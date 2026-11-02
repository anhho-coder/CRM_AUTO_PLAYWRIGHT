#!/usr/bin/env python3
"""Set Xray test-run statuses on a Test Execution, safely.

    python -I scripts/xray_set_run_status.py --exec CRM-13455 --results results.json \\
        --pat "D:/Automation_CRM/jira token.txt"            # dry run, prints the plan
    python -I scripts/xray_set_run_status.py ... --apply    # writes

`--results` is either
    JSON  {"CRM-13589": "PASS", "CRM-13592": "FAIL"}
    text  one "CRM-13589 PASS" per line (# comments allowed)
Status is PASS / FAIL / ABORTED / TODO.

WHY THIS TOOL EXISTS - incident 2026-10-22
------------------------------------------
An ad-hoc script flipping 15 runs on CRM-13455 instead wrote into two CLOSED executions of
another project (NJM-166704 and NJM-167088), overwriting other testers' results.

The mechanism, measured afterwards rather than guessed:

  * The run id was pulled out of `GET /api/testrun?testExecIssueKey=..&testIssueKey=..` with
    `sed -n 's/.*"id"...'`. That body is ONE line and holds NINE "id" values (the run, its steps,
    each step's evidences). `.*` is greedy, so the regex returned the LAST one.
  * Which id that is depends on the run's data. No evidences -> a STEP id (58xxxx), which is not a
    run id at all, so the PUT 404s harmlessly. Evidences attached -> an EVIDENCE id (29xxxx) - and
    in this Xray instance evidence ids and run ids share one numeric space, where 29xxxx is the
    run-id range of older executions. So the PUT succeeded, on a stranger's run.
  * The script then "verified" by re-reading the run by (execution, test). That lookup returns the
    RIGHT execution's run, so it printed `confirmed` for a run the PUT had never touched. The bad
    write was invisible in its own success log - which is why it happened twice instead of once.

So this tool:
  1. NEVER resolves a run id from a response body. It reads them all at once from the execution's
     `customfield_10715`, which is `[{b: testKey, c: runId}]` and is authoritative.
  2. Asserts the run's own `testExecKey` AND `testKey` before every write. A run belonging to
     another execution is a hard stop, not a warning.
  3. Verifies by `GET /testrun/<the id it just wrote>` - never by a lookup that could re-resolve
     somewhere else.
  4. Refuses to overwrite a run that already carries a result, unless `--allow-overwrite` is given
     explicitly. A status someone else set is their work.
  5. Checks that the run ids form one contiguous block and stops on an outlier - the 2026-10-22
     ids were visibly wrong in the dry-run output (295710 among 4546xx) before anything was written.
  6. Writes the FIRST run as a canary, verifies it, and aborts the whole batch if it is not exactly
     as expected.
"""
import argparse
import json
import sys
import urllib.error
import urllib.request

JIRA = "http://jira.nakivo.com"
TESTS_FIELD = "customfield_10715"   # [{b: testKey, c: runId}]
VALID = {"PASS", "FAIL", "ABORTED", "TODO", "EXECUTING"}


def call(url, token, method="GET"):
    req = urllib.request.Request(url, method=method)
    req.add_header("Authorization", "Bearer " + token)
    with urllib.request.urlopen(req, timeout=25) as r:
        body = r.read().decode("utf-8", "replace")
        return r.status, (json.loads(body) if body.strip()[:1] in "{[" else body)


def read_token(path):
    raw = open(path, encoding="utf-8").read()
    for line in raw.splitlines():
        if line.lower().startswith("token:"):
            return line.split(":", 1)[1].strip()
    return raw.strip()


