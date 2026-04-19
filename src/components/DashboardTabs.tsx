import React, { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { useCallLogs } from '@/hooks/useCallLogs';
import { supabase } from '@/integrations/supabase/client';
import { useEffect, useState } from 'react';

const tabs = [{ label: 'Overview' }, { label: 'User Performance' }, { label: 'Call Logs' }];

function formatDay(date: Date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function lastNDays(n: number) {
  const days: Date[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    days.push(d);
  }
  return days;
}

function useOverviewData() {
  const { callLogs = [] } = useCallLogs();

  const last7 = lastNDays(7);

  const callsByDay = last7.map((d) => {
    const dateKey = d.toISOString().slice(0, 10);
    const dayLogs = callLogs.filter((l: any) => (new Date(l.created_at)).toISOString().slice(0, 10) === dateKey);
    const total = dayLogs.length;
    const connected = dayLogs.filter((l: any) => (l.duration || 0) > 0).length;
    const duration = dayLogs.reduce((s: number, x: any) => s + (x.duration || 0), 0);
    return { date: formatDay(d), total, connected, duration };
  });

  // leaders
  const usersMap = new Map<string, { id: string; calls: number; outgoing: number; incoming: number; duration: number }>();
  for (const l of callLogs) {
    const uid = l.user_id || 'unassigned';
    const entry = usersMap.get(uid) || { id: uid, calls: 0, outgoing: 0, incoming: 0, duration: 0 };
    entry.calls += 1;
    if (l.type === 'outgoing') entry.outgoing += 1;
    if (l.type === 'incoming') entry.incoming += 1;
    entry.duration += l.duration || 0;
    usersMap.set(uid, entry);
  }

  const users = Array.from(usersMap.values());
  users.sort((a, b) => b.calls - a.calls);

  // outcomes
  const outcomeMap = new Map<string, number>();
  let missed = 0;
  let answered = 0;
  for (const l of callLogs) {
    const oc = (l.outcome || 'unknown') as string;
    outcomeMap.set(oc, (outcomeMap.get(oc) || 0) + 1);
    if ((l.duration || 0) > 0) answered += 1; else missed += 1;
  }

  // volume by hour
  const hourBuckets = Array.from({ length: 24 }).map((_, i) => ({ hour: `${i}`, calls: 0 }));
  for (const l of callLogs) {
    const d = new Date(l.created_at);
    const h = d.getHours();
    hourBuckets[h].calls += 1;
  }

  return { callLogs, callsByDay, users, outcomeMap, hourBuckets, missed, answered };
}

function useUserNames(callLogs: any[]) {
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    const ids = Array.from(new Set(callLogs.map((c) => c.user_id).filter(Boolean)));
    if (!ids.length) {
      setNames({});
      return;
    }

    let mounted = true;
    (async () => {
      const { data: profiles, error } = await supabase.from('profiles').select('id, full_name, email').in('id', ids).limit(1000);
      if (error) {
        console.warn('Failed to fetch profiles for dashboard', error.message || error);
        return;
      }
      if (!mounted) return;
      const map: Record<string, string> = {};
      for (const p of profiles || []) map[p.id] = p.full_name || p.email || p.id;
      setNames(map);
    })();

    return () => { mounted = false; };
  }, [callLogs]);

  return names;
}

const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#7C3AED', '#06B6D4'];

