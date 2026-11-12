import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function hasVisibleContent(body) {
  let offset = 0;
  while (offset < body.length) {
    const comment = body.indexOf('<!--', offset);
    if (comment === -1) return body.slice(offset).trim().length > 0;
    if (body.slice(offset, comment).trim()) return true;
    const end = body.indexOf('-->', comment + 4);
    if (end === -1) return false;
    offset = end + 3;
  }
  return false;
}

export function extractReleaseNotes(changelog, version) {
  const lines = changelog.replaceAll('\r\n', '\n').split('\n');
  const matches = lines.flatMap((line, index) => {
    const heading = /^## \[([^\]]+)\](?:\s+-\s+.+)?\s*$/.exec(line);
    return heading?.[1] === version ? [index] : [];
  });
  assert.equal(matches.length, 1, `CHANGELOG.md must contain exactly one entry for ${version}.`);

  const start = matches[0];
  const next = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  const end = next === -1 ? lines.length : next;
  const body = lines.slice(start + 1, end).join('\n').trim();
  assert.ok(hasVisibleContent(body), `Changelog entry for ${version} is empty.`);
  return `${lines[start]}\n\n${body}\n`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  process.stdout.write(extractReleaseNotes(readFileSync('CHANGELOG.md', 'utf8'), manifest.version));
}
