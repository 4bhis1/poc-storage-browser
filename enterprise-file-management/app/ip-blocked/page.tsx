import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function IpBlockedPage() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <div className="max-w-md text-center space-y-6 flex flex-col items-center">
        <div className="bg-red-100 dark:bg-red-900/30 p-4 rounded-full">
          <AlertTriangle className="h-12 w-12 text-red-600 dark:text-red-500" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-3xl font-extrabold tracking-tight">Access Denied</h1>
          <p className="text-muted-foreground text-sm sm:text-base px-2">
            Your current IP address is not whitelisted for access to this organization's resources. 
            If you believe this is an error, please contact your Tenant Administrator.
          </p>
        </div>

        <Link href="/login" passHref>
          <Button variant="outline" className="mt-8">
            Return to Login
          </Button>
        </Link>
      </div>
    </div>
  );
}
