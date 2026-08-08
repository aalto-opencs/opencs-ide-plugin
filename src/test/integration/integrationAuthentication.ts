import { createHash, randomBytes } from 'node:crypto';
import {
  ApiAuthRepository,
} from '../../features/auth/authRepository';
import {
  AuthSession,
  PlatformLoginResponse,
} from '../../features/auth/authModels';
import {
  ApiClient,
} from '../../infrastructure/apiClient';

export interface IntegrationAuthenticationConfiguration {
  baseUrl: string;
  email: string;
  password: string;
}

export interface IdeAuthorizationFixture {
  code: string;
  codeVerifier: string;
  expiresIn: number;
}

export function readIntegrationAuthenticationConfiguration():
  IntegrationAuthenticationConfiguration | undefined {
  const configuration = {
    baseUrl: process.env.AALTO_FITECH_TEST_API_URL,
    email: process.env.AALTO_FITECH_TEST_USER_EMAIL,
    password: process.env.AALTO_FITECH_TEST_USER_PASSWORD,
  };

  if (Object.values(configuration).some((value) => !value)) {
    return undefined;
  }

  return configuration as IntegrationAuthenticationConfiguration;
}

export async function loginToPlatform(
  configuration: IntegrationAuthenticationConfiguration,
): Promise<AuthSession> {
  const response = await new ApiClient(configuration.baseUrl)
    .post<PlatformLoginResponse>('/auth/login', {
      email: configuration.email,
      password: configuration.password,
    });

  return mapSession(response);
}

export async function requestIdeAuthorization(
  configuration: IntegrationAuthenticationConfiguration,
  browserSession: AuthSession,
): Promise<IdeAuthorizationFixture> {
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  const browserApiClient = new ApiClient(
    configuration.baseUrl,
    async () => browserSession.token,
  );
  const authorization = await browserApiClient.post<{
    code: string;
    expiresIn: number;
  }>('/auth/ide/authorize', { codeChallenge });

  return {
    ...authorization,
    codeVerifier,
  };
}

export async function signInThroughIde(
  configuration: IntegrationAuthenticationConfiguration,
): Promise<AuthSession> {
  const browserSession = await loginToPlatform(configuration);
  const authorization = await requestIdeAuthorization(
    configuration,
    browserSession,
  );
  const authRepository = new ApiAuthRepository(
    new ApiClient(configuration.baseUrl),
  );

  return authRepository.exchangeAuthorizationCode(
    authorization.code,
    authorization.codeVerifier,
  );
}

function mapSession(response: PlatformLoginResponse): AuthSession {
  return {
    token: response.token,
    student: {
      id: response.id,
      email: response.email,
    },
  };
}
