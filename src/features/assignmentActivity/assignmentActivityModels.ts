export type AssignmentActivityDiffOperation = -1 | 0 | 1;

export type AssignmentActivityDiffTuple = [
  AssignmentActivityDiffOperation,
  string,
];

export type AssignmentActivityFileDiff = AssignmentActivityDiffTuple[];

export type AssignmentActivityAction = 'run' | 'public-test' | 'submit';

export interface AssignmentActivityLoadEvent {
  id: string;
  timestamp: string;
  action: 'load';
  files: Record<string, string>;
}

export interface AssignmentActivityActionEvent {
  id: string;
  timestamp: string;
  action: AssignmentActivityAction;
  files: Record<string, AssignmentActivityFileDiff>;
}

export type AssignmentActivityEvent =
  | AssignmentActivityLoadEvent
  | AssignmentActivityActionEvent;

/** Full source state supplied when recording an action. */
export interface AssignmentActivityActionInput {
  id: string;
  timestamp: string;
  action: AssignmentActivityAction;
  files: Record<string, string>;
}

export interface CompletedAssignmentActivity {
  submissionUuid: string;
  events: AssignmentActivityEvent[];
}
