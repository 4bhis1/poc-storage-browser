'use client';

import * as React from 'react';
import { GenericTable } from '@/components/ui/generic-table';
import { GenericModal } from '@/components/ui/generic-modal';
import { PermissionGrid } from '@/components/ui/permission-grid';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Action } from '@/lib/permissions';

const allPermissions: Action[] = ['CREATE_BUCKET', 'READ', 'UPLOAD', 'DOWNLOAD', 'SHARE', 'DELETE'];

export default function MembersPage() {
  const [members, setMembers] = React.useState<any[]>([]);
  const [isInviteModalOpen, setIsInviteModalOpen] = React.useState(false);
  const [email, setEmail] = React.useState('');
  const [selectedPermissions, setSelectedPermissions] = React.useState<Action[]>([]);
  
  // Fake fetch function
  React.useEffect(() => {
    // In reality, this calls GET /api/tenant/members
    setMembers([
      { id: '1', email: 'user@tenant.com', role: 'TEAMMATE', status: 'ACTIVE' },
    ]);
  }, []);

  const handleInvite = async () => {
    // In reality, this posts to /api/tenant/members
    console.log('Inviting User:', email, 'Permissions:', selectedPermissions);
    setMembers([...members, { id: Date.now().toString(), email, role: 'TEAMMATE', status: 'PENDING' }]);
    setIsInviteModalOpen(false);
  };

  const memberColumns = [
    { header: 'Email', accessorKey: 'email' },
    { header: 'Role', accessorKey: 'role' },
    { header: 'Status', accessorKey: 'status' }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Members & Permissions</h1>
        <GenericModal
          title="Invite Member"
          description="Send an email invitation and assign initial permissions."
          open={isInviteModalOpen}
          onOpenChange={setIsInviteModalOpen}
          trigger={<Button>Invite User</Button>}
          footer={<Button onClick={handleInvite}>Send Invite</Button>}
        >
          <div className="space-y-4">
            <div>
              <label>User Email</label>
              <Input 
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="teammate@acme.com"
                type="email"
              />
            </div>
            <div>
              <label className="mb-2 block font-medium">Assign Permissions</label>
              <PermissionGrid 
                permissions={allPermissions} 
                selectedPermissions={selectedPermissions}
                onChange={setSelectedPermissions}
              />
            </div>
          </div>
        </GenericModal>
      </div>

      <GenericTable data={members} columns={memberColumns} emptyMessage="No members found in this tenant." />
    </div>
  );
}
