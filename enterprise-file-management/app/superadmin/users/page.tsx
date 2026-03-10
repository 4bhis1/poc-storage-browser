'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Search, UserCircle } from 'lucide-react';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  roles: string[];
  tenantsCount: number;
  isActive: boolean;
  createdAt: string;
}

const ROLE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  PLATFORM_ADMIN: 'destructive',
  TENANT_ADMIN: 'default',
  TEAM_ADMIN: 'secondary',
  TEAMMATE: 'outline',
};

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = React.useState<UserRow[]>([]);
  const [search, setSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch('/api/superadmin/users')
      .then(res => res.json())
      .then(data => setUsers(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    (u.name ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
          <p className="text-sm text-muted-foreground">All platform users across tenants. Click a user to manage their tenant access.</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by email or name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Roles</TableHead>
              <TableHead>Tenant Access</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">Loading...</TableCell>
              </TableRow>
            )}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-10">No users found.</TableCell>
              </TableRow>
            )}
            {filtered.map(u => (
              <TableRow
                key={u.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => router.push(`/superadmin/users/${u.id}`)}
              >
                <TableCell>
                  <div className="flex items-center gap-2">
                    <UserCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{u.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1 max-w-[200px]">
                    {u.roles.map(r => (
                      <Badge key={r} variant={ROLE_VARIANT[r] ?? 'outline'} className="text-[10px] px-1.5 py-0 h-4 uppercase tracking-wider">
                        {r.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className="gap-1 font-medium">
                    {u.tenantsCount} {u.tenantsCount === 1 ? 'Tenant' : 'Tenants'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className={`text-xs font-medium ${u.isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                    {u.isActive ? 'Active' : 'Inactive'}
                  </span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {new Date(u.createdAt).toLocaleDateString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
