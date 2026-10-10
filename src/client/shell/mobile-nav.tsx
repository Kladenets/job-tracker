import React from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Inbox, KanbanSquare, BarChart3, Sliders } from "lucide-react";
import { useShellStore } from "./shell-store";

export function MobileNavBar() {
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;
  const { userRole } = useShellStore();

  const items = [
    { to: "/inbox", label: userRole === "guest" ? "Explore Jobs" : "Inbox", icon: Inbox },
    ...(userRole === "owner"
      ? [
          { to: "/applications", label: "Applications", icon: KanbanSquare },
          { to: "/dashboard", label: "Metrics", icon: BarChart3 },
          { to: "/setup", label: "Setup", icon: Sliders },
        ]
      : [{ to: "/applications", label: "Showcase", icon: KanbanSquare }]),
  ];

  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-[var(--surface-elevated)] border-t border-[var(--border-subtle)] flex items-center justify-around z-30 px-2"
    >
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = currentPath === item.to || (item.to !== "/" && currentPath.startsWith(item.to));

        return (
          <Link
            key={item.to}
            to={item.to}
            className={`flex flex-col items-center justify-center min-w-[3rem] min-h-[2.75rem] py-1 px-2 rounded transition-colors text-[10px] font-medium ${
              isActive
                ? "text-[var(--border-focus)] font-semibold"
                : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate mt-0.5">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
