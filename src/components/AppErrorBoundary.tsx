import React from 'react';
import { Button } from '@/components/ui/button';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
  fallbackTitle?: string;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  constructor(props: AppErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown, errorInfo: React.ErrorInfo) {
    console.error('UI boundary caught error:', error);
    if (errorInfo?.componentStack) {
      console.error('UI boundary component stack:', errorInfo.componentStack);
    }
  }

  private handleReload = () => {
    this.setState({ hasError: false });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="px-4 py-8 text-center">
          <p className="text-base font-semibold text-foreground">{this.props.fallbackTitle ?? 'Something went wrong'}</p>
          <p className="mt-1 text-sm text-muted-foreground">Please retry loading this section.</p>
          <Button className="mt-4" onClick={this.handleReload}>
            Reload
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AppErrorBoundary;
