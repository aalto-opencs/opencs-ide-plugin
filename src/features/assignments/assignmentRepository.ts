import JSZip = require('jszip');
import { ApiClient } from '../../infrastructure/apiClient';
import { ProgrammingExerciseStarter } from './assignmentModels';

export interface AssignmentRepository {
  getContentHash(exerciseUuid: string): Promise<string>;
  getStarter(exerciseUuid: string): Promise<ProgrammingExerciseStarter>;
  getStarterFiles(exerciseUuid: string): Promise<Uint8Array>;
}

export class ApiAssignmentRepository implements AssignmentRepository {
  public constructor(
    private readonly apiClient: ApiClient,
  ) {}

  public async getContentHash(exerciseUuid: string): Promise<string> {
    const headers = await this.apiClient.head(
      `/exercises/${encodeURIComponent(exerciseUuid)}`,
    );
    const etag = headers.get('ETag');
    const contentHash = etag?.match(/^"([0-9a-f]{32})"$/)?.[1];

    if (!contentHash) {
      throw new Error('The platform returned an invalid assignment version.');
    }

    return contentHash;
  }

  public async getStarter(
    exerciseUuid: string,
  ): Promise<ProgrammingExerciseStarter> {
    return this.apiClient.get<ProgrammingExerciseStarter>(
      `/exercises/${encodeURIComponent(exerciseUuid)}/starter`,
    );
  }

  public async getStarterFiles(exerciseUuid: string): Promise<Uint8Array> {
    return this.apiClient.getBytes(
      `/exercises/${encodeURIComponent(exerciseUuid)}/starter/files`,
    );
  }
}

export class MockAssignmentRepository implements AssignmentRepository {
  public async getContentHash(_exerciseUuid: string): Promise<string> {
    return '00000000000000000000000000000000';
  }

  public async getStarter(
    exerciseUuid: string,
  ): Promise<ProgrammingExerciseStarter> {
    return {
      uuid: exerciseUuid,
      type: 'programming-exercise',
      name: 'Hello platform',
      handout: '# Hello platform\n\nComplete the starter function.',
      prerequisites_met: true,
    };
  }

  public async getStarterFiles(_exerciseUuid: string): Promise<Uint8Array> {
    const archive = new JSZip();
    archive.file(
      'src/index.ts',
      'export function hello(): string {\n  return "TODO";\n}\n',
    );
    archive.file('package.json', '{"private":true}\n');
    return archive.generateAsync({ type: 'uint8array' });
  }
}
