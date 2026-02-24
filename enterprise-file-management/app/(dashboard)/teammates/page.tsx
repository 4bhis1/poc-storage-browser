export const dynamic = 'force-dynamic';

import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbList,
    BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { getTeammates } from "@/app/actions/teammates"
import { TeammateList } from "@/components/teammates/teammate-list"

export default async function TeammatesPage() {
    const { data: rawTeammates = [] } = await getTeammates()

    const teammates = rawTeammates?.map((t: any) => ({
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
                            <BreadcrumbPage>Teammates</BreadcrumbPage>
                        </BreadcrumbItem>
                    </BreadcrumbList>
                </Breadcrumb>
            </header>

            <TeammateList initialTeammates={teammates || []} />
        </>
    )
}
