import { ApiClient } from '../../infrastructure/apiClient';
import {
  AuthSession,
  PlatformLoginResponse,
} from './authModels';

export interface AuthRepository {
  exchangeAuthorizationCode(
    code: string,
    codeVerifier: string,
  ): Promise<AuthSession>;
}

export class ApiAuthRepository implements AuthRepository {
  public constructor(
    private readonly apiClient: ApiClient,
  ) {}

  public async exchangeAuthorizationCode(
    code: string,
    codeVerifier: string,
  ): Promise<AuthSession> {
    const response = await this.apiClient.post<PlatformLoginResponse>(
      '/auth/ide/exchange',
      {
        code,
        codeVerifier,
      },
    );

    return {
      token: response.token,
      student: {
        id: response.id,
        email: response.email,
      },
    };
  }
}

export class MockAuthRepository implements AuthRepository {
  public async exchangeAuthorizationCode(): Promise<AuthSession> {
    return {
      token: `mock-session-token-${Date.now()}`,
      student: {
        id: 0,
        email: 'demo.student@example.com',
      },
    };
  }
}
