import * as assert from 'assert';
import {
  ApiAuthRepository,
} from '../../features/auth/authRepository';
import {
  ApiClient,
} from '../../infrastructure/apiClient';

suite('Authentication backend integration', () => {
  test('logs in with a valid UUID to backend platform', async function(){
    const userUuid = process.env.AALTO_FITECH_TEST_USER_UUID;
    const baseUrl = process.env.AALTO_FITECH_TEST_API_URL

    if (!userUuid || !baseUrl) {
      this.skip();
      return;
    }

    const apiClient = new ApiClient(baseUrl);
    const authRepository = new ApiAuthRepository(apiClient);

    const session = await authRepository.loginWithUuid(userUuid);

    assert.strictEqual(typeof session.token, 'string');
    assert.ok(
      session.token.trim().length > 0,
      'Expected the backend to return a non-empty session token',
    );

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
    if (expectedUserEmail){
      assert.strictEqual(session.student.email, expectedUserEmail, 'Expected the UUID to authenticate the configured test user',)
    }
  })
});