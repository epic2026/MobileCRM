import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building, Check, Loader2, X } from 'lucide-react';

type Stage = 'loading' | 'set-password' | 'success' | 'error';

const AcceptInvite = () => {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>('loading');
  const [errorMessage, setErrorMessage] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // On mount, exchange the invite token from the URL hash into a session.
  // detectSessionInUrl is false (mobile app setting) so we do this manually.
  useEffect(() => {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (!accessToken || !refreshToken || type !== 'invite') {
      setErrorMessage('Invalid or expired invite link. Please ask your admin to resend.');
      setStage('error');
      return;
    }

    supabase.auth
      .setSession({ access_token: accessToken, refresh_token: refreshToken })
      .then(({ error }) => {
        if (error) {
          setErrorMessage(error.message);
          setStage('error');
        } else {
          // Clear the token from the URL so it can't be replayed
          window.history.replaceState(null, '', window.location.pathname);
          setStage('set-password');
        }
      });
  }, []);

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setErrorMessage('Passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setErrorMessage('Password must be at least 8 characters.');
      return;
    }
    setErrorMessage('');
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStage('success');
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to set password.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleContinue = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate('/admin/login'); return; }

    const { data: roleRow } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', session.user.id)
      .maybeSingle();

    const role = roleRow?.role;
    if (role === 'admin' || role === 'super_admin') {
      navigate('/admin/dashboard');
    } else {
      navigate('/auth');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2f64d6] via-[#2854c5] to-[#173785] text-white shadow-lg">
            <Building className="h-7 w-7" />
          </div>
          <CardTitle>
            {stage === 'set-password' ? 'Set Your Password' : 'MobileCRM'}
          </CardTitle>
          <CardDescription>
            {stage === 'loading' && 'Verifying your invite link…'}
            {stage === 'set-password' && 'Choose a password to activate your account.'}
            {stage === 'success' && 'Your account is ready.'}
            {stage === 'error' && 'Something went wrong.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {stage === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          )}

          {stage === 'set-password' && (
            <form onSubmit={handleSetPassword} className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              {errorMessage && (
                <p className="text-sm text-destructive">{errorMessage}</p>
              )}
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {submitting ? 'Activating…' : 'Activate Account'}
              </Button>
            </form>
          )}

          {stage === 'success' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-900">Account Activated!</p>
                <p className="mt-1 text-sm text-muted-foreground">Your password has been set. You can now log in.</p>
              </div>
              <Button className="w-full" onClick={handleContinue}>
                Go to Dashboard
              </Button>
            </div>
          )}

          {stage === 'error' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <X className="h-6 w-6 text-red-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-900">Invite Failed</p>
                <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => navigate('/admin/login')}>
                Go to Login
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AcceptInvite;
