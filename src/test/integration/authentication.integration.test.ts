import * as assert from 'assert';
import { createHash, randomBytes } from 'node:crypto';
import {
  ApiAuthRepository,
} from '../../features/auth/authRepository';
import {
  ApiClient,
} from '../../infrastructure/apiClient';

suite('Authentication backend integration', () => {
  test('exchanges a browser authorization code for a session', async function () {
    const userUuid = process.env.AALTO_FITECH_TEST_USER_UUID;
    const baseUrl = process.env.AALTO_FITECH_TEST_API_URL;

    if (!userUuid || !baseUrl) {
      this.skip();
      return;
    }

    const publicApiClient = new ApiClient(baseUrl);
    const authRepository = new ApiAuthRepository(publicApiClient);
    // This creates the platform-browser session for an automated test. The
    // extension-facing portion below uses the new PKCE code exchange.
    const browserSession = await authRepository.loginWithUuid(userUuid);
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');
    const browserApiClient = new ApiClient(
      baseUrl,
      async () => browserSession.token,
    );
    const authorization = await browserApiClient.post<{
      code: string;
      expiresIn: number;
    }>('/auth/vscode/authorize', { codeChallenge });

    const session = await authRepository.exchangeAuthorizationCode(
      authorization.code,
      codeVerifier,
    );

    assert.strictEqual(typeof session.token, 'string');
    assert.ok(
      session.token.trim().length > 0,
      'Expected the backend to return a non-empty session token',
    );
    assert.strictEqual(authorization.expiresIn, 300);

    assert.ok(
      Number.isInteger(session.student.id),
      'Expected the student ID to be an integer',
    );
    assert.ok(
      session.student.id > 0,
      'Expected the student ID to be positive',
    );

    assert.strictEqual(
      typeof session.student.firstName,
      'string',
    );
    assert.strictEqual(
      typeof session.student.lastName,
      'string',
    );
    assert.strictEqual(
      typeof session.student.email,
      'string',
    );

    assert.ok(
      session.student.email.trim().length > 0,
      'Expected the student email to be non-empty',
    );

    const expectedUserEmail = process.env.AALTO_FITECH_TEST_EXPECTED_USER_EMAIL;
    if (expectedUserEmail) {
      assert.strictEqual(
        session.student.email,
        expectedUserEmail,
        'Expected the UUID to authenticate the configured test user',
      );
    }

    await assert.rejects(
      authRepository.exchangeAuthorizationCode(
        authorization.code,
        codeVerifier,
      ),
      /invalid or expired/i,
      'Expected the authorization code to work only once',
    );
  });
});
