import { ReactNode } from 'react';

interface MobileLayoutProps {
  children: ReactNode;
}

const MobileLayout = ({ children }: MobileLayoutProps) => {
  return (
    <div
      className="min-h-[100dvh] w-full overflow-x-hidden bg-background"
      style={{ paddingTop: 'max(env(safe-area-inset-top), 24px)' }}
    >
      <div className="w-full max-w-md mx-auto min-h-[100dvh] relative overflow-x-hidden">
        {children}
      </div>
    </div>
  );
};

export default MobileLayout;
