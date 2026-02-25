"use client";

import * as React from "react";
import { InviteUserModal } from "./invite-user-modal";
import { DataTable, ColumnDef } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { TeamMappingModal } from "./team-mapping-modal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Users, Shield, Trash2, Mail } from "lucide-react";
import { usePermission } from "@/lib/hooks/usePermission";

interface UserItem {
  id: string;
  name: string | null;
  email: string;
  role: string;
  tenantName: string;
  createdAt: string;
  teams?: any[];
}

interface TenantItem {
  id: string;
  name: string;
}

interface TeamItem {
  id: string;
  name: string;
}

interface UserListProps {
  initialUsers: UserItem[];
  tenants: TenantItem[];
  availableTeams: TeamItem[];
}

export function UserList({ initialUsers, tenants, availableTeams }: UserListProps) {
  const { can } = usePermission();
  const [users, setUsers] = React.useState<UserItem[]>(initialUsers);
  const [searchTerm, setSearchTerm] = React.useState("");
  
  // Team Mapping Modal State
  const [mappingUser, setMappingUser] = React.useState<UserItem | null>(null);
  const [isMappingOpen, setIsMappingOpen] = React.useState(false);

  React.useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  const filteredUsers = users.filter(
    (user) =>
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.tenantName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleMapTeams = (user: UserItem) => {
    setMappingUser(user);
    setIsMappingOpen(true);
  };

  const columns: ColumnDef<UserItem>[] = [
    {
      header: "User",
      accessorKey: "name",
      cell: (user) => (
        <div className="flex items-center gap-3 w-full min-w-0">
          <Avatar className="h-9 w-9 border">
            <AvatarFallback className="bg-primary/5 text-primary text-xs font-semibold">
              {user.name?.substring(0, 2).toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col truncate">
            <span className="font-semibold text-sm truncate">
              {user.name || "Unknown"}
            </span>
            <span className="text-xs text-muted-foreground truncate">
              {user.email}
            </span>
          </div>
        </div>
      ),
    },
    {
      header: "Role",
      accessorKey: "role",
      cell: (user) => (
        <Badge variant="outline" className="capitalize bg-background">
          {user.role.toLowerCase().replace("_", " ")}
        </Badge>
      ),
    },
    {
      header: "Tenant",
      accessorKey: "tenantName",
      cell: (user) => (
        <span className="text-sm font-medium">{user.tenantName}</span>
      ),
    },
    {
      header: "Teams part of",
      accessorKey: "teams",
      cell: (user) => {
        const teamNames = user.teams?.map((t: any) => t.team.name).filter(Boolean);
        if (!teamNames || teamNames.length === 0) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {teamNames.map((name: string, idx: number) => (
              <Badge key={idx} variant="secondary" className="font-normal text-[10px] px-1.5 py-0 h-5">
                {name}
              </Badge>
            ))}
          </div>
        );
      }
    },
    {
      header: "Joined",
      accessorKey: "createdAt",
      cell: (user) => (
        <span className="text-sm text-muted-foreground">
          {new Date(user.createdAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })}
        </span>
      ),
      className: "text-right hidden md:table-cell",
    },
    {
      header: "",
      accessorKey: "actions",
      className: "w-10",
      cell: (user) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 focus-visible:ring-0">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={() => handleMapTeams(user)}>
              <Users className="mr-2 h-4 w-4" />
              Map Teams
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <Shield className="mr-2 h-4 w-4" />
              Change Role
            </DropdownMenuItem>
            <DropdownMenuItem disabled>
              <Mail className="mr-2 h-4 w-4" />
              Resend Invite
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              disabled={!can('DELETE', { resourceType: 'user' })}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete User
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="p-6 h-full flex flex-col space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Users</h1>
          <p className="text-muted-foreground mt-1">
            All users who have access to the platform and their respective tenants.
          </p>
        </div>
        {can('CREATE', { resourceType: 'user' }) && (
          <InviteUserModal tenants={tenants} />
        )}
      </div>

      <div className="flex-1 bg-background rounded-lg border shadow-sm p-4">
        <DataTable
          data={filteredUsers}
          columns={columns}
          searchPlaceholder="Search users by name, email, or tenant..."
          onSearch={setSearchTerm}
          selectable={true}
          emptyMessage="No users found."
          onRowContextMenu={(e, user) => {
            e.preventDefault();
            handleMapTeams(user);
          }}
        />
      </div>

      <TeamMappingModal
        isOpen={isMappingOpen}
        onClose={() => setIsMappingOpen(false)}
        user={mappingUser}
        availableTeams={availableTeams}
        onSuccess={() => {
          // A real implementation would re-fetch, but since we are revalidating path in server action,
          // the page should reload the fresh data automatically from next/cache.
        }}
      />
    </div>
  );
}
