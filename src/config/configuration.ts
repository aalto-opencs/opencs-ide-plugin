import * as vscode from 'vscode';

const CONFIGURATION_SECTION = 'aaltoOpenCsIde';
const PRODUCTION_API_BASE_URL = 'https://opencs.aalto.fi/api';
const PRODUCTION_PLATFORM_BASE_URL = 'https://opencs.aalto.fi';
const DEVELOPMENT_PROFILE_ENV = 'AALTO_OPENCS_IDE_DEVELOPMENT_PROFILE';

function useProductionBaseUrls(): boolean {
  return typeof __DEVELOPMENT_TOOLS__ === 'undefined' ||
    !__DEVELOPMENT_TOOLS__ ||
    process.env[DEVELOPMENT_PROFILE_ENV] === 'production';
}

export function getApiBaseUrl(): string {
  if (useProductionBaseUrls()) {
    return PRODUCTION_API_BASE_URL;
  }
  return vscode.workspace
    .getConfiguration(CONFIGURATION_SECTION)
    .get<string>('apiBaseUrl', PRODUCTION_API_BASE_URL);
}

export function getPlatformBaseUrl(): string {
  if (useProductionBaseUrls()) {
    return PRODUCTION_PLATFORM_BASE_URL;
  }
  return vscode.workspace
    .getConfiguration(CONFIGURATION_SECTION)
    .get<string>('platformBaseUrl', PRODUCTION_PLATFORM_BASE_URL)
    .replace(/\/+$/, '');
}
