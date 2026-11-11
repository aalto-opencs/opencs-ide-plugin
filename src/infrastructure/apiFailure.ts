import { ApiError } from './apiError';

const PLATFORM_NAME = 'Aalto OpenCS platform';

/**
 * The stored session token was rejected by the platform as expired or
 * invalid. The platform marks this case with `invalidToken: true`, which
 * separates it from 401 responses for missing roles or unverified users.
 */
export class SessionExpiredError extends ApiError {
  constructor(body?: unknown) {
    super(
      401,
      'Your Aalto OpenCS sign-in has expired. Sign in again to continue.',
      body,
    );
    this.name = 'SessionExpiredError';
  }
}

/** The request never received an HTTP response. */
export class ApiConnectionError extends Error {
  constructor(public readonly kind: 'network' | 'timeout') {
    super(kind === 'timeout'
      ? `The ${PLATFORM_NAME} did not respond in time. Try again.`
      : `Cannot reach the ${PLATFORM_NAME}. ` +
        'Check your internet connection and try again.');
    this.name = 'ApiConnectionError';
  }
}

/** The platform answered, but not with data the extension can use. */
export class InvalidPlatformResponseError extends Error {
  constructor(
    message = `The ${PLATFORM_NAME} returned an unexpected response.`,
  ) {
    super(message);
    this.name = 'InvalidPlatformResponseError';
  }
}

/**
 * Why a platform refresh failed. Expired sessions are excluded: they are
 * handled by the sign-in flow before any failure is classified.
 */
export type ApiFailureKind =
  | 'network'
  | 'timeout'
  | 'server'
  | 'invalidResponse'
  | 'other';

export function isSessionExpiredError(
  error: unknown,
): error is SessionExpiredError {
  return error instanceof SessionExpiredError;
}

export function isInvalidTokenResponse(
  status: number,
  body: unknown,
): boolean {
  return status === 401 &&
    typeof body === 'object' && body !== null &&
    'invalidToken' in body && body.invalidToken === true;
}

export function classifyApiFailure(error: unknown): ApiFailureKind {
  if (error instanceof ApiConnectionError) {
    return error.kind;
  }
  if (error instanceof InvalidPlatformResponseError) {
    return 'invalidResponse';
  }
  if (error instanceof ApiError && error.status >= 500) {
    return 'server';
  }
  return 'other';
}

/** One sentence explaining why live platform data could not be refreshed. */
export function describeRefreshFailure(
  kind: ApiFailureKind | undefined,
): string {
  switch (kind) {
    case 'network':
      return `Cannot reach the ${PLATFORM_NAME}. Check your connection.`;
    case 'timeout':
      return `The ${PLATFORM_NAME} is not responding.`;
    case 'server':
      return `The ${PLATFORM_NAME} has a server problem.`;
    case 'invalidResponse':
      return `The ${PLATFORM_NAME} returned unexpected data.`;
    default:
      return `Could not refresh data from the ${PLATFORM_NAME}.`;
  }
}

/** HTTP failure text used when the platform response has no usable message. */
export function describeHttpStatus(status: number): string {
  if (status >= 500) {
    return `The ${PLATFORM_NAME} had a server error (HTTP ${status}). ` +
      'Try again later.';
  }
  return `API request failed with status ${status}.`;
}
