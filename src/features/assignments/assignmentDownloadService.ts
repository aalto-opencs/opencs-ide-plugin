import * as vscode from 'vscode';
import {
  DownloadedAssignment,
  PROGRAMMING_EXERCISE_TYPE,
  ProgrammingAssignment,
} from './assignmentModels';
import { AssignmentFileRepository } from './assignmentFileRepository';
import { AssignmentRepository } from './assignmentRepository';

export class AssignmentDownloadService {
  public constructor(
    private readonly assignmentRepository: AssignmentRepository,
    private readonly fileRepository: AssignmentFileRepository,
  ) {}

  public async download(
    assignment: ProgrammingAssignment,
    root: vscode.Uri,
    userEmail: string,
    overwrite = false,
  ): Promise<DownloadedAssignment> {
    if (assignment.type !== PROGRAMMING_EXERCISE_TYPE) {
      throw new Error('Only programming assignments can be downloaded.');
    }

    const starter = await this.assignmentRepository.getStarter(
      assignment.exerciseUuid,
    );

    if (
      starter.uuid !== assignment.exerciseUuid ||
      starter.type !== PROGRAMMING_EXERCISE_TYPE
    ) {
      throw new Error('The platform returned an invalid assignment starter.');
    }

    if (starter.prerequisites_met === false) {
      throw new Error(
        'This assignment is locked until its prerequisites are completed.',
      );
    }

    const archive = await this.assignmentRepository.getStarterFiles(
      assignment.exerciseUuid,
    );

    return this.fileRepository.writeAssignment(
      root,
      userEmail,
      assignment,
      starter,
      archive,
      overwrite,
    );
  }

  public getAssignmentFolder(
    root: vscode.Uri,
    userEmail: string,
    assignment: ProgrammingAssignment,
  ): vscode.Uri {
    return this.fileRepository.getAssignmentFolder(root, userEmail, assignment);
  }

  public getCourseFolder(
    root: vscode.Uri,
    userEmail: string,
    assignment: ProgrammingAssignment,
  ): vscode.Uri {
    return this.fileRepository.getCourseFolder(root, userEmail, assignment);
  }

  public isDownloaded(
    root: vscode.Uri,
    userEmail: string,
    assignment: ProgrammingAssignment,
  ): Promise<boolean> {
    return this.fileRepository.isDownloadedAssignment(
      root,
      userEmail,
      assignment,
    );
  }

  public getPreferredOpenFile(folder: vscode.Uri): Promise<vscode.Uri> {
    return this.fileRepository.getPreferredOpenFile(folder);
  }

}
