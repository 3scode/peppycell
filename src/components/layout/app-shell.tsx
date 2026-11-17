import type { SessionUser } from "@/types/domain";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { BottomNav } from "@/components/layout/bottom-nav";

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Lewati ke konten
      </a>
      <Sidebar user={user} />
      <div className="md:pl-20 xl:pl-[280px]">
        <Topbar user={user} />
        <main id="main-content" className="page-container pb-28 pt-4 md:pb-10 md:pt-6">
          {children}
        </main>
      </div>
      <BottomNav user={user} />
    </div>
  );
}
