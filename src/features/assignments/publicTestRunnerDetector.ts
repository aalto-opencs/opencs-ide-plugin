import JSZip = require('jszip');
import { PublicTestRunner } from './assignmentModels';

export const CROSS_PLATFORM_DEVELOPMENT_SLUG = 'cross-platform-development';

/** Derives a fixed local public-test command from the original starter archive. */
export async function detectPublicTestRunner(
  courseSlug: string,
  archiveBytes: Uint8Array,
): Promise<PublicTestRunner | undefined> {
  if (courseSlug !== CROSS_PLATFORM_DEVELOPMENT_SLUG) {
    return undefined;
  }

  const archive = await JSZip.loadAsync(archiveBytes, { checkCRC32: true });
  const paths = Object.values(archive.files)
    .filter((entry) => !entry.dir)
    .map((entry) => normalizeArchivePath(entry.name));
  const hasRootMainTest = paths.includes('main_test.dart');
  const hasDartTests = paths.some((path) =>
    /^test\/[^/].*\.dart$/i.test(path));
  const pubspec = archive.file('pubspec.yaml');
  const pubspecText = pubspec ? await pubspec.async('text') : '';
  const hasFlutterDependency = isFlutterPubspec(pubspecText);
  const hasDartTestDependency = isDartTestPubspec(pubspecText);

  if (hasRootMainTest) {
    return hasDartTests || hasFlutterDependency || hasDartTestDependency
      ? undefined
      : 'dart-main-test';
  }
  if (!hasDartTests || (hasFlutterDependency && hasDartTestDependency)) {
    return undefined;
  }
  if (hasFlutterDependency) {
    return 'flutter-test';
  }
  if (hasDartTestDependency) {
    return 'dart-test';
  }
  return undefined;
}

function normalizeArchivePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isFlutterPubspec(contents: string): boolean {
  return /(?:^|\n)\s*flutter_test\s*:/m.test(contents) ||
    /(?:^|\n)\s*flutter\s*:\s*\r?\n\s+sdk\s*:\s*flutter\b/m.test(contents);
}

function isDartTestPubspec(contents: string): boolean {
  return /(?:^|\n)\s+test\s*:/m.test(contents);
}
