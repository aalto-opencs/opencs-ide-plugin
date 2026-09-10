import * as vscode from 'vscode';
import {
  PROGRAMMING_EXERCISE_TYPE,
  ProgrammingAssignment,
} from '../assignments/assignmentModels';
import { AuthService } from '../auth/authService';
import { AssignmentFolderRepository } from '../assignments/assignmentFolderRepository';
import { AssignmentFileRepository } from '../assignments/assignmentFileRepository';
import {
  CourseChapter,
  CourseExercise,
  CoursePart,
} from '../courseMaterials/courseMaterialModels';
import { CourseMaterialService } from '../courseMaterials/courseMaterialService';
import { CourseCacheRepository } from './courseCacheRepository';
import { CourseSelectionRepository } from './courseSelectionRepository';
import { CourseService } from './courseService';
import { CourseExercisePoints } from '../coursePoints/coursePointsModels';
import { CoursePointsService } from '../coursePoints/coursePointsService';
import { CurrentAssignmentRepository } from '../assignments/currentAssignmentRepository';
import { CourseEnrolmentSyncService } from './courseEnrolmentSyncService';
import { CourseSyncService } from './courseSyncService';

class CourseTreeItem extends vscode.TreeItem {
  public constructor(
    label: string,
    collapsibleState = vscode.TreeItemCollapsibleState.None,
    public children: CourseTreeItem[] | null = [],
    public readonly courseSlug?: string,
    public readonly courseInstanceId?: number | null,
  ) {
    super(label, collapsibleState);
  }

  public assignment?: ProgrammingAssignment;
  public completed = false;
  public parent?: CourseTreeItem;
}

/**
 * Projects authenticated application state into the Courses tree.
 *
 * Root loading is intentionally gated by session -> assignment root -> selected
 * course/version. API results are cached per student; an API failure reuses
 * validated cache data and marks the view as Cached instead of clearing it.
 */
