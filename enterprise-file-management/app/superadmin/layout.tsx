import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/session';
import Link from 'next/link';

export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) return redirect('/login');
  if (user?.role !== 'PLATFORM_ADMIN') return redirect('/login');

  return (
    <div className="flex h-screen w-full bg-slate-50 dark:bg-slate-900">
      <aside className="w-64 border-r bg-white dark:bg-slate-950 px-4 py-6">
        <h2 className="text-xl font-bold tracking-tight mb-6 text-slate-800 dark:text-slate-100">PLATFORM ADMIN</h2>
        <nav className="flex flex-col gap-2">
          <Link href="/superadmin" className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-sm font-medium">Dashboard</Link>
          <Link href="/superadmin/users" className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-sm font-medium">Manage Users</Link>
          <Link href="/superadmin/buckets" className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md text-sm font-medium">Buckets</Link>
        </nav>
      </aside>
      <main className="flex-1 overflow-auto p-8">
        {children}
      </main>
    </div>
  );
}
