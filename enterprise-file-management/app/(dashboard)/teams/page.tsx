"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { GenericTable } from "@/components/ui/generic-table";
import { GenericModal } from "@/components/ui/generic-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function TeamsPage() {
  const [teams, setTeams] = React.useState<any[]>([]);
  const [users, setUsers] = React.useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [isInviteOpen, setIsInviteOpen] = React.useState(false);
  const [teamName, setTeamName] = React.useState("");
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteName, setInviteName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const router = useRouter();

  React.useEffect(() => {
    fetch("/api/tenant/teams")
      .then((res) => res.json())
      .then((data) => (Array.isArray(data) ? setTeams(data) : setTeams([])))
      .catch(console.error);

    fetch("/api/users")
      .then((res) => res.json())
      .then((data) => (Array.isArray(data) ? setUsers(data) : setUsers([])))
      .catch(console.error);
  }, []);

  const handleCreateTeam = async () => {
    if (!teamName.trim()) {
      setError("Team name is required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/tenant/teams", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: teamName }),
      });
      if (res.ok) {
        const newTeam = await res.json();
        setTeams([newTeam, ...teams]);
        setIsModalOpen(false);
        setTeamName("");
        router.push(`/teams/${newTeam.id}`);
      } else {
        const err = await res.json();
        setError(err.error || "Failed to create team");
      }
    } catch (e) {
      setError("Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleInviteUser = async () => {
    if (!inviteEmail.trim()) {
      setError("Email is required.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: inviteEmail,
          name: inviteName,
          password: "TempPassword123!",
        }),
      });
      if (res.ok) {
        const newUser = await res.json();
        setUsers([newUser, ...users]);
        setIsInviteOpen(false);
        setInviteEmail("");
        setInviteName("");
      } else {
        const err = await res.json();
        setError(err.error || "Failed to invite user");
      }
    } catch (e) {
      setError("Unexpected error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const teamColumns = [
    { header: "Team Name", accessorKey: "name" },
    {
      header: "Members",
      accessorKey: "_count",
      cell: (row: any) => row._count?.members || 0,
    },
    {
      header: "Created On",
      accessorKey: "createdAt",
      cell: (row: any) => new Date(row.createdAt).toLocaleDateString(),
    },
    {
      header: "Actions",
      accessorKey: "actions",
      cell: (row: any) => (
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/teams/${row.id}`)}
        >
          View & Manage
        </Button>
      ),
    },
  ];

  const userColumns = [
    {
      header: "Name",
      accessorKey: "name",
      cell: (row: any) => row.name || "—",
    },
    { header: "Email", accessorKey: "email" },
    { header: "Role", accessorKey: "role" },
    {
      header: "Joined",
      accessorKey: "createdAt",
      cell: (row: any) => new Date(row.createdAt).toLocaleDateString(),
    },
  ];

  return (
    <div className="flex-1 overflow-auto space-y-6 px-4 md:px-6 lg:px-8 py-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Teams and Roles</h1>
        <p className="text-muted-foreground mt-1">
          Manage tenant users, teams, and their bucket permissions.
        </p>
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="teams">Teams & Roles</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-slate-950 px-6 py-4 border rounded-t-lg shadow-sm">
            <h2 className="text-xl font-semibold">Tenant Users</h2>
            <GenericModal
              title="Invite User"
              description="Invite a new user to join this tenant. They will receive a temporary password."
              open={isInviteOpen}
              onOpenChange={(open) => {
                setIsInviteOpen(open);
                setError("");
              }}
              trigger={<Button>Invite User</Button>}
              footer={
                <Button disabled={loading} onClick={handleInviteUser}>
                  {loading ? "Inviting..." : "Send Invite"}
                </Button>
              }
            >
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Name (Optional)</label>
                  <Input
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="John Doe"
                    className="mt-1"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Email Address</label>
                  <Input
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="user@example.com"
                    type="email"
                    className="mt-1"
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-500 font-medium">{error}</p>
                )}
              </div>
            </GenericModal>
          </div>
          <GenericTable
            data={users}
            columns={userColumns}
            emptyMessage="No users found in this tenant."
          />
        </TabsContent>

        <TabsContent value="teams" className="space-y-4">
          <div className="flex justify-between items-center bg-white dark:bg-slate-950 px-6 py-4 border rounded-t-lg shadow-sm">
            <h2 className="text-xl font-semibold">Teams</h2>
            <GenericModal
              title="Create New Team"
              description="Create a team to easily group users and assign bucket permissions."
              open={isModalOpen}
              onOpenChange={(open) => {
                setIsModalOpen(open);
                setError("");
              }}
              trigger={<Button>Create Team</Button>}
              footer={
                <Button disabled={loading} onClick={handleCreateTeam}>
                  {loading ? "Creating..." : "Create Team"}
                </Button>
              }
            >
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Team Name</label>
                  <Input
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    placeholder="e.g., Marketing, Engineering"
                    className="mt-1"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleCreateTeam();
                    }}
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-500 font-medium">{error}</p>
                )}
              </div>
            </GenericModal>
          </div>
          <GenericTable
            data={teams}
            columns={teamColumns}
            emptyMessage="No teams found. Create one to get started."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
