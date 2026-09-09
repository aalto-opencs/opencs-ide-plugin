export type AssignmentActivityAction = 'run' | 'public-test' | 'submit';

export interface AssignmentActivityEvent {
  id: string;
  timestamp: string;
  action: AssignmentActivityAction;
  files: Record<string, string>;
}
