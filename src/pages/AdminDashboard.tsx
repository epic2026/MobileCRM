import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Shield,
  Users,
  LogOut,
  Plus,
  UserCheck,
  UserX,
  BarChart3,
  UserPlus,
  Mail,
  Pencil,
  Trash2,
  Upload,
} from 'lucide-react';
import { format } from 'date-fns';
import LeadImport from '@/components/admin/LeadImport';
import LeadAssignment from '@/components/admin/LeadAssignment';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
}

interface UserWithRole extends Profile {
  role: 'admin' | 'sales' | null;
}

interface ReportStats {
  totalLeads: number;
  totalCalls: number;
  convertedLeads: number;
}

const AdminDashboard = () => {
  const { user, role, isLoading, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<'users' | 'leads' | 'reports'>('users');
  const [deleteConfirm, setDeleteConfirm] = useState<{ userId: string; email: string } | null>(null);
  const [newUserData, setNewUserData] = useState({
    email: '',
    password: '',
    fullName: '',
    role: 'sales' as 'admin' | 'sales',
  });
  const [editUserData, setEditUserData] = useState({
    id: '',
    email: '',
    fullName: '',
    role: 'sales' as 'admin' | 'sales',
    isActive: true,
  });

  useEffect(() => {
    if (!isLoading && (!user || role !== 'admin')) {
      navigate('/admin/login');
    }
  }, [user, role, isLoading, navigate]);

  // Fetch all users with roles (admin only)
  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, role');

      if (rolesError) throw rolesError;

      const rolesMap = new Map(roles?.map((r) => [r.user_id, r.role]) || []);

      return (profiles || []).map((profile) => ({
        ...profile,
        role: rolesMap.get(profile.id) || null,
      })) as UserWithRole[];
    },
    enabled: role === 'admin',
  });

  const { data: reportStats } = useQuery({
    queryKey: ['admin-report-stats'],
    queryFn: async () => {
      const [leadsRes, callsRes, wonLeadsRes] = await Promise.all([
        supabase.from('leads').select('id', { count: 'exact', head: true }),
        supabase.from('call_logs').select('id', { count: 'exact', head: true }),
        supabase.from('leads').select('id', { count: 'exact', head: true }).eq('status', 'won'),
      ]);

      return {
        totalLeads: leadsRes.count || 0,
        totalCalls: callsRes.count || 0,
        convertedLeads: wonLeadsRes.count || 0,
      } as ReportStats;
    },
    enabled: role === 'admin',
  });

  // Create new user with role
  const createUser = useMutation({
    mutationFn: async (data: { email: string; password: string; fullName: string; role: 'admin' | 'sales' }) => {
      // Create user via Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: { full_name: data.fullName },
        },
      });

      if (authError) throw authError;
      if (!authData.user) throw new Error('Failed to create user');

      // Assign selected role
      const { error: roleError } = await supabase.from('user_roles').insert({
        user_id: authData.user.id,
        role: data.role,
      });

      if (roleError) throw roleError;

      return authData.user;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'User Created', description: 'User has been created successfully.' });
      setIsCreateDialogOpen(false);
      setNewUserData({ email: '', password: '', fullName: '', role: 'sales' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Create User',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Toggle user active status
  const toggleUserStatus = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ is_active: isActive })
        .eq('id', userId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'User Updated', description: 'User status has been updated.' });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Update User',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateUser = useMutation({
    mutationFn: async (data: { id: string; fullName: string; role: 'admin' | 'sales'; isActive: boolean }) => {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: data.fullName, is_active: data.isActive })
        .eq('id', data.id);

      if (profileError) throw profileError;

      const { data: existingRole, error: roleFetchError } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', data.id)
        .maybeSingle();

      if (roleFetchError) throw roleFetchError;

      if (existingRole) {
        const { error: roleUpdateError } = await supabase
          .from('user_roles')
          .update({ role: data.role })
          .eq('user_id', data.id);

        if (roleUpdateError) throw roleUpdateError;
      } else {
        const { error: roleInsertError } = await supabase
          .from('user_roles')
          .insert({ user_id: data.id, role: data.role });

        if (roleInsertError) throw roleInsertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'User Updated', description: 'User details have been saved.' });
      setIsEditDialogOpen(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Update User',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const removeUserAccess = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ is_active: false })
        .eq('id', userId);

      if (profileError) throw profileError;

      const { error: roleDeleteError } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);

      if (roleDeleteError) throw roleDeleteError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      toast({ title: 'User Removed', description: 'User access has been removed and the account is inactive.' });
      setDeleteConfirm(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Remove User',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSignOut = async () => {
    await signOut();
    navigate('/admin/login');
  };

  const handleEditUser = (selectedUser: UserWithRole) => {
    setEditUserData({
      id: selectedUser.id,
      email: selectedUser.email,
      fullName: selectedUser.full_name || '',
      role: selectedUser.role || 'sales',
      isActive: selectedUser.is_active,
    });
    setIsEditDialogOpen(true);
  };

  if (isLoading || usersLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Loading admin dashboard...</div>
      </div>
    );
  }

  if (!user || role !== 'admin') {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="container mx-auto px-4 py-3 flex items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Shield className="w-8 h-8 text-primary" />
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-foreground truncate">Admin Dashboard</h1>
              <p className="text-xs sm:text-sm text-muted-foreground truncate">Manage your sales team</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut} className="shrink-0">
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 sm:py-8 pb-24 sm:pb-8">
        {activeSection === 'users' && (
          <>
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>Sales Users</CardTitle>
                  <CardDescription>Manage users, roles, and access in one place</CardDescription>
                </div>
                <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full sm:w-auto">
                      <Plus className="w-4 h-4 mr-2" />
                      Add Sales User
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Create Sales User</DialogTitle>
                      <DialogDescription>
                        Add a new sales team member to your organization.
                      </DialogDescription>
                    </DialogHeader>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        createUser.mutate(newUserData);
                      }}
                      className="space-y-4"
                    >
                      <div className="space-y-2">
                        <Label htmlFor="newFullName">Full Name</Label>
                        <Input
                          id="newFullName"
                          value={newUserData.fullName}
                          onChange={(e) =>
                            setNewUserData((prev) => ({ ...prev, fullName: e.target.value }))
                          }
                          placeholder="John Doe"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newEmail">Email</Label>
                        <Input
                          id="newEmail"
                          type="email"
                          value={newUserData.email}
                          onChange={(e) =>
                            setNewUserData((prev) => ({ ...prev, email: e.target.value }))
                          }
                          placeholder="john@example.com"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newPassword">Password</Label>
                        <Input
                          id="newPassword"
                          type="password"
                          value={newUserData.password}
                          onChange={(e) =>
                            setNewUserData((prev) => ({ ...prev, password: e.target.value }))
                          }
                          placeholder="••••••••"
                          minLength={6}
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="newRole">Role</Label>
                        <Select
                          value={newUserData.role}
                          onValueChange={(value: 'admin' | 'sales') =>
                            setNewUserData((prev) => ({ ...prev, role: value }))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sales">Sales</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button type="submit" className="w-full" disabled={createUser.isPending}>
                        {createUser.isPending ? 'Creating...' : 'Create User'}
                      </Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <div className="md:hidden space-y-3">
                  {users.map((u) => (
                    <Card key={u.id} className="border">
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{u.full_name || 'No name'}</p>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                              <Mail className="w-3 h-3" />
                              {u.email}
                            </p>
                          </div>
                          <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                            {u.role || 'No role'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between">
                          {u.is_active ? (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              <UserCheck className="w-3 h-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-600 border-red-600">
                              <UserX className="w-3 h-3 mr-1" />
                              Inactive
                            </Badge>
                          )}
                          {u.role !== 'admin' && (
                            <Switch
                              checked={u.is_active}
                              onCheckedChange={(checked) =>
                                toggleUserStatus.mutate({ userId: u.id, isActive: checked })
                              }
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <Button size="sm" variant="outline" className="flex-1" onClick={() => handleEditUser(u)}>
                            <Pencil className="w-3 h-3 mr-2" />
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive border-destructive/30 hover:text-destructive"
                            onClick={() => setDeleteConfirm({ userId: u.id, email: u.email })}
                            disabled={u.id === user?.id}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Created {format(new Date(u.created_at), 'MMM d, yyyy')}
                        </p>
                      </CardContent>
                    </Card>
                  ))}
                  {users.length === 0 && (
                    <div className="text-center text-muted-foreground text-sm py-4">No users found</div>
                  )}
                </div>

                <div className="hidden md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Manage Role</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">
                          {u.full_name || 'No name'}
                        </TableCell>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>
                          <Badge variant={u.role === 'admin' ? 'default' : 'secondary'}>
                            {u.role || 'No role'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {u.is_active ? (
                            <Badge
                              variant="outline"
                              className="text-green-600 border-green-600"
                            >
                              <UserCheck className="w-3 h-3 mr-1" />
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-red-600 border-red-600">
                              <UserX className="w-3 h-3 mr-1" />
                              Inactive
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {u.id === user?.id ? (
                            <span className="text-sm text-muted-foreground">Current user</span>
                          ) : (
                            <Select
                              value={u.role || 'sales'}
                              onValueChange={(value: 'admin' | 'sales') =>
                                updateUser.mutate({
                                  id: u.id,
                                  fullName: u.full_name || '',
                                  role: value,
                                  isActive: u.is_active,
                                })
                              }
                            >
                              <SelectTrigger className="w-28">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sales">Sales</SelectItem>
                                <SelectItem value="admin">Admin</SelectItem>
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell>
                          {format(new Date(u.created_at), 'MMM d, yyyy')}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="outline" onClick={() => handleEditUser(u)}>
                              <Pencil className="w-3 h-3 mr-2" />
                              Edit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive border-destructive/30 hover:text-destructive"
                              onClick={() => setDeleteConfirm({ userId: u.id, email: u.email })}
                              disabled={u.id === user?.id}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {users.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No users found
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {activeSection === 'leads' && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <CardTitle>Lead Assignment</CardTitle>
                  <CardDescription>Assign leads to sales users and track ownership.</CardDescription>
                </div>
                <Dialog open={isImportDialogOpen} onOpenChange={setIsImportDialogOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline" className="w-full sm:w-auto">
                      <Upload className="w-4 h-4 mr-2" />
                      Import Leads
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>Import Leads</DialogTitle>
                      <DialogDescription>Upload an Excel or CSV file and import leads for assignment.</DialogDescription>
                    </DialogHeader>
                    <LeadImport />
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                <LeadAssignment />
              </CardContent>
            </Card>
          </div>
        )}

        {activeSection === 'reports' && (
            <Card>
              <CardHeader>
                <CardTitle>Sales Reports</CardTitle>
                <CardDescription>View performance metrics and analytics</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Lead Conversion Rate</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-4xl font-bold text-primary">
                        {reportStats?.totalLeads
                          ? Math.round((reportStats.convertedLeads / reportStats.totalLeads) * 100)
                          : 0}
                        %
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {reportStats?.convertedLeads || 0} of {reportStats?.totalLeads || 0} leads converted
                      </p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">Calls Per Lead</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-4xl font-bold text-primary">
                        {reportStats?.totalLeads
                          ? (reportStats.totalCalls / reportStats.totalLeads).toFixed(1)
                          : 0}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        Average calls made per lead
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border z-50 pb-[env(safe-area-inset-bottom)]">
        <div className="w-full max-w-md mx-auto grid grid-cols-3 h-16 px-2">
          <button
            onClick={() => setActiveSection('users')}
            className="relative flex flex-col items-center justify-center"
          >
            {activeSection === 'users' && <span className="absolute top-0 h-1 w-10 rounded-full bg-primary" />}
            <Users className={`w-5 h-5 ${activeSection === 'users' ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className={`text-[11px] mt-1 ${activeSection === 'users' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
              Users
            </span>
          </button>

          <button
            onClick={() => setActiveSection('leads')}
            className="relative flex flex-col items-center justify-center"
          >
            {activeSection === 'leads' && <span className="absolute top-0 h-1 w-10 rounded-full bg-primary" />}
            <UserPlus className={`w-5 h-5 ${activeSection === 'leads' ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className={`text-[11px] mt-1 ${activeSection === 'leads' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
              Leads
            </span>
          </button>

          <button
            onClick={() => setActiveSection('reports')}
            className="relative flex flex-col items-center justify-center"
          >
            {activeSection === 'reports' && <span className="absolute top-0 h-1 w-10 rounded-full bg-primary" />}
            <BarChart3 className={`w-5 h-5 ${activeSection === 'reports' ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className={`text-[11px] mt-1 ${activeSection === 'reports' ? 'text-primary font-medium' : 'text-muted-foreground'}`}>
              Reports
            </span>
          </button>
        </div>
      </nav>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user details and access settings.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateUser.mutate({
                id: editUserData.id,
                fullName: editUserData.fullName,
                role: editUserData.role,
                isActive: editUserData.isActive,
              });
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={editUserData.email} disabled />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editFullName">Full Name</Label>
              <Input
                id="editFullName"
                value={editUserData.fullName}
                onChange={(e) => setEditUserData((prev) => ({ ...prev, fullName: e.target.value }))}
                placeholder="Full name"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="editRole">Role</Label>
              <Select
                value={editUserData.role}
                onValueChange={(value: 'admin' | 'sales') => setEditUserData((prev) => ({ ...prev, role: value }))}
                disabled={editUserData.id === user?.id}
              >
                <SelectTrigger id="editRole">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Active User</p>
                <p className="text-xs text-muted-foreground">Inactive users cannot access the app.</p>
              </div>
              <Switch
                checked={editUserData.isActive}
                onCheckedChange={(checked) => setEditUserData((prev) => ({ ...prev, isActive: checked }))}
                disabled={editUserData.id === user?.id}
              />
            </div>
            <Button type="submit" className="w-full" disabled={updateUser.isPending}>
              {updateUser.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove User Access</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate {deleteConfirm?.email} and remove app access. The auth account will remain, but the user will not be able to enter the app until a role is assigned again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteConfirm && removeUserAccess.mutate({ userId: deleteConfirm.userId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Remove Access
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminDashboard;