def read_results(path):
    raw = open(path, encoding="utf-8").read().strip()
    if raw[:1] == "{":
        return {k: v.upper() for k, v in json.loads(raw).items()}
    out = {}
    for line in raw.splitlines():
        line = line.split("#", 1)[0].strip()
        if not line:
            continue
        parts = line.split()
        out[parts[0]] = parts[1].upper()
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--exec", dest="execution", required=True)
    ap.add_argument("--results", required=True)
    ap.add_argument("--pat", required=True,
                    help='file holding a JIRA PAT. "D:/Automation_CRM/jira token.txt" - NOT '
                         '"jenkin token.txt", which is the Jenkins credential.')
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--allow-overwrite", action="store_true",
                    help="also write runs that already carry a result (default: leave them alone)")
    a = ap.parse_args()

    token = read_token(a.pat)
    want = read_results(a.results)
    bad = {k: v for k, v in want.items() if v not in VALID}
    if bad:
        print("Not a valid Xray status: %s" % bad)
        return 1

    try:
        _, me = call(JIRA + "/rest/api/2/myself", token)
    except urllib.error.HTTPError as e:
        print("Jira rejected this token (HTTP %s). It must be a JIRA PAT - the Jenkins token "
              "gives exactly this." % e.code)
        return 2
    print("Authenticated as %s. Execution %s.\n" % (me.get("name"), a.execution))

    # 1. Run ids come from the execution itself, in one call. No per-test lookup, no parsing.
    _, issue = call("%s/rest/api/2/issue/%s?fields=%s" % (JIRA, a.execution, TESTS_FIELD), token)
    rows = (issue.get("fields") or {}).get(TESTS_FIELD) or []
    runid = {r["b"]: r["c"] for r in rows}
    print("Execution holds %d tests." % len(runid))

    missing = [k for k in want if k not in runid]
    if missing:
        print("Not on this execution, refusing to touch them: %s" % missing)
        return 3

    # 5. One execution's run ids sit in a contiguous block. An outlier means the wrong source.
    ids = sorted(runid.values())
    span = ids[-1] - ids[0]
    if span > 10 * len(ids) + 1000:
        print("Run ids are not one contiguous block (%d..%d across %d tests). Refusing: this is "
              "what a wrong id source looks like." % (ids[0], ids[-1], len(ids)))
        return 4

    plan = []
    for key in sorted(want, key=lambda k: runid[k]):
        rid = runid[key]
        _, run = call("%s/rest/raven/1.0/api/testrun/%s" % (JIRA, rid), token)
        # 2. The run must be the one we mean. Anything else stops the batch.
        if run.get("testExecKey") != a.execution or run.get("testKey") != key:
            print("  STOP: run %s is %s / %s, expected %s / %s"
                  % (rid, run.get("testExecKey"), run.get("testKey"), a.execution, key))
            return 5
        now = run.get("status")
        if now != "TODO" and not a.allow_overwrite:
            print("  %-12s run %-8s left alone: already %s (by %s)"
                  % (key, rid, now, run.get("executedBy") or "?"))
            continue
        plan.append((key, rid, now, want[key]))

    if not plan:
        print("\nNothing to write.")
        return 0
    for key, rid, now, new in plan:
        print("  %-12s run %-8s %s -> %s" % (key, rid, now, new))

    if not a.apply:
        print("\nDRY RUN. %d run(s) would be written. Re-run with --apply." % len(plan))
        return 0

    # 6. Canary first: one write, fully verified, before the rest of the batch.
    print("\nWriting. The first run is a canary - the batch aborts if it is not exactly right.")
    done = 0
    for i, (key, rid, now, new) in enumerate(plan):
        code, _ = call("%s/rest/raven/1.0/api/testrun/%s/status?status=%s" % (JIRA, rid, new),
                       token, method="PUT")
        # 3. Verify the id that was written. Never re-resolve.
        _, after = call("%s/rest/raven/1.0/api/testrun/%s" % (JIRA, rid), token)
        ok = (after.get("status") == new
              and after.get("testExecKey") == a.execution
              and after.get("testKey") == key)
        print("  %-12s run %-8s -> %-8s HTTP %s %s"
              % (key, rid, new, code, "confirmed" if ok else "NOT AS EXPECTED"))
        if not ok:
            print("     run now reads status=%s exec=%s test=%s"
                  % (after.get("status"), after.get("testExecKey"), after.get("testKey")))
            print("\nABORTED after %d write(s). Nothing further was sent." % (done + 1))
            return 6
        done += 1
        if i == 0 and len(plan) > 1:
            print("     canary ok, continuing with the remaining %d" % (len(plan) - 1))

    print("\nAPPLIED. %d run(s) written and verified." % done)
    return 0


if __name__ == "__main__":
    sys.exit(main())
