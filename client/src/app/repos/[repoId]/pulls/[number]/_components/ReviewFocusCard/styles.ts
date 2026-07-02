import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,

  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,

  headerIcon: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  headerTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  list: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,

  item: {
    display: "flex",
    alignItems: "baseline",
    gap: 8,
    fontSize: 13.5,
    lineHeight: 1.55,
  } satisfies CSSProperties,

  bullet: {
    flexShrink: 0,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  itemContent: {
    minWidth: 0,
  } satisfies CSSProperties,

  link: {
    fontSize: 13,
    color: "var(--accent-text)",
    textDecoration: "none",
    wordBreak: "break-all",
  } satisfies CSSProperties,

  itemNoLink: {
    fontSize: 13,
    color: "var(--text-muted)",
    wordBreak: "break-all",
  } satisfies CSSProperties,

  desc: {
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
