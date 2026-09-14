import { defineConfig } from '@vscode/test-cli';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const slot = process.env.AALTO_DISPATCHER_SLOT_ID ?? 'default';

export default defineConfig({
	files: 'out/test/*.test.js',
	launchArgs: [
		`--user-data-dir=${join(tmpdir(), `aalto-fitech-code-vscode-test-${slot}`)}`,
		`--extensions-dir=${join(tmpdir(), `aalto-fitech-code-vscode-extensions-${slot}`)}`,
	],
});
