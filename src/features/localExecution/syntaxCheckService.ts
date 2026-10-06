import { CollectedSubmission } from '../submissions/submissionModels';
import { LocalExecutionMetadata } from './localPythonExecutionService';

export interface SyntaxCheckError {
  filePath: string;
  line: number;
  column: number;
  message: string;
  severity?: 'error' | 'warning' | 'info';
}

export type SyntaxCheckResult =
  | { status: 'passed'; checkedFiles: number }
  | { status: 'errors'; checkedFiles: number; errors: SyntaxCheckError[] }
  | { status: 'unavailable'; message: string; pythonNotFound?: boolean };

export interface SyntaxCheckService {
  readonly languageLabel: string;
  supports(metadata: LocalExecutionMetadata): boolean;
  check(
    metadata: LocalExecutionMetadata,
    prepared: CollectedSubmission,
  ): Promise<SyntaxCheckResult>;
}

/** Chooses the language-specific syntax checker for the current assignment. */
export class CompositeSyntaxCheckService implements SyntaxCheckService {
  public readonly languageLabel = 'source';

  public constructor(
    private readonly services: readonly SyntaxCheckService[],
  ) {}

  public supports(metadata: LocalExecutionMetadata): boolean {
    return this.findService(metadata) !== undefined;
  }

  public check(
    metadata: LocalExecutionMetadata,
    prepared: CollectedSubmission,
  ): Promise<SyntaxCheckResult> {
    const service = this.findService(metadata);
    return service
      ? service.check(metadata, prepared)
      : Promise.resolve({
        status: 'unavailable',
        message: 'Syntax checking is not available for this assignment.',
      });
  }

  private findService(
    metadata: LocalExecutionMetadata,
  ): SyntaxCheckService | undefined {
    return this.services.find((service) => service.supports(metadata));
  }
}
