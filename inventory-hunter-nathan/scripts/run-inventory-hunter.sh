#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PKG_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
UPSTREAM_DIR="$(cd "$PKG_DIR/../inventory-hunter-upstream" && pwd -P)"
CONFIG_FILE="$PKG_DIR/config/rtx-5090.yaml"
ALERTER_FILE="$PKG_DIR/config/alerters.yaml"
IMAGE="ericjmarti/inventory-hunter:latest"

if [ ! -f "$CONFIG_FILE" ]; then
  echo "Missing config file: $CONFIG_FILE"
  exit 1
fi

if [ ! -f "$ALERTER_FILE" ]; then
  echo "Missing alerter file: $ALERTER_FILE"
  echo "Copy config/alerters.yaml.example to config/alerters.yaml and fill it in first."
  exit 1
fi

cd "$UPSTREAM_DIR"
./docker_run.bash -c "$CONFIG_FILE" -q "$ALERTER_FILE" -i "$IMAGE"
