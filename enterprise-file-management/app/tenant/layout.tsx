import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/app-sidebar';

export default async function TenantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // Unauthenticated → login. Super Admin shouldn't land here.
  if (!user) return redirect('/login');
  if (user.role === 'PLATFORM_ADMIN') return redirect('/superadmin');
  if (!user.tenantId) return redirect('/login');

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>{children}</SidebarInset>
    </SidebarProvider>
  );
}
