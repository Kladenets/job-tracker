import React, { useEffect } from "react";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { router } from "./router";
import { useThemeStore, applyThemeToDOM } from "./theme/theme-store";
import { useShellStore } from "./shell/shell-store";
import { useAIDockStore } from "./shell/ai-dock-store";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2, // 2 minutes
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  const { theme } = useThemeStore();
  const setUserRole = useShellStore((state) => state.setUserRole);

  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme]);

  useEffect(() => {
    let isActive = true;

    fetch("/api/session")
      .then((response) => {
        if (!response.ok) throw new Error("Could not resolve session role");
        return response.json();
      })
      .then((session: { role?: string }) => {
        if (!isActive) return;
        const role = session.role === "owner" ? "owner" : "guest";
        setUserRole(role);
        if (role === "guest") useAIDockStore.getState().resetGuestSession();
      })
      .catch(() => {
        if (!isActive) return;
        setUserRole("guest");
        useAIDockStore.getState().resetGuestSession();
      });

    return () => {
      isActive = false;
    };
  }, [setUserRole]);

  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
