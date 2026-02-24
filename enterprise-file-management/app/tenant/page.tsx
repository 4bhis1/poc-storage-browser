'use client';

// Re-use the same dashboard UI for the tenant portal.
// The layout (tenant/layout.tsx) provides the AppSidebar, so we just
// render the inner page content identical to (dashboard)/page.tsx.
export { default } from '@/app/(dashboard)/page';

