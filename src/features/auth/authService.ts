import { AuthSession } from './authModels';
import { AuthRepository } from './authRepository';
import { SessionRepository } from './sessionRepository';

export class AuthService {
  public constructor(
    private readonly authRepository: AuthRepository,
    private readonly sessionRepository: SessionRepository,
  ) {}

  public async signIn(
    code: string,
    codeVerifier: string,
  ): Promise<AuthSession> {
    const session = await this.authRepository.exchangeAuthorizationCode(
      code,
      codeVerifier,
    );

    await this.sessionRepository.save(session);

    return session;
  }

  public async getCurrentSession(): Promise<AuthSession | undefined> {
    return this.sessionRepository.get();
  }

  public async signOut(): Promise<void> {
    await this.sessionRepository.clear();
  }

  /**
   * Forget a session the platform rejected as expired. A request that started
   * before a fresh sign-in must not clear the new session, so only the
   * rejected token is removed.
   */
  public async expireSession(
    rejectedToken: string,
  ): Promise<AuthSession | undefined> {
    const session = await this.sessionRepository.get();
    if (!session || session.token !== rejectedToken) {
      return undefined;
    }
    await this.sessionRepository.clear();
    return session;
  }
}