function OverviewTab() {
  const { callLogs, callsByDay, users, outcomeMap, hourBuckets, missed, answered } = useOverviewData();
  const names = useUserNames(callLogs);

  const topOutbound = users.filter((u) => u.outgoing > 0).sort((a, b) => b.outgoing - a.outgoing).slice(0, 5).map(u=>({ ...u, name: names[u.id] || u.id }));
  const topInbound = users.filter((u) => u.incoming > 0).sort((a, b) => b.incoming - a.incoming).slice(0, 5).map(u=>({ ...u, name: names[u.id] || u.id }));
  const topDuration = users.sort((a, b) => b.duration - a.duration).slice(0, 5).map(u=>({ ...u, name: names[u.id] || u.id }));

  const outcomeData = Array.from(outcomeMap.entries()).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6 mt-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="col-span-2 bg-white rounded-xl shadow p-6">
          <h3 className="font-semibold text-lg mb-2">Calls vs Connected Trend</h3>
          <p className="text-sm text-gray-500 mb-4">Daily momentum of activity and outcomes.</p>
          <div className="h-56">
            <ResponsiveContainer>
              <LineChart data={callsByDay}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="total" stroke="#2563EB" strokeWidth={2} name="Calls" />
                <Line type="monotone" dataKey="connected" stroke="#10B981" strokeWidth={2} name="Connected" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h3 className="font-semibold text-lg mb-2">Duration Trend</h3>
          <p className="text-sm text-gray-500 mb-4">Talk time volume by day.</p>
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={callsByDay}>
                <defs>
                  <linearGradient id="dur" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06B6D4" stopOpacity={0.8} />
                    <stop offset="95%" stopColor="#06B6D4" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip formatter={(v: any) => `${v} s`} />
                <Area type="monotone" dataKey="duration" stroke="#06B6D4" fillOpacity={1} fill="url(#dur)" name="Duration (s)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow p-6">
          <h4 className="font-semibold mb-2">Outbound Leaders</h4>
          <p className="text-sm text-gray-500 mb-4">Top outbound callers by volume.</p>
          <div className="h-40">
            <ResponsiveContainer>
              <BarChart data={topOutbound.map((u) => ({ name: u.name || u.id, value: u.outgoing }))} layout="vertical">
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" />
                <Tooltip />
                <Bar dataKey="value" fill="#2563EB" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h4 className="font-semibold mb-2">Inbound Leaders</h4>
          <p className="text-sm text-gray-500 mb-4">Top inbound callers by volume.</p>
          <div className="h-40">
            <ResponsiveContainer>
              <BarChart data={topInbound.map((u) => ({ name: u.name || u.id, value: u.incoming }))} layout="vertical">
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" />
                <Tooltip />
                <Bar dataKey="value" fill="#7C3AED" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h4 className="font-semibold mb-2">Talk Time Leaders</h4>
          <p className="text-sm text-gray-500 mb-4">Users with the highest total call duration.</p>
          <div className="h-40">
            <ResponsiveContainer>
              <BarChart data={topDuration.map((u) => ({ name: u.name || u.id, value: Math.round(u.duration) }))} layout="vertical">
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" />
                <Tooltip formatter={(v: any) => `${v} s`} />
                <Bar dataKey="value" fill="#F59E0B" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow p-6">
          <h4 className="font-semibold mb-2">Call Outcomes</h4>
          <p className="text-sm text-gray-500 mb-4">Distribution of call outcomes.</p>
          <div className="h-44">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={outcomeData} dataKey="value" nameKey="name" outerRadius={70} fill="#8884d8">
                  {outcomeData.map((_, idx) => (
                    <Cell key={`cell-${idx}`} fill={COLORS[idx % COLORS.length]} />
                  ))}
                </Pie>
                <Legend />
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h4 className="font-semibold mb-2">Call Volume by Hour</h4>
          <p className="text-sm text-gray-500 mb-4">Hourly call distribution.</p>
          <div className="h-44">
            <ResponsiveContainer>
              <BarChart data={hourBuckets}>
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="calls" fill="#06B6D4" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow p-6">
          <h4 className="font-semibold mb-2">Missed vs Answered</h4>
          <p className="text-sm text-gray-500 mb-4">Quick view of missed vs answered calls.</p>
          <div className="h-44 flex items-center justify-center">
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={[{ name: 'Answered', value: answered }, { name: 'Missed', value: missed }]} dataKey="value" nameKey="name" outerRadius={60}>
                  <Cell fill="#10B981" />
                  <Cell fill="#EF4444" />
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function UserPerformanceTab() {
  const { callLogs = [] } = useCallLogs();
  const names = useUserNames(callLogs);

  const byUser = useMemo(() => {
    const map = new Map<string, any>();
    for (const l of callLogs) {
      const key = l.user_id || 'unassigned';
      const cur = map.get(key) || { user: key, incoming: 0, outgoing: 0, missed: 0, duration: 0 };
      if (l.type === 'incoming') cur.incoming += 1;
      if (l.type === 'outgoing') cur.outgoing += 1;
      if (l.type === 'missed') cur.missed += 1;
      cur.duration += l.duration || 0;
      map.set(key, cur);
    }
    return Array.from(map.values()).slice(0, 10).map((u) => ({ ...u, user: names[u.user] || u.user }));
  }, [callLogs]);

  return (
    <div className="mt-6 space-y-6">
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-semibold text-lg mb-2">User Performance View</h3>
        <p className="text-sm text-gray-500 mb-4">Measure each user's call load, connect quality, and direction mix.</p>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={byUser}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="user" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="incoming" stackId="a" fill="#7C3AED" />
              <Bar dataKey="outgoing" stackId="a" fill="#2563EB" />
              <Bar dataKey="missed" stackId="a" fill="#EF4444" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function CallLogsTab() {
  const { callLogs = [] } = useCallLogs();

  const durationBuckets = useMemo(() => {
    const buckets = [0, 30, 60, 120, 300, 600, 3600].map((upper) => ({ range: `${upper}s`, count: 0 }));
    for (const l of callLogs) {
      const s = l.duration || 0;
      const idx = buckets.findIndex((b) => parseInt(b.range) >= s || b.range === '3600s');
      if (idx >= 0) buckets[idx].count += 1;
    }
    return buckets;
  }, [callLogs]);

  const byType = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of callLogs) map.set(l.type, (map.get(l.type) || 0) + 1);
    return Array.from(map.entries()).map(([type, value]) => ({ type, value }));
  }, [callLogs]);

  return (
    <div className="mt-6 space-y-6">
      <div className="bg-white rounded-xl shadow p-6">
        <h3 className="font-semibold text-lg mb-2">Call Logs</h3>
        <p className="text-sm text-gray-500 mb-4">Detailed logs for QA, coaching, and audit.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="h-48">
            <ResponsiveContainer>
              <BarChart data={durationBuckets}>
                <XAxis dataKey="range" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#2563EB" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="h-48">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={byType} dataKey="value" nameKey="type" outerRadius={80}>
                  {byType.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardTabs() {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="p-6">
      <div className="flex space-x-2 mb-4">
        {tabs.map((tab, idx) => (
          <button
            key={tab.label}
            className={`px-4 py-2 rounded-lg font-medium focus:outline-none transition-colors ${
              idx === activeTab ? 'bg-white shadow text-gray-900' : 'bg-gray-100 text-gray-500 hover:bg-white'
            }`}
            onClick={() => setActiveTab(idx)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>
        {activeTab === 0 && <OverviewTab />}
        {activeTab === 1 && <UserPerformanceTab />}
        {activeTab === 2 && <CallLogsTab />}
      </div>
    </div>
  );
}
