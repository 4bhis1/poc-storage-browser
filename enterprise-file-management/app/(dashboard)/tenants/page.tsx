
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { getTenants } from "@/app/actions/tenants"
import { TenantList } from "@/components/tenants/tenant-list"

export default async function TenantsPage() {
    const { data: rawTenants = [] } = await getTenants()

    const tenants = rawTenants?.map((t: any) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
    }))

    return (
        <>
            <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
                <SidebarTrigger className="-ml-2" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbPage>Tenants</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </header>

            <TenantList initialTenants={tenants || []} />
        </>
    )
}
