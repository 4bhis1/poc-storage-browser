'use client';

import * as React from 'react';
import { GenericTable } from '@/components/ui/generic-table';
import { GenericModal } from '@/components/ui/generic-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function UsersPage() {
  const [users, setUsers] = React.useState<any[]>([]);
  const [tenants, setTenants] = React.useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState('TEAMMATE');
  const [tenantId, setTenantId] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    fetch('/api/superadmin/users')
      .then(res => res.json())
      .then(data => Array.isArray(data) ? setUsers(data) : setUsers([]))
      .catch(console.error);

    fetch('/api/superadmin/tenants')
      .then(res => res.json())
      .then(data => Array.isArray(data) ? setTenants(data) : setTenants([]))
      .catch(console.error);
  }, []);

  const handleInvite = async () => {
    if (!email || !tenantId) {
      setError('Email and Tenant are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/superadmin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role, tenantId }),
      });
      if (res.ok) {
        setIsModalOpen(false);
        const nwUser = await res.json();
        setUsers([nwUser, ...users]);
        setEmail('');
        setTenantId('');
      } else {
        const err = await res.json();
        setError(err.error || 'Failed to invite user');
      }
    } catch (e) {
      console.error(e);
      setError('Unexpected error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { header: 'Email', accessorKey: 'email' },
    { header: 'Role', accessorKey: 'role' },
    { 
      header: 'Tenant', 
      accessorKey: 'tenant',
      cell: (row: any) => row.tenant?.name || <span className="text-muted-foreground text-xs">Unassigned</span>
    },
    { header: 'Invited On', accessorKey: 'createdAt', cell: (row: any) => new Date(row.createdAt).toLocaleDateString() },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Manage Users</h1>
        <GenericModal
          title="Invite User"
          description="AWS Cognito will dispatch an email with a temporary password. The user will set their permanent password on first login."
          open={isModalOpen}
          onOpenChange={(open) => { setIsModalOpen(open); setError(''); }}
          trigger={<Button>Invite User</Button>}
          footer={
            <Button disabled={loading} onClick={handleInvite}>
              {loading ? 'Sending...' : 'Send Invite'}
            </Button>
          }
        >
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">User Email</label>
              <Input 
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="developer@company.com"
                type="email"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Assign to Tenant</label>
              <Select onValueChange={setTenantId} value={tenantId}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a tenant" />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t: any) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Role</label>
              <Select onValueChange={setRole} defaultValue={role}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TEAMMATE">TEAMMATE</SelectItem>
                  <SelectItem value="TEAM_ADMIN">TEAM_ADMIN</SelectItem>
                  <SelectItem value="TENANT_ADMIN">TENANT_ADMIN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {error && <p className="text-sm text-red-500">{error}</p>}
          </div>
        </GenericModal>
      </div>

      <GenericTable data={users} columns={columns} emptyMessage="No users found." />
    </div>
  );
}


