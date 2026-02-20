
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { getAccounts } from "@/app/actions/accounts"
import { AccountList } from "@/components/accounts/account-list"

export default async function AccountsPage() {
    const { data: rawAccounts = [] } = await getAccounts()

    const accounts = rawAccounts?.map((a: any) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
    }))

    return (
        <>
            <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
                <SidebarTrigger className="-ml-2" />
                <Separator orientation="vertical" className="mr-2 h-4" />
                <Breadcrumb>
                    <BreadcrumbList>
                        <BreadcrumbItem>
                            <BreadcrumbPage>AWS Accounts</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </header>

            <AccountList initialAccounts={accounts || []} />
        </>
    )
}
