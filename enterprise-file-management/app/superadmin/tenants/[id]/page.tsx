import { notFound, redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/session"
import { Role } from "@/lib/generated/prisma/client"
import prisma from "@/lib/prisma"
import { ArrowLeft, Building, Cloud, HardDrive, Users } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatBytes } from "@/lib/mock-data"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { AddUserDialog } from "@/components/tenants/add-user-dialog"
import { UserActionsMenu } from "@/components/tenants/user-actions-menu"
import { TenantAwsAccountTab } from "@/components/tenants/tenant-aws-account-tab"
import { DeleteTenantButton } from "@/components/tenants/delete-tenant-button"
import { EditTenantDialog } from "@/components/tenants/edit-tenant-dialog"

export default async function TenantDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()

  if (!user || user.role !== Role.PLATFORM_ADMIN) {
    redirect("/login")
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: {
      users: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          createdAt: true,
          hasLoggedIn: true,
        },
        orderBy: { createdAt: "desc" },
      },
      buckets: {
        select: {
          id: true,
          name: true,
          region: true,
          createdAt: true,
          quotaBytes: true,
          _count: {
            select: { objects: true }
          }
        },
        orderBy: { createdAt: "desc" },
      },
      awsAccounts: {
        select: {
          awsAccountId: true,
          region: true,
          friendlyName: true,
          status: true,
          createdAt: true,
          lastValidatedAt: true,
          id: true,
          roleArn: true,
        }
      },
      teams: {
        select: {
          id: true,
          name: true,
          _count: {
            select: { members: true }
          }
        }
      }
    }
  })

  if (!tenant) {
    notFound()
  }

  // Calculate actual storage used by summing the sizes of all files in this tenant
  const storageResult = await prisma.fileObject.aggregate({
    where: { tenantId: tenant.id },
    _sum: { size: true }
  })
  const totalStorageUsed = Number(storageResult._sum.size || 0)

  const activeAwsAccount = tenant.awsAccounts.find(a => 
    ["CONNECTED", "CREATING", "PENDING_VALIDATION", "FAILED", "DISCONNECTED"].includes(a.status)
  )

  return (
    <div className="flex-1 overflow-auto p-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/superadmin/tenants">
            <ArrowLeft className="h-4 w-4" />
            <span className="sr-only">Back to Tenants</span>
          </Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Building className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center">
                <h1 className="text-2xl font-bold tracking-tight">{tenant.name}</h1>
                <EditTenantDialog tenantId={tenant.id} currentName={tenant.name} />
              </div>
              <p className="text-xs text-muted-foreground font-mono">{tenant.id}</p>
            </div>
          </div>
        </div>
        <DeleteTenantButton tenantId={tenant.id} tenantName={tenant.name} />
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">
            Users <Badge variant="secondary" className="ml-2 bg-background/50">{tenant.users.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="buckets">
            Buckets <Badge variant="secondary" className="ml-2 bg-background/50">{tenant.buckets.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="teams">
            Teams <Badge variant="secondary" className="ml-2 bg-background/50">{tenant.teams.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="aws-account">
            AWS Account
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Storage Used</CardTitle>
                <HardDrive className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatBytes(totalStorageUsed)}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Active Users</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{tenant.users.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">S3 Buckets</CardTitle>
                <Cloud className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{tenant.buckets.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Teams</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{tenant.teams.length}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Tenant Identity</CardTitle>
                <CardDescription>Core details about this organization</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Created At</div>
                    <div>{new Date(tenant.createdAt).toLocaleDateString()}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Status</div>
                    <div><Badge variant="default">Active</Badge></div>
                  </div>
                  <div>
                    <div className="text-sm font-medium text-muted-foreground">Type</div>
                    <div>Standard Customer</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>AWS Infrastructure</CardTitle>
                <CardDescription>Cross-account architecture linkage</CardDescription>
              </CardHeader>
              <CardContent>
                {activeAwsAccount ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 bg-blue-100 text-blue-600 dark:bg-blue-900 rounded-md items-center justify-center">
                          <Cloud className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="font-medium">{activeAwsAccount.friendlyName}</p>
                          <p className="text-sm text-muted-foreground font-mono">{activeAwsAccount.awsAccountId}</p>
                        </div>
                      </div>
                      <Badge variant={
                        activeAwsAccount.status === "CONNECTED" ? "default" :
                        activeAwsAccount.status === "FAILED" || activeAwsAccount.status === "DISCONNECTED" ? "destructive" :
                        "secondary"
                      }>
                        {activeAwsAccount.status.replace("_", " ")}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm mt-4 p-4 bg-muted/50 rounded-lg">
                       <div>
                          <span className="text-muted-foreground block mb-1">Region</span>
                          <span className="font-medium">{activeAwsAccount.region}</span>
                       </div>
                       <div>
                          <span className="text-muted-foreground block mb-1">Linked On</span>
                          <span className="font-medium">{new Date(activeAwsAccount.createdAt).toLocaleDateString()}</span>
                       </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center border-2 border-dashed rounded-lg bg-muted/20">
                    <Cloud className="h-8 w-8 mb-2 text-muted-foreground/50" />
                    <h3 className="text-sm font-medium mb-1">No AWS Account Integrated</h3>
                    <p className="text-xs text-muted-foreground mb-4">Link an AWS account to enable Bring-Your-Own-Cloud storage.</p>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/superadmin/aws-accounts/link?tenantId=${tenant.id}`}>
                        Setup Bring-Your-Own-Cloud
                      </Link>
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
              <div className="space-y-1">
                <CardTitle>Users</CardTitle>
                <CardDescription>Identities that belong to this tenant.</CardDescription>
              </div>
              <AddUserDialog tenantId={tenant.id} />
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Joined</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenant.users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                        No users have been invited to this tenant yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    tenant.users.map(u => (
                      <TableRow key={u.id}>
                        <TableCell>
                          <div className="font-medium">{u.name || 'Unknown'}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </TableCell>
                        <TableCell><Badge variant="outline">{u.role.replace("_", " ")}</Badge></TableCell>
                        <TableCell>
                          {u.isActive ? (
                             u.hasLoggedIn ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline" className="opacity-50">Pending Invitation</Badge>
                          ) : (
                             <Badge variant="destructive">Inactive</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{new Date(u.createdAt).toLocaleDateString()}</TableCell>
                        <TableCell>
                          <UserActionsMenu 
                            userId={u.id} 
                            isActive={u.isActive} 
                            userName={u.name || u.email} 
                          />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="buckets">
          <Card>
            <CardHeader>
              <CardTitle>Storage Buckets</CardTitle>
              <CardDescription>S3 buckets assigned to and managed by this tenant.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Bucket Name</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Total Files</TableHead>
                    <TableHead className="text-right">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenant.buckets.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        This tenant does not have any allocated buckets.
                      </TableCell>
                    </TableRow>
                  ) : (
                    tenant.buckets.map(b => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium flex items-center gap-2">
                           <Cloud className="h-4 w-4 text-blue-500" />
                           {b.name}
                        </TableCell>
                        <TableCell>{b.region}</TableCell>
                        <TableCell>{b._count.objects} items</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{new Date(b.createdAt).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="aws-account">
          <TenantAwsAccountTab
            tenantId={tenant.id}
            tenantName={tenant.name}
            awsAccounts={tenant.awsAccounts.map(a => ({
              ...a,
              createdAt: a.createdAt.toISOString(),
              lastValidatedAt: a.lastValidatedAt?.toISOString() || null,
            }))}
          />
        </TabsContent>

        <TabsContent value="teams">
           <Card>
            <CardHeader>
              <CardTitle>Internal Teams</CardTitle>
              <CardDescription>Permission groups configured within this tenant.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team Name</TableHead>
                    <TableHead>Members</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenant.teams.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={2} className="text-center text-muted-foreground py-8">
                        No custom teams established.
                      </TableCell>
                    </TableRow>
                  ) : (
                    tenant.teams.map(t => (
                      <TableRow key={t.id}>
                        <TableCell className="font-medium">{t.name}</TableCell>
                        <TableCell>{t._count.members} users</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </div>
  )
}
