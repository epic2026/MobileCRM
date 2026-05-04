import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';

interface AIAgentButtonProps {
  onClick: () => void;
  isActive: boolean;
}

const AIAgentButton = ({ onClick, isActive }: AIAgentButtonProps) => {
  const [showLabel, setShowLabel] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setShowLabel(false), 3200);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="fixed z-40 flex items-center gap-2.5"
      style={{
        bottom: 'calc(max(env(safe-area-inset-bottom), 12px) + 120px)',
        right: '20px',
      }}
    >
      {/* Floating "ARIA" label */}
      <AnimatePresence>
        {(showLabel && !isActive) && (
          <motion.span
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.25 }}
            className="rounded-full px-3 py-1 text-xs font-semibold text-white shadow-lg"
            style={{
              background: 'linear-gradient(135deg, rgba(139,92,246,0.92), rgba(99,102,241,0.92))',
              backdropFilter: 'blur(10px)',
            }}
          >
            Ask ARIA
          </motion.span>
        )}
      </AnimatePresence>

      {/* Relative container for pulse rings + button */}
      <div className="relative h-[60px] w-[60px]">
        {!isActive && (
          <>
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ background: 'rgba(139,92,246,0.28)' }}
              animate={{ scale: [1, 1.9, 1], opacity: [0.6, 0, 0.6] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ background: 'rgba(139,92,246,0.15)' }}
              animate={{ scale: [1, 2.5, 1], opacity: [0.4, 0, 0.4] }}
              transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
            />
          </>
        )}

        <motion.button
          onClick={onClick}
          whileTap={{ scale: 0.88 }}
          animate={isActive ? { rotate: [0, 15, -15, 0] } : {}}
          transition={{ duration: 0.4 }}
          className="relative flex h-[60px] w-[60px] items-center justify-center rounded-full focus:outline-none"
          style={{
            background: isActive
              ? 'linear-gradient(135deg, #6d28d9, #4338ca)'
              : 'linear-gradient(135deg, #8b5cf6, #6366f1)',
            boxShadow: isActive
              ? '0 0 0 3px rgba(139,92,246,0.4), 0 8px 24px rgba(99,102,241,0.5)'
              : '0 0 20px rgba(139,92,246,0.55), 0 4px 16px rgba(99,102,241,0.4)',
          }}
          aria-label="Open ARIA AI Assistant"
        >
          <motion.div
            animate={isActive ? { rotate: 360 } : { rotate: 0 }}
            transition={{ duration: 0.5 }}
          >
            <Sparkles className="h-6 w-6 text-white" strokeWidth={1.75} />
          </motion.div>
        </motion.button>
      </div>
    </div>
  );
};

export default AIAgentButton;
