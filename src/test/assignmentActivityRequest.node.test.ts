import * as assert from 'assert';
import { suite, test } from 'mocha';
import { AssignmentActivityEvent } from '../features/assignmentActivity/assignmentActivityModels';
import {
  activityLogRequestBytes,
  activityLogRequestFits,
  createActivityLogRequest,
  MAX_ACTIVITY_LOG_REQUEST_BYTES,
} from '../features/assignmentActivity/assignmentActivityRequest';

const submissionUuid = '11111111-1111-4111-8111-111111111111';
const timestamp = '2026-09-20T10:00:00.000Z';

suite('Assignment activity request', () => {
  test('serializes the IntroCS IDE action-log contract', () => {
    const events = createEvents('initial code');

    assert.deepStrictEqual(
      createActivityLogRequest(submissionUuid, events),
      {
        eventType: 'ide-action-log',
        data: {
          submissionUuid,
          log: [
            {
              action: 'load',
              timestamp,
              files: { 'app.js': 'initial code' },
            },
            {
              action: 'submit',
              timestamp,
              diffs: {},
            },
          ],
        },
      },
    );
  });

  test('accepts exactly 256 KiB and rejects one additional byte', () => {
    const emptyRequest = {
      eventType: 'ide-action-log',
      data: {
        submissionUuid,
        log: [
          {
            action: 'load',
            timestamp,
            files: { 'app.js': '' },
          },
          {
            action: 'submit',
            timestamp,
            diffs: {},
          },
        ],
      },
    };
    const fixedBytes = new TextEncoder().encode(
      JSON.stringify(emptyRequest),
    ).byteLength;
    const exactEvents = createEvents(
      'x'.repeat(MAX_ACTIVITY_LOG_REQUEST_BYTES - fixedBytes),
    );

    assert.strictEqual(
      activityLogRequestBytes(submissionUuid, exactEvents),
      MAX_ACTIVITY_LOG_REQUEST_BYTES,
    );
    assert.strictEqual(
      activityLogRequestFits(submissionUuid, exactEvents),
      true,
    );
    assert.strictEqual(
      activityLogRequestFits(
        submissionUuid,
        createEvents(
          'x'.repeat(MAX_ACTIVITY_LOG_REQUEST_BYTES - fixedBytes + 1),
        ),
      ),
      false,
    );
  });
});

function createEvents(contents: string): AssignmentActivityEvent[] {
  return [
    {
      id: '22222222-2222-4222-8222-222222222222',
      timestamp,
      action: 'load',
      files: { 'app.js': contents },
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      timestamp,
      action: 'submit',
      files: {},
    },
  ];
}
