#!/bin/bash
cd "$(dirname "$0")"
while true; do
  node cached-server.mjs
  EXIT=$?
  echo "[YT-Proxy] Crashed (exit=$EXIT), restarting in 2s..." >> /home/z/my-project/yt-proxy.log
  sleep 2
done
