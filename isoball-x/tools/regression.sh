#!/bin/bash
# 回归 v3：L1-L10 autotest + 2s 轮询；agent-browser 用绝对路径（后台 bash 无 profile PATH）
AB=/c/Users/Jacky/.workbuddy/binaries/node/versions/22.22.2-3/agent-browser
PASS=0; FAIL=0; FAILED=""
for i in $(seq 1 10); do
  OK=0
  for try in 1 2 3; do
    "$AB" close >/dev/null 2>&1
    "$AB" open "http://localhost:8086/index.html?autotest=1&level=$i" >/dev/null 2>&1
    STAT=""
    for k in 1 2 3 4 5 6 7 8; do
      sleep 2
      STAT=$("$AB" eval "var e=document.getElementById('autostat'); e?e.textContent:'none'" 2>/dev/null)
      echo "$STAT" | grep -q "result=w" && { OK=1; break; }
    done
    [ $OK -eq 1 ] && break
  done
  if [ $OK -eq 1 ]; then echo "L$i PASS"; PASS=$((PASS+1))
  else echo "L$i FAIL  last=$STAT"; FAIL=$((FAIL+1)); FAILED="$FAILED L$i"
  fi
done
echo "===================="
echo "PASS=$PASS FAIL=$FAIL failed:$FAILED"
