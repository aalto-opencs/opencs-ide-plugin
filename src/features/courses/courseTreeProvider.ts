import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import { CourseEnrolment } from './courseModels';
import { CourseService } from './courseService';

class CourseTreeItem extends vscode.TreeItem {
  public constructor(
    label: string,
    collapsibleState = vscode.TreeItemCollapsibleState.None,
    public readonly children: CourseTreeItem[] = [],
  ) {
    super(label, collapsibleState);
  }
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
      return element.children;
    }

    const session = await this.authService.getCurrentSession();

    if (!session) {
      return [this.createSignInItem()];
    }

    try {
      const enrolments = await this.courseService.getEnrolments();

      if (!enrolments.length) {
        return [this.createMessageItem(
          'No course enrolments found.',
          'info',
        )];
      }

      return enrolments.map((enrolment) =>
        this.createCourseItem(enrolment));
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
  ): CourseTreeItem {
    const instanceItems = enrolment.instances.map((instance) => {
      const item = new CourseTreeItem(instance.label);
      const isActive = instance.id === enrolment.activeInstanceId;

      item.description = isActive ? 'Active' : undefined;
      item.iconPath = new vscode.ThemeIcon(
        isActive ? 'check' : 'circle-outline',
      );

      return item;
    });
    const item = new CourseTreeItem(
      enrolment.courseName || enrolment.courseSlug,
      instanceItems.length
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      instanceItems,
    );

    item.description = enrolment.abbreviation || enrolment.courseSlug;
    item.tooltip = enrolment.courseSlug;
    item.iconPath = new vscode.ThemeIcon('book');

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

  private createMessageItem(
    message: string,
    icon: string,
  ): CourseTreeItem {
    const item = new CourseTreeItem(message);
    item.iconPath = new vscode.ThemeIcon(icon);
    return item;
  }
}
