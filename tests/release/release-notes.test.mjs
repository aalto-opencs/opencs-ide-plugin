import assert from 'node:assert/strict';
import test from 'node:test';
import { extractReleaseNotes } from '../../scripts/release-notes.mjs';

test('uses only the released version, preserving subsections and Markdown links', () => {
  const changelog = `# Changelog

## [Unreleased]
- Future work.

## [0.5.5] - 2026-11-12

### Changed
- New [icons](https://example.com/icons).

## [0.5.4] - 2026-10-29
- Old changes.
`;
  assert.equal(extractReleaseNotes(changelog, '0.5.5'),
    '## [0.5.5] - 2026-11-12\n\n### Changed\n- New [icons](https://example.com/icons).\n');
});

test('accepts the final section and CRLF line endings', () => {
  assert.equal(extractReleaseNotes('## [0.5.5]\r\n\r\n- Shipped.\r\n', '0.5.5'),
    '## [0.5.5]\n\n- Shipped.\n');
});

test('rejects a missing version instead of publishing unrelated notes', () => {
  assert.throws(() => extractReleaseNotes('## [0.5.4]\n- Old.\n', '0.5.5'), /exactly one entry/);
});

test('rejects duplicate version headings', () => {
  assert.throws(() => extractReleaseNotes('## [0.5.5]\n- First.\n## [0.5.5]\n- Second.\n', '0.5.5'),
    /exactly one entry/);
});

test('rejects an empty version before another section', () => {
  assert.throws(() => extractReleaseNotes('## [0.5.5]\n\n## [0.5.4]\n- Old.\n', '0.5.5'), /is empty/);
});

test('rejects an empty or comment-only final version', () => {
  for (const body of ['', '\n', '<!-- Write notes before releasing. -->',
    '<!-- First -->\n<!-- Second -->', '<!-- Unfinished comment']) {
    assert.throws(() => extractReleaseNotes(`## [0.5.5]\n${body}`, '0.5.5'), /is empty/);
  }
});

test('preserves author content and comments without trying to sanitize Markdown', () => {
  const source = '## [0.5.5]\n<!-- Internal note -->\n- Shipped.\n<!-- Footer note -->';
  assert.equal(extractReleaseNotes(source, '0.5.5'),
    '## [0.5.5]\n\n<!-- Internal note -->\n- Shipped.\n<!-- Footer note -->\n');
});
