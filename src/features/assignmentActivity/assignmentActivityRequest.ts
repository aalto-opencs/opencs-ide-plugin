import { AssignmentActivityEvent } from './assignmentActivityModels';

export const MAX_ACTIVITY_LOG_REQUEST_BYTES = 256 * 1024;

export function createActivityLogRequest(
  submissionUuid: string,
  events: readonly AssignmentActivityEvent[],
) {
  return {
    eventType: 'ide-action-log' as const,
    data: {
      submissionUuid,
      log: events.map((event) => event.action === 'load'
        ? {
          action: event.action,
          timestamp: event.timestamp,
          files: event.files,
        }
        : {
          action: event.action,
          timestamp: event.timestamp,
          diffs: event.files,
        }),
    },
  };
}

export function activityLogRequestBytes(
  submissionUuid: string,
  events: readonly AssignmentActivityEvent[],
): number {
  return new TextEncoder().encode(
    JSON.stringify(createActivityLogRequest(submissionUuid, events)),
  ).byteLength;
}

export function activityLogRequestFits(
  submissionUuid: string,
  events: readonly AssignmentActivityEvent[],
): boolean {
  return activityLogRequestBytes(submissionUuid, events) <=
    MAX_ACTIVITY_LOG_REQUEST_BYTES;
}
