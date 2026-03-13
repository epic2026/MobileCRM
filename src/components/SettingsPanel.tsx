import { User, Bell, Shield, HelpCircle, LogOut, ChevronRight, Smartphone, FileText, Sun, Moon } from 'lucide-react';
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
  const { user, signOut } = useAuth();

  const isDark = theme === 'dark';

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  // Get user initials
  const getInitials = () => {
    if (!user?.email) return 'U';
    return user.email.charAt(0).toUpperCase();
  };

  const menuItems = [
    { icon: User, label: 'Account Settings', hasChevron: true, onClick: () => {} },
    { icon: Smartphone, label: 'SIM Card Settings', hasChevron: true, onClick: () => {} },
    { icon: Shield, label: 'Privacy & Security', hasChevron: true, onClick: () => {} },
    { icon: FileText, label: 'Privacy Policy', hasChevron: true, onClick: () => navigate('/privacy') },
    { icon: HelpCircle, label: 'Help & Support', hasChevron: true, onClick: () => {} },
  ];

  return (
    <div className="pb-20">
      {/* Profile Header */}
      <div className="px-4 pt-6 pb-8">
        <div className="glass-card p-6 flex items-center gap-4">
          <Avatar className="w-16 h-16 bg-gradient-to-br from-primary to-accent">
            <AvatarFallback className="bg-transparent text-primary-foreground text-xl font-semibold">
              {getInitials()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="text-xl font-bold text-foreground">{user?.email || 'User'}</h2>
            <p className="text-sm text-muted-foreground">Sales Representative</p>
            <p className="text-xs text-primary mt-1">Active</p>
          </div>
        </div>
      </div>

      {/* Quick Settings */}
      <div className="px-4 mb-6">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Quick Settings</h2>
        <div className="glass-card divide-y divide-border">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {isDark ? <Moon className="w-5 h-5 text-muted-foreground" /> : <Sun className="w-5 h-5 text-muted-foreground" />}
              <span className="text-foreground">Dark Mode</span>
            </div>
            <Switch checked={isDark} onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')} />
          </div>
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Bell className="w-5 h-5 text-muted-foreground" />
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
        <h2 className="text-sm font-medium text-muted-foreground mb-3">Settings</h2>
        <div className="glass-card divide-y divide-border">
          {menuItems.map((item, index) => (
            <motion.button
              key={item.label}
              whileTap={{ scale: 0.98 }}
              onClick={item.onClick}
              className="w-full p-4 flex items-center justify-between hover:bg-secondary/30 transition-colors"
            >
              <div className="flex items-center gap-3">
                <item.icon className="w-5 h-5 text-muted-foreground" />
                <span className="text-foreground">{item.label}</span>
              </div>
              {item.hasChevron && <ChevronRight className="w-5 h-5 text-muted-foreground" />}
            </motion.button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="px-4 mb-6">
        <h2 className="text-sm font-medium text-muted-foreground mb-3">This Month</h2>
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

      {/* Logout */}
      <div className="px-4">
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={handleSignOut}
          className="w-full glass-card p-4 flex items-center justify-center gap-2 text-destructive hover:bg-destructive/10 transition-colors"
        >
          <LogOut className="w-5 h-5" />
          <span>Sign Out</span>
        </motion.button>
      </div>
    </div>
  );
};

export default SettingsPanel;
