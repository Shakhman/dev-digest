"use client";

import React from "react";
import { SeverityBadge } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";

export type SeverityCounts = {
  critical: number;
  warning: number;
  suggestion: number;
};

const SEV_ORDER: { key: keyof SeverityCounts; sev: Severity }[] = [
  { key: "critical", sev: "CRITICAL" },
  { key: "warning", sev: "WARNING" },
  { key: "suggestion", sev: "SUGGESTION" },
];

/** Compute severity counts from a list of findings (any shape with a `severity` string). */
export function countBySeverity(findings: Array<{ severity: string }>): SeverityCounts {
  return {
    critical: findings.filter((f) => f.severity === "CRITICAL").length,
    warning: findings.filter((f) => f.severity === "WARNING").length,
    suggestion: findings.filter((f) => f.severity === "SUGGESTION").length,
  };
}

/**
 * Three compact severity chips — CRITICAL · WARNING · SUGGESTION — rendered
 * only for counts > 0. Shows "—" when all counts are zero or counts is null.
 */
export function FindingsIndicator({
  counts,
}: {
  counts: SeverityCounts | null | undefined;
}) {
  if (!counts) return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>;
  const total = counts.critical + counts.warning + counts.suggestion;
  if (total === 0) return <span style={{ color: "var(--text-muted)", fontSize: 12 }}>—</span>;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {SEV_ORDER.map(({ key, sev }) =>
        counts[key] > 0 ? (
          <SeverityBadge key={sev} severity={sev} count={counts[key]} compact plain />
        ) : null,
      )}
    </div>
  );
}
