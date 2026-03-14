import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface MobileLayoutProps {
  children: ReactNode;
}

const MobileLayout = ({ children }: MobileLayoutProps) => {
  return (
    <div
      className="min-h-[100dvh] w-full overflow-x-hidden bg-background"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)' }}
    >
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="w-full max-w-md mx-auto min-h-[100dvh] relative overflow-x-hidden"
      >
        {children}
      </motion.div>
    </div>
  );
};

export default MobileLayout;
