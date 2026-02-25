"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { DataTable, ColumnDef } from "@/components/ui/data-table";
import { GenericModal } from "@/components/ui/generic-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Settings, Plus } from "lucide-react";

export default function TeamsPage() {
  const [teams, setTeams] = React.useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [teamName, setTeamName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [searchTerm, setSearchTerm] = React.useState("");
  const router = useRouter();

  React.useEffect(() => {
    fetch("/api/tenant/teams")
      .then((res) => res.json())
      .then((data) => (Array.isArray(data) ? setTeams(data) : setTeams([])))
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

  const filteredTeams = teams.filter((t) => 
    t.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const teamColumns: ColumnDef<any>[] = [
    { 
      header: "Team Name", 
      accessorKey: "name",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <div className="bg-primary/10 p-2 rounded-md text-primary">
            <Users className="h-4 w-4" />
          </div>
          <span className="font-semibold">{row.name}</span>
        </div>
      )
    },
    {
      header: "Members",
      accessorKey: "_count",
      cell: (row) => (
        <span className="text-muted-foreground">{row._count?.members || 0} users</span>
      ),
    },
    {
      header: "Created On",
      accessorKey: "createdAt",
      cell: (row) => (
        <span className="text-muted-foreground">
          {new Date(row.createdAt).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          })}
        </span>
      ),
    },
    {
      header: "Actions",
      accessorKey: "actions",
      className: "text-right",
      cell: (row) => (
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={(e) => {
            e.stopPropagation();
            router.push(`/teams/${row.id}`);
          }}
        >
          <Settings className="h-4 w-4" />
          Manage Permissions
        </Button>
      ),
    },
  ];

  return (
    <div className="p-6 h-full flex flex-col space-y-6 ">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
          <p className="text-muted-foreground mt-1">
            Manage teams and map permissions for resources like buckets.
          </p>
        </div>
        <GenericModal
          title="Create New Team"
          description="Create a team to easily group users and assign permissions."
          open={isModalOpen}
          onOpenChange={(open) => {
            setIsModalOpen(open);
            setError("");
          }}
          trigger={
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Team
            </Button>
          }
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

      <div className="flex-1 bg-background rounded-lg border shadow-sm p-4">
        <DataTable
          data={filteredTeams}
          columns={teamColumns}
          searchPlaceholder="Search teams by name..."
          onSearch={setSearchTerm}
          emptyMessage="No teams found. Create one to get started."
          onRowClick={(row) => router.push(`/teams/${row.id}`)}
        />
      </div>
    </div>
  );
}
