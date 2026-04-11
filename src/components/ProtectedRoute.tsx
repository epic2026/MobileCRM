import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'sales';
}

const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  const { user, role, isLoading } = useAuth();
  const navigate = useNavigate();
  const [isRoleLoading, setIsRoleLoading] = useState(true);

  useEffect(() => {
    // Give role a moment to load after user is available
    if (!isLoading && user) {
      const timer = setTimeout(() => {
        setIsRoleLoading(false);
      }, 500);
      return () => clearTimeout(timer);
    } else if (!isLoading && !user) {
      setIsRoleLoading(false);
    }
  }, [isLoading, user]);

  const redirectTarget = useMemo(() => {
    if (isLoading || isRoleLoading) return null;

    if (!user) {
      return requiredRole === 'admin' ? '/admin/login' : '/auth';
    }

    if (role === 'admin' && requiredRole !== 'admin') {
      return '/admin';
    }

    if (role === 'sales' && requiredRole === 'admin') {
      return '/';
    }

    if (!role) {
      return requiredRole === 'admin' ? '/admin/login' : '/auth';
    }

    return null;
  }, [isLoading, isRoleLoading, user, role, requiredRole]);

  useEffect(() => {
    if (redirectTarget) {
      navigate(redirectTarget, { replace: true });
    }
  }, [redirectTarget, navigate]);

  if (isLoading || isRoleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (
    !!redirectTarget ||
    !user ||
    !role ||
    (role === 'admin' && requiredRole !== 'admin') ||
    (role === 'sales' && requiredRole === 'admin')
  ) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Redirecting...</div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
