'use client';

import * as React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { GenericTable } from '@/components/ui/generic-table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Shield, Users, Trash2 } from 'lucide-react';
import { GenericModal } from '@/components/ui/generic-modal';
import { Checkbox } from '@/components/ui/checkbox';

export default function TeamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const teamId = params.teamId as string;

  const [team, setTeam] = React.useState<any>(null);
  const [tenantUsers, setTenantUsers] = React.useState<any[]>([]);
  const [buckets, setBuckets] = React.useState<any[]>([]);
  
  // Members State
  const [selectedUserId, setSelectedUserId] = React.useState('');
  const [isAddMemberOpen, setIsAddMemberOpen] = React.useState(false);
  const [loadingMember, setLoadingMember] = React.useState(false);

  // Policies (Matrix) State
  // Format: { bucketId: { READ: true, WRITE: false, ... } }
  const [matrix, setMatrix] = React.useState<Record<string, Record<string, boolean>>>({});
  const [savingPolicies, setSavingPolicies] = React.useState(false);

  const ACTIONS = ['READ', 'WRITE', 'DELETE', 'SHARE'];

  React.useEffect(() => {
    // Fetch team details
    fetch(`/api/tenant/teams/${teamId}`)
      .then(res => {
         if(!res.ok) throw new Error('Failed to load team');
         return res.json();
      })
      .then(data => {
        setTeam(data);
        // Initialize matrix from existing policies
        const initMatrix: any = {};
        data.policies?.filter((p: any) => p.resourceType === 'Bucket').forEach((p: any) => {
           if(p.resourceId) {
             initMatrix[p.resourceId] = {};
             p.actions.forEach((act: string) => {
                 initMatrix[p.resourceId][act] = true;
             });
           }
        });
        setMatrix(initMatrix);
      })
      .catch(console.error);

    // Fetch tenant buckets for matrix rows
    fetch('/api/tenant/buckets')
      .then(res => res.json())
      .then(data => Array.isArray(data) ? setBuckets(data) : setBuckets([]))
      .catch(console.error);

    // Fetch tenant users for member dropdown
    fetch('/api/tenant/users')
      .then(res => res.json())
      .then(data => Array.isArray(data) ? setTenantUsers(data) : setTenantUsers([]))
      .catch(console.error);
  }, [teamId]);

  const handleAddMember = async () => {
    if (!selectedUserId) return;
    setLoadingMember(true);
    try {
      const res = await fetch(`/api/tenant/teams/${teamId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId }),
      });
      if (res.ok) {
        const newMember = await res.json();
        setTeam((prev: any) => ({
          ...prev,
          members: [newMember, ...prev.members]
        }));
        setIsAddMemberOpen(false);
        setSelectedUserId('');
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to add member');
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMember(false);
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if(!confirm('Are you sure you want to remove this user from the team?')) return;
    try {
      const res = await fetch(`/api/tenant/teams/${teamId}/members/${userId}`, { method: 'DELETE' });
      if (res.ok) {
        setTeam((prev: any) => ({
          ...prev,
          members: prev.members.filter((m: any) => m.userId !== userId)
        }));
      }
    } catch(e) { console.error(e); }
  };

  const handleSavePolicies = async () => {
     setSavingPolicies(true);
     try {
         // Convert matrix to API format: { bucketId: ['READ', 'WRITE'] }
         const payload: any = {};
         Object.keys(matrix).forEach(bucketId => {
             const activeActions = Object.keys(matrix[bucketId]).filter(action => matrix[bucketId][action]);
             if (activeActions.length > 0) {
                 payload[bucketId] = activeActions;
             }
         });

         const res = await fetch(`/api/tenant/teams/${teamId}/policies`, {
             method: 'PUT',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ policies: payload })
         });
         
         if(res.ok) {
             alert('Permissions saved successfully.');
         } else {
             const err = await res.json();
             alert(err.error || 'Failed to save permissions');
         }
     } catch (e) {
         console.error(e);
     } finally {
         setSavingPolicies(false);
     }
  };

  const handleCheckboxChange = (bucketId: string, action: string, checked: boolean) => {
      setMatrix(prev => ({
          ...prev,
          [bucketId]: {
              ...prev[bucketId],
              [action]: checked
          }
      }));
  };

  if (!team) return <div className="p-8 text-center text-muted-foreground">Loading team...</div>;

  const membersColumns = [
    { header: 'Email', accessorKey: 'user.email' },
    { header: 'Name', accessorKey: 'user.name', cell: (r: any) => r.user.name || '—' },
    { header: 'Role', accessorKey: 'user.role' },
    { header: 'Added On', accessorKey: 'createdAt', cell: (r: any) => new Date(r.createdAt).toLocaleDateString() },
    {
       id: 'actions',
       cell: (row: any) => (
           <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 block" onClick={() => handleRemoveMember(row.userId)}>
              <Trash2 className="h-4 w-4" />
           </Button>
       )
    }
  ];

  // Users not currently in team
  const availableUsers = tenantUsers.filter(tu => !team.members.find((m: any) => m.userId === tu.id));

  return (
    <div className="space-y-6 px-4 md:px-6 lg:px-8 py-6 max-w-7xl mx-auto">
      <div>
         <Button variant="link" className="px-0 text-muted-foreground mb-2" onClick={() => router.push('/teams')}>
           ← Back to Teams
         </Button>
         <h1 className="text-3xl font-bold tracking-tight">{team.name}</h1>
         <p className="text-muted-foreground mt-1">Manage team members and configure granular bucket access.</p>
      </div>

      <Tabs defaultValue="permissions" className="w-full mt-6">
        <TabsList className="mb-4">
          <TabsTrigger value="members" className="gap-2">
             <Users className="h-4 w-4" /> Members
          </TabsTrigger>
          <TabsTrigger value="permissions" className="gap-2">
             <Shield className="h-4 w-4" /> Permissions
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="space-y-4 bg-white dark:bg-slate-950 p-6 rounded-lg border shadow-sm">
           <div className="flex justify-between items-center mb-6">
               <h2 className="text-xl font-semibold">Team Members</h2>
               <GenericModal
                  title="Add Member to Team"
                  open={isAddMemberOpen}
                  onOpenChange={setIsAddMemberOpen}
                  trigger={<Button>Add Member</Button>}
                  footer={
                      <Button disabled={loadingMember || !selectedUserId} onClick={handleAddMember}>
                         {loadingMember ? 'Adding...' : 'Add User'}
                      </Button>
                  }
               >
                   <div className="space-y-4">
                       <label className="text-sm font-medium">Select Tenant User</label>
                       {availableUsers.length === 0 ? (
                           <p className="text-sm text-muted-foreground">All tenant users are already in this team.</p>
                       ) : (
                           <Select onValueChange={setSelectedUserId} value={selectedUserId}>
                              <SelectTrigger>
                                 <SelectValue placeholder="Select a user" />
                              </SelectTrigger>
                              <SelectContent>
                                  {availableUsers.map(u => (
                                      <SelectItem key={u.id} value={u.id}>{u.email} ({u.role})</SelectItem>
                                  ))}
                              </SelectContent>
                           </Select>
                       )}
                   </div>
               </GenericModal>
           </div>
           
           <GenericTable data={team.members} columns={membersColumns} emptyMessage="No members in this team yet." />
        </TabsContent>

        <TabsContent value="permissions" className="space-y-6 bg-slate-50 dark:bg-slate-900 border rounded-lg overflow-hidden">
           <div className="flex justify-between items-center bg-white dark:bg-slate-950 px-6 py-4 border-b">
               <div>
                  <h2 className="text-xl font-semibold">Bucket Access Matrix</h2>
                  <p className="text-sm text-muted-foreground mt-1">Select the actions this team is allowed to perform on each bucket.</p>
               </div>
               <Button onClick={handleSavePolicies} disabled={savingPolicies}>
                  {savingPolicies ? 'Saving...' : 'Save Changes'}
               </Button>
           </div>

           <div className="p-0 overflow-x-auto">
               <table className="w-full text-sm text-left">
                  <thead className="text-xs text-muted-foreground uppercase bg-slate-100 dark:bg-slate-800/50 border-b">
                      <tr>
                          <th className="px-6 py-4 font-semibold w-1/3">Buckets</th>
                          {ACTIONS.map(action => (
                              <th key={action} className="px-6 py-4 font-semibold text-center">{action}</th>
                          ))}
                      </tr>
                  </thead>
                  <tbody className="divide-y border-b bg-white dark:bg-slate-950">
                      {buckets.length === 0 && (
                          <tr><td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">No buckets available in this tenant.</td></tr>
                      )}
                      {buckets.map(bucket => (
                          <tr key={bucket.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                              <td className="px-6 py-4 font-medium flex flex-col gap-0.5">
                                 <span>{bucket.name}</span>
                                 <span className="text-xs text-muted-foreground font-normal tracking-tight">{bucket.region}</span>
                              </td>
                              {ACTIONS.map(action => (
                                  <td key={action} className="px-6 py-4 text-center">
                                      <div className="flex justify-center">
                                         <Checkbox 
                                            checked={matrix[bucket.id]?.[action] || false}
                                            onCheckedChange={(checked) => handleCheckboxChange(bucket.id, action, checked as boolean)}
                                            className="data-[state=checked]:bg-indigo-500 data-[state=checked]:border-indigo-500"
                                         />
                                      </div>
                                  </td>
                              ))}
                          </tr>
                      ))}
                  </tbody>
               </table>
           </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
