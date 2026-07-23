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
import {
  CourseEnrolment,
} from './courseModels';
import { CourseCacheRepository } from './courseCacheRepository';
import { CourseSelectionRepository } from './courseSelectionRepository';
import { CourseService } from './courseService';
import { SubmissionRepository } from '../submissions/submissionRepository';

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
  private treeView?: vscode.TreeView<CourseTreeItem>;
  private viewDescription?: string;
  private viewMessage?: string;
  private usedCachedProgress = false;

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(
    private readonly authService: AuthService,
    private readonly courseService: CourseService,
    private readonly courseMaterialService: CourseMaterialService,
    private readonly assignmentFolderRepository: AssignmentFolderRepository,
    private readonly assignmentFileRepository: AssignmentFileRepository,
    private readonly courseSelectionRepository: CourseSelectionRepository,
    private readonly submissionRepository: SubmissionRepository,
    private readonly isDevelopmentCompleted: (
      userId: number,
      assignment: ProgrammingAssignment,
    ) => boolean = () => false,
    private readonly cacheRepository?: CourseCacheRepository,
  ) {}

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

    this.setMessage('Loading course data...');
    this.usedCachedProgress = false;
    try {
      const enrolmentResult = await this.loadEnrolments(session.student.id);
      const enrolments = enrolmentResult.value;

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
        instance.id,
        assignmentRoot,
        session.student.id,
      );
      const usingCache = enrolmentResult.cached || contentResult.cached ||
        this.usedCachedProgress;
      this.setDescription([
        enrolment.abbreviation || enrolment.courseName || enrolment.courseSlug,
        instance.label,
        usingCache ? 'Cached' : undefined,
      ].filter(Boolean).join(' · '));
      this.setMessage(usingCache
        ? 'Platform offline - retry later'
        : undefined);
      return contentResult.items;
    } catch (error: unknown) {
      this.setDescription(undefined);
      this.setMessage('Course data is unavailable. Refresh to retry.');
      const message = error instanceof Error
        ? error.message
        : 'Failed to load course enrolments.';

      return [this.createMessageItem(
        message,
        'error',
        'aaltoFitechPlatform.refreshCourses',
      )];
    }
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }

  private async loadCourseContent(
    courseSlug: string,
    courseInstanceId: number,
    root: vscode.Uri,
    userId: number,
  ): Promise<{ items: CourseTreeItem[]; cached: boolean }> {
    const structureResult = await this.loadStructure(userId, courseSlug);
    const programmingParts = structureResult.value
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
          courseInstanceId,
          root,
          userId,
        )))
        : [this.createMessageItem(
          'No programming assignments found.',
          'info',
        )];
    return { items, cached: structureResult.cached };
  }

  private async createPartItem(
    part: CoursePart,
    courseSlug: string,
    courseInstanceId: number | null,
    root: vscode.Uri | undefined,
    userId: number | undefined,
  ): Promise<CourseTreeItem> {
    const chapters = await Promise.all(part.chapters.map((chapter) =>
      this.createChapterItem(
        chapter,
        courseSlug,
        courseInstanceId,
        root,
        userId,
      )));
    const item = new CourseTreeItem(
      part.name,
      chapters.length
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      chapters,
    );
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
    courseInstanceId: number | null,
    root: vscode.Uri | undefined,
    userId: number | undefined,
  ): Promise<CourseTreeItem> {
    const exercises = await Promise.all(chapter.exercises.map((exercise) =>
      this.createExerciseItem(
        exercise,
        courseSlug,
        courseInstanceId,
        root,
        userId,
      )));
    const item = new CourseTreeItem(
      chapter.name,
      exercises.length
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      exercises,
    );
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
    courseInstanceId: number | null,
    root: vscode.Uri | undefined,
    userId: number | undefined,
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
        courseInstanceId,
      };
      const [downloaded, backendPassed] = await Promise.all([
        root
          ? this.assignmentFileRepository.isDownloadedAssignment(
            root,
            assignment,
          )
          : false,
        this.loadPassedState(userId, assignment),
      ]);
      const passed = backendPassed ||
        (userId !== undefined &&
          this.isDevelopmentCompleted(userId, assignment));
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
    }

    const assignmentState = item.completed
      ? 'Completed'
      : item.contextValue === 'downloadedProgrammingExercise'
        ? 'Downloaded, not completed'
        : 'Not downloaded, not completed';
    item.accessibilityInformation = {
      label: `Programming assignment: ${String(item.label)}. ${assignmentState}. ${exercise.maxPoints} points.`,
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

  private async loadEnrolments(
    userId: number,
  ): Promise<{ value: CourseEnrolment[]; cached: boolean }> {
    try {
      const value = await this.courseService.getEnrolments();
      await this.cacheRepository?.saveEnrolments(userId, value)
        .catch(() => undefined);
      return { value, cached: false };
    } catch (error: unknown) {
      const cached = this.cacheRepository?.getEnrolments(userId);
      if (cached) {
        return { value: cached, cached: true };
      }
      throw error;
    }
  }

  private async loadStructure(
    userId: number,
    courseSlug: string,
  ): Promise<{ value: CoursePart[]; cached: boolean }> {
    try {
      const value = await this.courseMaterialService.getStructure(courseSlug);
      await this.cacheRepository?.saveStructure(userId, courseSlug, value)
        .catch(() => undefined);
      return { value, cached: false };
    } catch (error: unknown) {
      const cached = this.cacheRepository?.getStructure(userId, courseSlug);
      if (cached) {
        return { value: cached, cached: true };
      }
      throw error;
    }
  }

  private async loadPassedState(
    userId: number | undefined,
    assignment: ProgrammingAssignment,
  ): Promise<boolean> {
    if (userId === undefined || assignment.courseInstanceId === null) {
      return false;
    }
    try {
      const passed = await this.submissionRepository.hasPassed(
        assignment.exerciseUuid,
        assignment.courseInstanceId,
      );
      await this.cacheRepository?.savePassed(
        userId,
        assignment.courseInstanceId,
        assignment.exerciseUuid,
        passed,
      ).catch(() => undefined);
      return passed;
    } catch {
      this.usedCachedProgress = true;
      return this.cacheRepository?.getPassed(
        userId,
        assignment.courseInstanceId,
        assignment.exerciseUuid,
      ) ?? false;
    }
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
