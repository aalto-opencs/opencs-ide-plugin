import { ApiError } from './apiError';

export type AuthenticationTokenProvider = () => Promise<
  string | undefined
>;

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

  public async post<TResponse>(
    path: string,
    body: unknown,
  ): Promise<TResponse> {
    return this.request<TResponse>(path, 'POST', body);
  }

  private async request<TResponse>(
    path: string,
    method: 'GET' | 'POST',
    body?: unknown,
  ): Promise<TResponse> {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, this.timeoutMs);

    try {
      const token = await this.authenticationTokenProvider();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers.Authorization = token;
      }

      const response = await fetch(
        `${this.baseUrl}${path}`,
        {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
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

      return (await response.json()) as TResponse;
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
