import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  } satisfies CSSProperties,

  // Header stat row: "N symbols · N callers · N endpoints · N cron"
  stats: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 16,
    paddingBottom: 12,
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,

  stat: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  statNum: {
    fontWeight: 700,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  tree: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,

  // A changed-symbol node (collapsible).
  nodeHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    background: "none",
    border: "none",
    padding: "6px 4px",
    cursor: "pointer",
    textAlign: "left",
    color: "var(--text-primary)",
    borderRadius: 6,
  } satisfies CSSProperties,

  nodeName: {
    fontSize: 13.5,
    fontWeight: 600,
  } satisfies CSSProperties,

  nodeCount: {
    marginLeft: "auto",
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  nodeBody: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    padding: "2px 0 10px 24px",
  } satisfies CSSProperties,

  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  callerNoLink: {
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  badgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 2,
  } satisfies CSSProperties,

  degradedNote: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  loadingRow: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,

  // Segmented Tree | Graph toggle — sits in the stats row, pushed to the right.
  toggle: {
    display: "inline-flex",
    marginLeft: "auto",
    padding: 2,
    gap: 2,
    borderRadius: 7,
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,

  toggleBtn: {
    border: "none",
    background: "none",
    cursor: "pointer",
    padding: "2px 10px",
    borderRadius: 5,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-muted)",
    lineHeight: 1.5,
  } satisfies CSSProperties,

  toggleBtnActive: {
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    boxShadow: "0 1px 2px rgba(0,0,0,0.18)",
  } satisfies CSSProperties,
} as const;
