"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/AuthProvider";

export function LogoutButton() {
  const { logout } = useAuth();

  return (
    <Button
      variant="ghost"
      className="w-full justify-start text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 text-red-600 hover:text-red-700 dark:text-red-500 dark:hover:text-red-400 mt-auto"
      onClick={logout}
    >
      <LogOut className="mr-2 h-4 w-4" />
      Sign out
    </Button>
  );
}
