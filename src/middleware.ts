import { timingSafeEqual } from 'node:crypto';
import { defineMiddleware } from 'astro:middleware';

const protectedPaths = [
  '/business/operations-schedule',
  '/business/daily-promotion-review',
  '/business/annual-plan',
  '/business/stage-review',
  '/business/non-promotion-review',
  '/business/meeting-review',
  '/business/settings',
  '/api/operations-content',
  '/api/operations-annual-plans',
  '/api/promotion-daily',
  '/api/promotion-awaiting',
  '/api/stage-reviews',
  '/api/non-promotion-reviews',
  '/api/meeting-reviews',
  '/api/business-settings',
];

interface BasicAuthCredential {
  user: string;
  password: string;
}

function sameValue(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function configuredCredentials(): BasicAuthCredential[] {
  const serialized = import.meta.env.OPERATIONS_BASIC_AUTH_USERS
    || process.env.OPERATIONS_BASIC_AUTH_USERS;

  if (serialized) {
    try {
      const parsed: unknown = JSON.parse(serialized);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') return [];
      return Object.entries(parsed)
        .filter((entry): entry is [string, string] => (
          entry[0].trim().length > 0
          && typeof entry[1] === 'string'
          && entry[1].length > 0
        ))
        .map(([user, password]) => ({ user, password }));
    } catch {
      return [];
    }
  }

  const user = import.meta.env.OPERATIONS_ADMIN_USER || process.env.OPERATIONS_ADMIN_USER;
  const password = import.meta.env.OPERATIONS_ADMIN_PASSWORD || process.env.OPERATIONS_ADMIN_PASSWORD;
  return user && password ? [{ user, password }] : [];
}

export const onRequest = defineMiddleware(async ({ request, url, locals }, next) => {
  if (!protectedPaths.some((path) => url.pathname === path || url.pathname.startsWith(`${path}/`))) return next();
  const requestStartedAt = performance.now();

  const header = request.headers.get('authorization');
  let user = '';
  let password = '';

  if (header?.startsWith('Basic ')) {
    try {
      [user, password] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(/:(.*)/s, 2);
    } catch { /* 无效凭据按未认证处理。 */ }
  }

  const authenticated = configuredCredentials().some((credential) => (
    sameValue(user, credential.user) && sameValue(password, credential.password)
  ));
  if (!authenticated) {
    return new Response('需要排期台账访问凭据。', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Operations Schedule", charset="UTF-8"' },
    });
  }
  locals.operationsUser = user;
  const response = await next();
  const totalDuration = performance.now() - requestStartedAt;
  const existingTiming = response.headers.get('Server-Timing') ?? '';
  const databaseDuration = Number(existingTiming.match(/(?:^|,)\s*db;dur=([\d.]+)/)?.[1] ?? 0);
  const renderDuration = Math.max(0, totalDuration - databaseDuration);
  const timing = [
    existingTiming,
    `render;dur=${renderDuration.toFixed(1)}`,
    `total;dur=${totalDuration.toFixed(1)}`,
  ].filter(Boolean).join(', ');
  response.headers.set('Server-Timing', timing);
  return response;
});
