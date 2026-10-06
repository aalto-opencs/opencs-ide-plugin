import JSZip = require('jszip');
import { LocalRuntime } from './assignmentModels';
import { normalizeArchivePath } from './publicTestRunnerDetector';

const PYTHON_STARTER_ENTRYPOINT = 'main.py';

/** Derives a fixed local runtime from the original starter archive. */
export async function detectLocalRuntime(
  archiveBytes: Uint8Array,
): Promise<LocalRuntime | undefined> {
  const archive = await JSZip.loadAsync(archiveBytes, { checkCRC32: true });
  const hasRootMainPy = Object.values(archive.files).some((entry) =>
    !entry.dir &&
    normalizeArchivePath(entry.name) === PYTHON_STARTER_ENTRYPOINT);
  return hasRootMainPy ? 'python' : undefined;
}
