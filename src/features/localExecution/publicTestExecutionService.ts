import * as vscode from 'vscode';
import { PublicTestRunner } from '../assignments/assignmentModels';

export interface PublicTestRun {
  cwd: vscode.Uri;
  command: string;
}

/** Prepares only the fixed public-test commands persisted in assignment metadata. */
export class PublicTestExecutionService {
  public prepare(
    folder: vscode.Uri,
    runner: PublicTestRunner,
  ): PublicTestRun {
    return {
      cwd: folder,
      command: commandForRunner(runner),
    };
  }
}

function commandForRunner(runner: PublicTestRunner): string {
  switch (runner) {
    case 'dart-test':
      return 'dart test';
    case 'dart-main-test':
      return 'dart run main_test.dart';
    case 'flutter-test':
      return 'flutter test';
    default:
      throw new Error('The assignment contains an unsupported public-test runner.');
  }
}
