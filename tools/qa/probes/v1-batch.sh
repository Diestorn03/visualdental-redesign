#!/bin/bash
# usage: v1-batch.sh <logfile> <args-of-run1> -- <args-of-run2> -- ...   (each run: scen + flags)
cd "C:/Users/diegoa.cardozo/Desktop/Rediseño VisualDents"
LOG="$1"; shift
: > "$LOG"
cur=()
run() { MSYS_NO_PATHCONV=1 timeout 400 node tools/qa/probes/v1-run.mjs "${cur[@]}" 2>&1 | cut -c1-2200 >> "$LOG"; echo "-----" >> "$LOG"; cur=(); powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 9421 -State Listen -ErrorAction SilentlyContinue | % { Stop-Process -Id \$_.OwningProcess -Force }" >/dev/null 2>&1; sleep 2; }
for a in "$@"; do if [ "$a" == "--" ]; then run; else cur+=("$a"); fi; done
[ ${#cur[@]} -gt 0 ] && run
echo "BATCH DONE" >> "$LOG"
