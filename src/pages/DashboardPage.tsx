import DashboardTabs from '../components/DashboardTabs';

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="w-full max-w-6xl">
        <DashboardTabs />
      </div>
    </div>
  );
}
