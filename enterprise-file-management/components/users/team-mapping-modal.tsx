"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { mapUserToTeams } from "@/app/actions/team-mapping";

interface Team {
  id: string;
  name: string;
}

interface TeamMappingModalProps {
  user: any | null;
  isOpen: boolean;
  onClose: () => void;
  availableTeams: Team[];
  onSuccess?: () => void;
}

export function TeamMappingModal({ user, isOpen, onClose, availableTeams, onSuccess }: TeamMappingModalProps) {
  const [selectedTeams, setSelectedTeams] = React.useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = React.useState(false);

  React.useEffect(() => {
    if (user && user.teams) {
      const initialTeams = new Set<string>(user.teams.map((t: any) => t.team.id));
      setSelectedTeams(initialTeams);
    } else {
      setSelectedTeams(new Set());
    }
  }, [user, isOpen]);

  const toggleTeam = (teamId: string) => {
    const next = new Set(selectedTeams);
    if (next.has(teamId)) {
      next.delete(teamId);
    } else {
      next.add(teamId);
    }
    setSelectedTeams(next);
  };

  const handleSave = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const result = await mapUserToTeams(user.id, Array.from(selectedTeams));
      if (result.success) {
        toast.success("Successfully updated team mappings");
        onSuccess?.();
        onClose();
      } else {
        toast.error(result.error || "Failed to update team mappings");
      }
    } catch (error) {
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Map Teams for {user.name || user.email}</DialogTitle>
          <DialogDescription>
            Select the teams this user should belong to.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4 max-h-[60vh] overflow-y-auto pr-2">
          {availableTeams.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No teams available in this tenant.
            </p>
          ) : (
            availableTeams.map((team) => (
              <div key={team.id} className="flex items-center space-x-3 border p-3 rounded-md hover:bg-muted/50 transition-colors">
                <Checkbox
                  id={`team-${team.id}`}
                  checked={selectedTeams.has(team.id)}
                  onCheckedChange={() => toggleTeam(team.id)}
                />
                <label
                  htmlFor={`team-${team.id}`}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                >
                  {team.name}
                </label>
              </div>
            ))
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? "Saving..." : "Save Mappings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
