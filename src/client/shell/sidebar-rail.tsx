import React, { useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Inbox,
  KanbanSquare,
  BarChart3,
  Sliders,
  PanelLeftClose,
  PanelLeft,
  Sparkles,
  HelpCircle,
} from "lucide-react";
import { useShellStore } from "./shell-store";
import { ThemeToggle } from "../theme/theme-toggle";

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  ownerOnly?: boolean;
  shortcut?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    to: "/inbox",
    label: "Recommendations",
    icon: Inbox,
    shortcut: "1",
  },
  {
    to: "/applications",
    label: "Applications",
    icon: KanbanSquare,
    ownerOnly: true,
    shortcut: "2",
  },
  {
    to: "/dashboard",
    label: "Metrics & Funnel",
    icon: BarChart3,
    ownerOnly: true,
    shortcut: "3",
  },
  {
    to: "/setup",
    label: "Setup & Rules",
    icon: Sliders,
    ownerOnly: true,
    shortcut: "4",
  },
];

export function SidebarRail() {
  const { sidebarCollapsed, toggleSidebar, toggleShortcutHelp, userRole } = useShellStore();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  // Global hotkey: '[' toggles sidebar collapse, '?' toggles shortcut guide
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        activeEl?.getAttribute("contenteditable") === "true";
      if (isInput) return;

      if (e.key === "[") {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key === "?") {
        e.preventDefault();
        toggleShortcutHelp();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar, toggleShortcutHelp]);

  const visibleNavItems = NAV_ITEMS.filter((item) => {
    if (userRole === "guest" && item.ownerOnly) return false;
    return true;
  });

  return (
    <aside
      aria-label="Primary Navigation"
      className={`hidden md:flex flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-elevated)] transition-[width] duration-300 ease-in-out select-none relative z-20 shrink-0 overflow-hidden ${
        sidebarCollapsed ? "w-14" : "w-56"
      }`}
    >
      {/* 
        App Header (h-13 matches top filter bar exactly):
        Contains the brand title, dev badge, and the toggle button in the exact same top slot.
      */}
      <div className="h-13 border-b border-[var(--border-subtle)] flex items-center shrink-0 w-56 px-2.5 relative">
        {/* Expanded Title & Dev Badge Container */}
        <div
          className={`flex items-center gap-2 min-w-0 flex-1 whitespace-nowrap transition-opacity duration-200 ${
            sidebarCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          <span className="text-xs font-bold tracking-tight text-[var(--text-primary)] shrink-0">
            Job Tracker
          </span>
          <span className="text-[10px] font-mono-tabular text-[var(--status-recommended-fg)] bg-[var(--status-recommended-bg)] px-1.5 py-0.5 rounded font-semibold inline-flex items-center shrink-0">
            DEV :3000
          </span>
        </div>

        {/* 
          Single Toggle Button:
          - When expanded: docked to the right of the title (right-2.5).
          - When collapsed: smoothly glides to the center of the 56px rail (left-[0.625rem] = 10px from edge, (56-36)/2 = 10px).
          - Transition is smooth across both position and icon swap!
        */}
        <button
          type="button"
          onClick={toggleSidebar}
          title={sidebarCollapsed ? "Expand sidebar ([)" : "Collapse sidebar ([)"}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={`absolute top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-9 w-9 rounded-md transition-all duration-300 ease-in-out cursor-pointer z-10 ${
            sidebarCollapsed
              ? "left-[0.625rem] hover:bg-[var(--surface-sunken)] text-[var(--border-focus)] hover:text-[var(--text-primary)]"
              : "right-2.5 hover:bg-[var(--surface-sunken)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          {sidebarCollapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-3 px-2 space-y-1 overflow-hidden">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPath === item.to || (item.to !== "/" && currentPath.startsWith(item.to));

          return (
            <Link
              key={item.to}
              to={item.to}
              title={sidebarCollapsed ? `${item.label} (${item.shortcut})` : undefined}
              className={`flex items-center h-9 rounded-md text-xs font-medium transition-[width,background-color,border-color] duration-300 ease-in-out group relative cursor-pointer overflow-hidden ${
                sidebarCollapsed ? "w-10" : "w-52"
              } ${
                isActive
                  ? "bg-[var(--surface-sunken)] text-[var(--text-primary)] font-semibold border border-[var(--border-subtle)] shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]/60 border border-transparent"
              }`}
            >
              {/* 
                Fixed 40px icon anchor: (w-10 = 40px).
                Matches the collapsed <a> width (w-10), perfectly centering the icon within the button 
                and within the 56px rail (40px button + 8px padding each side = 56px).
                The icon never moves during expand or collapse!
              */}
              <div className="w-10 h-9 flex items-center justify-center shrink-0">
                <Icon
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    isActive
                      ? "text-[var(--border-focus)]"
                      : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"
                  }`}
                />
              </div>

              {/* Text label & shortcut fade smoothly and cleanly without wrapping */}
              <div
                className={`flex items-center justify-between flex-1 min-w-0 pr-2.5 whitespace-nowrap transition-opacity duration-200 ${
                  sidebarCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
                }`}
              >
                <span className="truncate pr-1 text-xs">{item.label}</span>

                {item.shortcut && (
                  <kbd className="hidden lg:inline-block text-[10px] font-mono-tabular px-1 py-0.2 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--text-muted)] shrink-0">
                    {item.shortcut}
                  </kbd>
                )}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* Footer Controls */}
      <div className="border-t border-[var(--border-subtle)] p-2 space-y-2 overflow-hidden">
        {/* AI Tier Telemetry Badge (Informational status, strictly non-actionable) */}
        <div
          title="AI Engine: Free Tier (Zero-cost operational tier)"
          className={`h-9 flex items-center rounded-md bg-[var(--surface-sunken)]/70 border border-[var(--border-subtle)] overflow-hidden transition-[width] duration-300 ease-in-out cursor-default select-none ${
            sidebarCollapsed ? "w-10" : "w-52"
          }`}
        >
          <div className="w-10 h-9 flex items-center justify-center shrink-0 text-amber-500">
            <Sparkles className="h-4 w-4" />
          </div>
          <div
            className={`flex items-center justify-between flex-1 min-w-0 pr-2 whitespace-nowrap text-[11px] font-mono-tabular transition-opacity duration-200 ${
              sidebarCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
          >
            <span className="text-[var(--text-secondary)] truncate">AI Engine</span>
            <span className="text-[var(--status-recommended-fg)] font-semibold shrink-0">Free Tier</span>
          </div>
        </div>

        {/* Theme and Shortcut Guide Cluster */}
        <div
          className={`flex items-center h-9 transition-[width] duration-300 ease-in-out relative ${
            sidebarCollapsed ? "w-10" : "w-52"
          }`}
        >
          {/* Theme Toggle Button - matches the exact 40px icon anchor */}
          <div className="w-10 h-9 flex items-center justify-center shrink-0">
            <ThemeToggle />
          </div>

          <div
            className={`flex items-center justify-end flex-1 pr-1 whitespace-nowrap transition-opacity duration-200 ${
              sidebarCollapsed ? "opacity-0 pointer-events-none" : "opacity-100"
            }`}
          >
            <button
              type="button"
              onClick={toggleShortcutHelp}
              title="Keyboard Shortcuts (?)"
              aria-label="Keyboard Shortcuts"
              className="inline-flex items-center justify-center h-9 w-10 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
