#!/usr/bin/env bash
set -euo pipefail
sleep 5
if command -v telegram-desktop >/dev/null 2>&1; then
  nohup telegram-desktop >/dev/null 2>&1 &
elif command -v wslview >/dev/null 2>&1; then
  nohup wslview "tg://" >/dev/null 2>&1 &
fi
sleep 2
if command -v x-terminal-emulator >/dev/null 2>&1; then
  nohup x-terminal-emulator -e /home/shootre/.openclaw/workspace/scripts/start-openclaw-tui.sh >/dev/null 2>&1 &
fi
