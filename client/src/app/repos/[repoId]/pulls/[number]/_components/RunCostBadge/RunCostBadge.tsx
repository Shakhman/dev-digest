import React from "react";
import { formatCost, formatTokens } from "../RunTraceDrawer/helpers";

const muted: React.CSSProperties = { color: "var(--text-muted)" };

/**
 * compact — "$0.0013" (PR list column, timeline right column)
 * detailed — "$0.0013 · 9k→1.2k" (verdict plaque, trace stats)
 */
export function RunCostBadge({
  costUsd,
  tokensIn,
  tokensOut,
  variant = "compact",
}: {
  costUsd?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  variant?: "compact" | "detailed";
}) {
  const cost = formatCost(costUsd);
  if (variant === "compact") {
    return <span style={muted}>{cost}</span>;
  }
  const tokens =
    tokensIn != null && tokensOut != null
      ? ` · ${formatTokens(tokensIn, tokensOut)}`
      : "";
  return (
    <span style={muted}>
      {cost}
      {tokens}
    </span>
  );
}