export class CourseTreeProvider implements
  vscode.TreeDataProvider<CourseTreeItem>,
  vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<
    void
  >();
  private readonly enrolmentSyncService: CourseEnrolmentSyncService;
  private readonly courseSyncService: CourseSyncService;
  private readonly ownsEnrolmentSyncService: boolean;
  private readonly ownsCourseSyncService: boolean;
  private readonly enrolmentSyncSubscription: vscode.Disposable;
  private readonly courseSyncSubscription: vscode.Disposable;
  private treeView?: vscode.TreeView<CourseTreeItem>;
  private viewDescription?: string;
  private viewMessage?: string;

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(
    private readonly authService: AuthService,
    private readonly courseService: CourseService,
    private readonly courseMaterialService: CourseMaterialService,
    private readonly assignmentFolderRepository: AssignmentFolderRepository,
    private readonly assignmentFileRepository: AssignmentFileRepository,
    private readonly courseSelectionRepository: CourseSelectionRepository,
    private readonly coursePointsService: CoursePointsService,
    private readonly isDevelopmentCompleted: (
      userId: number,
      assignment: ProgrammingAssignment,
    ) => boolean = () => false,
    private readonly cacheRepository?: CourseCacheRepository,
    private readonly currentAssignmentRepository?: CurrentAssignmentRepository,
    enrolmentSyncService?: CourseEnrolmentSyncService,
    courseSyncService?: CourseSyncService,
  ) {
    this.ownsEnrolmentSyncService = enrolmentSyncService === undefined;
    this.enrolmentSyncService = enrolmentSyncService ??
      new CourseEnrolmentSyncService(courseService, cacheRepository);
    this.enrolmentSyncSubscription = this.enrolmentSyncService.onDidChange(
      () => this.refresh(),
    );
    this.ownsCourseSyncService = courseSyncService === undefined;
    this.courseSyncService = courseSyncService ?? new CourseSyncService(
      courseService,
      courseMaterialService,
      coursePointsService,
      cacheRepository,
      this.enrolmentSyncService,
    );
    this.courseSyncSubscription = this.courseSyncService.onDidChange(
      () => this.refresh(),
    );
  }

  public refresh(): void {
    this.changeEmitter.fire();
  }

  public attachTreeView(treeView: vscode.TreeView<CourseTreeItem>): void {
    this.treeView = treeView;
  }

  public get description(): string | undefined {
    return this.viewDescription;
  }

  public get message(): string | undefined {
    return this.viewMessage;
  }

  public getTreeItem(element: CourseTreeItem): vscode.TreeItem {
    return element;
  }

  public getParent(element: CourseTreeItem): CourseTreeItem | undefined {
    return element.parent;
  }

  public async revealAssignment(exerciseUuid: string): Promise<boolean> {
    if (!this.treeView) {
      return false;
    }
    const roots = await this.getChildren();
    const assignment = findAssignmentItem(roots, exerciseUuid);
    if (!assignment) {
      return false;
    }
    await this.treeView.reveal(assignment, {
      select: true,
      focus: true,
      expand: false,
    });
    return true;
  }

  public async getChildren(
    element?: CourseTreeItem,
  ): Promise<CourseTreeItem[]> {
    if (element) {
      return element.children ?? [];
    }

    const session = await this.authService.getCurrentSession();

    if (!session) {
      this.setDescription(undefined);
      this.setMessage(undefined);
      return [];
    }

    const assignmentRoot = this.assignmentFolderRepository.getRoot(
      session.student.id,
    );
    if (!assignmentRoot) {
      this.setDescription(undefined);
      this.setMessage(undefined);
      return [];
    }

    const selection = this.courseSelectionRepository.getSelection(
      session.student.id,
    );
    if (!selection) {
      this.setDescription(undefined);
      this.setMessage(undefined);
      return [];
    }

    const enrolmentSnapshot = this.enrolmentSyncService.getSnapshot(
      session.student.id,
    );
    const structure = this.courseSyncService.getStructureSnapshot(
      session.student.id,
      selection.courseSlug,
    );
    const exercisePoints = this.courseSyncService.getExercisePointsSnapshot(
      session.student.id,
      selection.courseInstanceId,
    );
    if (!enrolmentSnapshot || !structure) {
      this.setDescription(undefined);
      this.setMessage('Course data is unavailable. Refresh to retry.');
      return [this.createMessageItem(
        'Course data is unavailable. Refresh to retry.',
        'error',
        'aaltoOpenCsIde.refreshCourses',
      )];
    }

    try {
      const enrolments = enrolmentSnapshot.enrolments;

      if (!enrolments.length) {
        this.setDescription(undefined);
        this.setMessage(undefined);
        return [this.createMessageItem(
          'No course enrolments found.',
          'info',
        )];
      }

      const enrolment = enrolments.find((candidate) =>
        candidate.courseSlug === selection.courseSlug);
      const instance = enrolment?.instances.find((candidate) =>
        candidate.id === selection.courseInstanceId);

      if (!enrolment || !instance) {
        await this.courseSelectionRepository.clearSelection(
          session.student.id,
        );
        this.setDescription(undefined);
        this.setMessage(undefined);
        return [this.createMessageItem(
          'Your previous course selection is no longer available.',
          'warning',
        )];
      }

      const contentResult = await this.loadCourseContent(
        enrolment.courseSlug,
        enrolment.courseName || enrolment.courseSlug,
        instance.id,
        instance.label,
        assignmentRoot,
        session.student.id,
        session.student.email,
        structure.value,
        exercisePoints
          ? new Map(exercisePoints.value.map((entry) => [
            entry.exerciseUuid,
            entry,
          ]))
          : undefined,
      );
      const refreshing = enrolmentSnapshot.refreshing ||
        structure.refreshing || exercisePoints?.refreshing === true;
      const usingCache = enrolmentSnapshot.source === 'cache' ||
        enrolmentSnapshot.offline || structure.source === 'cache' ||
        structure.offline || exercisePoints === undefined ||
        exercisePoints.source === 'cache' || exercisePoints.offline;
      this.setDescription([
        enrolment.abbreviation || enrolment.courseName || enrolment.courseSlug,
        instance.label,
        usingCache ? 'Cached' : undefined,
      ].filter(Boolean).join(' · '));
      this.setMessage(refreshing
        ? 'Refreshing course data...'
        : usingCache
          ? 'Platform offline - retry later'
          : undefined);
      return contentResult;
    } catch (error: unknown) {
      this.setDescription(undefined);
      this.setMessage('Course data is unavailable. Refresh to retry.');
      const message = error instanceof Error
        ? error.message
        : 'Failed to load course enrolments.';

      return [this.createMessageItem(
        message,
        'error',
        'aaltoOpenCsIde.refreshCourses',
      )];
    }
  }

  public dispose(): void {
    this.changeEmitter.dispose();
    this.enrolmentSyncSubscription.dispose();
    this.courseSyncSubscription.dispose();
    if (this.ownsEnrolmentSyncService) {
      this.enrolmentSyncService.dispose();
    }
    if (this.ownsCourseSyncService) {
      this.courseSyncService.dispose();
    }
  }

  private async loadCourseContent(
    courseSlug: string,
    courseName: string,
    courseInstanceId: number,
    courseInstanceName: string,
    root: vscode.Uri,
    userId: number,
    userEmail: string,
    structure: CoursePart[],
    exerciseProgress: Map<string, CourseExercisePoints> | undefined,
  ): Promise<CourseTreeItem[]> {
    const programmingParts = structure
        .map((part) => ({
          ...part,
          chapters: part.chapters
            .map((chapter) => ({
              ...chapter,
              exercises: chapter.exercises.filter((exercise) =>
                exercise.type === PROGRAMMING_EXERCISE_TYPE),
            }))
            .filter((chapter) => chapter.exercises.length > 0),
        }))
        .filter((part) => part.chapters.length > 0);

    const items = programmingParts.length
        ? await Promise.all(programmingParts.map((part) => this.createPartItem(
          part,
          courseSlug,
          courseName,
          courseInstanceId,
          courseInstanceName,
          root,
          userId,
          userEmail,
          exerciseProgress,
        )))
        : [this.createMessageItem(
          'No programming assignments found.',
          'info',
        )];
    return items;
  }

  private async createPartItem(
    part: CoursePart,
    courseSlug: string,
    courseName: string,
    courseInstanceId: number | null,
    courseInstanceName: string,
    root: vscode.Uri | undefined,
    userId: number | undefined,
    userEmail: string,
    exerciseProgress: Map<string, CourseExercisePoints> | undefined,
  ): Promise<CourseTreeItem> {
    const chapters = await Promise.all(part.chapters.map((chapter) =>
      this.createChapterItem(
        chapter,
        courseSlug,
        courseName,
        courseInstanceId,
        courseInstanceName,
        root,
        userId,
        userEmail,
        exerciseProgress,
      )));
    const item = new CourseTreeItem(
      part.name,
      chapters.length
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      chapters,
    );
    for (const chapter of chapters) {
      chapter.parent = item;
    }
    item.completed = chapters.length > 0 &&
      chapters.every((chapter) => chapter.completed);
    item.iconPath = new vscode.ThemeIcon(
      item.completed ? 'pass' : 'folder',
    );
    if (item.completed) {
      item.description = 'Completed';
      item.tooltip = 'All programming assignments in this part are completed.';
    }
    item.accessibilityInformation = {
      label: `Course part: ${part.name}. ${item.completed ? 'Completed' : 'Not completed'}.`,
    };
    return item;
  }

  private async createChapterItem(
    chapter: CourseChapter,
    courseSlug: string,
    courseName: string,
    courseInstanceId: number | null,
    courseInstanceName: string,
    root: vscode.Uri | undefined,
    userId: number | undefined,
    userEmail: string,
    exerciseProgress: Map<string, CourseExercisePoints> | undefined,
  ): Promise<CourseTreeItem> {
    const exercises = await Promise.all(chapter.exercises.map((exercise) =>
      this.createExerciseItem(
        exercise,
        courseSlug,
        courseName,
        courseInstanceId,
        courseInstanceName,
        root,
        userId,
        userEmail,
        exerciseProgress,
      )));
    const item = new CourseTreeItem(
      chapter.name,
      exercises.length
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      exercises,
    );
    for (const exercise of exercises) {
      exercise.parent = item;
    }
    item.completed = exercises.length > 0 &&
      exercises.every((exercise) => exercise.completed);
    item.iconPath = new vscode.ThemeIcon(
      item.completed ? 'pass' : 'book',
    );
    if (item.completed) {
      item.description = 'Completed';
      item.tooltip = 'All programming assignments in this chapter are completed.';
    }
    item.accessibilityInformation = {
      label: `Course chapter: ${chapter.name}. ${item.completed ? 'Completed' : 'Not completed'}.`,
    };
    return item;
  }

  private async createExerciseItem(
    exercise: CourseExercise,
    courseSlug: string,
    courseName: string,
    courseInstanceId: number | null,
    courseInstanceName: string,
    root: vscode.Uri | undefined,
    userId: number | undefined,
    userEmail: string,
    exerciseProgress: Map<string, CourseExercisePoints> | undefined,
  ): Promise<CourseTreeItem> {
    const item = new CourseTreeItem(
      exercise.name || exercise.exerciseUuid,
    );
    item.description = `${exercise.maxPoints} pts`;
    item.tooltip = [
      exercise.exerciseUuid,
      exercise.type,
    ].join('\n');
    const isProgrammingExercise =
      exercise.type === PROGRAMMING_EXERCISE_TYPE;
    item.iconPath = new vscode.ThemeIcon(
      isProgrammingExercise ? 'cloud-download' : 'checklist',
    );

    if (isProgrammingExercise) {
      const assignment: ProgrammingAssignment = {
        exerciseUuid: exercise.exerciseUuid,
        name: exercise.name || exercise.exerciseUuid,
        type: exercise.type,
        courseSlug,
        courseName,
        courseInstanceId,
        courseInstanceName,
      };
      const [downloaded, backendPassed] = await Promise.all([
        root
          ? this.assignmentFileRepository.isDownloadedAssignment(
            root,
            userEmail,
            assignment,
          )
          : false,
        this.loadPassedState(userId, assignment, exerciseProgress),
      ]);
      const passed = backendPassed ||
        (userId !== undefined &&
          this.isDevelopmentCompleted(userId, assignment));
      const current = userId !== undefined &&
        this.currentAssignmentRepository?.get(userId)?.exerciseUuid ===
          assignment.exerciseUuid;
      item.assignment = assignment;
      if (passed) {
        item.contextValue = downloaded
          ? 'completedDownloadedProgrammingExercise'
          : 'completedProgrammingExercise';
        item.completed = true;
        item.description = `Completed • ${exercise.maxPoints} pts`;
        item.iconPath = new vscode.ThemeIcon('pass');
        item.tooltip = [
          assignment.name,
          'Completed: all assignment tests passed.',
        ].join('\n');
      } else if (downloaded) {
        item.contextValue = 'downloadedProgrammingExercise';
        item.iconPath = new vscode.ThemeIcon('folder-opened');
      } else {
        item.contextValue = 'programmingExercise';
      }
      if (current) {
        item.description = `Current • ${item.description}`;
        item.iconPath = new vscode.ThemeIcon('target');
      }
      item.command = {
        command: 'aaltoOpenCsIde.selectAssignment',
        title: 'Select Exercise',
        arguments: [item],
      };
    }

    const currentState = userId !== undefined && item.assignment &&
        this.currentAssignmentRepository?.get(userId)?.exerciseUuid ===
          item.assignment.exerciseUuid
      ? 'Current exercise. '
      : '';
    const assignmentState = item.completed
      ? 'Completed'
      : item.contextValue === 'downloadedProgrammingExercise'
        ? 'Downloaded, not completed'
        : 'Not downloaded, not completed';
    item.accessibilityInformation = {
      label: `Programming assignment: ${String(item.label)}. ${currentState}${assignmentState}. ${exercise.maxPoints} points.`,
    };

    return item;
  }

  private createMessageItem(
    message: string,
    icon: string,
    command?: string,
  ): CourseTreeItem {
    const item = new CourseTreeItem(message);
    item.iconPath = new vscode.ThemeIcon(icon);
    item.accessibilityInformation = { label: message };
    if (command) {
      item.command = { command, title: 'Retry' };
      item.tooltip = 'Select to retry loading course data.';
    }
    return item;
  }

  private async loadPassedState(
    userId: number | undefined,
    assignment: ProgrammingAssignment,
    exerciseProgress: Map<string, CourseExercisePoints> | undefined,
  ): Promise<boolean> {
    if (userId === undefined || assignment.courseInstanceId === null) {
      return false;
    }
    if (!exerciseProgress) {
      return this.cacheRepository?.getPassed(
        userId,
        assignment.courseInstanceId,
        assignment.exerciseUuid,
      ) ?? false;
    }

    const progress = exerciseProgress.get(assignment.exerciseUuid);
    const passed = progress !== undefined &&
      progress.points >= progress.maxPoints;
    await this.cacheRepository?.savePassed(
      userId,
      assignment.courseInstanceId,
      assignment.exerciseUuid,
      passed,
    ).catch(() => undefined);
    return passed;
  }

  private setDescription(description: string | undefined): void {
    this.viewDescription = description;
    if (this.treeView) {
      this.treeView.description = description;
    }
  }

  private setMessage(message: string | undefined): void {
    this.viewMessage = message;
    if (this.treeView) {
      this.treeView.message = message;
    }
  }
}

function findAssignmentItem(
  items: CourseTreeItem[],
  exerciseUuid: string,
): CourseTreeItem | undefined {
  for (const item of items) {
    if (item.assignment?.exerciseUuid === exerciseUuid) {
      return item;
    }
    const nested = item.children
      ? findAssignmentItem(item.children, exerciseUuid)
      : undefined;
    if (nested) {
      return nested;
    }
  }
  return undefined;
}
