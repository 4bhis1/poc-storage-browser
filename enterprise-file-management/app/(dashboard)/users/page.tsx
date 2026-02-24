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
import { UserList } from "@/components/users/user-list";

export default async function UsersPage() {
  const { data: rawUsers = [] } = await getUsers();
  const { data: rawTenants = [] } = await getTenants();

  const users = rawUsers?.map((u: any) => ({
    ...u,
    createdAt: u.createdAt.toISOString(),
    tenantName: u.tenant?.name || "None",
  }));

  const tenants =
    rawTenants?.map((t: any) => ({
      id: t.id,
      name: t.name,
    })) || [];

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
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

      <UserList initialUsers={users || []} tenants={tenants} />
    </>
  );
}
