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
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}
    >
      <div className="w-full max-w-md rounded-t-2xl border border-b-0 border-border bg-card/95 shadow-lg backdrop-blur">
        <div className="flex h-16 items-center justify-around px-2">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className="relative flex h-full w-16 flex-col items-center justify-center"
              >
                {isActive && (
                  <div className="absolute -top-0.5 h-1 w-8 rounded-full bg-primary transition-[left,right,width] duration-200" />
                )}
                <item.icon
                  className={`h-5 w-5 transition-colors ${
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  }`}
                />
                <span
                  className={`mt-1 text-[10px] transition-colors ${
                    isActive ? 'font-medium text-primary' : 'text-muted-foreground'
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default BottomNav;
