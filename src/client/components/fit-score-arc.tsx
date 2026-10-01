import React from "react";

interface FitScoreArcProps {
  score: number; // 0 to 100
  size?: number; // diameter in px (default 36)
  strokeWidth?: number; // stroke thickness (default 3)
}

/**
 * Semantic Arc Percentage Ring for JEV qualification & fit scores
 * - 36px circular SVG arc ring displaying bold monospace fit percentage centered inside
 * - High Fit (>= 70%): --status-recommended-fg (accessible mint/emerald)
 * - Marginal Fit (40% - 69%): --status-marginal-fg (accessible warm amber)
 * - Low / Filtered (< 40%): --status-danger-fg / --status-dismissed-fg
 * - Accessible meter semantics (role="meter", aria-valuenow)
 */
export function FitScoreArc({ score, size = 36, strokeWidth = 3 }: FitScoreArcProps) {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));

  // SVG circle calculations
  const center = size / 2;
  const radius = center - strokeWidth;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (clampedScore / 100) * circumference;

  // Semantic color and badge tokens based on threshold
  let strokeColor = "var(--status-recommended-fg)";
  let bgColor = "var(--status-recommended-bg)";
  let textColor = "var(--status-recommended-fg)";

  if (clampedScore >= 70) {
    strokeColor = "var(--status-recommended-fg)";
    bgColor = "var(--status-recommended-bg)";
    textColor = "var(--status-recommended-fg)";
  } else if (clampedScore >= 40) {
    strokeColor = "var(--status-marginal-fg)";
    bgColor = "var(--status-marginal-bg)";
    textColor = "var(--status-marginal-fg)";
  } else {
    strokeColor = "var(--status-danger-fg)";
    bgColor = "var(--status-danger-bg)";
    textColor = "var(--status-danger-fg)";
  }

  return (
    <div
      role="meter"
      aria-label={`Job qualification fit score: ${clampedScore}%`}
      aria-valuenow={clampedScore}
      aria-valuemin={0}
      aria-valuemax={100}
      className="relative shrink-0 flex items-center justify-center rounded-full select-none"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        backgroundColor: bgColor,
      }}
      title={`Candidate Fit: ${clampedScore}%`}
    >
      <svg
        width={size}
        height={size}
        className="absolute inset-0 -rotate-90 transform"
        aria-hidden="true"
      >
        {/* Background track circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-black/10 dark:text-white/10"
        />
        {/* Animated value arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="transparent"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      {/* Centered monospace percentage label */}
      <span
        className="font-mono-tabular font-bold text-[11px] tracking-tight relative z-10"
        style={{ color: textColor }}
      >
        {clampedScore}
        <span className="text-[8px] font-normal">%</span>
      </span>
    </div>
  );
}
