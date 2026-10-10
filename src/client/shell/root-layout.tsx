import React from "react";
import { Outlet } from "@tanstack/react-router";
import { SidebarRail } from "./sidebar-rail";
import { MobileNavBar } from "./mobile-nav";
import { MobileTopHeader } from "./mobile-top-header";
import { ShortcutHelpModal } from "./shortcut-modal";
import { AIDock } from "./ai-dock";

export function RootLayout() {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--surface-base)] text-[var(--text-primary)]">
      <a
        href="#main-content"
        className="fixed left-2 top-2 z-[100] -translate-y-20 rounded bg-[var(--surface-base)] px-3 py-2 text-sm font-semibold text-[var(--text-primary)] shadow focus:translate-y-0 focus-visible:outline-2 focus-visible:outline-[var(--border-focus)]"
      >
        Skip to main content
      </a>

      {/* 1. Persistent Left Navigation Rail (Desktop only, zero unmount on route change) */}
      <SidebarRail />

      {/* 2. Main Center Workspace - ONLY this Outlet swaps when navigating */}
      <main
        id="main-content"
        className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto pb-20 md:pb-0 relative z-10"
      >
        {/* Mobile top header with logo & theme toggle */}
        <MobileTopHeader />
        <Outlet />
      </main>

      {/* 3. Persistent Right AI Assistant Dock (Zero unmount, streaming continuity across routes) */}
      <AIDock />

      {/* 4. Mobile Bottom Navigation (<768px viewports) */}
      <MobileNavBar />

      {/* 5. Global Modals (Shortcuts help, accessible from anywhere via '?') */}
      <ShortcutHelpModal />
    </div>
  );
}
