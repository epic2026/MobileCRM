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
      className="fixed left-0 right-0 z-50 border-t border-border bg-card/95 shadow-lg"
      style={{
        bottom: 'max(env(safe-area-inset-bottom, 0px), 56px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 4px)',
      }}
    >
      <div className="w-full max-w-md mx-auto flex justify-around items-center h-16 px-2">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className="relative flex flex-col items-center justify-center w-16 h-full"
            >
              {isActive && (
                <div className="absolute -top-0.5 w-8 h-1 bg-primary rounded-full transition-[left,right,width] duration-200" />
              )}
              <item.icon
                className={`w-5 h-5 transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
              />
              <span
                className={`text-[10px] mt-1 transition-colors ${
                  isActive ? 'text-primary font-medium' : 'text-muted-foreground'
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
