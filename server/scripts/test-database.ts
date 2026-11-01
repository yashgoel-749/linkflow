import { z } from 'zod';

const postgresUrl = z
  .string()
  .url()
  .refine(
    (value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol),
    'PostgreSQL required'
  );

function identity(url: URL) {
  return `${url.hostname.replace(/-pooler(?=\.)/, '')}:${url.port || '5432'}${url.pathname}`;
}

export function validateTestDatabase({
  testUrl,
  applicationUrl,
  confirmedNeonEndpoint,
}: {
  testUrl: unknown;
  applicationUrl?: string;
  confirmedNeonEndpoint?: string;
}) {
  const value = postgresUrl.parse(testUrl);
  const test = new URL(value);
  const application = applicationUrl ? new URL(postgresUrl.parse(applicationUrl)) : null;
  if (application && identity(test) === identity(application)) {
    throw new Error('TEST_DATABASE_URL must not target the application database');
  }
  const namedTest = /^[a-z0-9_]+_test(?:_[a-z0-9_]+)?$/i.test(test.pathname.slice(1));
  const neonEndpoint = test.hostname.split('.')[0]?.replace(/-pooler$/, '');
  const confirmedNeon =
    !!application &&
    test.hostname.endsWith('.neon.tech') &&
    !!confirmedNeonEndpoint &&
    confirmedNeonEndpoint === neonEndpoint &&
    application.hostname.replace(/-pooler(?=\.)/, '') !==
      test.hostname.replace(/-pooler(?=\.)/, '');
  if (!namedTest && !confirmedNeon) {
    throw new Error(
      'Use a database named *_test, or explicitly confirm a separate Neon test endpoint with TEST_DATABASE_NEON_ENDPOINT'
    );
  }
  return value;
}
