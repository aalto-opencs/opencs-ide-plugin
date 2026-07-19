import { ApiClient } from '../../infrastructure/apiClient';
import {
  AuthSession,
  VscodeUuidLoginResponse,
} from './authModels';

export interface AuthRepository {
  loginWithUuid(userUuid: string): Promise<AuthSession>;
}

export class ApiAuthRepository implements AuthRepository {
  public constructor(
    private readonly apiClient: ApiClient,
  ) {}

  public async loginWithUuid(
    userUuid: string,
  ): Promise<AuthSession> {
    const response = await this.apiClient.post<VscodeUuidLoginResponse>(
      '/auth/vscode/uuid',
      {
        userUuid,
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
}

export class MockAuthRepository implements AuthRepository {
  public async loginWithUuid(
    userUuid: string,
  ): Promise<AuthSession> {
    if (!userUuid.trim()) {
      throw new Error('User UUID is required.');
    }

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
