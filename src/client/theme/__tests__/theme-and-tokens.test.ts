import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { applyThemeToDOM } from "../theme-store";

console.log("Running Design System & Theme Store Unit Tests...");

// ====================================================================
// Test 1: Design Tokens & CSS Properties Contract
// ====================================================================
const globalsCssPath = path.join(process.cwd(), "src", "client", "styles", "globals.css");
assert.ok(fs.existsSync(globalsCssPath), "globals.css must exist");

const cssContent = fs.readFileSync(globalsCssPath, "utf-8");
const indexHtml = fs.readFileSync(path.join(process.cwd(), "index.html"), "utf-8");

assert.ok(indexHtml.includes('localStorage.getItem("job_tracker_theme")'));
assert.ok(indexHtml.includes('window.matchMedia("(prefers-color-scheme: dark)")'));
assert.ok(indexHtml.includes('document.documentElement.classList.add("dark")'));
assert.ok(indexHtml.includes('document.documentElement.style.colorScheme = useDark ? "dark" : "light"'));

const requiredTokens = [
  "--surface-base",
  "--surface-elevated",
  "--surface-sunken",
  "--text-primary",
  "--text-secondary",
  "--text-muted",
  "--border-subtle",
  "--border-focus",
  "--status-recommended-fg",
  "--status-recommended-bg",
  "--status-marginal-fg",
  "--status-marginal-bg",
  "--status-danger-fg",
  "--status-danger-bg",
  "--status-dismissed-fg",
  "--status-dismissed-bg",
  "--space-1",
  "--space-4",
  "--space-8",
  "--space-16",
];

for (const token of requiredTokens) {
  assert.ok(
    cssContent.includes(token),
    `globals.css must define design token: ${token}`
  );
}

// Verify both :root (light) and .dark blocks exist
assert.ok(cssContent.includes(":root"), "globals.css must contain :root token definitions");
assert.ok(cssContent.includes(".dark"), "globals.css must contain .dark mode token overrides");
assert.ok(
  cssContent.includes("prefers-reduced-motion"),
  "globals.css must contain prefers-reduced-motion accessibility guard"
);

console.log("  ✔ Design tokens, pre-paint theme bootstrap, and accessibility guards verified");

// ====================================================================
// Test 2: Theme DOM Application & Color Scheme Synchronization
// ====================================================================
// Mock DOM document and root element
class MockClassList {
  classes = new Set<string>();
  add(cls: string) {
    this.classes.add(cls);
  }
  remove(cls: string) {
    this.classes.delete(cls);
  }
  contains(cls: string) {
    return this.classes.has(cls);
  }
}

class MockElement {
  classList = new MockClassList();
  style = { colorScheme: "" };
}

(global as any).document = {
  documentElement: new MockElement(),
};

// Test Dark Theme Application
applyThemeToDOM("dark");
const docRoot = (global as any).document.documentElement;
assert.ok(
  docRoot.classList.contains("dark"),
  "Applying 'dark' theme must add .dark class to root element"
);
assert.strictEqual(
  docRoot.style.colorScheme,
  "dark",
  "Applying 'dark' theme must set root colorScheme to 'dark'"
);

// Test Light Theme Application
applyThemeToDOM("light");
assert.ok(
  !docRoot.classList.contains("dark"),
  "Applying 'light' theme must remove .dark class from root element"
);
assert.strictEqual(
  docRoot.style.colorScheme,
  "light",
  "Applying 'light' theme must set root colorScheme to 'light'"
);

console.log("  ✔ applyThemeToDOM correctly toggles .dark class and root colorScheme");
console.log("All Chunk 1 tests passed successfully!\n");
