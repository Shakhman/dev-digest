"use client";

import React from "react";
import { createPortal } from "react-dom";
import { FindingsIndicator, countBySeverity, type SeverityCounts } from "./FindingsIndicator";
import { FindingsHoverCard } from "./FindingsHoverCard";
import type { FindingRecord } from "@devdigest/shared";

/**
 * Wraps FindingsIndicator with a hover-triggered portal card (FindingsHoverCard).
 *
 * The card is portaled to document.body via fixed positioning to avoid clipping
 * by ancestor overflow:hidden containers (the PR list table card, accordion panels).
 *
 * Usage patterns:
 *   PR list row — pass `counts` (from PrMeta.findings_by_severity, always available)
 *                 and `findings` (lazy-fetched on hover from usePrReviews).
 *                 Also pass `isLoading` so the card shows a spinner while fetching.
 *   Timeline row — pass only `findings` (from the findingsByRunId map in FindingsTab);
 *                  counts are derived automatically.
 */
export function FindingsHover({
  counts,
  findings,
  isLoading,
  headerSuffix,
}: {
  /** Pre-computed severity counts for the indicator chips. Derived from findings when omitted. */
  counts?: SeverityCounts | null;
  /** Full FindingRecord list for the hover card. Card not shown when empty. */
  findings: FindingRecord[];
  /** True while the findings list is being fetched (shows spinner in card). */
  isLoading?: boolean;
  /** Optional suffix after the count in the card header (e.g. "in this run"). */
  headerSuffix?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ top: 0, left: 0 });
  const ref = React.useRef<HTMLDivElement>(null);
  const closeTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const derivedCounts = counts ?? (findings.length > 0 ? countBySeverity(findings) : null);
  const hasAnyCounts =
    derivedCounts != null &&
    derivedCounts.critical + derivedCounts.warning + derivedCounts.suggestion > 0;
  const total = findings.length;
  const header = headerSuffix
    ? `${total} finding${total === 1 ? "" : "s"} ${headerSuffix}`
    : `${total} finding${total === 1 ? "" : "s"}`;

  const handleEnter = () => {
    clearTimeout(closeTimer.current);
    // Open the card if we have findings to show OR we're still loading them
    // (counts tell us findings exist, but the detail fetch hasn't finished yet).
    if (findings.length === 0 && !isLoading) return;
    if (!hasAnyCounts && !isLoading) return;
    if (ref.current) {
      const r = ref.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(true);
  };

  const handleLeave = () => {
    // Short grace period so the mouse can travel from the trigger to the card.
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };

  return (
    <div
      ref={ref}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      style={{ display: "inline-flex", cursor: hasAnyCounts ? "pointer" : "default" }}
    >
      <FindingsIndicator counts={derivedCounts} />
      {open &&
        createPortal(
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
            onMouseEnter={() => clearTimeout(closeTimer.current)}
            onMouseLeave={handleLeave}
            // Prevent clicks inside the card from bubbling to the row's navigation handler.
            onClick={(e) => e.stopPropagation()}
          >
            <FindingsHoverCard findings={findings} header={header} isLoading={isLoading} />
          </div>,
          document.body,
        )}
    </div>
  );
}
