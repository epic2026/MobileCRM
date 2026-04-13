import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { isNativeApp } from '@/services/nativePlugins';

type AppRole = 'super_admin' | 'admin' | 'sales' | null;

const isLikelyJwt = (token: string | null | undefined) =>
  typeof token === 'string' && token.split('.').length === 3;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserRole = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.log('No role found for user:', error.message);
        return null;
      }

      return data?.role as AppRole;
    } catch (err) {
      console.error('Error fetching role:', err);
      return null;
    }
  };

  const clearAuthState = () => {
    setSession(null);
    setUser(null);
    setRole(null);
  };

  const applyValidatedSession = async (incomingSession: Session | null) => {
    if (!incomingSession) {
      clearAuthState();
      return;
    }

    if (!isLikelyJwt(incomingSession.access_token)) {
      console.warn('⚠️ Cached session token is invalid, attempting refresh...');
      const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshedData.session || !refreshedData.user || !isLikelyJwt(refreshedData.session.access_token)) {
        await supabase.auth.signOut();
        clearAuthState();
        return;
      }

      setSession(refreshedData.session);
      setUser(refreshedData.user);
      setRole(await fetchUserRole(refreshedData.user.id));
      return;
    }

    const { data: currentUserData, error: currentUserError } = await supabase.auth.getUser();
    if (!currentUserError && currentUserData.user) {
      setSession(incomingSession);
      setUser(currentUserData.user);
      setRole(await fetchUserRole(currentUserData.user.id));
      return;
    }

    console.warn('⚠️ Cached session invalid, attempting refresh...', currentUserError?.message);
    const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !refreshedData.session || !refreshedData.user) {
      console.error('❌ Session refresh failed during app bootstrap:', refreshError?.message || 'No refreshed user');
      await supabase.auth.signOut();
      clearAuthState();
      return;
    }

    setSession(refreshedData.session);
    setUser(refreshedData.user);
    setRole(await fetchUserRole(refreshedData.user.id));
  };

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      setTimeout(() => {
        void applyValidatedSession(session);
      }, 0);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      applyValidatedSession(session).finally(() => {
        setIsLoading(false);
      });
    }).catch((error) => {
      console.error('❌ Failed to bootstrap auth session:', error);
      clearAuthState();
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const redirectUrl = isNativeApp() ? undefined : `${window.location.origin}/`;

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
        },
      },
    });

    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    clearAuthState();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        role,
        isLoading,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
