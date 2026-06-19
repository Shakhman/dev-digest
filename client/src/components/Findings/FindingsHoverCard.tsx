"use client";

import React from "react";
import { Icon, SeverityBadge, CategoryTag } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";

const spinnerStyle: React.CSSProperties = {
  display: "inline-block",
  width: 12,
  height: 12,
  border: "2px solid var(--border)",
  borderTopColor: "var(--accent)",
  borderRadius: "50%",
  animation: "ddspin 0.7s linear infinite",
  flexShrink: 0,
};

/**
 * Rich hover card listing findings with severity, title, category, file:line,
 * confidence %, and a 2-line rationale excerpt. Used by FindingsHover for both
 * the PR list tooltip and the agent-runs timeline tooltip.
 */
export function FindingsHoverCard({
  findings,
  header,
  isLoading,
}: {
  findings: FindingRecord[];
  /** Card header text (e.g. "6 findings" or "2 findings in this run"). */
  header?: string;
  /** Show a loading spinner in place of finding rows while fetching. */
  isLoading?: boolean;
}) {
  const total = findings.length;
  const title = header ?? `${total} finding${total === 1 ? "" : "s"}`;

  return (
    <div
      style={{
        background: "var(--bg-elevated)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        width: 360,
        maxHeight: 480,
        overflowY: "auto",
        boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 14px",
          borderBottom: "1px solid var(--border)",
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          color: "var(--text-secondary)",
        }}
      >
        <Icon.Info size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        {title}
      </div>

      {/* Finding rows */}
      {isLoading ? (
        <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={spinnerStyle} />
          Loading findings…
        </div>
      ) : findings.length === 0 ? (
        <div style={{ padding: "12px 14px", fontSize: 12, color: "var(--text-muted)" }}>
          No open findings.
        </div>
      ) : (
        findings.map((f, i) => (
          <div
            key={f.id}
            style={{
              padding: "10px 14px",
              borderBottom: i < findings.length - 1 ? "1px solid var(--border)" : "none",
            }}
          >
            {/* Row 1: severity chip + title + category tag */}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <SeverityBadge
                severity={f.severity as "CRITICAL" | "WARNING" | "SUGGESTION"}
                compact
              />
              <span
                style={{
                  flex: 1,
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {f.title}
              </span>
              <CategoryTag
                category={f.category as "bug" | "security" | "perf" | "style" | "test"}
              />
            </div>

            {/* Row 2: file:line  ·  confidence */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--accent-text)" }}>
                {f.file}:{f.start_line}
              </span>
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 3,
                  fontSize: 11,
                  color: "var(--text-muted)",
                  marginLeft: "auto",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 99,
                    /* green → yellow → red as confidence falls */
                    background: `hsl(${Math.round(f.confidence * 120)}, 60%, 50%)`,
                    display: "inline-block",
                  }}
                />
                {Math.round(f.confidence * 100)}% conf
              </span>
            </div>

            {/* Row 3: rationale (2-line clamp) */}
            <p
              style={
                {
                  margin: 0,
                  fontSize: 11.5,
                  color: "var(--text-secondary)",
                  lineHeight: 1.45,
                  overflow: "hidden",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                } as React.CSSProperties
              }
            >
              {f.rationale}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
