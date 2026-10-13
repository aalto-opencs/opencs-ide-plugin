import { defineConfig } from '@vscode/test-cli';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const { config } = JSON.parse(
	readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
);
const slot = process.env.AALTO_DISPATCHER_SLOT_ID ?? 'default';

export default defineConfig({
	files: 'out/test/*.test.js',
	version: config.vscodeTestVersion,
	launchArgs: [
		`--user-data-dir=${join(tmpdir(), `aalto-fitech-code-vscode-test-${slot}`)}`,
		`--extensions-dir=${join(tmpdir(), `aalto-fitech-code-vscode-extensions-${slot}`)}`,
	],
});
