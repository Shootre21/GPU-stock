#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
npm install playwright
npx playwright install chromium
printf '\nInstalled Playwright + Chromium for x-post-deployer.\n'
