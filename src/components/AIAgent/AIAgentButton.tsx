import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface AIAgentButtonProps {
  onClick: () => void;
  isActive: boolean;
}

const AIAgentButton = ({ onClick, isActive }: AIAgentButtonProps) => {
  return (
    <div
      className="fixed z-40"
      style={{
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 118px)',
        right: '16px',
      }}
    >
      {/* Ambient pulse rings — only when idle */}
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
        className="relative w-14 h-14 rounded-full flex items-center justify-center focus:outline-none"
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
          <Sparkles className="w-6 h-6 text-white" strokeWidth={1.75} />
        </motion.div>
      </motion.button>
    </div>
  );
};

export default AIAgentButton;
