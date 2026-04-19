import React, { useState } from 'react';

const tabs = [
  { label: 'Overview' },
  { label: 'User Performance' },
  { label: 'Call Logs' },
];

const chartPlaceholder = (
  <div className="flex flex-col items-center justify-center h-full w-full">
    <div className="w-32 h-32 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 text-xl">
      Chart
    </div>
  </div>
);

const OverviewTab = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mt-6">
    <div className="col-span-2 bg-white rounded-xl shadow p-6 flex flex-col">
      <h2 className="font-semibold text-lg mb-2">Calls vs Connected Trend</h2>
      <span className="text-gray-500 mb-4">Daily momentum of activity and outcomes.</span>
      <div className="flex-1 flex items-center justify-center">{chartPlaceholder}</div>
    </div>
    <div className="col-span-2 bg-white rounded-xl shadow p-6 flex flex-col">
      <h2 className="font-semibold text-lg mb-2">Duration Trend</h2>
      <span className="text-gray-500 mb-4">Talk time volume by day.</span>
      <div className="flex-1 flex items-center justify-center">{chartPlaceholder}</div>
    </div>
    <div className="bg-white rounded-xl shadow p-6 flex flex-col">
      <h2 className="font-semibold text-lg mb-2">Outbound Leaders</h2>
      <span className="text-gray-500 mb-4">Top outbound callers by volume.</span>
      <div className="flex-1 flex items-center justify-center">{chartPlaceholder}</div>
    </div>
    <div className="bg-white rounded-xl shadow p-6 flex flex-col">
      <h2 className="font-semibold text-lg mb-2">Inbound Leaders</h2>
      <span className="text-gray-500 mb-4">Top inbound callers by volume.</span>
      <div className="flex-1 flex items-center justify-center">{chartPlaceholder}</div>
    </div>
    <div className="bg-white rounded-xl shadow p-6 flex flex-col">
      <h2 className="font-semibold text-lg mb-2">Talk Time Leaders</h2>
      <span className="text-gray-500 mb-4">Users with the highest total call duration.</span>
      <div className="flex-1 flex items-center justify-center">{chartPlaceholder}</div>
    </div>
  </div>
);

const PlaceholderTab = ({ label }: { label: string }) => (
  <div className="flex flex-col items-center justify-center h-96">
    <div className="w-40 h-40 bg-gray-100 rounded-full flex items-center justify-center text-gray-400 text-2xl mb-4">
      Chart
    </div>
    <span className="text-gray-500">{label} charts coming soon...</span>
  </div>
);

export default function DashboardTabs() {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="p-6">
      <div className="flex space-x-2 mb-4">
        {tabs.map((tab, idx) => (
          <button
            key={tab.label}
            className={`px-4 py-2 rounded-lg font-medium focus:outline-none transition-colors ${
              idx === activeTab
                ? 'bg-white shadow text-gray-900'
                : 'bg-gray-100 text-gray-500 hover:bg-white'
            }`}
            onClick={() => setActiveTab(idx)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div>
        {activeTab === 0 && <OverviewTab />}
        {activeTab === 1 && <PlaceholderTab label="User Performance" />}
        {activeTab === 2 && <PlaceholderTab label="Call Logs" />}
      </div>
    </div>
  );
}
