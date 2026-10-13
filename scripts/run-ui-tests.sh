#!/usr/bin/env bash

# Runs the ExTester UI tests in out/ui-test against a VSIX built from a
# staged copy of the extension, so local untracked folders never get packaged.
# Test resources live in the temp directory because VS Code's IPC socket path
# must stay under about 100 bytes, which deep checkouts exceed. Each run starts
# from a fresh profile and extensions folder and keeps only its own screenshots.

set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repository_root=$(CDPATH= cd -- "$script_dir/.." && pwd -P)

storage="${TMPDIR:-/tmp}"; storage="${storage%/}/aalto-opencs-extest"
staging="$storage/package"
vsix="$storage/aalto-opencs-ide-ui-test.vsix"
extensions="$storage/extensions"

cd "$repository_root"
code_version=$(node -p 'require("./package.json").config.vscodeTestVersion')
npm run compile-tests
npm run compile

rm -rf "$staging" "$extensions" "$storage/settings" "$storage/screenshots"
mkdir -p "$staging"
cp -R dist media LICENSE CHANGELOG.md "$staging/"
cp README.marketplace.md "$staging/README.md"
node -e '
const fs = require("node:fs");
const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
delete manifest.scripts;
delete manifest.devDependencies;
delete manifest.config;
fs.writeFileSync(process.argv[1], `${JSON.stringify(manifest, null, 2)}\n`);
' "$staging/package.json"

(cd "$staging" && "$repository_root/node_modules/.bin/vsce" package \
  --no-dependencies --allow-missing-repository --out "$vsix")

npx extest get-vscode --storage "$storage" --code_version "$code_version"
npx extest get-chromedriver --storage "$storage" --code_version "$code_version"
npx extest install-vsix --storage "$storage" --extensions_dir "$extensions" \
  --vsix_file "$vsix"
npx extest run-tests "out/ui-test/*.ui.test.js" \
  --storage "$storage" \
  --extensions_dir "$extensions" \
  --code_version "$code_version" \
  --mocha_config .mocharc.ui-test.json
