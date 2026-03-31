#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.npm-global/bin:$HOME/.local/bin:$PATH"
cd /home/shootre/.openclaw/workspace
exec openclaw tui --session main
