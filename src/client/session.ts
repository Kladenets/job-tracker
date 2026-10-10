import { useAIDockStore } from "./shell/ai-dock-store";
import { useShellStore } from "./shell/shell-store";
import { SessionRole } from "./route-access";

let sessionRolePromise: Promise<SessionRole> | null = null;

export function resolveSessionRole(): Promise<SessionRole> {
  if (!sessionRolePromise) {
    sessionRolePromise = fetch("/api/session")
      .then((response) => {
        if (!response.ok) throw new Error("Could not resolve session role");
        return response.json() as Promise<{ role?: string }>;
      })
      .then((session) => session.role === "owner" ? "owner" : "guest")
      .catch(() => "guest" as const)
      .then((role) => {
        useShellStore.getState().setUserRole(role);
        if (role === "guest") useAIDockStore.getState().resetGuestSession();
        return role;
      });
  }
  return sessionRolePromise;
}

export function resetSessionRoleForTests(): void {
  sessionRolePromise = null;
}