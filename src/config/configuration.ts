import * as vscode from 'vscode';
import { validateEndpointUrl } from '../infrastructure/endpointUrl';

export { validateEndpointUrl } from '../infrastructure/endpointUrl';

const CONFIGURATION_SECTION = 'aaltoOpenCsIde';
const PRODUCTION_API_BASE_URL = 'https://opencs.aalto.fi/api';
const PRODUCTION_PLATFORM_BASE_URL = 'https://opencs.aalto.fi';
const DEVELOPMENT_PROFILE_ENV = 'AALTO_OPENCS_IDE_DEVELOPMENT_PROFILE';

function useProductionBaseUrls(): boolean {
  return typeof __DEVELOPMENT_TOOLS__ === 'undefined' ||
    !__DEVELOPMENT_TOOLS__ ||
    process.env[DEVELOPMENT_PROFILE_ENV] === 'production';
}

// The local URLs live after the build-flag check so production bundles drop them.
function getLocalBaseUrls(): { api: string; platform: string } | undefined {
  if (typeof __DEVELOPMENT_TOOLS__ === 'undefined' || !__DEVELOPMENT_TOOLS__) {
    return undefined;
  }
  if (process.env[DEVELOPMENT_PROFILE_ENV] !== 'local') {
    return undefined;
  }
  return {
    api: 'http://localhost:8842/api',
    platform: 'http://localhost:7799',
  };
}

export function getApiBaseUrl(): string {
  if (useProductionBaseUrls()) {
    return PRODUCTION_API_BASE_URL;
  }
  const localBaseUrls = getLocalBaseUrls();
  if (localBaseUrls) {
    return localBaseUrls.api;
  }
  return validateEndpointUrl(
    'aaltoOpenCsIde.apiBaseUrl',
    vscode.workspace
      .getConfiguration(CONFIGURATION_SECTION)
      .get<string>('apiBaseUrl', PRODUCTION_API_BASE_URL),
  );
}

export function getPlatformBaseUrl(): string {
  if (useProductionBaseUrls()) {
    return PRODUCTION_PLATFORM_BASE_URL;
  }
  const localBaseUrls = getLocalBaseUrls();
  if (localBaseUrls) {
    return localBaseUrls.platform;
  }
  return validateEndpointUrl(
    'aaltoOpenCsIde.platformBaseUrl',
    vscode.workspace
      .getConfiguration(CONFIGURATION_SECTION)
      .get<string>('platformBaseUrl', PRODUCTION_PLATFORM_BASE_URL),
  );
}
