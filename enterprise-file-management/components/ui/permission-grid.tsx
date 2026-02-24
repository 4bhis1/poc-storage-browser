import * as React from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Action } from '@/lib/permissions';

export interface PermissionGridProps {
  permissions: Action[];
  selectedPermissions: Action[];
  onChange: (permissions: Action[]) => void;
  disabled?: boolean;
}

export function PermissionGrid({
  permissions,
  selectedPermissions,
  onChange,
  disabled
}: PermissionGridProps) {
  
  const handleToggle = (action: Action, isChecked: boolean) => {
    if (isChecked) {
      onChange([...selectedPermissions, action]);
    } else {
      onChange(selectedPermissions.filter(p => p !== action));
    }
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 border p-4 rounded-md">
      {permissions.map((action) => (
        <div key={action} className="flex flex-row items-center space-x-2">
          <Checkbox 
            id={`perm-${action}`} 
            checked={selectedPermissions.includes(action)}
            disabled={disabled}
            onCheckedChange={(checked) => handleToggle(action, checked === true)}
          />
          <Label 
            htmlFor={`perm-${action}`}
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            {action.replace('_', ' ')}
          </Label>
        </div>
      ))}
    </div>
  )
}
