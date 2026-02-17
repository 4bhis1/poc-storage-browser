"use client"

import * as React from "react"
import { Copy, Eye, EyeOff } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from "sonner"
import { mockOrganization, mockUsers } from "@/lib/mock-data"
import { SearchCommandDialog } from "@/components/search-command"

export default function SettingsPage() {
  const [showApiKey, setShowApiKey] = React.useState(false)
  const apiKey = "cv_live_sk_a8x4k2mN7pQ3rT9wB5jH1cF6"

  return (
    <>
      <SearchCommandDialog />
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
        <SidebarTrigger className="-ml-2" />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbPage>Settings</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your profile, organization, and preferences.
            </p>
          </div>

          <Tabs defaultValue="profile" className="space-y-6">
            <TabsList>
              <TabsTrigger value="profile">Profile</TabsTrigger>
              <TabsTrigger value="organization">Organization</TabsTrigger>
              <TabsTrigger value="security">Security</TabsTrigger>
              <TabsTrigger value="preferences">Preferences</TabsTrigger>
            </TabsList>

            {/* Profile */}
            <TabsContent value="profile" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Profile Information</CardTitle>
                  <CardDescription>
                    Your personal details and account information.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16">
                      <AvatarFallback className="bg-primary/10 text-primary text-lg">
                        SC
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <Button variant="outline" size="sm">
                        Change Avatar
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">
                        JPG, PNG, or GIF. Max 2 MB.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="fullname">Full Name</Label>
                      <Input id="fullname" defaultValue="Sarah Chen" />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        defaultValue="sarah@acme.co"
                        type="email"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="role">Role</Label>
                      <Input id="role" defaultValue="Admin" disabled />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="department">Department</Label>
                      <Input id="department" defaultValue="Engineering" />
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => toast.success("Profile updated")}>
                      Save Changes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Organization */}
            <TabsContent value="organization" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Organization Details</CardTitle>
                  <CardDescription>
                    Information about your organization and tenant.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Organization Name</Label>
                      <Input defaultValue={mockOrganization.name} />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Tenant ID</Label>
                      <div className="flex gap-2">
                        <Input
                          defaultValue={mockOrganization.tenantId}
                          readOnly
                          className="font-mono text-sm"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => {
                            toast.success("Tenant ID copied")
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Region</Label>
                      <Input
                        defaultValue={mockOrganization.region}
                        readOnly
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Plan</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          defaultValue={mockOrganization.plan}
                          readOnly
                          className="capitalize"
                        />
                        <Badge>Enterprise</Badge>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Team Members</CardTitle>
                  <CardDescription>
                    {mockOrganization.memberCount} members in your organization.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {mockUsers.map((user) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between rounded-md border p-3"
                      >
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {user.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{user.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {user.email}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={
                            user.role === "admin" ? "default" : "secondary"
                          }
                          className="capitalize"
                        >
                          {user.role}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Security */}
            <TabsContent value="security" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Multi-Factor Authentication
                  </CardTitle>
                  <CardDescription>
                    Add an extra layer of security to your account.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Enable MFA</p>
                      <p className="text-xs text-muted-foreground">
                        Require a verification code when signing in.
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Session Management</CardTitle>
                  <CardDescription>
                    Control how long sessions remain active.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Session Timeout</Label>
                    <Select defaultValue="30">
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                        <SelectItem value="480">8 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">API Key</CardTitle>
                  <CardDescription>
                    Use this key to authenticate API requests.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        value={
                          showApiKey ? apiKey : "cv_live_sk_" + "*".repeat(20)
                        }
                        readOnly
                        className="font-mono text-sm pr-10"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setShowApiKey(!showApiKey)}
                      >
                        {showApiKey ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => toast.success("API key copied")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Keep this key secret. Never share it in public repositories
                    or client-side code.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Preferences */}
            <TabsContent value="preferences" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Appearance</CardTitle>
                  <CardDescription>
                    Customize how CloudVault looks on your device.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Theme</Label>
                    <Select defaultValue="dark">
                      <SelectTrigger className="w-[200px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Notifications</CardTitle>
                  <CardDescription>
                    Choose what you want to be notified about.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Upload Notifications</p>
                      <p className="text-xs text-muted-foreground">
                        Get notified when file uploads complete.
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Sharing Alerts</p>
                      <p className="text-xs text-muted-foreground">
                        Get notified when someone shares a file with you.
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Cost Alerts</p>
                      <p className="text-xs text-muted-foreground">
                        Receive alerts when costs exceed your threshold.
                      </p>
                    </div>
                    <Switch />
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <p className="text-sm font-medium">Security Alerts</p>
                      <p className="text-xs text-muted-foreground">
                        Get notified of suspicious activity.
                      </p>
                    </div>
                    <Switch defaultChecked />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Default Storage Class</CardTitle>
                  <CardDescription>
                    Set the default storage class for new uploads.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Select defaultValue="STANDARD">
                    <SelectTrigger className="w-[250px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="STANDARD">
                        Standard (Hot Storage)
                      </SelectItem>
                      <SelectItem value="STANDARD_IA">
                        Infrequent Access
                      </SelectItem>
                      <SelectItem value="GLACIER">Glacier (Cold)</SelectItem>
                      <SelectItem value="DEEP_ARCHIVE">
                        Deep Archive
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button onClick={() => toast.success("Preferences saved")}>
                  Save Preferences
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  )
}
