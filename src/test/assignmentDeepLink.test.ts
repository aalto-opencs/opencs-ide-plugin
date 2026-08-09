import * as assert from 'assert';
import * as vscode from 'vscode';
import {
  AssignmentCourseEnrolmentRequiredError,
  AssignmentDeepLinkService,
} from '../features/assignments/assignmentDeepLinkService';
import { CurrentAssignmentRepository } from '../features/assignments/currentAssignmentRepository';
import { CourseMaterialService } from '../features/courseMaterials/courseMaterialService';
import { CourseSelectionRepository } from '../features/courses/courseSelectionRepository';
import { CourseService } from '../features/courses/courseService';
import { ExtensionUriRouter } from '../infrastructure/extensionUriRouter';
import { InMemoryMemento } from './testUtilities';

suite('Assignment platform deep links', () => {
  test('selects a programming assignment from the active course instance', async () => {
    const storage = new InMemoryMemento();
    const selectionRepository = new CourseSelectionRepository(storage);
    const assignmentRepository = new CurrentAssignmentRepository(storage);
    const service = new AssignmentDeepLinkService(
      new CourseService({
        getEnrolments: async () => [{
          courseSlug: 'web-software-development',
          courseName: 'Web Software Development',
          abbreviation: 'WSD',
          activeInstanceId: 17,
          instances: [{
            id: 17,
            label: 'Summer 2026',
            startTime: null,
            endTime: null,
            pointsComparisonEnabled: false,
          }],
        }],
      }),
      new CourseMaterialService({
        getStructure: async () => [{
          slug: 'part-1',
          name: 'Part 1',
          order: 0,
          chapters: [{
            name: 'Chapter 1',
            order: 0,
            exercises: [{
              exerciseUuid: '3b969c55-9645-4203-8bb2-5556c693ed34',
              name: 'Hello world!',
              type: 'programming-exercise',
              maxPoints: 1,
              order: 0,
            }],
          }],
        }],
      }),
      selectionRepository,
      assignmentRepository,
      undefined,
      () => new Date('2026-08-09T12:00:00.000Z'),
    );

    const assignment = await service.selectAssignment(
      42,
      'web-software-development',
      '3b969c55-9645-4203-8bb2-5556c693ed34',
    );

    assert.deepStrictEqual(assignment, {
      exerciseUuid: '3b969c55-9645-4203-8bb2-5556c693ed34',
      name: 'Hello world!',
      type: 'programming-exercise',
      courseSlug: 'web-software-development',
      courseInstanceId: 17,
    });
    assert.deepStrictEqual(assignmentRepository.get(42), assignment);
    assert.deepStrictEqual(selectionRepository.getSelection(42), {
      courseSlug: 'web-software-development',
      courseInstanceId: 17,
      schemaVersion: 2,
      instanceLabel: 'Summer 2026',
      instanceEndTime: null,
      lastValidatedAt: '2026-08-09T12:00:00.000Z',
    });
  });

  test('enrols through the existing active-instance operation and verifies it', async () => {
    const storage = new InMemoryMemento();
    const selectionRepository = new CourseSelectionRepository(storage);
    const assignmentRepository = new CurrentAssignmentRepository(storage);
    let activeInstanceId: number | null = null;
    const instance = {
      id: 17,
      label: 'Summer 2026',
      startTime: null,
      endTime: null,
      pointsComparisonEnabled: false,
    };
    const courseService = new CourseService({
      getEnrolments: async () => activeInstanceId === null ? [] : [{
        courseSlug: 'web-software-development',
        courseName: 'Web Software Development',
        abbreviation: 'WSD',
        activeInstanceId,
        instances: [instance],
      }],
      getCourseInstances: async () => [instance],
      activateCourseInstance: async (id) => { activeInstanceId = id; },
    });
    const service = new AssignmentDeepLinkService(
      courseService,
      new CourseMaterialService({
        getStructure: async () => [{
          slug: 'part-1',
          name: 'Part 1',
          order: 0,
          chapters: [{
            name: 'Chapter 1',
            order: 0,
            exercises: [{
              exerciseUuid: '3b969c55-9645-4203-8bb2-5556c693ed34',
              name: 'Hello world!',
              type: 'programming-exercise',
              maxPoints: 1,
              order: 0,
            }],
          }],
        }],
      }),
      selectionRepository,
      assignmentRepository,
    );

    await assert.rejects(
      service.selectAssignment(
        42,
        'web-software-development',
        '3b969c55-9645-4203-8bb2-5556c693ed34',
      ),
      AssignmentCourseEnrolmentRequiredError,
    );

    const assignment = await service.enrolAndSelectAssignment(
      42,
      'web-software-development',
      '3b969c55-9645-4203-8bb2-5556c693ed34',
      17,
    );

    assert.strictEqual(activeInstanceId, 17);
    assert.strictEqual(assignment.courseInstanceId, 17);
    assert.deepStrictEqual(assignmentRepository.get(42), assignment);
  });

  test('routes authentication and assignment URIs independently', async () => {
    const authUris: string[] = [];
    const assignmentUris: string[] = [];
    const router = new ExtensionUriRouter(
      { handleUri: async (uri) => { authUris.push(uri.path); } },
      { handleUri: async (uri) => { assignmentUris.push(uri.path); } },
    );

    await router.handleUri(vscode.Uri.parse(
      'vscode://aalto-opencs.aalto-opencs-ide/auth/callback',
    ));
    await router.handleUri(vscode.Uri.parse(
      'vscode://aalto-opencs.aalto-opencs-ide/assignments/open',
    ));

    assert.deepStrictEqual(authUris, ['/auth/callback']);
    assert.deepStrictEqual(assignmentUris, ['/assignments/open']);
  });
});
