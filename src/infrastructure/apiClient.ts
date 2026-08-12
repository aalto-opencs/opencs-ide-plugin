import { ApiError } from './apiError';

export type AuthenticationTokenProvider = () => Promise<
  string | undefined
>;

/**
 * Shared HTTP boundary for every API repository.
 *
 * The token provider is evaluated per request so sign-in and sign-out take
 * effect without rebuilding the dependency graph. The platform middleware
 * expects the raw session token in Authorization, not a Bearer token.
 */
export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly authenticationTokenProvider:
      AuthenticationTokenProvider = async () => undefined,
    private readonly timeoutMs = 10_000,
  ) {}

  public async get<TResponse>(path: string): Promise<TResponse> {
    return this.request<TResponse>(path, 'GET');
  }

  public async getBytes(path: string): Promise<Uint8Array> {
    return this.request(
      path,
      'GET',
      undefined,
      {},
      async (response) =>
        new Uint8Array(await response.arrayBuffer()),
    );
  }

  public async head(path: string): Promise<Headers> {
    return this.request(
      path,
      'HEAD',
      undefined,
      {},
      async (response) => response.headers,
    );
  }

  public async post<TResponse>(
    path: string,
    body: unknown,
  ): Promise<TResponse> {
    return this.request<TResponse>(
      path,
      'POST',
      JSON.stringify(body),
      { 'Content-Type': 'application/json' },
    );
  }

  public async postForm<TResponse>(
    path: string,
    body: FormData,
  ): Promise<TResponse> {
    return this.request<TResponse>(path, 'POST', body);
  }

  private async request<TResponse>(
    path: string,
    method: 'GET' | 'HEAD' | 'POST',
    body?: string | FormData,
    requestHeaders: Record<string, string> = {},
    parseResponse: (response: Response) => Promise<TResponse> =
      async (response) => (await response.json()) as TResponse,
  ): Promise<TResponse> {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
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
        throw new Error('The API request timed out.');
      }

      throw new Error(
        error instanceof Error
          ? error.message
          : 'An unknown API error occurred.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}
