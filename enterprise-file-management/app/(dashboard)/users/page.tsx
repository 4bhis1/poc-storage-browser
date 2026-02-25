export const dynamic = "force-dynamic";

import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb";
import { getUsers } from "@/app/actions/users";
import { getTenants } from "@/app/actions/tenants";
import { getTeams } from "@/app/actions/teams";
import { UserList } from "@/components/users/user-list";

export default async function UsersPage() {
  const { data: rawUsers = [] } = await getUsers();
  const { data: rawTenants = [] } = await getTenants();
  const { data: rawTeams = [] } = await getTeams();

  const users = rawUsers?.map((u: any) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    tenantName: u.tenant?.name || "None",
  })) || [];

  const tenants =
    rawTenants?.map((t: any) => ({
      id: t.id,
      name: t.name,
    })) || [];

  const teams = rawTeams || [];

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6 bg-background">
        <SidebarTrigger className="-ml-2" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Manage Users</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex-1 overflow-auto bg-muted/10 h-full">
        <UserList initialUsers={users} tenants={tenants} availableTeams={teams} />
      </div>
    </>
  );
}
