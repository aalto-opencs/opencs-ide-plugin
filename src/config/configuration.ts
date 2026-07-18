import * as vscode from 'vscode';

const CONFIGURATION_SECTION = 'wsdPlatform';

export function getApiBaseUrl(): string {
  return vscode.workspace
    .getConfiguration(CONFIGURATION_SECTION)
    .get<string>('apiBaseUrl', 'http://localhost:8842/api');
}

export function useMockApi(): boolean {
  return vscode.workspace
    .getConfiguration('wsdPlatform')
    .get<boolean>('useMockApi', true);
}