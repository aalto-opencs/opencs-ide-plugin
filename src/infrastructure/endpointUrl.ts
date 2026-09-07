const LOCAL_DEVELOPMENT_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '[::1]',
]);

export function validateEndpointUrl(
  settingName: string,
  value: string,
): string {
  let url: URL;

  try {
    if (value.trim() !== value || !/^https?:\/\//i.test(value)) {
      throw new Error('Whitespace is not allowed.');
    }
    url = new URL(value);
  } catch {
    throw invalidEndpointError(settingName);
  }

  const authority = value.slice(value.indexOf('://') + 3)
    .split(/[\/?#]/, 1)[0];
  const endpointPath = value.slice(value.indexOf('://') + 3);
  const rawHost = authority.startsWith('[')
    ? authority.slice(0, authority.indexOf(']') + 1)
    : authority.split(':', 1)[0];
  const validScheme = url.protocol === 'https:' || url.protocol === 'http:';
  const localDevelopmentHost = LOCAL_DEVELOPMENT_HOSTS.has(
    rawHost.toLowerCase(),
  );

  if (
    !validScheme ||
    (url.protocol === 'http:' && !localDevelopmentHost) ||
    authority.includes('@') ||
    url.username ||
    url.password ||
    endpointPath.includes('?') ||
    endpointPath.includes('#') ||
    url.search ||
    url.hash
  ) {
    throw invalidEndpointError(settingName);
  }

  return url.toString().replace(/\/+$/, '');
}

function invalidEndpointError(settingName: string): Error {
  return new Error(
    `Invalid setting \`${settingName}\`: use an HTTPS URL; HTTP is allowed ` +
    'only for localhost, 127.0.0.1, or [::1] during development.',
  );
}
