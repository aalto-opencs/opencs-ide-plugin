import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import { CourseCacheRepository } from './courseCacheRepository';
import { CourseSelectionRepository } from './courseSelectionRepository';
import { CourseService } from './courseService';
import { CourseEnrolmentSyncService } from './courseEnrolmentSyncService';

/** Shows the one course/version currently driving the assignment workspace. */
export class CourseSelectionTreeProvider implements
  vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  private readonly enrolmentSyncService: CourseEnrolmentSyncService;
  private readonly ownsEnrolmentSyncService: boolean;
  private readonly enrolmentSyncSubscription: vscode.Disposable;
  public readonly onDidChangeTreeData = this.changeEmitter.event;

  public constructor(
    private readonly authService: AuthService,
    private readonly courseService: CourseService,
    private readonly selectionRepository: CourseSelectionRepository,
    private readonly cacheRepository: CourseCacheRepository,
    enrolmentSyncService?: CourseEnrolmentSyncService,
  ) {
    this.ownsEnrolmentSyncService = enrolmentSyncService === undefined;
    this.enrolmentSyncService = enrolmentSyncService ??
      new CourseEnrolmentSyncService(courseService, cacheRepository);
    this.enrolmentSyncSubscription = this.enrolmentSyncService.onDidChange(
      () => this.refresh(),
    );
  }

  public refresh(): void {
    this.changeEmitter.fire();
  }

  public getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  public async getChildren(): Promise<vscode.TreeItem[]> {
    const session = await this.authService.getCurrentSession();
    const selection = session
      ? this.selectionRepository.getSelection(session.student.id)
      : undefined;
    if (!session || !selection) {
      return [];
    }

    let snapshot;
    try {
      snapshot = await this.enrolmentSyncService.read(session.student.id);
    } catch {
      return [];
    }
    const enrolments = snapshot.enrolments;

    const course = enrolments.find((candidate) =>
      candidate.courseSlug === selection.courseSlug);
    const instance = course?.instances.find((candidate) =>
      candidate.id === selection.courseInstanceId);
    const item = new vscode.TreeItem(
      course?.courseName || course?.abbreviation || selection.courseSlug,
    );
    item.description = instance?.label ?? `Instance ${selection.courseInstanceId}`;
    item.tooltip = `${selection.courseSlug}\n${item.description}`;
    item.iconPath = new vscode.ThemeIcon('book');
    item.command = {
      command: 'aaltoOpenCsIde.selectCourse',
      title: 'Change Course and Version',
    };
    item.accessibilityInformation = {
      label: `Selected course: ${String(item.label)}. Version: ${item.description}.`,
    };
    return [item];
  }

  public dispose(): void {
    this.changeEmitter.dispose();
    this.enrolmentSyncSubscription.dispose();
    if (this.ownsEnrolmentSyncService) {
      this.enrolmentSyncService.dispose();
    }
  }
}
