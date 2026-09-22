import * as vscode from 'vscode';

const MAX_SUBMISSION_FILES = 500;
const MAX_SUBMISSION_BYTES = 1024 * 1024;
const EXCLUDED_FILES = new Set([
  '.aalto-opencs-assignment.json',
  'assignment-handout.md',
  '.DS_Store',
]);
const EXCLUDED_DIRECTORIES = new Set([
  '.git',
  '.dart_tool',
  '.vscode',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'test',
]);
const SAFE_PATH_SEGMENT = /^[A-Za-z0-9._+@()[\] -]+$/;

/**
 * Defines the current submission file policy. It collects every safe UTF-8 text
 * file except extension metadata and generated/dependency directories; changing
 * that product policy belongs here, not in the submission controller.
 */
export class SubmissionFileRepository {
  public async collect(
    folder: vscode.Uri,
    submissionFiles?: string[],
  ): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    let totalBytes = 0;

    const addFile = async (
      file: vscode.Uri,
      relativePath: string,
    ): Promise<void> => {
      const contents = await vscode.workspace.fs.readFile(file);
      totalBytes += contents.byteLength;

      if (Object.keys(files).length >= MAX_SUBMISSION_FILES) {
        throw new Error(
          `An assignment can contain at most ${MAX_SUBMISSION_FILES} submitted files.`,
        );
      }
      if (totalBytes > MAX_SUBMISSION_BYTES) {
        throw new Error('The submitted files exceed the 1 MB size limit.');
      }

      if (contents.includes(0)) {
        throw new Error(`Binary files cannot be submitted: ${relativePath}`);
      }

      try {
        files[relativePath] = new TextDecoder('utf-8', {
          fatal: true,
        }).decode(contents);
      } catch {
        throw new Error(`Binary files cannot be submitted: ${relativePath}`);
      }
    };

    if (submissionFiles) {
      if (submissionFiles.length === 0) {
        throw new Error('No source files were found to submit.');
      }
      const normalizedPaths = new Set<string>();
      for (const relativePath of submissionFiles) {
        const pathSegments = getSafePathSegments(relativePath);
        const normalizedPath = relativePath.toLowerCase();
        if (normalizedPaths.has(normalizedPath)) {
          throw new Error(
            `Duplicate submission file path: ${relativePath}`,
          );
        }
        normalizedPaths.add(normalizedPath);
        try {
          let file = folder;
          for (const segment of pathSegments) {
            file = vscode.Uri.joinPath(file, segment);
            const segmentStat = await vscode.workspace.fs.stat(file);
            if (segmentStat.type & vscode.FileType.SymbolicLink) {
              throw new Error(
                `Symbolic links cannot be submitted: ${relativePath}`,
              );
            }
          }
          const stat = await vscode.workspace.fs.stat(file);
          if (!(stat.type & vscode.FileType.File)) {
            throw new Error(
              `Required submission path is not a file: ${relativePath}`,
            );
          }
          await addFile(file, relativePath);
        } catch (error: unknown) {
          if (
            error instanceof vscode.FileSystemError &&
            error.code === 'FileNotFound'
          ) {
            throw new Error(
              `Cannot submit because the required file is missing: ${relativePath}`,
            );
          }
          throw error;
        }
      }
      return files;
    }

    const visit = async (
      currentFolder: vscode.Uri,
      parentSegments: string[],
    ): Promise<void> => {
      const entries = await vscode.workspace.fs.readDirectory(currentFolder);

      for (const [name, type] of entries) {
        if (type & vscode.FileType.SymbolicLink) {
          throw new Error(`Symbolic links cannot be submitted: ${[
            ...parentSegments,
            name,
          ].join('/')}`);
        }

        if (type & vscode.FileType.Directory) {
          if (!EXCLUDED_DIRECTORIES.has(name)) {
            await visit(
              vscode.Uri.joinPath(currentFolder, name),
              [...parentSegments, name],
            );
          }
          continue;
        }

        if (!(type & vscode.FileType.File) ||
          (!parentSegments.length && EXCLUDED_FILES.has(name))) {
          continue;
        }

        const pathSegments = [...parentSegments, name];
        const relativePath = pathSegments.join('/');
        getSafePathSegments(relativePath);
        await addFile(vscode.Uri.joinPath(currentFolder, name), relativePath);
      }
    };

    await visit(folder, []);

    if (!Object.keys(files).length) {
      throw new Error('No source files were found to submit.');
    }

    return files;
  }
}

function getSafePathSegments(relativePath: string): string[] {
  const pathSegments = relativePath.split('/');
  if (pathSegments.some((segment) =>
    !SAFE_PATH_SEGMENT.test(segment) ||
    segment === '.' ||
    segment === '..' ||
    segment.trim() !== segment)) {
    throw new Error(`Unsupported submission file path: ${relativePath}`);
  }
  return pathSegments;
}
