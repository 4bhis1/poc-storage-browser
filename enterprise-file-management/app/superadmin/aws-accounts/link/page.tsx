import { getTenants } from "@/app/actions/tenants"
import { LinkAwsAccountForm } from "@/components/aws-accounts/link-aws-account-form"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

export default async function LinkAwsAccountPage({ searchParams }: { searchParams: Promise<{ tenantId?: string }> }) {
    const { tenantId } = await searchParams
    const { data: rawTenants = [] } = await getTenants()
    
    const tenants = rawTenants?.map((t: any) => ({
        id: t.id,
        name: t.name,
    })) || []

    const backHref = tenantId ? `/superadmin/tenants/${tenantId}` : "/superadmin/tenants"

    return (
        <div className="flex-1 overflow-auto p-6 flex justify-center">
            <div className="w-full max-w-4xl">
                <div className="mb-6">
                    <Button variant="ghost" size="sm" className="mb-4 gap-1.5 -ml-2" asChild>
                        <Link href={backHref}>
                            <ArrowLeft className="h-4 w-4" />
                            Back
                        </Link>
                    </Button>
                    <h1 className="text-2xl font-bold tracking-tight">Link AWS Account</h1>
                    <p className="text-muted-foreground">
                        Follow the steps below to securely connect a customer's AWS account.
                    </p>
                </div>
                
                <LinkAwsAccountForm tenants={tenants} preselectedTenantId={tenantId} />
            </div>
        </div>
    )
}
