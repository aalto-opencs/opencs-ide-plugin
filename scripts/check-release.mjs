import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));

assert.equal(process.env.GITHUB_EVENT_NAME, 'push', 'Publishing requires a new release tag push.');
assert.equal(process.env.TAG_CREATED, 'true', 'Publishing requires a newly created tag, not a moved tag.');
assert.equal(manifest.publisher, 'aalto-opencs', 'Unexpected extension publisher.');
assert.equal(manifest.name, 'aalto-opencs-ide', 'Unexpected extension name.');
assert.notEqual(manifest.preview, true, 'Release packages must not be marked as preview.');
assert.match(
  manifest.version,
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
  'Use a numeric major.minor.patch version for a regular release.',
);
assert.equal(
  process.env.GITHUB_REF,
  `refs/tags/v${manifest.version}`,
  'Release tag must match package.json version exactly.',
);
assert.equal(lock.version, manifest.version, 'Update the lockfile version before tagging.');
assert.equal(
  lock.packages[''].version,
  manifest.version,
  'Update the root package version in the lockfile before tagging.',
);
assert.doesNotThrow(
  () => execFileSync('git', ['merge-base', '--is-ancestor', 'HEAD', 'refs/remotes/origin/main']),
  'Release commit must already belong to origin/main.',
);

console.log(`Validated ${manifest.publisher}.${manifest.name} ${manifest.version} for publishing.`);
