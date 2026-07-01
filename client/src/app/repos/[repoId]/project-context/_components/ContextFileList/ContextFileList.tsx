"use client";
import React from "react";
import { Badge, Markdown, Skeleton, EmptyState, ErrorState } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import type { SpecFile } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { useContextFiles, useReindexContext } from "@/lib/hooks/core";
import { useAgents } from "@/lib/hooks/agents";
import { ApiError } from "@/lib/api";
import { ContextFileRow } from "../ContextFileRow";

export function ContextFileList() {
  const t = useTranslations("context");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const crumb = [{ label: "Skills Lab" }, { label: t("title") }];

  const { data, isLoading, isError, error, refetch } = useContextFiles(repoId);
  const reindex = useReindexContext();
  const { data: agents } = useAgents();
  const totalAgents = agents?.length ?? 0;

  const [selectedIdx, setSelectedIdx] = React.useState(0);
  const [viewMode, setViewMode] = React.useState<"preview" | "edit">("preview");

  const list: SpecFile[] = data?.files ?? [];
  const selectedFile = list[selectedIdx] ?? null;

  if (isLoading) {
    return (
      <AppShell crumb={crumb}>
        <div style={{ display: "flex", height: "100%", padding: 24, gap: 24 }}>
          <div style={{ width: 280, display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton height={32} />
            <Skeleton height={32} />
            <Skeleton height={32} />
          </div>
          <div style={{ flex: 1 }}>
            <Skeleton height={200} />
          </div>
        </div>
      </AppShell>
    );
  }

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          title={t("loadError")}
          body={error instanceof ApiError ? error.message : t("loadError")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  // AC-3: No clone on disk — server returns empty array with a reason
  if (list.length === 0) {
    return (
      <AppShell crumb={crumb}>
        <EmptyState
          icon="FileText"
          title={t("noClone.title")}
          body={data?.reason ?? t("noClone.body")}
        />
      </AppShell>
    );
  }

  const chunksIndexed = reindex.data?.chunks_indexed ?? null;

  return (
    <AppShell crumb={crumb}>
    <div style={{ display: "flex", height: "calc(100vh - 52px)", overflow: "hidden" }}>
      {/* Left: file list */}
      <div
        style={{
          width: 280,
          flexShrink: 0,
          borderRight: "1px solid var(--border)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "12px 12px 8px", flexShrink: 0, borderBottom: "1px solid var(--border)" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {t("footer.files", { count: list.length })}
          </span>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "8px 8px" }}>
          {list.map((f, idx) => (
            <ContextFileRow
              key={f.path}
              file={f}
              active={idx === selectedIdx}
              onClick={() => setSelectedIdx(idx)}
            />
          ))}
        </div>
        {/* Footer: chunks counter from existing repo-intel index */}
        <div
          style={{
            padding: "8px 12px",
            borderTop: "1px solid var(--border)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {chunksIndexed != null && (
            <span data-testid="chunks-footer" style={{ fontSize: 11, color: "var(--text-muted)" }}>
              {t("chunks", { count: chunksIndexed })}
            </span>
          )}
        </div>
      </div>

      {/* Right: Markdown preview pane */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {selectedFile ? (
          <>
            <div
              style={{
                padding: "12px 20px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {selectedFile.path}
              </span>
              {/* Read-only Preview/Edit toggle (AC Non-goal: no persistence) */}
              <div style={{ display: "flex", gap: 4, background: "var(--bg-surface)", borderRadius: 6, padding: 2, border: "1px solid var(--border)" }}>
                <button
                  onClick={() => setViewMode("preview")}
                  style={{
                    padding: "2px 10px",
                    borderRadius: 4,
                    fontSize: 12,
                    border: "none",
                    cursor: "pointer",
                    background: viewMode === "preview" ? "var(--bg-hover)" : "transparent",
                    color: viewMode === "preview" ? "var(--text-primary)" : "var(--text-muted)",
                  }}
                >
                  {t("mode.preview")}
                </button>
                <button
                  onClick={() => setViewMode("edit")}
                  style={{
                    padding: "2px 10px",
                    borderRadius: 4,
                    fontSize: 12,
                    border: "none",
                    cursor: "pointer",
                    background: viewMode === "edit" ? "var(--bg-hover)" : "transparent",
                    color: viewMode === "edit" ? "var(--text-primary)" : "var(--text-muted)",
                  }}
                >
                  {t("mode.edit")}
                </button>
              </div>
              {/* Used by N agents (AC-24) */}
              {(selectedFile.used_by_agents ?? 0) > 0 && (
                <Badge color="var(--accent)" data-testid="used-by-badge">
                  {t("file.usedBy", { count: selectedFile.used_by_agents })}
                </Badge>
              )}
              {selectedFile.tokens != null && (
                <span style={{ fontSize: 12, color: "var(--text-muted)", flexShrink: 0 }}>
                  {t("file.tokens", { count: selectedFile.tokens })}
                </span>
              )}
              {/* Coverage: N / total agents */}
              {totalAgents > 0 && (
                <span
                  data-testid="coverage-indicator"
                  style={{ fontSize: 12, color: "var(--text-secondary)", flexShrink: 0 }}
                >
                  {t("file.coverage", { used: selectedFile.used_by_agents ?? 0, total: totalAgents })}
                </span>
              )}
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
              {viewMode === "edit" ? (
                /* Read-only "edit" mode: shows the raw markdown source in a pre block */
                <pre
                  className="mono"
                  style={{
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: "var(--text-primary)",
                    background: "var(--bg-surface)",
                    borderRadius: 6,
                    padding: 16,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {selectedFile.content ?? ""}
                </pre>
              ) : (
                <Markdown>{selectedFile.content}</Markdown>
              )}
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ color: "var(--text-muted)", fontSize: 13 }}>Select a file to preview</span>
          </div>
        )}
      </div>
    </div>
    </AppShell>
  );
}
