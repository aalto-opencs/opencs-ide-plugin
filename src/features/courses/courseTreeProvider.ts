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

export class CourseTreeProvider implements
  vscode.TreeDataProvider<CourseTreeItem>,
  vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<
    void
  >();
  private treeView?: vscode.TreeView<CourseTreeItem>;
  private viewDescription?: string;

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
      return [];
    }

    const assignmentRoot = this.assignmentFolderRepository.getRoot(
      session.student.id,
    );
    if (!assignmentRoot) {
      this.setDescription(undefined);
      return [];
    }

    const selection = this.courseSelectionRepository.getSelection(
      session.student.id,
    );
    if (!selection) {
      this.setDescription(undefined);
      return [];
    }

    try {
      const enrolments = await this.courseService.getEnrolments();

      if (!enrolments.length) {
        this.setDescription(undefined);
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
        return [this.createMessageItem(
          'Your previous course selection is no longer available.',
          'warning',
        )];
      }

      this.setDescription(
        `${enrolment.abbreviation || enrolment.courseName || enrolment.courseSlug} · ${instance.label}`,
      );
      return this.loadCourseContent(
        enrolment.courseSlug,
        instance.id,
        assignmentRoot,
        session.student.id,
      );
    } catch (error: unknown) {
      this.setDescription(undefined);
      const message = error instanceof Error
        ? error.message
        : 'Failed to load course enrolments.';

      return [this.createMessageItem(message, 'error')];
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
  ): Promise<CourseTreeItem[]> {
    try {
      const structure = await this.courseMaterialService.getStructure(
        courseSlug,
      );
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

      return programmingParts.length
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
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : 'Failed to load course content.';
      return [this.createMessageItem(message, 'error')];
    }
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
        this.submissionRepository.hasPassed(
          assignment.exerciseUuid,
          assignment.courseInstanceId,
        ).catch(() => false),
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

    return item;
  }

  private createMessageItem(
    message: string,
    icon: string,
  ): CourseTreeItem {
    const item = new CourseTreeItem(message);
    item.iconPath = new vscode.ThemeIcon(icon);
    return item;
  }

  private setDescription(description: string | undefined): void {
    this.viewDescription = description;
    if (this.treeView) {
      this.treeView.description = description;
    }
  }
}
