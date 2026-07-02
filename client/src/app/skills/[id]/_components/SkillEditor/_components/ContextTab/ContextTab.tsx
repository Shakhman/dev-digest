"use client";
import React from "react";
import { Badge, Drawer, Markdown, Skeleton } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import type { SpecFile, ContextDocLink } from "@devdigest/shared";
import { useContextFiles } from "@/lib/hooks/core";
import { useActiveRepo } from "@/lib/repo-context";
import { useSkillContextDocs, useSetSkillContextDocs } from "@/lib/hooks/context-docs";

interface ContextTabProps {
  skillId: string;
}

const SOURCE_COLORS: Record<string, string> = {
  specs: "var(--accent)",
  docs: "var(--warn)",
  insights: "var(--ok)",
};

export function ContextTab({ skillId }: ContextTabProps) {
  const t = useTranslations("context");
  const { activeRepo } = useActiveRepo();
  const repoId = activeRepo?.id ?? null;

  const { data: contextFiles, isLoading: filesLoading } = useContextFiles(repoId);
  const allFiles = contextFiles?.files;
  const { data: links, isLoading: linksLoading } = useSkillContextDocs(skillId);
  const setContextDocs = useSetSkillContextDocs();

  // Ordered list of attached paths, derived from server links (React Query
  // cache is optimistically updated by the mutation, so this stays in sync
  // instantly on toggle/reorder without a separate local copy).
  const orderedPaths = React.useMemo(
    () => (links ? [...links].sort((a, b) => a.order - b.order).map((l) => l.path) : []),
    [links]
  );
  const [search, setSearch] = React.useState("");
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);
  const dragItem = React.useRef<number | null>(null);
  const dragOverItem = React.useRef<number | null>(null);

  if (filesLoading || linksLoading) return <Skeleton height={200} />;

  const fileMap = new Map((allFiles ?? []).map((f: SpecFile) => [f.path, f]));
  const linkMap = new Map((links ?? []).map((l: ContextDocLink) => [l.path, l]));
  const attachedSet = new Set(orderedPaths);

  const totalTokens = orderedPaths.reduce((sum, path) => {
    const f = fileMap.get(path);
    return sum + (f?.tokens ?? 0);
  }, 0);

  const filteredAll = (allFiles ?? []).filter((f: SpecFile) =>
    !search || f.path.toLowerCase().includes(search.toLowerCase())
  );

  const toggleAttach = (path: string) => {
    const next = attachedSet.has(path)
      ? orderedPaths.filter((p) => p !== path)
      : [...orderedPaths, path];
    setContextDocs.mutate({ skillId, paths: next });
  };

  const handleDragStart = (idx: number) => { dragItem.current = idx; };
  const handleDragEnter = (idx: number) => { dragOverItem.current = idx; };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const next = [...orderedPaths];
    const dragged = next.splice(dragItem.current, 1)[0]!;
    next.splice(dragOverItem.current, 0, dragged);
    dragItem.current = null;
    dragOverItem.current = null;
    setContextDocs.mutate({ skillId, paths: next });
  };

  const previewFile = previewPath ? (fileMap.get(previewPath) ?? null) : null;

  return (
    <div style={{ maxWidth: 720 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          {t("contextTab.title")}
        </span>
        <Badge color="var(--accent)" mono>
          {t("contextTab.attached", { count: orderedPaths.length })}
        </Badge>
        <span
          data-testid="token-estimate"
          style={{ fontSize: 13, color: "var(--text-secondary)", marginLeft: "auto" }}
        >
          {t("contextTab.tokenEstimate", { count: totalTokens })}
        </span>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("contextTab.filterPlaceholder")}
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border)",
            borderRadius: 5,
            padding: "4px 10px",
            fontSize: 12,
            color: "var(--text-primary)",
            outline: "none",
            width: 160,
          }}
        />
      </div>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
        {t("contextTab.orderHint")}
      </p>
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
        Project specifications are injected before the skill body when this skill runs.
      </p>

      {/* Attached docs (ordered, draggable) */}
      {orderedPaths.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          {orderedPaths.map((path, idx) => {
            const file = fileMap.get(path);
            const link = linkMap.get(path);
            const isMissing = link?.missing ?? (!file);
            const source = file?.source ?? "specs";
            const baseName = path.split("/").pop() ?? path;
            return (
              <div
                key={path}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragEnter={() => handleDragEnter(idx)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => e.preventDefault()}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "7px 10px",
                  borderRadius: 6,
                  marginBottom: 4,
                  border: "1px solid var(--border)",
                  background: "var(--bg-surface)",
                  cursor: "grab",
                  opacity: isMissing ? 0.5 : 1,
                }}
              >
                <span style={{ color: "var(--text-muted)", cursor: "grab", flexShrink: 0, fontSize: 14 }}>⠿</span>
                <input
                  type="checkbox"
                  checked={true}
                  onChange={() => {
                    if (isMissing && !window.confirm(`"${baseName}" doesn't exist in the current repo.\n\nRemoving it will permanently delete this link — it won't come back on refresh. Continue?`)) return;
                    toggleAttach(path);
                  }}
                  style={{ cursor: "pointer", flexShrink: 0 }}
                />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {baseName}
                </span>
                {isMissing && (
                  <Badge color="var(--error)" mono data-testid={`missing-badge-${path}`}>
                    {t("contextTab.missingBadge")}
                  </Badge>
                )}
                <Badge color={SOURCE_COLORS[source] ?? "var(--text-muted)"} mono>
                  {source}
                </Badge>
                {file?.tokens != null && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                    {file.tokens} tok
                  </span>
                )}
                {file?.content && (
                  <button
                    onClick={() => setPreviewPath(previewPath === path ? null : path)}
                    style={{
                      fontSize: 11,
                      color: "var(--accent)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: "0 4px",
                    }}
                  >
                    {t("contextTab.preview")}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Unattached docs */}
      {filteredAll
        .filter((f: SpecFile) => !attachedSet.has(f.path))
        .map((f: SpecFile) => {
          const source = f.source ?? "specs";
          const baseName = f.path.split("/").pop() ?? f.path;
          return (
            <div
              key={f.path}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                borderRadius: 6,
                marginBottom: 4,
                border: "1px solid var(--border)",
                opacity: 0.6,
              }}
            >
              <div style={{ width: 14, flexShrink: 0 }} />
              <input
                type="checkbox"
                checked={false}
                onChange={() => toggleAttach(f.path)}
                style={{ cursor: "pointer", flexShrink: 0 }}
              />
              <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {baseName}
              </span>
              <Badge color={SOURCE_COLORS[source] ?? "var(--text-muted)"} mono>
                {source}
              </Badge>
              {f.tokens != null && (
                <span style={{ fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>
                  {f.tokens} tok
                </span>
              )}
            </div>
          );
        })}

      {previewFile && (
        <Drawer width={520} title={previewPath} onClose={() => setPreviewPath(null)}>
          <Markdown>{previewFile.content}</Markdown>
        </Drawer>
      )}
    </div>
  );
}
