import { AuthSession } from './authModels';
import { AuthRepository } from './authRepository';
import { SessionRepository } from './sessionRepository';

export class AuthService {
  public constructor(
    private readonly authRepository: AuthRepository,
    private readonly sessionRepository: SessionRepository,
  ) {}

  public async signIn(studentCode: string): Promise<AuthSession> {
    const session =
      await this.authRepository.redeemStudentCode(studentCode);

    await this.sessionRepository.save(session);

    return session;
  }
}