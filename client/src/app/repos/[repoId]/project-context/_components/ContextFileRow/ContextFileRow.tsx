"use client";
import React from "react";
import { Badge } from "@devdigest/ui";
import type { SpecFile } from "@devdigest/shared";

interface ContextFileRowProps {
  file: SpecFile;
  active: boolean;
  onClick: () => void;
}

const SOURCE_COLORS: Record<string, string> = {
  specs: "var(--accent)",
  docs: "var(--warn)",
  insights: "var(--ok)",
};

export function ContextFileRow({ file, active, onClick }: ContextFileRowProps) {
  const baseName = file.path.split("/").pop() ?? file.path;
  const source = file.source ?? "specs";
  const badgeColor = SOURCE_COLORS[source] ?? "var(--text-muted)";
  const usedByAgents = file.used_by_agents ?? 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 12px",
        borderRadius: 6,
        marginBottom: 2,
        cursor: "pointer",
        background: active ? "var(--bg-hover)" : "transparent",
        border: active ? "1px solid var(--border)" : "1px solid transparent",
        transition: "background 0.1s",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: active ? 600 : 400,
            color: "var(--text-primary)",
            display: "block",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {baseName}
        </span>
        <span
          style={{ fontSize: 11, color: "var(--text-muted)", display: "block", marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
        >
          {file.path}
        </span>
      </div>
      <Badge color={badgeColor} mono>
        {source}
      </Badge>
      {file.tokens != null && (
        <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
          {file.tokens} tok
        </span>
      )}
      {usedByAgents > 0 && (
        <span
          data-testid="usage-badge"
          style={{
            fontSize: 11,
            color: "var(--accent)",
            flexShrink: 0,
            fontWeight: 600,
          }}
        >
          ×{usedByAgents}
        </span>
      )}
    </div>
  );
}
