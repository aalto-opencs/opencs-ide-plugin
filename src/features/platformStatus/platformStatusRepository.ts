import { ApiClient } from '../../infrastructure/apiClient';

export interface PlatformStatusRepository {
  checkStatus(): Promise<void>;
}

export class ApiPlatformStatusRepository implements
  PlatformStatusRepository {
  public constructor(
    private readonly apiClient: ApiClient,
  ) {}

  public async checkStatus(): Promise<void> {
    await this.apiClient.get<unknown>('/status');
  }
}
