import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTenant } from '@/contexts/TenantContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Building, Check, Loader2, X } from 'lucide-react';

const AcceptInvite = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const { user, isLoading } = useAuth();
  const { acceptInvite } = useTenant();
  const navigate = useNavigate();

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleAccept = async () => {
    if (!token) return;

    try {
      setStatus('loading');
      await acceptInvite(token);
      setStatus('success');
    } catch (error: any) {
      setErrorMessage(error.message || 'Failed to accept invite');
      setStatus('error');
    }
  };

  useEffect(() => {
    if (!isLoading && !user && token) {
      navigate(`/auth?redirect=/invite?token=${token}`);
    }
  }, [isLoading, user, token, navigate]);

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid Invite</CardTitle>
            <CardDescription>This invite link is invalid or missing the required token.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full" onClick={() => navigate('/')}>
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f7fb]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2f64d6] via-[#2854c5] to-[#173785] text-white shadow-lg">
            <Building className="h-7 w-7" />
          </div>
          <CardTitle>Team Invitation</CardTitle>
          <CardDescription>You have been invited to join an organization on MobileCRM.</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {status === 'idle' && (
            <>
              <p className="text-center text-sm text-muted-foreground">
                Click below to accept your invitation to join this team.
              </p>
              <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={handleAccept}>
                Accept Invite
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
                Decline
              </Button>
            </>
          )}

          {status === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <p className="text-sm text-muted-foreground">Accepting your invitation...</p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-900">Invitation Accepted!</p>
                <p className="mt-1 text-sm text-muted-foreground">You've joined the team successfully.</p>
              </div>
              <Badge variant="outline" className="border-green-500 text-green-600">Active Member</Badge>
              <Button className="w-full" onClick={() => navigate('/')}>
                Go to Dashboard
              </Button>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <X className="h-6 w-6 text-red-600" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-slate-900">Invite Failed</p>
                <p className="mt-1 text-sm text-muted-foreground">{errorMessage}</p>
              </div>
              <Button variant="outline" className="w-full" onClick={() => navigate('/')}>
                Go Home
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AcceptInvite;
