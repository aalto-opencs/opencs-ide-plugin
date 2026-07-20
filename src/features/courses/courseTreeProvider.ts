import * as vscode from 'vscode';
import {
  PROGRAMMING_EXERCISE_TYPE,
  ProgrammingAssignment,
} from '../assignments/assignmentModels';
import { AuthService } from '../auth/authService';
import { AssignmentFolderRepository } from '../assignments/assignmentFolderRepository';
import {
  CourseChapter,
  CourseExercise,
  CoursePart,
} from '../courseMaterials/courseMaterialModels';
import { CourseMaterialService } from '../courseMaterials/courseMaterialService';
import {
  CourseEnrolment,
  CourseInstance,
} from './courseModels';
import { CourseSelectionRepository } from './courseSelectionRepository';
import { CourseService } from './courseService';

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
}

export class CourseTreeProvider implements
  vscode.TreeDataProvider<CourseTreeItem>,
  vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<
    void
  >();

  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(
    private readonly authService: AuthService,
    private readonly courseService: CourseService,
    private readonly courseMaterialService: CourseMaterialService,
    private readonly assignmentFolderRepository: AssignmentFolderRepository,
    private readonly courseSelectionRepository: CourseSelectionRepository,
  ) {}

  public refresh(): void {
    this.changeEmitter.fire();
  }

  public getTreeItem(element: CourseTreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(
    element?: CourseTreeItem,
  ): Promise<CourseTreeItem[]> {
    if (element) {
      if (element.children !== null) {
        return element.children;
      }

      return this.loadCourseContent(element);
    }

    const session = await this.authService.getCurrentSession();

    if (!session) {
      return [this.createSignInItem()];
    }

    if (!this.assignmentFolderRepository.getRoot(session.student.id)) {
      return [this.createSelectAssignmentFolderItem()];
    }

    const selection = this.courseSelectionRepository.getSelection(
      session.student.id,
    );
    if (!selection) {
      return [this.createSelectCourseItem()];
    }

    try {
      const enrolments = await this.courseService.getEnrolments();

      if (!enrolments.length) {
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
        return [this.createSelectCourseItem(
          'Your previous course selection is no longer available',
        )];
      }

      return [
        this.createCourseItem(enrolment, instance),
        this.createSelectCourseItem('Change Course or Version'),
      ];
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : 'Failed to load course enrolments.';

      return [this.createMessageItem(message, 'error')];
    }
  }

  public dispose(): void {
    this.changeEmitter.dispose();
  }

  private createCourseItem(
    enrolment: CourseEnrolment,
    instance: CourseInstance,
  ): CourseTreeItem {
    const item = new CourseTreeItem(
      enrolment.courseName || enrolment.courseSlug,
      vscode.TreeItemCollapsibleState.Collapsed,
      null,
      enrolment.courseSlug,
      instance.id,
    );
    item.description = instance.label;
    item.tooltip = [
      enrolment.courseSlug,
      instance.label,
    ].join('\n');
    item.iconPath = new vscode.ThemeIcon('book');

    return item;
  }

  private async loadCourseContent(
    contentItem: CourseTreeItem,
  ): Promise<CourseTreeItem[]> {
    if (!contentItem.courseSlug) {
      return [];
    }

    try {
      const structure = await this.courseMaterialService.getStructure(
        contentItem.courseSlug,
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

      contentItem.children = programmingParts.length
        ? programmingParts.map((part) => this.createPartItem(
          part,
          contentItem.courseSlug as string,
          contentItem.courseInstanceId ?? null,
        ))
        : [this.createMessageItem(
          'No programming assignments found.',
          'info',
        )];
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : 'Failed to load course content.';
      contentItem.children = [this.createMessageItem(message, 'error')];
    }

    return contentItem.children;
  }

  private createPartItem(
    part: CoursePart,
    courseSlug: string,
    courseInstanceId: number | null,
  ): CourseTreeItem {
    const chapters = part.chapters.map((chapter) =>
      this.createChapterItem(chapter, courseSlug, courseInstanceId));
    const item = new CourseTreeItem(
      part.name,
      chapters.length
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      chapters,
    );
    item.iconPath = new vscode.ThemeIcon('folder');
    return item;
  }

  private createChapterItem(
    chapter: CourseChapter,
    courseSlug: string,
    courseInstanceId: number | null,
  ): CourseTreeItem {
    const exercises = chapter.exercises.map((exercise) =>
      this.createExerciseItem(exercise, courseSlug, courseInstanceId));
    const item = new CourseTreeItem(
      chapter.name,
      exercises.length
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      exercises,
    );
    item.iconPath = new vscode.ThemeIcon('book');
    return item;
  }

  private createExerciseItem(
    exercise: CourseExercise,
    courseSlug: string,
    courseInstanceId: number | null,
  ): CourseTreeItem {
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
      item.contextValue = 'programmingExercise';
      item.assignment = {
        exerciseUuid: exercise.exerciseUuid,
        name: exercise.name || exercise.exerciseUuid,
        type: exercise.type,
        courseSlug,
        courseInstanceId,
      };
    }

    return item;
  }

  private createSignInItem(): CourseTreeItem {
    const item = new CourseTreeItem(
      'Sign in to view your courses',
    );

    item.iconPath = new vscode.ThemeIcon('sign-in');
    item.command = {
      command: 'aaltoFitechPlatform.signIn',
      title: 'Sign In',
    };

    return item;
  }

  private createSelectAssignmentFolderItem(): CourseTreeItem {
    const item = new CourseTreeItem(
      'Select an assignment folder to continue',
    );
    item.iconPath = new vscode.ThemeIcon('folder-opened');
    item.command = {
      command: 'aaltoFitechPlatform.selectAssignmentFolder',
      title: 'Select Assignment Folder',
    };
    return item;
  }

  private createSelectCourseItem(
    label = 'Select a course and version to continue',
  ): CourseTreeItem {
    const item = new CourseTreeItem(label);
    item.iconPath = new vscode.ThemeIcon('list-selection');
    item.command = {
      command: 'aaltoFitechPlatform.selectCourse',
      title: 'Select Course and Version',
    };
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
}
