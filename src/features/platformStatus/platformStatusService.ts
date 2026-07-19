import { PlatformStatusRepository } from './platformStatusRepository';

export class PlatformStatusService {
  public constructor(
    private readonly repository: PlatformStatusRepository,
  ) {}

  public async isAvailable(): Promise<boolean> {
    try {
      await this.repository.checkStatus();
      return true;
    } catch {
      return false;
    }
  }
}
