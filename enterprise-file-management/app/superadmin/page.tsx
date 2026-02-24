'use client';

import * as React from 'react';
import { GenericTable } from '@/components/ui/generic-table';
import { GenericModal } from '@/components/ui/generic-modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function SuperAdminPage() {
  const [tenants, setTenants] = React.useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [newTenantName, setNewTenantName] = React.useState('');
  const [adminEmail, setAdminEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);

  // Fetch tenants...
  React.useEffect(() => {
    fetch('/api/superadmin/tenants')
      .then(res => res.json())
      .then(data => setTenants(data))
      .catch(console.error);
  }, []);

  const handleCreateTenant = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/superadmin/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTenantName, adminEmail }),
      });
      if (res.ok) {
        setIsModalOpen(false);
        const nw = await res.json();
        setTenants([...tenants, nw.tenant]);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { header: 'ID', accessorKey: 'id' },
    { header: 'Tenant Name', accessorKey: 'name' },
    { header: 'Created', accessorKey: 'createdAt', cell: (row: any) => new Date(row.createdAt).toLocaleDateString() },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">All Tenants</h1>
        <GenericModal
          title="Create Tenant"
          description="Register a new logical tenant and invite its Tenant Admin."
          open={isModalOpen}
          onOpenChange={setIsModalOpen}
          trigger={<Button>Create Tenant</Button>}
          footer={
            <Button disabled={loading} onClick={handleCreateTenant}>
              {loading ? 'Submitting...' : 'Create & Invite'}
            </Button>
          }
        >
          <div className="space-y-4">
            <div>
              <label>Tenant Name</label>
              <Input 
                value={newTenantName}
                onChange={e => setNewTenantName(e.target.value)}
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label>Admin Email</label>
              <Input 
                value={adminEmail}
                onChange={e => setAdminEmail(e.target.value)}
                placeholder="admin@acme.com"
                type="email"
              />
            </div>
          </div>
        </GenericModal>
      </div>

      <GenericTable data={tenants} columns={columns} />
    </div>
  );
}
