'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Loader2, Plus, Trash2, UserCircle } from 'lucide-react';

type Role = 'PLATFORM_ADMIN' | 'TENANT_ADMIN' | 'TEAM_ADMIN' | 'TEAMMATE';

interface Assignment {
  userId: string;
  tenantId: string;
  tenantName: string | null;
  role: Role;
  email: string;
  name: string | null;
  isActive: boolean;
}

interface UserDetail {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isActive: boolean;
  createdAt: string;
  tenant?: { name: string } | null;
}

const ROLES: Role[] = ['TEAMMATE', 'TENANT_ADMIN'];

export default function UserDetailPage() {
  const { userId } = useParams<{ userId: string }>();
  const router = useRouter();

  const [user, setUser] = React.useState<UserDetail | null>(null);
  const [assignments, setAssignments] = React.useState<Assignment[]>([]);
  const [tenants, setTenants] = React.useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  // Assign form
  const [assignTenantId, setAssignTenantId] = React.useState('');
  const [assignRole, setAssignRole] = React.useState<Role>('TEAMMATE');
  const [assigning, setAssigning] = React.useState(false);

  // Confirm remove
  const [confirmRemove, setConfirmRemove] = React.useState<string | null>(null);

  React.useEffect(() => {
    Promise.all([
      fetch(`/api/superadmin/users/${userId}`).then(r => r.json()),
      fetch('/api/superadmin/tenants').then(r => r.json()),
    ]).then(([userData, tenantsData]) => {
      setUser(userData);
      setTenants(Array.isArray(tenantsData) ? tenantsData : []);
      // Load assignments by email once we have the user
      if (userData?.email) {
        return fetch(`/api/admin/users/assignments?email=${encodeURIComponent(userData.email)}`)
          .then(r => r.json())
          .then(setAssignments);
      }
    }).catch(console.error).finally(() => setLoading(false));
  }, [userId]);

  async function refreshAssignments() {
    if (!user?.email) return;
    const res = await fetch(`/api/admin/users/assignments?email=${encodeURIComponent(user.email)}`);
    if (res.ok) setAssignments(await res.json());
  }

  async function assignToTenant() {
    if (!assignTenantId || !user?.email) return;
    setAssigning(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/users/assign-tenant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, tenantId: assignTenantId, role: assignRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to assign tenant');
      setMessage('User assigned to tenant successfully.');
      setAssignTenantId('');
      setAssignRole('TEAMMATE');
      await refreshAssignments();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAssigning(false);
    }
  }

  async function removeAssignment(targetUserId: string) {
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${targetUserId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to remove assignment');
      setMessage('Tenant access removed.');
      setConfirmRemove(null);
      await refreshAssignments();
    } catch (e: any) {
      setError(e.message);
      setConfirmRemove(null);
    }
  }

  async function updateRole(targetUserId: string, role: Role) {
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`/api/admin/users/${targetUserId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to update role');
      setMessage('Role updated.');
      setAssignments(prev => prev.map(a => a.userId === targetUserId ? { ...a, role } : a));
    } catch (e: any) {
      setError(e.message);
    }
  }

  // Filter out tenants already assigned
  const assignedTenantIds = new Set(assignments.map(a => a.tenantId));
  const availableTenants = tenants.filter(t => !assignedTenantIds.has(t.id));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
        <p className="text-muted-foreground">User not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/superadmin/users')}>
          <ArrowLeft className="h-4 w-4 mr-2" /> User Management
        </Button>
      </div>

      {/* User profile card */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <UserCircle className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold">{user.name ?? '—'}</h1>
              <p className="text-sm text-muted-foreground">{user.email}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">{user.role.replace(/_/g, ' ')}</Badge>
                <span className={`text-xs font-medium ${user.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {user.isActive ? 'Active' : 'Inactive'}
                </span>
                <span className="text-xs text-muted-foreground">
                  Joined {new Date(user.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {message && (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {/* Tenant Access */}
      <Card>
        <CardHeader>
          <CardTitle>Tenant Access</CardTitle>
          <CardDescription>
            {assignments.length === 0
              ? 'This user has no tenant assignments.'
              : `This user has access to ${assignments.length} tenant${assignments.length > 1 ? 's' : ''}.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {assignments.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="w-[140px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map(a => (
                  <TableRow key={a.userId}>
                    <TableCell>
                      <p className="text-sm font-medium">{a.tenantName ?? '—'}</p>
                      <p className="text-xs text-muted-foreground font-mono">{a.tenantId}</p>
                    </TableCell>
                    <TableCell>
                      <Select value={a.role} onValueChange={val => updateRole(a.userId, val as Role)}>
                        <SelectTrigger className="w-[140px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map(r => (
                            <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {confirmRemove === a.userId ? (
                        <div className="flex gap-1">
                          <Button size="sm" variant="destructive" onClick={() => removeAssignment(a.userId)}>
                            Confirm
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setConfirmRemove(null)}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setConfirmRemove(a.userId)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Add tenant access */}
          {availableTenants.length > 0 && (
            <div className="border rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium flex items-center gap-2">
                Add Tenant Access
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                <div className="space-y-1">
                  <Label>Tenant</Label>
                  <Select value={assignTenantId} onValueChange={setAssignTenantId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTenants.map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Role</Label>
                  <Select value={assignRole} onValueChange={v => setAssignRole(v as Role)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map(r => (
                        <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={assignToTenant} disabled={assigning || !assignTenantId}>
                  {assigning && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Assign
                </Button>
              </div>
            </div>
          )}

          {availableTenants.length === 0 && assignments.length > 0 && (
            <p className="text-xs text-muted-foreground">User is already assigned to all available tenants.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
