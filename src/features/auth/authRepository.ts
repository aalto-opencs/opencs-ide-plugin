import { AuthSession } from './authModels';

export interface AuthRepository {
  redeemStudentCode(studentCode: string): Promise<AuthSession>;
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