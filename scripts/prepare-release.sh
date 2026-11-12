#!/usr/bin/env bash

set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repository_root=$(CDPATH= cd -- "$script_dir/.." && pwd -P)

cd "$repository_root"
npm run prepare:release

cd "$repository_root/release"
../node_modules/.bin/vsce package --no-dependencies
