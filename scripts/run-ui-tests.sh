#!/usr/bin/env bash

# Runs the ExTester UI tests in out/ui-test against a VSIX built from a
# staged copy of the extension, so local untracked folders never get packaged.
# Test resources live in the temp directory because VS Code's IPC socket path
# must stay under about 100 bytes, which deep checkouts exceed. Each run starts
# from a fresh profile and extensions folder and keeps only its own screenshots.
#
# The tests serve a fake platform on a fixed local port. Sign-in still runs the
# real browser flow: VS Code opens the sign-in page in a stand-in "browser" that
# fetches it and hands the callback to the test window through the VS Code CLI.

set -euo pipefail

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
repository_root=$(CDPATH= cd -- "$script_dir/.." && pwd -P)

storage="${TMPDIR:-/tmp}"; storage="${storage%/}/aalto-opencs-extest"
staging="$storage/package"
vsix="$storage/aalto-opencs-ide-ui-test.vsix"
extensions="$storage/extensions"
browser="$storage/stand-in-browser"
settings="$storage/ui-test-settings.json"
export OPENCS_UI_TEST_PLATFORM_PORT=${OPENCS_UI_TEST_PLATFORM_PORT:-47123}

cd "$repository_root"
code_version=$(node -p 'require("./package.json").config.vscodeTestVersion')
npm run compile-tests
npm run compile

rm -rf "$staging" "$extensions" "$storage/settings" "$storage/screenshots" \
  "$browser"
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

# The CLI forwards the callback through a short-lived Electron process. On
# Linux it needs the same sandbox flags ExTester gives the test window, or it
# exits before forwarding anything.
if [ "$(uname)" = Darwin ]; then
  code_cli="$storage/Visual Studio Code.app/Contents/Resources/app/bin/code"
  cli_flags=""
else
  code_cli="$storage/VSCode-linux-x64/bin/code"
  cli_flags="--no-sandbox --disable-gpu-sandbox"
fi

mkdir -p "$browser"
# The log records each step but never the authorization code or state.
cat > "$browser/open.sh" <<SCRIPT
#!/usr/bin/env bash
exec >> "$browser/open.log" 2>&1
echo "\$(date -u +%FT%TZ) stand-in browser started with \$# argument(s)"
callback=\$(curl --silent --show-error --output /dev/null --write-out '%{redirect_url}' "\${@: -1}")
echo "sign-in page redirected to \${callback%%\?*}"
"$code_cli" $cli_flags --user-data-dir "$storage/settings" --open-url "\$callback"
echo "VS Code CLI exited with \$?"
SCRIPT
chmod +x "$browser/open.sh"

# VS Code starts the browser with `open -a` on macOS, which only accepts apps.
browser_app="$browser/open.sh"
if [ "$(uname)" = Darwin ]; then
  browser_app="$browser/StandInBrowser.app"
  osacompile -o "$browser_app" -e "on open location theURL
  do shell script quoted form of \"$browser/open.sh\" & \" \" & quoted form of theURL
end open location"
  /usr/libexec/PlistBuddy -c "Add :LSUIElement bool true" \
    "$browser_app/Contents/Info.plist"
fi

cat > "$settings" <<SETTINGS
{
  "aaltoOpenCsIde.apiBaseUrl": "http://127.0.0.1:$OPENCS_UI_TEST_PLATFORM_PORT/api",
  "aaltoOpenCsIde.platformBaseUrl": "http://127.0.0.1:$OPENCS_UI_TEST_PLATFORM_PORT",
  "workbench.externalBrowser": "$browser_app",
  "files.simpleDialog.enable": true
}
SETTINGS

npx extest run-tests "out/ui-test/*.ui.test.js" \
  --storage "$storage" \
  --extensions_dir "$extensions" \
  --code_version "$code_version" \
  --mocha_config .mocharc.ui-test.json \
  --code_settings "$settings"
