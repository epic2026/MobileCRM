import http from 'k6/http';
import { check } from 'k6';

export const SUPABASE_URL = __ENV.SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Set SUPABASE_URL and SUPABASE_ANON_KEY env vars before running load tests.');
  }
}

export function defaultHeaders(accessToken) {
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

export function login(email, password) {
  assertEnv();

  const res = http.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    JSON.stringify({ email, password }),
    { headers: defaultHeaders() }
  );

  check(res, {
    'login status is 200': (r) => r.status === 200,
  });

  if (res.status !== 200) return null;

  const body = res.json();
  return body?.access_token || null;
}

export function fetchLeads(accessToken) {
  assertEnv();

  const res = http.get(
    `${SUPABASE_URL}/rest/v1/leads?select=id,name,phone,status&order=created_at.desc&limit=20`,
    { headers: defaultHeaders(accessToken) }
  );

  check(res, {
    'fetch leads status is 200': (r) => r.status === 200,
  });

  if (res.status !== 200) return [];
  return res.json() || [];
}

export function createLeadActivity(accessToken, leadId, payload) {
  assertEnv();

  const res = http.post(
    `${SUPABASE_URL}/rest/v1/lead_activities`,
    JSON.stringify([
      {
        lead_id: leadId,
        type: payload.type,
        title: payload.title,
        description: payload.description || null,
        metadata: payload.metadata || {},
      },
    ]),
    {
      headers: {
        ...defaultHeaders(accessToken),
        Prefer: 'return=minimal',
      },
    }
  );

  check(res, {
    'create activity status is 201': (r) => r.status === 201,
  });

  return res;
}

export function createLeadTask(accessToken, leadId, payload) {
  assertEnv();

  const res = http.post(
    `${SUPABASE_URL}/rest/v1/lead_tasks`,
    JSON.stringify([
      {
        lead_id: leadId,
        title: payload.title,
        description: payload.description || null,
        due_date: payload.due_date || null,
        status: payload.status || 'pending',
      },
    ]),
    {
      headers: {
        ...defaultHeaders(accessToken),
        Prefer: 'return=minimal',
      },
    }
  );

  check(res, {
    'create task status is 201': (r) => r.status === 201,
  });

  return res;
}
