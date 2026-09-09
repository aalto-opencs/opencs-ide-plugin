import { ProgrammingAssignment } from '../assignments/assignmentModels';
import { CollectedSubmission } from '../submissions/submissionModels';

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
  | { status: 'unavailable'; message: string };

export interface SyntaxCheckService {
  readonly languageLabel: string;
  supports(assignment: ProgrammingAssignment): boolean;
  check(
    assignment: ProgrammingAssignment,
    prepared: CollectedSubmission,
  ): Promise<SyntaxCheckResult>;
}

/** Chooses the language-specific syntax checker for the current assignment. */
export class CompositeSyntaxCheckService implements SyntaxCheckService {
  public readonly languageLabel = 'source';

  public constructor(
    private readonly services: readonly SyntaxCheckService[],
  ) {}

  public supports(assignment: ProgrammingAssignment): boolean {
    return this.findService(assignment) !== undefined;
  }

  public check(
    assignment: ProgrammingAssignment,
    prepared: CollectedSubmission,
  ): Promise<SyntaxCheckResult> {
    const service = this.findService(assignment);
    return service
      ? service.check(assignment, prepared)
      : Promise.resolve({
        status: 'unavailable',
        message: 'Syntax checking is not available for this assignment.',
      });
  }

  private findService(
    assignment: ProgrammingAssignment,
  ): SyntaxCheckService | undefined {
    return this.services.find((service) => service.supports(assignment));
  }
}
