const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const releaseDirectory = path.join(root, 'release');
const manifestPath = path.join(root, 'package.json');

async function main() {
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  const properties = manifest.contributes.configuration.properties;
  const bundle = await fs.readFile(
    path.join(root, 'dist', 'extension.js'),
    'utf8',
  );

  if (
    bundle.includes('Aalto OpenCS Test Tools') ||
    bundle.includes('aaltoOpenCsIde.development.markAssignmentComplete')
  ) {
    throw new Error('Production bundle contains development tools.');
  }

  delete properties['aaltoOpenCsIde.apiBaseUrl'];
  delete properties['aaltoOpenCsIde.platformBaseUrl'];
  delete manifest.scripts;
  delete manifest.devDependencies;

  await fs.mkdir(releaseDirectory, { recursive: true });
  for (const entry of await fs.readdir(releaseDirectory)) {
    await fs.rm(path.join(releaseDirectory, entry), {
      recursive: true,
      force: true,
    });
  }
  await fs.writeFile(
    path.join(releaseDirectory, 'package.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  for (const entry of [
    'CHANGELOG.md',
    'README.md',
    '.vscodeignore',
    'dist',
    'media',
  ]) {
    await fs.cp(
      path.join(root, entry),
      path.join(releaseDirectory, entry),
      { recursive: true },
    );
  }

  console.log(`Release package prepared in ${path.relative(root, releaseDirectory)}/`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
