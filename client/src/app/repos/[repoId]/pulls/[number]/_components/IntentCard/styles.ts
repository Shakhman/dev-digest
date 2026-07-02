import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 18,
  } satisfies CSSProperties,

  cardHeader: {
    display: "flex",
    justifyContent: "flex-end",
    marginBottom: -6,
  } satisfies CSSProperties,

  section: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,

  intentText: {
    fontSize: 14,
    lineHeight: 1.6,
    color: "var(--text-primary)",
    margin: 0,
  } satisfies CSSProperties,

  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 5,
  } satisfies CSSProperties,

  inScopeItem: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,

  checkMark: {
    color: "var(--success, #22c55e)",
    fontWeight: 700,
    flexShrink: 0,
  } satisfies CSSProperties,

  outOfScopeItem: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-muted)",
    paddingLeft: 16,
  } satisfies CSSProperties,

  riskRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  } satisfies CSSProperties,

  riskList: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,

  riskRowWrap: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
  } satisfies CSSProperties,

  riskRowHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    background: "transparent",
    border: "none",
    width: "100%",
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,

  riskRowContent: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 2,
    minWidth: 0,
  } satisfies CSSProperties,

  riskRowTitle: {
    fontSize: 13.5,
    fontWeight: 600,
    color: "var(--text-primary)",
    lineHeight: 1.4,
  } satisfies CSSProperties,

  riskRowFileRefLink: {
    textDecoration: "none",
    minWidth: 0,
  } satisfies CSSProperties,

  riskRowFileRef: {
    fontSize: 11.5,
    fontFamily: "var(--font-mono, monospace)",
    color: "var(--accent)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  } satisfies CSSProperties,

  riskChevron: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,

  riskRowBody: {
    padding: "8px 12px 10px 38px",
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
} as const;
