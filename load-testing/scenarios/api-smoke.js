import { sleep } from 'k6';
import { SharedArray } from 'k6/data';
import {
  createLeadActivity,
  createLeadTask,
  fetchLeads,
  login,
} from '../lib/supabase-api.js';

export const options = {
  vus: Number(__ENV.VUS || 1),
  iterations: Number(__ENV.ITERATIONS || 5),
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1200'],
  },
};

const USERS = new SharedArray('users', () => JSON.parse(open('../data/users.json')));

export default function () {
  const user = USERS[__VU % USERS.length];
  const token = user.access_token || login(user.email, user.password);

  if (!token) {
    sleep(1);
    return;
  }

  const leads = fetchLeads(token);
  if (leads.length > 0) {
    const leadId = leads[0].id;

    createLeadActivity(token, leadId, {
      type: 'note',
      title: `k6 smoke activity vu-${__VU}`,
      description: 'smoke test',
      metadata: { source: 'k6-smoke' },
    });

    createLeadTask(token, leadId, {
      title: `k6 smoke task vu-${__VU}`,
      description: 'smoke test',
      status: 'pending',
    });
  }

  sleep(Number(__ENV.SLEEP_SECONDS || 1));
}
