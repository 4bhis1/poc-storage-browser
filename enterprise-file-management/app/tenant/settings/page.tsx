'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function TenantSettingsPage() {
  const [tenantName, setTenantName] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  // In reality, fetch tenant from context or API
  React.useEffect(() => {
    setTenantName("Acme Corp");
  }, []);

  const handleSave = async () => {
    setSaving(true);
    // PUT /api/tenant/settings
    setTimeout(() => {
      setSaving(false);
      alert('Tenant updated successfully.');
    }, 1000);
  };

  return (
    <div className="space-y-6 max-w-lg">
      <h1 className="text-3xl font-bold">Tenant Settings</h1>
      
      <div className="space-y-4 border p-6 rounded-md bg-white shadow-sm dark:bg-slate-950">
        <div>
          <label className="block text-sm font-medium mb-1">Tenant Name</label>
          <Input 
            value={tenantName}
            onChange={e => setTenantName(e.target.value)}
          />
          <p className="text-sm text-slate-500 mt-2">
            This name will be visible to all members of your tenant.
          </p>
        </div>

        <Button disabled={saving} onClick={handleSave}>
          {saving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>

    </div>
  );
}
