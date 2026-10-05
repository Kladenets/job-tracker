import { create } from "zustand";

interface ShellUIState {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  shortcutHelpOpen: boolean;
  setShortcutHelpOpen: (open: boolean) => void;
  toggleShortcutHelp: () => void;
  userRole: "owner" | "guest";
  setUserRole: (role: "owner" | "guest") => void;
}

const SIDEBAR_STORAGE_KEY = "job_tracker_sidebar_collapsed";

function getInitialSidebarState(): boolean {
  if (typeof window === "undefined") return false;
  const saved = localStorage.getItem(SIDEBAR_STORAGE_KEY);
  if (saved !== null) {
    return saved === "true";
  }
  return false;
}

export const useShellStore = create<ShellUIState>((set, get) => ({
  sidebarCollapsed: getInitialSidebarState(),
  setSidebarCollapsed: (collapsed: boolean) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    }
    set({ sidebarCollapsed: collapsed });
  },
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    get().setSidebarCollapsed(next);
  },
  shortcutHelpOpen: false,
  setShortcutHelpOpen: (open: boolean) => set({ shortcutHelpOpen: open }),
  toggleShortcutHelp: () => set((s) => ({ shortcutHelpOpen: !s.shortcutHelpOpen })),
  userRole: "guest",
  setUserRole: (role: "owner" | "guest") => set({ userRole: role }),
}));
