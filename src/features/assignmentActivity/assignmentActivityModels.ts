export type AssignmentActivityAction = 'run' | 'submit';

export interface AssignmentActivityEvent {
  id: string;
  timestamp: string;
  action: AssignmentActivityAction;
  files: Record<string, string>;
}
