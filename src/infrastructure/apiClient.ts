import { ApiError } from './apiError';
import {
  ApiConnectionError,
  describeHttpStatus,
  InvalidPlatformResponseError,
  isInvalidTokenResponse,
  SessionExpiredError,
} from './apiFailure';
import {
  ApiRequestPriority,
  ApiRequestScheduler,
} from './apiRequestScheduler';
import { validateEndpointUrl } from './endpointUrl';

export type AuthenticationTokenProvider = () => Promise<
  string | undefined
>;

/** Called with the token the platform rejected as expired or invalid. */
export type SessionExpiredHandler = (rejectedToken: string) => void;

export interface ApiRequestOptions {
  priority?: ApiRequestPriority;
  signal?: AbortSignal;
}

/**
 * Shared HTTP boundary for every API repository.
 *
 * The token provider is evaluated per request so sign-in and sign-out take
 * effect without rebuilding the dependency graph. The platform middleware
 * expects the raw session token in Authorization, not a Bearer token.
 */
export class ApiClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly authenticationTokenProvider:
      AuthenticationTokenProvider = async () => undefined,
    private readonly timeoutMs = 10_000,
    private readonly requestScheduler = new ApiRequestScheduler(),
    private readonly onSessionExpired?: SessionExpiredHandler,
  ) {
    this.baseUrl = validateEndpointUrl('API endpoint', baseUrl);
  }

  public async get<TResponse>(
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<TResponse> {
    return this.request<TResponse>(
      path,
      'GET',
      undefined,
      {},
      undefined,
      options,
    );
  }

  public async getBytes(
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<Uint8Array> {
    return this.request(
      path,
      'GET',
      undefined,
      {},
      async (response) =>
        new Uint8Array(await response.arrayBuffer()),
      options,
    );
  }

  public async head(
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<Headers> {
    return this.request(
      path,
      'HEAD',
      undefined,
      {},
      async (response) => response.headers,
      options,
    );
  }

  public async post<TResponse>(
    path: string,
    body: unknown,
    options: ApiRequestOptions = {},
  ): Promise<TResponse> {
    return this.request<TResponse>(
      path,
      'POST',
      JSON.stringify(body),
      { 'Content-Type': 'application/json' },
      undefined,
      options,
    );
  }

  public async postForm<TResponse>(
    path: string,
    body: FormData,
    options: ApiRequestOptions = {},
  ): Promise<TResponse> {
    return this.request<TResponse>(
      path,
      'POST',
      body,
      {},
      undefined,
      options,
    );
  }

  private async request<TResponse>(
    path: string,
    method: 'GET' | 'HEAD' | 'POST',
    body?: string | FormData,
    requestHeaders: Record<string, string> = {},
    parseResponse: (response: Response) => Promise<TResponse> =
      async (response) => (await response.json()) as TResponse,
    options: ApiRequestOptions = {},
  ): Promise<TResponse> {
    return this.requestScheduler.schedule(
      options.priority ?? 'foreground',
      async () => {
        const controller = new AbortController();
        let timedOut = false;
        const cancelRequest = (): void => controller.abort();

        if (options.signal?.aborted) {
          cancelRequest();
        } else {
          options.signal?.addEventListener(
            'abort',
            cancelRequest,
            { once: true },
          );
        }

        const timeout = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, this.timeoutMs);

        try {
          const token = await this.authenticationTokenProvider();
          const headers: Record<string, string> = { ...requestHeaders };

          if (token) {
            headers.Authorization = token;
          }

          let response: Response;
          try {
            response = await fetch(
              `${this.baseUrl}${path}`,
              {
                method,
                headers,
                body,
                signal: controller.signal,
              },
            );
          } catch (error: unknown) {
            if (
              error instanceof Error &&
              error.name === 'AbortError' &&
              !timedOut
            ) {
              throw new Error('The API request was cancelled.');
            }
            throw new ApiConnectionError(timedOut ? 'timeout' : 'network');
          }

          if (!response.ok) {
            let errorBody: unknown;

            try {
              errorBody = await response.json() as unknown;
            } catch {
              // Use the status-based fallback for non-JSON responses.
            }

            if (isInvalidTokenResponse(response.status, errorBody)) {
              // Without a token, the session was already cleared while this
              // workflow was running, so the student has already been asked
              // to sign in again.
              if (token) {
                this.onSessionExpired?.(token);
              }
              throw new SessionExpiredError(errorBody);
            }

            throw new ApiError(
              response.status,
              getErrorMessage(response.status, errorBody),
              errorBody,
            );
          }

          try {
            return await parseResponse(response);
          } catch (error: unknown) {
            if (error instanceof Error && error.name === 'AbortError') {
              throw timedOut
                ? new ApiConnectionError('timeout')
                : new Error('The API request was cancelled.');
            }
            throw new InvalidPlatformResponseError();
          }
        } finally {
          clearTimeout(timeout);
          options.signal?.removeEventListener('abort', cancelRequest);
        }
      },
    );
  }
}

function getErrorMessage(status: number, body: unknown): string {
  // Server-side failures rarely carry text meant for students.
  if (
    status < 500 &&
    typeof body === 'object' &&
    body !== null &&
    'message' in body &&
    typeof body.message === 'string' &&
    body.message.trim()
  ) {
    return body.message;
  }
  return describeHttpStatus(status);
}
