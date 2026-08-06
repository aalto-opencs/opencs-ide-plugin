import * as vscode from 'vscode';

const CONFIGURATION_SECTION = 'aaltoFitechPlatform';

export function getApiBaseUrl(): string {
  return vscode.workspace
    .getConfiguration(CONFIGURATION_SECTION)
    .get<string>('apiBaseUrl', 'http://localhost:8842/api');
}

export function getPlatformBaseUrl(): string {
  return vscode.workspace
    .getConfiguration(CONFIGURATION_SECTION)
    .get<string>('platformBaseUrl', 'http://localhost:7799')
    .replace(/\/+$/, '');
}

export function useMockApi(): boolean {
  return vscode.workspace
    .getConfiguration(CONFIGURATION_SECTION)
    .get<boolean>('useMockApi', true);
}
