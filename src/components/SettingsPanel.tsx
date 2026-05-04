import { Bell, LogOut, ChevronRight, FileText, Sun, Moon } from 'lucide-react';
import { motion } from 'framer-motion';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { useAuth } from '@/contexts/AuthContext';
import CallRecordingToggle from '@/components/CallRecordingToggle';

const SettingsPanel = () => {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(true);
  const { theme, setTheme } = useTheme();
  const { user, role, signOut } = useAuth();

  const isDark = theme === 'dark';

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : 'U';
  const roleLabel = role === 'super_admin' ? 'Super Admin' : role === 'admin' ? 'Admin' : 'Sales Rep';

  const menuItems = [
    { icon: FileText, label: 'Privacy Policy', hasChevron: true, onClick: () => navigate('/privacy') },
  ];

  return (
    <div className="pb-20">
      {/* Profile Header — compact */}
      <div className="px-4 pt-4 pb-6">
        <div className="glass-card p-4 flex items-center gap-3">
          <Avatar className="h-12 w-12 bg-gradient-to-br from-primary to-accent flex-shrink-0">
            <AvatarFallback className="bg-transparent text-primary-foreground text-base font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{user?.email || 'User'}</p>
            <div className="mt-0.5 flex items-center gap-2">
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                {roleLabel}
              </span>
              <span className="text-xs text-emerald-500">● Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Settings */}
      <div className="px-4 mb-6">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">Preferences</h2>
        <div className="glass-card divide-y divide-border">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              {isDark ? <Moon className="h-5 w-5 text-muted-foreground" /> : <Sun className="h-5 w-5 text-muted-foreground" />}
              <span className="text-foreground">Dark Mode</span>
            </div>
            <Switch checked={isDark} onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')} />
          </div>
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <Bell className="h-5 w-5 text-muted-foreground" />
              <span className="text-foreground">Push Notifications</span>
            </div>
            <Switch checked={notifications} onCheckedChange={setNotifications} />
          </div>
          <div className="p-0">
            <CallRecordingToggle />
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="px-4 mb-6">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">More</h2>
        <div className="glass-card divide-y divide-border">
          {menuItems.map((item) => (
            <motion.button
              key={item.label}
              whileTap={{ scale: 0.98 }}
              onClick={item.onClick}
              className="flex w-full items-center justify-between p-4 transition-colors hover:bg-secondary/30"
            >
              <div className="flex items-center gap-3">
                <item.icon className="h-5 w-5 text-muted-foreground" />
                <span className="text-foreground">{item.label}</span>
              </div>
              {item.hasChevron && <ChevronRight className="h-5 w-5 text-muted-foreground" />}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 mb-6">
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">This Month</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold gradient-text">147</p>
            <p className="text-xs text-muted-foreground">Calls Made</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold text-success">23</p>
            <p className="text-xs text-muted-foreground">Deals Closed</p>
          </div>
          <div className="glass-card p-4 text-center">
            <p className="text-2xl font-bold text-accent">4.2h</p>
            <p className="text-xs text-muted-foreground">Talk Time</p>
          </div>
        </div>
      </div>

      {/* Sign out — destructive card */}
      <div className="px-4">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleSignOut}
          className="glass-card w-full p-4 flex items-center justify-center gap-2 text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="h-5 w-5" />
          <span className="font-medium">Sign Out</span>
        </motion.button>
      </div>
    </div>
  );
};

export default SettingsPanel;
