import { ReactNode } from 'react';

interface MobileLayoutProps {
  children: ReactNode;
}

const MobileLayout = ({ children }: MobileLayoutProps) => {
  return (
    <div
      className="min-h-[100dvh] w-full overflow-x-hidden bg-background"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 24px)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 16px)',
      }}
    >
      <div
        className="w-full max-w-md mx-auto min-h-[100dvh] relative overflow-x-hidden"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 104px)' }}
      >
        {children}
      </div>
    </div>
  );
};

export default MobileLayout;
