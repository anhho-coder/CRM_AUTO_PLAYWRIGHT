"""Daily 16:00 leftover-test-data check for the O12 migration server (crm-mig).

Enforces CLAUDE.md -> "CRM Migration server needs to clean up test data", rule 2.

Flow:
  1. PROBE https://crm-mig.nakivo.site/ ONCE. Unreachable -> report SKIPPED with the
     reason and exit. No retry loop, and never reported as "no leftover data".
  2. Authenticate (alias crm_mig, db nakivoCE) and, per model, search_read the records
     created in the last --since-hours by the automation user. Bounded: narrow filter
     (date range + create_uid) and limit <= 500.
  3. Report into logs/ + logs/latest.txt, and pop a Windows reminder when leftovers are found.

Read-only: search_read only. Deleting the leftovers stays a human/spec decision.

Exit codes:  0 clean | 2 leftovers found | 3 SKIPPED (unreachable) | 1 error/incomplete

NOTE: never run this with cwd = D:\\Automation_CRM - the repo root's inspect.py shadows
the stdlib module and breaks `import requests`. run_check.sh cds into this folder first.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import pathlib
import subprocess
import sys

import requests
import urllib3

urllib3.disable_warnings()

HERE = pathlib.Path(__file__).resolve().parent
LOGS = HERE / "logs"
CREDENTIALS = pathlib.Path.home() / ".claude" / "mcp-odoo" / "credentials.json"
ALIAS = "crm_mig"
LIMIT = 500          # CLAUDE.md: every search bounded, limit <= 500
PROBE_TIMEOUT = 15   # CLAUDE.md: explicit timeout <= 15s
CALL_TIMEOUT = 15

# What an automation spec can leave behind. Extra fields are only for the report.
MODELS = [
    ("crm.lead", "Lead / Opportunity", ["name", "type", "create_date", "user_id"]),
    ("res.partner", "Contact / Company", ["name", "email", "create_date"]),
    ("sale.order", "Quotation / Order", ["name", "state", "create_date"]),
    ("account.invoice", "Invoice", ["number", "state", "create_date"]),
]


def log(lines, line=""):
    print(line)
    lines.append(line)


def write(lines, stamp, status):
    LOGS.mkdir(parents=True, exist_ok=True)
    body = "\n".join(lines) + "\n"
    path = LOGS / "leftover-{:%Y-%m-%d_%H%M}-{}.txt".format(stamp, status)
    path.write_text(body, encoding="utf-8")
    (LOGS / "latest.txt").write_text(body, encoding="utf-8")
    return path


def notify(title, body):
    """Detached Windows message box - the 16:00 reminder itself."""
    body = body.replace("'", " ")[:1200]
    title = title.replace("'", " ")[:120]
    ps = ("Add-Type -AssemblyName PresentationFramework; "
          "[System.Windows.MessageBox]::Show('" + body + "','" + title + "')")
    try:
        subprocess.Popen(
            ["powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", ps],
            creationflags=0x00000008 | 0x00000200,  # DETACHED_PROCESS | NEW_PROCESS_GROUP
        )
    except OSError as exc:  # a failed popup must not fail the check
        print("warn  could not raise the reminder popup: {}".format(exc))


def call(sess, base, model, method, args, kwargs=None):
    r = sess.post(base + "/web/dataset/call_kw",
                  json={"jsonrpc": "2.0", "method": "call",
                        "params": {"model": model, "method": method,
                                   "args": args, "kwargs": kwargs or {}}},
                  timeout=CALL_TIMEOUT)
    body = r.json()
    if "error" in body:
        raise RuntimeError(body["error"].get("data", {}).get("message", body["error"]))
    return body["result"]


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    p.add_argument("--since-hours", type=float, default=24.0,
                   help="how far back to look for created records (default 24h, so an "
                        "evening run's leftovers are still caught the next afternoon)")
    p.add_argument("--any-user", action="store_true",
                   help="drop the create_uid filter (report data from every user)")
    p.add_argument("--no-notify", action="store_true", help="log only, no popup")
    p.add_argument("--alias", default=ALIAS,
                   help="Odoo MCP credentials alias (default crm_mig; use preprod only to "
                        "smoke-test this script's query path while crm-mig is down)")
    a = p.parse_args(argv)

    stamp = dt.datetime.now()
    out = []
    log(out, "crm-mig leftover-test-data check   {:%Y-%m-%d %H:%M:%S} (local)".format(stamp))

    try:
        h = json.loads(CREDENTIALS.read_text(encoding="utf-8"))["hosts"][a.alias]
    except (OSError, ValueError, KeyError) as exc:
        log(out, "ERROR  cannot read alias '{}' from {}: {}".format(a.alias, CREDENTIALS, exc))
        write(out, stamp, "ERROR")
        return 1

    base = h["url"].rstrip("/")
    sess = requests.Session()
    sess.verify = bool(h.get("verify_ssl", True))
    log(out, "host   {}   db {}   verify_ssl={}".format(base, h.get("db"), sess.verify))

    # ---- 1. the gate: probe ONCE, no retry loop --------------------------------
    try:
        r = sess.get(base + "/web/login", timeout=PROBE_TIMEOUT, allow_redirects=True)
        if r.status_code >= 400:
            log(out, "SKIPPED  server unreachable - HTTP {} from {}/web/login".format(
                r.status_code, base))
            log(out, "         (502 since 2026-09-01 = the gateway, not the credentials)")
            log(out, "NOT a clean result: an unreachable server and a clean server look identical.")
            write(out, stamp, "SKIPPED")
            return 3
    except requests.RequestException as exc:
        log(out, "SKIPPED  server unreachable - {}: {}".format(type(exc).__name__, exc))
        log(out, "NOT a clean result: an unreachable server and a clean server look identical.")
        write(out, stamp, "SKIPPED")
        return 3
    log(out, "probe  OK (HTTP {}) - server reachable, running the check".format(r.status_code))

    # ---- 2. authenticate + bounded reads ---------------------------------------
    try:
        res = sess.post(base + "/web/session/authenticate",
                        json={"jsonrpc": "2.0", "method": "call",
                              "params": {"db": h["db"], "login": h["login"],
                                         "password": h["password"]}},
                        timeout=CALL_TIMEOUT).json()
        uid = (res.get("result") or {}).get("uid")
        if not uid:
            raise RuntimeError(res.get("error", {}).get("data", {}).get("message", "no uid"))
    except (requests.RequestException, RuntimeError, ValueError) as exc:
        log(out, "SKIPPED  cannot authenticate - {}".format(exc))
        write(out, stamp, "SKIPPED")
        return 3

    since = (dt.datetime.utcnow() - dt.timedelta(hours=a.since_hours)).strftime(
        "%Y-%m-%d %H:%M:%S")
    log(out, "login  uid {} ({})   window: create_date >= {} UTC   user filter: {}".format(
        uid, h["login"], since, "ANY" if a.any_user else "create_uid = {}".format(uid)))
    log(out)

    total, details, errors = 0, [], []
    for model, label, fields in MODELS:
        domain = [["create_date", ">=", since]]
        if not a.any_user:
            domain.append(["create_uid", "=", uid])
        try:
            rows = call(sess, base, model, "search_read", [domain, fields], {"limit": LIMIT})
        except (requests.RequestException, RuntimeError, ValueError) as exc:
            # one bad model must not sink the run - and is never counted as "clean"
            log(out, "  !!  {:<16} {:<20} ERROR {}".format(model, label, exc))
            errors.append(model)
            continue
        n = len(rows)
        total += n
        log(out, "  {} {:<16} {:<20} {}{}".format(
            "LEFTOVER" if n else "clean   ", model, label, n,
            "  (limit hit - there may be more)" if n == LIMIT else ""))
        for row in rows[:25]:
            name = row.get("name") or row.get("number") or "?"
            log(out, "           id {:<9} {:<60} {}".format(
                row["id"], str(name)[:60], row.get("create_date")))
        if n > 25:
            log(out, "           ... and {} more".format(n - 25))
        if n:
            details.append("{}: {}".format(label, n))

    log(out)
    if errors:
        log(out, "RESULT  INCOMPLETE - {} leftover record(s) found, but these models could "
                 "not be read: {}".format(total, ", ".join(errors)))
        status, rc = "INCOMPLETE", 1
    elif total:
        log(out, "RESULT  {} leftover test record(s) still on crm-mig - clean them up, or fix "
                 "the spec teardown (CLAUDE.md rule 1).".format(total))
        status, rc = "LEFTOVERS", 2
    else:
        log(out, "RESULT  clean - nothing created in the window is still on crm-mig.")
        status, rc = "CLEAN", 0

    path = write(out, stamp, status)
    if rc in (1, 2) and not a.no_notify:
        notify("crm-mig: test data not cleaned up",
               "{} leftover test record(s) on crm-mig.\n\n{}\n\nReport: {}".format(
                   total, "\n".join(details or errors), path))
    return rc


if __name__ == "__main__":
    sys.exit(main())
