#!/usr/bin/env bash

set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repository_root=$(CDPATH= cd -- "$script_dir/.." && pwd -P)

cd "$repository_root"

if [ ! -f ".env.test.local" ]; then
  echo "Missing .env.test.local."
  echo "Create it from .env.test.example and provide a valid backend user UUID."
  exit 1
fi

npm run pretest
node --env-file=.env.test.local \
  ./node_modules/@vscode/test-cli/out/bin.mjs \
  --config .vscode-test.integration.mjs \
  --fail-zero
