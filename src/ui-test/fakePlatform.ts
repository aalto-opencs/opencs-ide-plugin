import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'http';
import JSZip = require('jszip');

// Must match the endpoint settings written by scripts/run-ui-tests.sh.
export const FAKE_PLATFORM_PORT = Number(
  process.env.OPENCS_UI_TEST_PLATFORM_PORT ?? '47123',
);

export const STUDENT_EMAIL = 'student@example.test';
export const COURSE_NAME = 'UI Test Course';
export const COURSE_VERSION_LABEL = 'Autumn 2026';
export const PART_NAME = 'Getting Started';
export const CHAPTER_NAME = 'First Steps';
export const EXERCISE_NAME = 'Hello UI Test';
export const STARTER_FILE = 'main.js';
export const STARTER_CONTENT = 'console.log("Hello from the starter");\n';
export const PASSING_TEST_NAME = 'Prints the greeting';

const COURSE_SLUG = 'ui-test-course';
const INSTANCE_ID = 7;
const EXERCISE_UUID = '11111111-1111-4111-8111-111111111111';
const SUBMISSION_UUID = '22222222-2222-4222-8222-222222222222';
const CONTENT_HASH = '0123456789abcdef0123456789abcdef';
const MAX_POINTS = 2;

interface RecordedRequest {
  method: string;
  path: string;
  body: string;
}

/**
 * A stateful stand-in for the OpenCS platform and API that serves one course
 * with one programming exercise. Response shapes follow the fixtures in the
 * Extension Host tests.
 */
export class FakePlatform {
  public readonly requests: RecordedRequest[] = [];
  public readonly unexpectedRequests: string[] = [];
  private activeInstanceId: number | null = null;
  private submittedAt: string | undefined;
  private statusPolls = 0;

  private constructor(private readonly server: Server) {}

  public static async start(): Promise<FakePlatform> {
    const server = createServer();
    const platform = new FakePlatform(server);
    server.on('request', (request, response) => {
      void platform.handle(request, response).catch((error: unknown) => {
        respondJson(response, 500, { message: String(error) });
      });
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(FAKE_PLATFORM_PORT, '127.0.0.1', resolve);
    });
    return platform;
  }

  public async close(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }

  public received(method: string, path: string): RecordedRequest[] {
    return this.requests.filter(
      (request) => request.method === method && request.path === path,
    );
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1');
    const method = request.method ?? 'GET';
    const body = await readBody(request);
    this.requests.push({ method, path: url.pathname, body });

    const route = `${method} ${url.pathname}`;
    const exercise = `/api/exercises/${EXERCISE_UUID}`;

    switch (route) {
      case 'GET /en/auth/ide': {
        const callback = new URL(url.searchParams.get('callback_uri') ?? '');
        callback.searchParams.set('code', 'ui-test-authorization-code');
        callback.searchParams.set('state', url.searchParams.get('state') ?? '');
        response.writeHead(302, { Location: callback.toString() }).end();
        return;
      }
      case 'POST /api/auth/ide/exchange':
        return respondJson(response, 200, {
          token: 'ui-test-session-token',
          id: 1,
          email: STUDENT_EMAIL,
        });
      case 'GET /api/status':
        return respondJson(response, 200, { migrationVersion: '1' });
      case 'GET /api/users/ide-available-course-enrolments':
        return respondJson(response, 200, [{
          courseSlug: COURSE_SLUG,
          courseName: COURSE_NAME,
          abbreviation: 'UTC',
          activeInstanceId: this.activeInstanceId,
          instances: [{
            id: INSTANCE_ID,
            label: COURSE_VERSION_LABEL,
            startTime: null,
            endTime: null,
            pointsComparisonEnabled: false,
          }],
        }]);
      case 'GET /api/course-instances':
        return respondJson(response, 200, {
          status: 'success',
          courseInstances: [{
            id: INSTANCE_ID,
            label: COURSE_VERSION_LABEL,
            start_time: null,
            end_time: null,
          }],
        });
      case `POST /api/course-instances/${INSTANCE_ID}/active`:
        this.activeInstanceId = INSTANCE_ID;
        return respondJson(response, 200, { status: 'success' });
      case `GET /api/course-materials/${COURSE_SLUG}/structure`:
        return respondJson(response, 200, {
          success: true,
          structure: [{
            slug: 'getting-started',
            name: PART_NAME,
            order: 0,
            chapters: [{
              slug: 'first-steps',
              name: CHAPTER_NAME,
              order: 0,
              exercises: [{
                exerciseUuid: EXERCISE_UUID,
                name: EXERCISE_NAME,
                type: 'programming-exercise',
                maxPoints: MAX_POINTS,
                order: 0,
              }],
            }],
          }],
        });
      case `GET /api/points/exercises/instance/${INSTANCE_ID}`:
        return respondJson(response, 200, {
          progress: [{
            exerciseUuid: EXERCISE_UUID,
            points: this.isGraded() ? MAX_POINTS : 0,
            maxPoints: MAX_POINTS,
          }],
        });
      case `HEAD ${exercise}`:
        response.writeHead(200, { ETag: `"${CONTENT_HASH}"` }).end();
        return;
      case `GET ${exercise}/starter`:
        return respondJson(response, 200, {
          uuid: EXERCISE_UUID,
          type: 'programming-exercise',
          name: EXERCISE_NAME,
          handout: `# ${EXERCISE_NAME}\n\nPrint a greeting.\n`,
        });
      case `GET ${exercise}/starter/files`: {
        const archive = new JSZip();
        archive.file(STARTER_FILE, STARTER_CONTENT);
        const bytes = await archive.generateAsync({ type: 'nodebuffer' });
        response.writeHead(200, { 'Content-Type': 'application/zip' })
          .end(bytes);
        return;
      }
      case `GET /api/submissions/${EXERCISE_UUID}`:
        return respondJson(
          response,
          200,
          this.submissionHistory(url.searchParams.has('light')),
        );
      case 'POST /api/submissions':
        this.submittedAt = new Date().toISOString();
        return respondJson(response, 200, { submissionUuid: SUBMISSION_UUID });
      case 'POST /api/event-logs':
        return respondJson(response, 200, { status: 'success' });
      case `GET /api/submissions/status/${SUBMISSION_UUID}`:
        this.statusPolls += 1;
        return respondJson(response, 200, this.isGraded()
          ? {
            gradingStatus: 'PROCESSED',
            correct: true,
            gradingData: this.gradingData(),
          }
          : { gradingStatus: 'PENDING', correct: null, gradingData: null });
      default:
        this.unexpectedRequests.push(route);
        return respondJson(response, 404, { message: `Not faked: ${route}` });
    }
  }

  // The first status poll reports PENDING so the test sees grading progress.
  private isGraded(): boolean {
    return this.statusPolls > 1;
  }

  private gradingData(): unknown {
    return { testResults: [{ testName: PASSING_TEST_NAME, passed: true }] };
  }

  private submissionHistory(light: boolean): unknown[] {
    if (!this.submittedAt) {
      return [];
    }
    const correct = this.isGraded() ? true : null;
    if (light) {
      return [{ uuid: SUBMISSION_UUID, created_at: this.submittedAt, correct }];
    }
    return [{
      uuid: SUBMISSION_UUID,
      created_at: this.submittedAt,
      correct,
      grading_status: this.isGraded() ? 'PROCESSED' : 'PENDING',
      grading_data: this.isGraded() ? this.gradingData() : null,
    }];
  }
}

function respondJson(
  response: ServerResponse,
  status: number,
  body: unknown,
): void {
  response.writeHead(status, { 'Content-Type': 'application/json' })
    .end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString('utf8');
}
