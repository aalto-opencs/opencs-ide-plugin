#!/usr/bin/env bash

set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)

case "${1:-}" in
  enable)
    node "$script_dir/set-mock-api.mjs" true
    ;;
  disable)
    node "$script_dir/set-mock-api.mjs" false
    ;;
  *)
    echo "Usage: ./scripts/set-mock-api.sh <enable|disable>"
    exit 1
    ;;
esac
