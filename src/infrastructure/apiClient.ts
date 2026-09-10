import { ApiError } from './apiError';
import {
  ApiRequestPriority,
  ApiRequestScheduler,
} from './apiRequestScheduler';
import { validateEndpointUrl } from './endpointUrl';

export type AuthenticationTokenProvider = () => Promise<
  string | undefined
>;

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

          const response = await fetch(
            `${this.baseUrl}${path}`,
            {
              method,
              headers,
              body,
              signal: controller.signal,
            },
          );

          if (!response.ok) {
            const fallbackMessage =
              `API request failed with status ${response.status}.`;
            let message = fallbackMessage;

            try {
              const errorBody = await response.json() as unknown;

              if (
                typeof errorBody === 'object' &&
                errorBody !== null &&
                'message' in errorBody &&
                typeof errorBody.message === 'string' &&
                errorBody.message.trim()
              ) {
                message = errorBody.message;
              }
            } catch {
              // Use the status-based fallback for non-JSON responses.
            }

            throw new ApiError(
              response.status,
              message,
            );
          }

          return await parseResponse(response);
        } catch (error: unknown) {
          if (error instanceof ApiError) {
            throw error;
          }

          if (
            error instanceof Error &&
            error.name === 'AbortError'
          ) {
            throw new Error(
              timedOut
                ? 'The API request timed out.'
                : 'The API request was cancelled.',
            );
          }

          throw new Error(
            error instanceof Error
              ? error.message
              : 'An unknown API error occurred.',
          );
        } finally {
          clearTimeout(timeout);
          options.signal?.removeEventListener('abort', cancelRequest);
        }
      },
    );
  }
}
