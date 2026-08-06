import { ApiClient } from '../../infrastructure/apiClient';
import {
  AuthSession,
  VscodeLoginResponse,
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
    const response = await this.apiClient.post<VscodeLoginResponse>(
      '/auth/vscode/exchange',
      {
        code,
        codeVerifier,
      },
    );

    return {
      token: response.token,
      student: {
        id: response.id,
        firstName: response.firstName,
        lastName: response.lastName,
        email: response.email,
      },
    };
  }

  /**
   * Legacy helper retained only for real-backend integration fixtures while
   * browser authentication replaces UUID entry in the extension UI.
   */
  public async loginWithUuid(userUuid: string): Promise<AuthSession> {
    const response = await this.apiClient.post<VscodeLoginResponse>(
      '/auth/vscode/uuid',
      { userUuid },
    );

    return this.mapSession(response);
  }

  private mapSession(response: VscodeLoginResponse): AuthSession {
    return {
      token: response.token,
      student: {
        id: response.id,
        firstName: response.firstName,
        lastName: response.lastName,
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
        firstName: 'Demo',
        lastName: 'Student',
        email: 'demo.student@example.com',
      },
    };
  }
}
