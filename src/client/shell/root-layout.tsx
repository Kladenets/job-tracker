import React from "react";
import { Outlet } from "@tanstack/react-router";
import { SidebarRail } from "./sidebar-rail";
import { MobileNavBar } from "./mobile-nav";
import { ShortcutHelpModal } from "./shortcut-modal";

export function RootLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--surface-base)] text-[var(--text-primary)]">
      {/* 1. Persistent Left Navigation Rail (Zero unmount on route change) */}
      <SidebarRail />

      {/* 2. Main Center Workspace - ONLY this Outlet swaps when navigating */}
      <main
        id="main-content"
        className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto pb-16 md:pb-0 relative z-10"
      >
        <Outlet />
      </main>

      {/* 3. Mobile Bottom Navigation (<768px viewports) */}
      <MobileNavBar />

      {/* 4. Global Modals (Shortcuts help, accessible from anywhere via '?') */}
      <ShortcutHelpModal />
    </div>
  );
}
