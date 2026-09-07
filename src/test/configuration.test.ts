import * as assert from 'assert';
import { validateEndpointUrl } from '../config/configuration';

suite('Configuration', () => {
  test('accepts HTTPS production and deployment endpoints', () => {
    assert.strictEqual(
      validateEndpointUrl(
        'aaltoOpenCsIde.apiBaseUrl',
        'https://opencs.aalto.fi/api',
      ),
      'https://opencs.aalto.fi/api',
    );
    assert.strictEqual(
      validateEndpointUrl(
        'aaltoOpenCsIde.platformBaseUrl',
        'https://platform.example.test:8443',
      ),
      'https://platform.example.test:8443',
    );
  });

  test('accepts HTTP localhost development endpoints', () => {
    assert.strictEqual(
      validateEndpointUrl(
        'aaltoOpenCsIde.apiBaseUrl',
        'http://localhost:8842/api/',
      ),
      'http://localhost:8842/api',
    );
    assert.strictEqual(
      validateEndpointUrl(
        'aaltoOpenCsIde.platformBaseUrl',
        'http://127.0.0.1:7799',
      ),
      'http://127.0.0.1:7799',
    );
    assert.strictEqual(
      validateEndpointUrl(
        'aaltoOpenCsIde.platformBaseUrl',
        'http://[::1]:7799/',
      ),
      'http://[::1]:7799',
    );
  });

  test('rejects unsafe endpoint values with setting name', () => {
    for (const value of [
      'http://platform.example.test/api',
      'ftp://localhost/api',
      'not a URL',
      'https://user:password@opencs.aalto.fi/api',
      'https://@opencs.aalto.fi/api',
      'https://user%40example.com@opencs.aalto.fi/api',
      'http://127.1:8842/api',
      'https://opencs.aalto.fi/api?token=secret',
      'https://opencs.aalto.fi/api?',
      'https://opencs.aalto.fi/api#',
    ]) {
      assert.throws(
        () => validateEndpointUrl('aaltoOpenCsIde.apiBaseUrl', value),
        /aaltoOpenCsIde\.apiBaseUrl/,
      );
    }
  });
});
