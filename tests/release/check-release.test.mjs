import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../../scripts/check-release.mjs', import.meta.url));

function fixture(t, { manifest = {}, lock = {}, env = {}, unmerged = false } = {}) {
  const cwd = mkdtempSync(join(tmpdir(), 'extension-release-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', [
    '-c', 'core.hooksPath=/dev/null',
    '-c', 'commit.gpgsign=false',
    '-c', 'user.name=Release test',
    '-c', 'user.email=release-test@example.invalid',
    ...args,
  ], { cwd, stdio: 'pipe' });
  git('init', '--quiet', '--initial-branch=main');
  git('commit', '--quiet', '--allow-empty', '-m', 'Main commit');
  git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  if (unmerged) git('commit', '--quiet', '--allow-empty', '-m', 'Unmerged commit');

  writeFileSync(join(cwd, 'package.json'), JSON.stringify({
    name: 'aalto-opencs-ide', publisher: 'aalto-opencs', version: '1.2.3', ...manifest,
  }));
  writeFileSync(join(cwd, 'package-lock.json'), JSON.stringify({
    version: '1.2.3', packages: { '': { version: '1.2.3' } }, ...lock,
  }));
  return spawnSync(process.execPath, [script], {
    cwd, encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: 'push',
      GITHUB_REF: 'refs/tags/v1.2.3',
      PUBLISH_REQUESTED: '',
      ...env,
    },
  });
}

test('accepts a matching release from main', (t) => {
  const result = fixture(t);
  assert.equal(result.status, 0, result.stderr);
});

const manualEnv = { GITHUB_EVENT_NAME: 'workflow_dispatch', PUBLISH_REQUESTED: 'true' };

test('accepts explicitly requested manual publication of a matching tag from main', (t) => {
  const result = fixture(t, { env: manualEnv });
  assert.equal(result.status, 0, result.stderr);
});

for (const [name, options, message] of [
  ['mismatched tag', { env: { GITHUB_REF: 'refs/tags/v1.2.4' } }, /tag must match/],
  ['branch push', { env: { GITHUB_REF: 'refs/heads/main' } }, /tag must match/],
  ['manual run without opt-in', { env: { GITHUB_EVENT_NAME: 'workflow_dispatch' } }, /explicit manual request/],
  ['manual dry run', { env: { ...manualEnv, PUBLISH_REQUESTED: 'false' } }, /explicit manual request/],
  ['manual publication from a branch', { env: { ...manualEnv, GITHUB_REF: 'refs/heads/main' } }, /tag must match/],
  ['manual publication of a mismatched tag', { env: { ...manualEnv, GITHUB_REF: 'refs/tags/v1.2.4' } }, /tag must match/],
  ['manual publication of an unmerged commit', { env: manualEnv, unmerged: true }, /must already belong to origin\/main/],
  ['pull request even with opt-in', { env: { GITHUB_EVENT_NAME: 'pull_request', PUBLISH_REQUESTED: 'true' } }, /explicit manual request/],
  ['wrong publisher', { manifest: { publisher: 'someone-else' } }, /Unexpected extension publisher/],
  ['wrong extension', { manifest: { name: 'another-extension' } }, /Unexpected extension name/],
  ['preview package', { manifest: { preview: true } }, /must not be marked as preview/],
  ['prerelease version', { manifest: { version: '1.2.3-beta.1' } }, /major.minor.patch/],
  ['stale lockfile version', { lock: { version: '1.2.2' } }, /lockfile version/],
  ['stale lockfile root', { lock: { packages: { '': { version: '1.2.2' } } } }, /root package version/],
  ['commit outside main', { unmerged: true }, /must already belong to origin\/main/],
]) {
  test(`rejects ${name}`, (t) => {
    const result = fixture(t, options);
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, message);
  });
}
