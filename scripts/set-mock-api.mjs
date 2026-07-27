import { readFile, writeFile } from 'node:fs/promises';

const settingName = 'aaltoFitechPlatform.useMockApi';
const requestedValue = process.argv[2];

if (requestedValue !== 'true' && requestedValue !== 'false') {
	throw new Error(
		'Usage: node scripts/set-mock-api.mjs <true|false>',
	);
}

const settingsUrl = new URL('../.vscode/settings.json', import.meta.url);
const contents = await readFile(settingsUrl, 'utf8');
const settingPattern =
	/("aaltoFitechPlatform\.useMockApi"\s*:\s*)(true|false)/;
let updatedContents;

if (settingPattern.test(contents)) {
	updatedContents = contents.replace(
		settingPattern,
		`$1${requestedValue}`,
	);
} else {
	const closingBraceIndex = contents.lastIndexOf('}');

	if (closingBraceIndex < 0) {
		throw new Error('Could not find the root settings object.');
	}

	const beforeClosingBrace = contents
		.slice(0, closingBraceIndex)
		.trimEnd();
	const comma = beforeClosingBrace.endsWith('{') ? '' : ',';

	updatedContents = [
		beforeClosingBrace,
		`${comma}\n    "${settingName}": ${requestedValue}\n`,
		contents.slice(closingBraceIndex),
	].join('');
}

await writeFile(settingsUrl, updatedContents, 'utf8');

const state = requestedValue === 'true' ? 'enabled' : 'disabled';
console.log(
	`Mock API ${state}. Reload the Extension Development Host to apply it.`,
);
