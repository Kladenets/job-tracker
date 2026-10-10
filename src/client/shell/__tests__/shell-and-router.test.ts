import assert from "node:assert/strict";
import { router } from "../../router";
import { useShellStore } from "../shell-store";
import { getGuestRedirect } from "../../route-access";
import { createOwnerRouteGuard } from "../../router";
import { getVisibleNavItems } from "../sidebar-rail";
import { resetSessionRoleForTests } from "../../session";

console.log("Running Shell & Router Architecture Unit Tests...");

// ====================================================================
// Test 1: TanStack Router Route Tree Verification
// ====================================================================
const routePaths = Object.keys(router.routesById);
console.log("  Registered routes in router:", routePaths);

assert.ok(routePaths.includes("__root__"), "Router must have __root__ root layout route");
assert.ok(routePaths.includes("/"), "Router must have '/' index route");
assert.ok(routePaths.includes("/inbox"), "Router must have '/inbox' route");
assert.ok(routePaths.includes("/applications"), "Router must have '/applications' route");
assert.ok(routePaths.includes("/dashboard"), "Router must have '/dashboard' route");
assert.ok(routePaths.includes("/setup"), "Router must have '/setup' route");
assert.ok(routePaths.includes("/jobs/$id"), "Router must have '/jobs/:id' detail route");

assert.strictEqual(getGuestRedirect("/dashboard", "guest"), "/inbox");
assert.strictEqual(getGuestRedirect("/setup", "guest"), "/inbox");
assert.strictEqual(getGuestRedirect("/applications", "guest"), null, "Guest applications route is a public showcase");
assert.strictEqual(getGuestRedirect("/jobs/00000000-0000-4000-8000-000000000001", "guest"), null);
assert.strictEqual(getGuestRedirect("/dashboard", "owner"), null);

const guestNavRoutes = getVisibleNavItems("guest").map((item) => item.to);
const ownerNavRoutes = getVisibleNavItems("owner").map((item) => item.to);
assert.deepStrictEqual(guestNavRoutes, ["/inbox", "/applications"]);
assert.deepStrictEqual(ownerNavRoutes, ["/inbox", "/applications", "/dashboard", "/setup"]);

console.log("  ✔ All required application routes correctly configured in TanStack Router");

// ====================================================================
// Test 2: Shell State & Ergonomics (Collapse & Role Scoping)
// ====================================================================
const shell = useShellStore.getState();

// Test initial default state
assert.strictEqual(shell.userRole, "guest", "Default user role must be guest until the server resolves the session");

// Test sidebar toggle
const initialCollapsed = shell.sidebarCollapsed;
shell.toggleSidebar();
assert.strictEqual(
  useShellStore.getState().sidebarCollapsed,
  !initialCollapsed,
  "toggleSidebar must flip collapsed state"
);

// Toggle back
shell.toggleSidebar();
assert.strictEqual(
  useShellStore.getState().sidebarCollapsed,
  initialCollapsed,
  "toggleSidebar must revert back to initial state"
);

// Test shortcut help modal toggle
assert.strictEqual(shell.shortcutHelpOpen, false, "Shortcut help modal should initially be closed");
shell.toggleShortcutHelp();
assert.strictEqual(
  useShellStore.getState().shortcutHelpOpen,
  true,
  "toggleShortcutHelp must toggle shortcut modal open"
);
shell.setShortcutHelpOpen(false);
assert.strictEqual(
  useShellStore.getState().shortcutHelpOpen,
  false,
  "setShortcutHelpOpen(false) must close modal"
);

// Test guest role mutation
shell.setUserRole("guest");
assert.strictEqual(
  useShellStore.getState().userRole,
  "guest",
  "setUserRole must update userRole to 'guest'"
);
shell.setUserRole("owner");
assert.strictEqual(
  useShellStore.getState().userRole,
  "owner",
  "setUserRole must restore userRole to 'owner'"
);

console.log("  ✔ Shell store correctly controls sidebar collapsing, shortcuts modal, and role scoping");
console.log("All Chunk 2 shell tests passed successfully!\n");

async function verifyOwnerRouteGuardsResolveRoleBeforeAccess() {
  const originalFetch = globalThis.fetch;
  const originalRole = useShellStore.getState().userRole;

  try {
    resetSessionRoleForTests();
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ role: "guest" }) }) as Response) as typeof fetch;

    let setupRedirect: unknown;
    try {
      await createOwnerRouteGuard("/setup")();
    } catch (error) {
      setupRedirect = error;
    }
    assert.ok(setupRedirect, "Guest direct navigation to Setup must redirect");
    assert.strictEqual((setupRedirect as { options?: { to?: string } }).options?.to, "/inbox");
    assert.strictEqual(useShellStore.getState().userRole, "guest");

    resetSessionRoleForTests();
    globalThis.fetch = (async () => { throw new Error("session unavailable"); }) as typeof fetch;
    let failedSessionRedirect: unknown;
    try {
      await createOwnerRouteGuard("/dashboard")();
    } catch (error) {
      failedSessionRedirect = error;
    }
    assert.strictEqual((failedSessionRedirect as { options?: { to?: string } }).options?.to, "/inbox");
    assert.strictEqual(useShellStore.getState().userRole, "guest", "Session failures must fail closed to guest role");

    resetSessionRoleForTests();
    globalThis.fetch = (async () => ({ ok: true, json: async () => ({ role: "owner" }) }) as Response) as typeof fetch;
    await createOwnerRouteGuard("/dashboard")();
    assert.strictEqual(useShellStore.getState().userRole, "owner");
  } finally {
    globalThis.fetch = originalFetch;
    resetSessionRoleForTests();
    useShellStore.getState().setUserRole(originalRole);
  }
}

verifyOwnerRouteGuardsResolveRoleBeforeAccess().catch((error: unknown) => {
  console.error("Role-aware route guard test failed:", error);
  process.exitCode = 1;
});
