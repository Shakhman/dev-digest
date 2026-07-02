import type { CSSProperties } from "react";

export const s = {
  card: {
    borderRadius: 10,
    background: "transparent",
    padding: "18px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,

  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: -6,
  } satisfies CSSProperties,

  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  } satisfies CSSProperties,

  badgeRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  } satisfies CSSProperties,

  note: {
    fontSize: 12.5,
    color: "var(--text-secondary)",
    lineHeight: 1.5,
    margin: 0,
  } satisfies CSSProperties,

  text: {
    fontSize: 14,
    lineHeight: 1.6,
    color: "var(--text-primary)",
    margin: 0,
    whiteSpace: "pre-wrap",
  } satisfies CSSProperties,

  loadingRow: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;
