import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'super_admin' | 'admin' | 'sales';
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

  const hasRequiredRole = useMemo(() => {
    if (!requiredRole) return true;
    if (!role) return false;

    if (requiredRole === 'super_admin') {
      return role === 'super_admin';
    }

    if (requiredRole === 'admin') {
      return role === 'admin' || role === 'super_admin';
    }

    return role === 'sales';
  }, [requiredRole, role]);

  const redirectTarget = useMemo(() => {
    if (isLoading || isRoleLoading) return null;

    if (!user) {
      return requiredRole === 'sales' ? '/auth' : '/admin/login';
    }

    if (!role) {
      return requiredRole === 'sales' ? '/auth' : '/admin/login';
    }

    if (hasRequiredRole) {
      return null;
    }

    if (role === 'sales') {
      return '/';
    }

    return '/admin';
  }, [hasRequiredRole, isLoading, isRoleLoading, requiredRole, role, user]);

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
    !hasRequiredRole
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
