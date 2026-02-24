'use client';

import * as React from 'react';
import { GenericTable } from '@/components/ui/generic-table';
import { Badge } from '@/components/ui/badge';

export default function SuperAdminBucketsPage() {
  const [buckets, setBuckets] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch('/api/superadmin/buckets')
      .then(res => res.json())
      .then(data => setBuckets(Array.isArray(data) ? data : []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const columns = [
    { header: 'Bucket Name', accessorKey: 'name' },
    { header: 'Region', accessorKey: 'region' },
    {
      header: 'Tenant',
      accessorKey: 'account',
      cell: (row: any) => row.account?.tenant?.name || <span className="text-muted-foreground text-xs">—</span>,
    },
    {
      header: 'Account',
      accessorKey: 'account',
      cell: (row: any) => row.account?.name || '—',
    },
    {
      header: 'Versioning',
      accessorKey: 'versioning',
      cell: (row: any) => (
        <Badge variant={row.versioning ? 'default' : 'secondary'}>
          {row.versioning ? 'Enabled' : 'Disabled'}
        </Badge>
      ),
    },
    {
      header: 'Created',
      accessorKey: 'createdAt',
      cell: (row: any) => new Date(row.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">All Buckets</h1>
        <span className="text-sm text-muted-foreground">Read-only global view across all tenants</span>
      </div>
      {loading ? (
        <p className="text-muted-foreground text-sm">Loading buckets...</p>
      ) : (
        <GenericTable data={buckets} columns={columns} emptyMessage="No buckets found." />
      )}
    </div>
  );
}
