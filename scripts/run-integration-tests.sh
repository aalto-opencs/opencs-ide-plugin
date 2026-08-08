#!/usr/bin/env bash

set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repository_root=$(CDPATH= cd -- "$script_dir/.." && pwd -P)
code_version=${AALTO_FITECH_TEST_VSCODE_VERSION:-1.130.0}

cd "$repository_root"

if [ ! -f ".env.test.local" ]; then
  echo "Missing .env.test.local."
  echo "Create it from .env.test.example and provide valid test-user credentials."
  exit 1
fi

npm run pretest
node --env-file=.env.test.local \
  ./node_modules/@vscode/test-cli/out/bin.mjs \
  --config .vscode-test.integration.mjs \
  --code-version "$code_version" \
  --fail-zero
