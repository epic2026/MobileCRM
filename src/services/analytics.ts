import posthog from 'posthog-js';

export function initPostHog() {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) return;

  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST ?? 'https://app.posthog.com',
    autocapture: false,
    capture_pageview: false, // we fire page events manually per tab
    persistence: 'localStorage',
    sanitize_properties: (props) => {
      // Never send raw phone numbers
      const clean: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(props)) {
        clean[k] = typeof v === 'string' ? v.replace(/\b\d{7,}\b/g, '[phone]') : v;
      }
      return clean;
    },
  });
}

// ─── User identity ────────────────────────────────────────────────────────────

export function identifyUser(userId: string, props: {
  email?: string;
  tenantId?: string | null;
  role?: string | null;
}) {
  posthog.identify(userId, {
    email: props.email,
    tenant_id: props.tenantId,
    role: props.role,
  });
}

export function resetUser() {
  posthog.reset();
}

// ─── Typed events ─────────────────────────────────────────────────────────────

type AnalyticsEvent =
  | { event: 'user_signed_in';          props?: { role: string | null } }
  | { event: 'user_signed_out' }
  | { event: 'tab_viewed';              props: { tab: string } }
  | { event: 'lead_created';            props: { status: string; has_email: boolean; has_company: boolean } }
  | { event: 'lead_updated';            props: { field: string } }
  | { event: 'lead_deleted' }
  | { event: 'call_initiated' }
  | { event: 'whatsapp_opened' }
  | { event: 'email_opened' }
  | { event: 'activity_logged';         props: { type: string } }
  | { event: 'task_created' }
  | { event: 'task_status_updated';     props: { status: string } }
  | { event: 'task_deleted' }
  | { event: 'recording_imported';      props: { count: number } }
  | { event: 'aria_opened' }
  | { event: 'aria_closed' }
  | { event: 'aria_message_sent';       props: { length: number } }
  | { event: 'aria_action_executed';    props: { action_type: string } }
  | { event: 'aria_conversation_cleared' };

export function track(e: AnalyticsEvent) {
  if ('props' in e && e.props) {
    posthog.capture(e.event, e.props);
  } else {
    posthog.capture(e.event);
  }
}
