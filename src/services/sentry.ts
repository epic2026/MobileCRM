import * as Sentry from '@sentry/react';

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_APP_ENV ?? 'production',
    release: import.meta.env.VITE_APP_VERSION ?? '1.0.0',
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: 0.15,
    replaysSessionSampleRate: 0.05,
    replaysOnErrorSampleRate: 1.0,
    beforeSend(event) {
      // Strip phone numbers from any string in the event
      const scrub = (s: string) => s.replace(/\b\d{7,}\b/g, '[phone]');
      if (event.message) event.message = scrub(event.message);
      return event;
    },
  });
}

export function setSentryUser(user: { id: string; email?: string; tenantId?: string | null; role?: string | null }) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
    tenant_id: user.tenantId ?? undefined,
    role: user.role ?? undefined,
  });
}

export function clearSentryUser() {
  Sentry.setUser(null);
}

export { Sentry };
