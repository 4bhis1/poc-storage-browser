"use client";

import {
  AudioWaveform,
  Building,
  Bot,
  Check,
  ChevronDown,
  Cloud,
  CreditCard,
  Files,
  FolderOpen,
  HardDrive,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  Shield,
  User,
  Users,
  Share2,
  FileText
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useAuth } from "@/components/providers/AuthProvider";

const platformAdminNav = [
  { title: "Home", icon: LayoutDashboard, href: "/" },
  { title: "Tenants", icon: Building, href: "/tenants" },
  { title: "Manage Users", icon: Users, href: "/users" },
  { title: "Buckets", icon: HardDrive, href: "/buckets" },
];

const tenantNavGroups = [
  {
    title: "",
    items: [
      { title: "Home", icon: LayoutDashboard, href: "/" },
    ]
  },
  {
    title: "Storage",
    items: [
      { title: "Buckets", icon: HardDrive, href: "/buckets" },
      { title: "File Explorer", icon: FolderOpen, href: "/explorer" },
    ]
  },
  {
    title: "Collaboration",
    items: [
      { title: "Shares", icon: Share2, href: "/shares" },
      { title: "Users", icon: User, href: "/users" },
      { title: "Teams", icon: Users, href: "/teams" },
      { title: "Service Accounts", icon: Bot, href: "/bots" },
    ]
  },
  {
    title: "Administration",
    items: [
      { title: "Audit", icon: FileText, href: "/audit" },
      { title: "Settings", icon: Settings, href: "/settings" },
    ]
  }
];

interface SidebarUser {
  id: string;
  email: string;
  name: string;
  role: string;
  tenantId: string;
  tenantName?: string;
}

export function AppSidebar({ serverUser }: { serverUser?: SidebarUser }) {
  const pathname = usePathname();
  const { user: contextUser, logout, loading, tenants, activeTenantId, switchTenant } = useAuth();

  // Use server-provided user (available immediately on render) or fall back to client context
  const user = serverUser ?? contextUser;

  let navGroups = tenantNavGroups;
  if (user?.role === "PLATFORM_ADMIN") {
    navGroups = [
      { title: "Platform", items: platformAdminNav }
    ];
  } else if (user?.role !== "TENANT_ADMIN") {
    // Teammate: filter out Users and Teams from Collaboration
    navGroups = tenantNavGroups.map(group => {
      if (group.title === "Collaboration") {
        return {
          ...group,
          items: group.items.filter(
            (item) =>
              item.title !== "Users" &&
              item.title !== "Teams" &&
              item.title !== "Service Accounts",
          ),
        };
      }
      return group;
    });
  }

  // Show skeleton only when no server user was provided and client context is still loading
  if (!serverUser && (loading || !user)) {
    return (
      <Sidebar variant="inset">
        <SidebarHeader>
          <div className="h-10 w-full rounded-md bg-muted/40 animate-pulse" />
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <div className="space-y-2 px-2 mt-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-8 w-full rounded-md bg-muted/40 animate-pulse" />
                ))}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    );
  }

  // At this point user is guaranteed non-null (either from serverUser prop or contextUser)
  if (!user) return null;

  return (
    <Sidebar variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="w-full">
                  <div className="flex items-center justify-center rounded-md bg-primary text-primary-foreground h-8 w-8">
                    <Cloud className="h-4 w-4" />
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="font-semibold">CloudVault</span>
                    <span className="text-xs text-muted-foreground">
                      {user.tenantName || "Enterprise"}
                    </span>
                  </div>
                  <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width]"
                align="start"
              >
                <DropdownMenuLabel>Organizations</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {tenants && tenants.length > 0 ? (
                  tenants.map((t) => (
                    <DropdownMenuItem
                      key={t.tenantId}
                      onClick={() => switchTenant(t.tenantId)}
                      className="cursor-pointer"
                    >
                      <Cloud className="mr-2 h-4 w-4 shrink-0" />
                      <span className="flex-1">{t.tenantName}</span>
                      {t.tenantId === activeTenantId && (
                        <Check className="ml-2 h-3 w-3 text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem>
                    <Cloud className="mr-2 h-4 w-4" />
                    {user.tenantName || "Enterprise"}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {navGroups.map((group, idx) => (
          <SidebarGroup key={idx}>
            {group.title && (
              <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mt-4 first:mt-0">
                {group.title}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = item.href === "/" 
                      ? pathname === "/" 
                      : pathname.startsWith(item.href);
                      
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive}>
                        <Link href={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="w-full cursor-pointer">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {user.name?.substring(0, 2).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-0.5 leading-none">
                    <span className="text-sm font-medium">{user.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {user.role}
                    </span>
                  </div>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="start" side="top">
                <DropdownMenuLabel className="flex items-center gap-2">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">
                      {user.name?.substring(0, 2).toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="text-sm">{user.name}</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      {user.email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" />
                    Profile
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/settings" className="cursor-pointer">
                    <Shield className="mr-2 h-4 w-4" />
                    Security
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href="/explorer" className="cursor-pointer">
                    <Files className="mr-2 h-4 w-4" />
                    My Files
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <div className="flex items-center justify-between px-2 py-1.5">
                  <span className="text-sm">Theme</span>
                  <ThemeToggle />
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} className="font-red cursor-pointer">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      <SidebarRail />
    </Sidebar>
  );
}

