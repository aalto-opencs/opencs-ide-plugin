import { SubmissionStatus } from './submissionModels';

export interface SubmissionTestResult {
  name: string;
  passed: boolean;
  details?: string;
}

export interface SubmissionResultSummary {
  tests: SubmissionTestResult[];
  failedTests: SubmissionTestResult[];
  passedTestCount: number;
  graderErrors: string[];
}

export function summarizeSubmissionResult(
  status: SubmissionStatus,
): SubmissionResultSummary {
  const gradingData = status.gradingData ?? {};
  const tests = parseTestResults(gradingData.testResults);

  return {
    tests,
    failedTests: tests.filter((test) => !test.passed),
    passedTestCount: tests.filter((test) => test.passed).length,
    graderErrors: [
      readText(gradingData.error),
      readText(gradingData.testErrors),
      readText(gradingData.testErrorsOutput),
    ].filter((value): value is string => value !== undefined),
  };
}

export function formatSubmissionResult(
  status: SubmissionStatus,
): string[] {
  const summary = summarizeSubmissionResult(status);
  const lines = [
    `Status: ${status.gradingStatus}`,
    `Correct: ${String(status.correct)}`,
  ];

  if (summary.tests.length > 0) {
    lines.push(
      `Tests: ${summary.passedTestCount} passed, ${summary.failedTests.length} failed`,
    );
  }

  if (summary.failedTests.length > 0) {
    lines.push('', 'Failed tests:');
    summary.failedTests.forEach((test, index) => {
      lines.push(`${index + 1}. ${test.name}`);
      if (test.details) {
        lines.push('   Error details:');
        lines.push(...indentLines(test.details, '     '));
      } else {
        lines.push('   No error details were returned by the grader.');
      }
    });
  }

  if (summary.graderErrors.length > 0) {
    lines.push('', 'Grader errors:');
    summary.graderErrors.forEach((error) => {
      lines.push(...indentLines(error, '  '));
    });
  }

  return lines;
}

function parseTestResults(value: unknown): SubmissionTestResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((test, index) => {
    if (!isRecord(test) || typeof test.passed !== 'boolean') {
      return [];
    }

    return [{
      name: readTestName(test, index),
      passed: test.passed,
      details: readTestDetails(test),
    }];
  });
}

function readTestName(test: Record<string, unknown>, index: number): string {
  for (const key of ['testName', 'name', 'title']) {
    const value = test[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return `Test ${index + 1}`;
}

function readTestDetails(test: Record<string, unknown>): string | undefined {
  for (const key of [
    'test output',
    'testOutput',
    'error',
    'message',
    'output',
  ]) {
    const value = readText(test[key]);
    if (value) {
      return value;
    }
  }

  return undefined;
}

function readText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    return value.trim() || undefined;
  }

  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return undefined;
    }
  }

  return String(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function indentLines(value: string, indentation: string): string[] {
  return value.split(/\r?\n/).map((line) => `${indentation}${line}`);
}
