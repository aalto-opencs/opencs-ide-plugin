import { ApiClient } from '../../infrastructure/apiClient';
import { AuthSession } from './authModels';

export interface AuthRepository {
  redeemStudentCode(studentCode: string): Promise<AuthSession>;
}

export class ApiAuthRepository implements AuthRepository {
  public constructor(
    private readonly apiClient: ApiClient,
  ) {}

  public async redeemStudentCode(
    studentCode: string,
  ): Promise<AuthSession> {
    return this.apiClient.post<AuthSession>(
      '/auth/redeem-code',
      {
        studentCode,
      },
    );
  }
}

export class MockAuthRepository implements AuthRepository {
  public async redeemStudentCode(
    studentCode: string,
  ): Promise<AuthSession> {
    if (!studentCode.trim()) {
      throw new Error('Student code is required.');
    }

    return {
      accessToken: `mock-access-token-${Date.now()}`,
      refreshToken: `mock-refresh-token-${Date.now()}`,
      student: {
        id: 'demo-student',
        name: 'Demo Student',
      },
    };
  }
}