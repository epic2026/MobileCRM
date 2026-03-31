import { sleep } from 'k6';
import { SharedArray } from 'k6/data';
import {
  createLeadActivity,
  createLeadTask,
  fetchLeads,
  login,
} from '../lib/supabase-api.js';

export const options = {
  scenarios: {
    free_tier_safe_ramp: {
      executor: 'ramping-vus',
      startVUs: Number(__ENV.START_VUS || 1),
      stages: [
        { duration: __ENV.STAGE1_DURATION || '2m', target: Number(__ENV.STAGE1_TARGET || 5) },
        { duration: __ENV.STAGE2_DURATION || '3m', target: Number(__ENV.STAGE2_TARGET || 10) },
        { duration: __ENV.STAGE3_DURATION || '3m', target: Number(__ENV.STAGE3_TARGET || 15) },
        { duration: __ENV.STAGE4_DURATION || '2m', target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1500'],
  },
};

const USERS = new SharedArray('users', () => JSON.parse(open('../data/users.json')));

export default function () {
  const user = USERS[(__VU - 1) % USERS.length];
  const token = user.access_token || login(user.email, user.password);

  if (!token) {
    sleep(2);
    return;
  }

  const leads = fetchLeads(token);
  if (leads.length > 0) {
    const leadId = leads[Math.floor(Math.random() * leads.length)].id;

    // Keep writes sparse for free-tier safety.
    if (__ITER % 5 === 0) {
      createLeadActivity(token, leadId, {
        type: 'note',
        title: `k6 free ramp activity iter-${__ITER}`,
        description: 'free-tier safe ramp',
        metadata: { source: 'k6-free-ramp' },
      });
    }

    if (__ITER % 9 === 0) {
      createLeadTask(token, leadId, {
        title: `k6 free ramp task iter-${__ITER}`,
        description: 'free-tier safe ramp',
        status: 'pending',
      });
    }
  }

  sleep(Number(__ENV.SLEEP_SECONDS || 1));
}
