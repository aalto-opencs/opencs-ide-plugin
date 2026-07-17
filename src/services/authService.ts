import { AuthSession } from '../models/authModels';
import { AuthRepository } from '../repositories/authRepository';
import { SessionRepository } from '../repositories/sessionRepository';

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