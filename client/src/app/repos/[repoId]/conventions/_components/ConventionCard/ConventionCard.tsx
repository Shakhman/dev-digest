"use client";

import React from "react";
import { Button, ProgressBar, MonoLink, Textarea, Icon } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

/** Split an `evidence_path` of `path:line` into its file and line parts. */
function parseEvidencePath(p: string): { file: string; line?: number } {
  const m = p.match(/^(.*):(\d+)$/);
  if (m) return { file: m[1]!, line: Number(m[2]) };
  return { file: p };
}

function confidenceColor(c: number): string {
  if (c >= 0.85) return "var(--ok)";
  if (c >= 0.7) return "var(--warn)";
  return "var(--crit)";
}

export function ConventionCard({
  convention,
  repoFullName,
  defaultBranch,
  onAccept,
  onReject,
  onEdit,
  busy,
}: {
  convention: ConventionCandidate;
  repoFullName: string | null;
  defaultBranch: string | null;
  onAccept: (accepted: boolean) => void;
  onReject: () => void;
  onEdit: (patch: { rule: string; evidence_snippet: string }) => void;
  busy?: boolean;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(convention.rule);
  const [snippet, setSnippet] = React.useState(convention.evidence_snippet);

  const { file, line } = parseEvidencePath(convention.evidence_path);
  const href =
    repoFullName && defaultBranch ? githubBlobUrl(repoFullName, defaultBranch, file, line) : undefined;
  const pct = Math.round(convention.confidence * 100);
  const accepted = convention.accepted;

  const saveEdit = () => {
    onEdit({ rule: rule.trim(), evidence_snippet: snippet });
    setEditing(false);
  };
  const cancelEdit = () => {
    setRule(convention.rule);
    setSnippet(convention.evidence_snippet);
    setEditing(false);
  };

  return (
    <div
      style={{
        display: "flex",
        border: "1px solid var(--border)",
        borderLeft: `3px solid ${accepted ? "var(--ok)" : "var(--border-strong)"}`,
        borderRadius: 8,
        background: "var(--bg-elevated)",
        overflow: "hidden",
      }}
    >
      <div style={{ flex: 1, padding: 18, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
          {convention.category && (
            <span
              className="mono"
              style={{
                fontSize: 11,
                color: "var(--text-muted)",
                border: "1px solid var(--border)",
                borderRadius: 5,
                padding: "1px 6px",
                whiteSpace: "nowrap",
              }}
            >
              {convention.category}
            </span>
          )}
          {editing ? (
            <Textarea value={rule} onChange={setRule} rows={2} />
          ) : (
            <div style={{ fontStyle: "italic", fontWeight: 600, fontSize: 15, lineHeight: 1.4 }}>
              {convention.rule}
            </div>
          )}
        </div>

        <div
          style={{
            border: "1px solid var(--border)",
            borderRadius: 7,
            background: "var(--bg-surface)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <Icon.FileText size={12} style={{ color: "var(--text-muted)" }} />
            {href ? (
              <MonoLink href={href}>{convention.evidence_path}</MonoLink>
            ) : (
              <span className="mono" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                {convention.evidence_path}
              </span>
            )}
          </div>
          {editing ? (
            <div style={{ padding: 10 }}>
              <Textarea value={snippet} onChange={setSnippet} rows={4} mono />
            </div>
          ) : (
            <pre
              className="mono"
              style={{
                margin: 0,
                padding: "12px",
                fontSize: 12.5,
                lineHeight: 1.5,
                color: "var(--text-primary)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {convention.evidence_snippet}
            </pre>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{t("card.confidence")}</span>
          <div style={{ width: 140 }}>
            <ProgressBar value={pct} color={confidenceColor(convention.confidence)} />
          </div>
          <span className="mono tnum" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {pct}%
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          padding: 14,
          borderLeft: "1px solid var(--border)",
          minWidth: 150,
        }}
      >
        {editing ? (
          <>
            <Button kind="primary" size="sm" icon="Check" onClick={saveEdit} full>
              {t("card.save")}
            </Button>
            <Button kind="ghost" size="sm" onClick={cancelEdit} full>
              {t("card.cancel")}
            </Button>
          </>
        ) : (
          <>
            <Button
              kind={accepted ? "primary" : "secondary"}
              size="sm"
              icon="Check"
              active={accepted}
              loading={busy}
              onClick={() => onAccept(!accepted)}
              full
            >
              {accepted ? t("card.accepted") : t("card.accept")}
            </Button>
            <Button kind="ghost" size="sm" icon="X" onClick={onReject} full>
              {t("card.reject")}
            </Button>
            <Button kind="ghost" size="sm" icon="Edit" onClick={() => setEditing(true)} full>
              {t("card.edit")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
