import type { CSSProperties } from "react";

/** Co-located styles for SmartDiffViewer. */
export const s = {
  // --- SmartDiffViewer root ---
  root: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,

  viewerHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 0 4px",
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  viewerHeaderStats: {
    marginLeft: "auto",
    fontWeight: 400,
    textTransform: "none",
    letterSpacing: 0,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  // --- SmartDiffGroupSection ---
  groupSection: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,

  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    cursor: "pointer",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,

  groupDot: (color: string): CSSProperties => ({
    width: 8,
    height: 8,
    borderRadius: 2,
    background: color,
    flexShrink: 0,
  }),

  groupLabel: {
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,

  groupSubtitle: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginLeft: 4,
  } satisfies CSSProperties,

  groupCount: {
    marginLeft: "auto",
    fontSize: 11,
    fontWeight: 600,
    color: "var(--text-muted)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "1px 7px",
  } satisfies CSSProperties,

  groupChevron: (expanded: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: expanded ? "rotate(90deg)" : "none",
    transition: "transform .12s",
    flexShrink: 0,
  }),

  groupBody: {
    borderTop: "1px solid var(--border)",
    display: "flex",
    flexDirection: "column",
  } satisfies CSSProperties,

  // --- SmartDiffFileRow ---
  fileRow: {
    borderTop: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,

  fileRowFirstInGroup: {
    borderTop: "none",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,

  fileHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    cursor: "pointer",
    minWidth: 0,
  } satisfies CSSProperties,

  fileChevron: (expanded: boolean): CSSProperties => ({
    color: "var(--text-muted)",
    transform: expanded ? "rotate(90deg)" : "none",
    transition: "transform .12s",
    flexShrink: 0,
  }),

  fileIcon: { color: "var(--text-muted)", flexShrink: 0 } satisfies CSSProperties,

  // Wrapper takes the remaining flex space; filename + dot sit inside it
  // so the dot appears flush against the end of the filename, not pushed right.
  fileNameWrap: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    flex: 1,
    minWidth: 0,
    overflow: "hidden",
  } satisfies CSSProperties,

  filePath: {
    fontSize: 12.5,
    fontWeight: 500,
    minWidth: 0,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontFamily: "var(--font-mono, monospace)",
  } satisfies CSSProperties,

  findingDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--crit)",
    flexShrink: 0,
    cursor: "pointer",
  } satisfies CSSProperties,

  findingCount: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--crit)",
    background: "var(--crit-bg, rgba(239,68,68,0.08))",
    borderRadius: 8,
    padding: "1px 6px",
    flexShrink: 0,
  } satisfies CSSProperties,

  summaryBadge: {
    fontSize: 11,
    color: "var(--text-muted)",
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    padding: "1px 6px",
    flexShrink: 0,
    maxWidth: 180,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,

  // Interactive per-file "generate summary" trigger (collapsed header row) —
  // a small pill button, NOT a passive badge like `summaryBadge` above.
  summaryButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    fontWeight: 600,
    color: "var(--accent)",
    background: "transparent",
    border: "1px solid var(--accent)",
    borderRadius: 10,
    padding: "1px 7px",
    flexShrink: 0,
    cursor: "pointer",
  } satisfies CSSProperties,

  summaryButtonDisabled: {
    opacity: 0.45,
    cursor: "not-allowed",
  } satisfies CSSProperties,

  fileStat: {
    fontSize: 11.5,
    fontFamily: "var(--font-mono, monospace)",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    gap: 4,
  } satisfies CSSProperties,

  addText: { color: "var(--code-add-text)" } satisfies CSSProperties,
  delText: { color: "var(--code-del-text)" } satisfies CSSProperties,

  // --- File expanded body ---
  fileBody: {
    borderTop: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,

  pseudoRow: {
    padding: "8px 14px",
    fontSize: 12.5,
    color: "var(--text-secondary)",
    borderBottom: "1px solid var(--border)",
    fontStyle: "italic",
    display: "flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,

  pseudoLabel: {
    fontWeight: 600,
    fontStyle: "normal",
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  // Wraps the sparkle icon + "What this does:" label so the icon centers
  // against the label's cap-height rather than the text baseline.
  pseudoLabelWrap: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  } satisfies CSSProperties,

  patchPre: {
    margin: 0,
    padding: "6px 0",
    fontSize: 12,
    lineHeight: "20px",
    overflowX: "auto",
    fontFamily: "var(--font-mono, monospace)",
  } satisfies CSSProperties,

  diffLine: (kind: "add" | "del" | "hunk" | "ctx", severity?: string | null): CSSProperties => ({
    display: "flex",
    alignItems: "stretch",
    background:
      kind === "add"
        ? "var(--code-add)"
        : kind === "del"
          ? "var(--code-del)"
          : kind === "hunk"
            ? "var(--accent-bg)"
            : "transparent",
    position: "relative",
    // Transparent fallback keeps all lines the same indent — no layout shift.
    borderLeft: severity === "CRITICAL"
      ? "3px solid var(--crit)"
      : severity === "WARNING"
        ? "3px solid var(--warn)"
        : severity != null
          ? "3px solid var(--sugg, var(--accent))"
          : "3px solid transparent",
  }),

  diffLineNo: {
    width: 44,
    textAlign: "right",
    padding: "0 10px 0 0",
    color: "var(--text-muted)",
    userSelect: "none",
    flexShrink: 0,
    fontSize: 12,
  } satisfies CSSProperties,

  diffLineSign: (kind: "add" | "del" | "hunk" | "ctx"): CSSProperties => ({
    width: 14,
    textAlign: "center",
    color:
      kind === "add"
        ? "var(--code-add-text)"
        : kind === "del"
          ? "var(--code-del-text)"
          : "var(--text-muted)",
    flexShrink: 0,
    fontSize: 12,
  }),

  diffLineText: {
    flex: 1,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: "var(--text-primary)",
    paddingRight: 12,
    fontSize: 12,
  } satisfies CSSProperties,

  findingBadge: (severity: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    marginLeft: 8,
    marginRight: 8,
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    flexShrink: 0,
    lineHeight: "16px",
    color:
      severity === "CRITICAL"
        ? "var(--crit)"
        : severity === "WARNING"
          ? "var(--warn)"
          : "var(--sugg, var(--accent))",
  }),
} as const;
