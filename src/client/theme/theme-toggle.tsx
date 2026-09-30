import React, { useEffect, useState } from "react";
import { useThemeStore } from "./theme-store";
import { Sun, Moon } from "lucide-react";

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps = {}) {
  const { theme, toggleTheme } = useThemeStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className={`h-9 w-10 rounded-md bg-[var(--surface-sunken)] border border-[var(--border-subtle)] animate-pulse ${className ?? ""}`} />
    );
  }

  const isDark = theme === "dark";
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center h-9 w-10 rounded-md border border-[var(--border-subtle)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--border-focus)] cursor-pointer ${className ?? ""}`}
    >
      {isDark ? (
        <Sun className="h-4 w-4 text-[var(--status-marginal-fg)]" aria-hidden="true" />
      ) : (
        <Moon className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden="true" />
      )}
    </button>
  );
}
