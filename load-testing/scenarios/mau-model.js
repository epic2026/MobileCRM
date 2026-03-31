import exec from 'k6/execution';
import { sleep } from 'k6';
import { SharedArray } from 'k6/data';
import {
  createLeadActivity,
  createLeadTask,
  fetchLeads,
  login,
} from '../lib/supabase-api.js';

const TARGET_USERS = Number(__ENV.MAU_TARGET || 10000);
const SAFE_VUS = Number(__ENV.VUS || 25);

export const options = {
  scenarios: {
    mau_model: {
      executor: 'shared-iterations',
      vus: SAFE_VUS,
      iterations: Number(__ENV.ITERATIONS || TARGET_USERS),
      maxDuration: __ENV.MAX_DURATION || '2h',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1800'],
  },
};

const USERS = new SharedArray('users', () => JSON.parse(open('../data/users.json')));

export default function () {
  const globalIteration = exec.scenario.iterationInTest;
  const user = USERS[globalIteration % USERS.length];
  const token = user.access_token || login(user.email, user.password);

  if (!token) {
    sleep(0.5);
    return;
  }

  const leads = fetchLeads(token);
  if (leads.length > 0) {
    const leadId = leads[0].id;

    // MAU modeling should be read-heavy with occasional writes.
    if (globalIteration % 12 === 0) {
      createLeadActivity(token, leadId, {
        type: 'note',
        title: `k6 mau activity user-${globalIteration}`,
        description: 'mau model event',
        metadata: { source: 'k6-mau-model' },
      });
    }

    if (globalIteration % 25 === 0) {
      createLeadTask(token, leadId, {
        title: `k6 mau task user-${globalIteration}`,
        description: 'mau model event',
        status: 'pending',
      });
    }
  }

  sleep(Number(__ENV.SLEEP_SECONDS || 0.4));
}
