import { ApiError } from './apiError';

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
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
      const response = await fetch(
        `${this.baseUrl}${path}`,
        {
          method,
          headers: {
            'Content-Type': 'application/json',
          },
          body: body === undefined ? undefined : JSON.stringify(body),
          signal: controller.signal,
        },
      );

      if (!response.ok) {
        throw new ApiError(
          response.status,
          `API request failed with status ${response.status}.`,
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