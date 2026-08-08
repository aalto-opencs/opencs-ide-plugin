import * as assert from 'assert';
import {
  ApiAuthRepository,
} from '../../features/auth/authRepository';
import {
  ApiClient,
} from '../../infrastructure/apiClient';
import {
  loginToPlatform,
  readIntegrationAuthenticationConfiguration,
  requestIdeAuthorization,
} from './integrationAuthentication';

suite('Authentication backend integration', () => {
  test('exchanges a browser authorization code for a session', async function () {
    const configuration = readIntegrationAuthenticationConfiguration();

    if (!configuration) {
      this.skip();
      return;
    }

    const publicApiClient = new ApiClient(configuration.baseUrl);
    const authRepository = new ApiAuthRepository(publicApiClient);
    const browserSession = await loginToPlatform(configuration);
    const authorization = await requestIdeAuthorization(
      configuration,
      browserSession,
    );

    const session = await authRepository.exchangeAuthorizationCode(
      authorization.code,
      authorization.codeVerifier,
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
      typeof session.student.email,
      'string',
    );

    assert.ok(
      session.student.email.trim().length > 0,
      'Expected the student email to be non-empty',
    );

    assert.strictEqual(
      session.student.email,
      configuration.email,
      'Expected the IDE session to belong to the platform login user',
    );

    await assert.rejects(
      authRepository.exchangeAuthorizationCode(
        authorization.code,
        authorization.codeVerifier,
      ),
      /invalid or expired/i,
      'Expected the authorization code to work only once',
    );

    const contractAuthorization = await requestIdeAuthorization(
      configuration,
      browserSession,
    );
    const contractResponse = await publicApiClient.post<Record<string, unknown>>(
      '/auth/ide/exchange',
      {
        code: contractAuthorization.code,
        codeVerifier: contractAuthorization.codeVerifier,
      },
    );

    assert.deepStrictEqual(
      Object.keys(contractResponse).sort(),
      ['email', 'id', 'token'],
      'Expected the IDE exchange response to contain only required fields',
    );
  });
});
