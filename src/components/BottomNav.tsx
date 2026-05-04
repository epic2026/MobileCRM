import { Settings, Target, Phone, ListTodo } from 'lucide-react';

interface BottomNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const navItems = [
  { id: 'leads', icon: Target, label: 'Leads' },
  { id: 'tasks', icon: ListTodo, label: 'Tasks' },
  { id: 'activity', icon: Phone, label: 'Activity' },
  { id: 'settings', icon: Settings, label: 'Settings' },
];

const BottomNav = ({ activeTab, onTabChange }: BottomNavProps) => {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center px-2"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
    >
      <div className="w-full max-w-md rounded-t-2xl border border-b-0 border-border bg-card/95 shadow-lg backdrop-blur">
        <div className="flex h-[72px] items-center justify-around px-2">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className="relative flex h-full flex-1 flex-col items-center justify-center gap-0.5"
              >
                {isActive ? (
                  <span className="flex flex-col items-center gap-0.5 rounded-2xl bg-primary/10 px-4 py-1.5">
                    <item.icon className="h-[22px] w-[22px] text-primary" />
                    <span className="text-xs font-semibold text-primary">{item.label}</span>
                  </span>
                ) : (
                  <>
                    <item.icon className="h-5 w-5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{item.label}</span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;
