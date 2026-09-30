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
  Briefcase,
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
      const isInput = activeEl?.tagName === "INPUT" || activeEl?.tagName === "TEXTAREA" || activeEl?.getAttribute("contenteditable") === "true";
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
      className={`hidden md:flex flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-elevated)] transition-[width] duration-200 select-none relative z-20 shrink-0 ${
        sidebarCollapsed ? "w-[3.75rem]" : "w-[14rem]"
      }`}
    >
      {/* App Header & Env Badge */}
      <div className="h-14 border-b border-[var(--border-subtle)] px-3 flex items-center justify-between">
        {!sidebarCollapsed ? (
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="h-8 w-8 rounded-md bg-[var(--surface-sunken)] border border-[var(--border-subtle)] flex items-center justify-center font-bold text-[var(--border-focus)] shrink-0">
              <Briefcase className="h-4 w-4" />
            </div>
            <div className="truncate">
              <span className="text-xs font-bold tracking-tight block truncate">Job Tracker</span>
              <span className="text-[10px] font-mono-tabular text-[var(--status-recommended-fg)] bg-[var(--status-recommended-bg)] px-1.5 py-0.2 rounded font-semibold">
                DEV :3000
              </span>
            </div>
          </div>
        ) : (
          <div className="mx-auto h-8 w-8 rounded-md bg-[var(--surface-sunken)] border border-[var(--border-subtle)] flex items-center justify-center font-bold text-[var(--border-focus)]">
            <Briefcase className="h-4 w-4" />
          </div>
        )}

        {!sidebarCollapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            title="Collapse sidebar ([)"
            aria-label="Collapse sidebar"
            className="p-1.5 rounded-md hover:bg-[var(--surface-sunken)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 py-3 px-2 space-y-1">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPath === item.to || (item.to !== "/" && currentPath.startsWith(item.to));

          return (
            <Link
              key={item.to}
              to={item.to}
              title={sidebarCollapsed ? `${item.label} (${item.shortcut})` : undefined}
              className={`flex items-center gap-3 px-2.5 py-2 rounded-md text-xs font-medium transition-colors group relative cursor-pointer ${
                isActive
                  ? "bg-[var(--surface-sunken)] text-[var(--text-primary)] font-semibold border border-[var(--border-subtle)] shadow-xs"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]/60"
              }`}
            >
              <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-[var(--border-focus)]" : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"}`} />
              
              {!sidebarCollapsed && (
                <span className="truncate flex-1">{item.label}</span>
              )}

              {!sidebarCollapsed && item.shortcut && (
                <kbd className="hidden lg:inline-block text-[10px] font-mono-tabular px-1 py-0.2 rounded bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                  {item.shortcut}
                </kbd>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer Controls */}
      <div className="border-t border-[var(--border-subtle)] p-2 space-y-2">
        {/* Collapsed expand trigger button */}
        {sidebarCollapsed && (
          <button
            type="button"
            onClick={toggleSidebar}
            title="Expand sidebar ([)"
            aria-label="Expand sidebar"
            className="w-full flex items-center justify-center p-2 rounded-md hover:bg-[var(--surface-sunken)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
        )}

        {/* AI Tier Badge */}
        {!sidebarCollapsed ? (
          <div className="flex items-center justify-between px-2 py-1.5 rounded-md bg-[var(--surface-sunken)] border border-[var(--border-subtle)] text-[11px] font-mono-tabular">
            <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
              <Sparkles className="h-3 w-3 text-amber-500" />
              AI Engine
            </span>
            <span className="text-[var(--status-recommended-fg)] font-semibold">Free Tier</span>
          </div>
        ) : (
          <div
            title="AI Engine: Free Tier"
            className="flex items-center justify-center p-2 rounded-md text-amber-500 hover:bg-[var(--surface-sunken)]"
          >
            <Sparkles className="h-4 w-4" />
          </div>
        )}

        {/* Theme and Shortcut Guide Cluster */}
        <div className={`flex items-center ${sidebarCollapsed ? "flex-col gap-1.5" : "justify-between px-1"}`}>
          <ThemeToggle />
          
          <button
            type="button"
            onClick={toggleShortcutHelp}
            title="Keyboard Shortcuts (?)"
            aria-label="Keyboard Shortcuts"
            className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
