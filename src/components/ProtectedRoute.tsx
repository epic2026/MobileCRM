import { useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!isLoading && !isRoleLoading) {
      if (!user) {
        // Not logged in - redirect to appropriate login
        if (requiredRole === 'admin') {
          navigate('/admin/login');
        } else {
          navigate('/auth');
        }
        return;
      }

      // Admin users should ONLY access admin routes
      if (role === 'admin') {
        if (requiredRole !== 'admin') {
          // Admin trying to access sales app - redirect to admin dashboard
          navigate('/admin');
        }
        return;
      }

      // Sales users should ONLY access sales routes
      if (role === 'sales') {
        if (requiredRole === 'admin') {
          // Sales user trying to access admin - redirect to sales app
          navigate('/');
        }
        return;
      }

      // User has no role assigned yet - check what they're trying to access
      if (!role) {
        if (requiredRole === 'admin') {
          navigate('/admin/login');
        } else {
          navigate('/auth');
        }
      }
    }
  }, [user, role, isLoading, isRoleLoading, requiredRole, navigate]);

  if (isLoading || isRoleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  // Admin can only access admin routes
  if (role === 'admin' && requiredRole !== 'admin') {
    return null;
  }

  // Sales can only access sales routes
  if (role === 'sales' && requiredRole === 'admin') {
    return null;
  }

  // No role - deny access
  if (!role) {
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
