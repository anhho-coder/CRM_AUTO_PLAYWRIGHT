#!/usr/bin/env bash
# Wrapper fired by Windows Task Scheduler (task CRM_MIG_leftover_testdata_1600, weekdays 16:00).
# Self-contained: Task Scheduler gives a bare environment, so PATH and python are hardcoded.
export PATH=/mingw64/bin:/usr/bin:/bin:$PATH
PY=${PY:-/c/Python313/python}

# cd into THIS folder - resolved from $0, so the checkout can live anywhere. Never run with cwd =
# the D:\Automation_CRM root: its inspect.py shadows the stdlib module and makes `import requests`
# die with KeyError: 'J_USER'.
cd "$(dirname "$(readlink -f "$0")")" || exit 1
mkdir -p logs

echo "===== $(date '+%Y-%m-%d %H:%M:%S') run start =====" >> logs/run.log
"$PY" check_leftover_testdata.py "$@" >> logs/run.log 2>&1
rc=$?
echo "----- exit $rc (0 clean | 2 leftovers | 3 SKIPPED unreachable | 1 error) -----" >> logs/run.log
exit $rc
