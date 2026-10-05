import assert from "node:assert/strict";
import { router } from "../../router";
import { useShellStore } from "../shell-store";

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

console.log("  ✔ All 5 required application routes correctly configured in TanStack Router");

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
