#!/bin/bash
cd /workspace/edutunisie/pdf-test
while true; do
  date +%H:%M:%S > monitor.heartbeat
  # Only monitor W0 now
  for w in 0; do
    PID=$(cat bulk_math_v5_w${w}.pid 2>/dev/null)
    if [ -z "$PID" ] || ! ps -p $PID > /dev/null 2>&1; then
      echo "[$(date +%H:%M:%S)] W$w DEAD, restarting" >> monitor.log
      /usr/bin/python3 -u bulk_math_v5.py --worker-id $w --total-workers 1 >> bulk_math_v5_w${w}.log 2>&1 &
      echo $! > bulk_math_v5_w${w}.pid
      echo "[$(date +%H:%M:%S)] W$w restarted PID=$!" >> monitor.log
    fi
  done
  sleep 30
done
