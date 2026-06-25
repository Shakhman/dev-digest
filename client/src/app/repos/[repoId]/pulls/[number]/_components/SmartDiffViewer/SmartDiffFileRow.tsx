"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import type { SmartDiffFile, FindingRecord } from "@devdigest/shared";
import { parsePatch } from "@/components/diff-viewer/helpers";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

export interface SmartDiffFileRowProps {
  file: SmartDiffFile;
  patch: string | null;
  findings: FindingRecord[];
  defaultExpanded: boolean;
  onFindingClick: (findingId: string) => void;
  isFirst?: boolean;
  repoFullName: string | null;
  headSha: string | null;
}

export function SmartDiffFileRow({
  file,
  patch,
  findings,
  defaultExpanded,
  onFindingClick,
  isFirst,
  repoFullName,
  headSha,
}: SmartDiffFileRowProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);

  // Build a map from new line number → findings at that line
  const findingsByLine = React.useMemo(() => {
    const map = new Map<number, FindingRecord[]>();
    for (const finding of findings) {
      // findings are anchored via start_line (new-file line)
      const line = finding.start_line;
      const existing = map.get(line);
      if (existing) {
        existing.push(finding);
      } else {
        map.set(line, [finding]);
      }
    }
    return map;
  }, [findings]);

  const lines = React.useMemo(() => parsePatch(patch), [patch]);

  const rowStyle = isFirst ? s.fileRowFirstInGroup : s.fileRow;

  return (
    <div style={rowStyle}>
      {/* Collapsed header */}
      <div style={s.fileHeader} onClick={() => setExpanded((v) => !v)}>
        <Icon.ChevronRight size={13} style={s.fileChevron(expanded)} />
        <Icon.FileText size={13} style={s.fileIcon} />

        {/* filename + finding dot sit together; wrapper takes the remaining space */}
        <div style={s.fileNameWrap}>
          <span style={s.filePath}>{file.path}</span>
          {findings.length > 0 && (
            <span
              style={s.findingDot}
              title={`${findings.length} finding${findings.length === 1 ? "" : "s"} — click to reveal`}
              onClick={(e) => {
                // Always expand (never collapse) when clicking the dot directly
                // so the inline finding markers are immediately visible.
                e.stopPropagation();
                setExpanded(true);
              }}
            />
          )}
        </div>

        {file.pseudocode_summary != null && (
          <span style={s.summaryBadge} title={file.pseudocode_summary}>
            % {file.pseudocode_summary}
          </span>
        )}

        <span style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>
          <span style={s.delText}>−{file.deletions}</span>
        </span>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div style={s.fileBody}>
          {file.pseudocode_summary != null && (
            <div style={s.pseudoRow}>
              <span style={s.pseudoLabel}>What this does: </span>
              {file.pseudocode_summary}
            </div>
          )}

          {lines.length === 0 ? (
            <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-muted)" }}>
              {patch == null && repoFullName && headSha ? (
                <>
                  Diff not available — file is too large for GitHub to return inline patch data.{" "}
                  <a
                    href={githubBlobUrl(repoFullName, headSha, file.path)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--accent)", textDecoration: "underline" }}
                  >
                    View file on GitHub
                  </a>
                </>
              ) : (
                "No diff available"
              )}
            </div>
          ) : (
            <pre style={s.patchPre}>
              {lines.map((ln, i) => {
                const lineFindings =
                  ln.kind !== "hunk" && ln.newNo != null
                    ? (findingsByLine.get(ln.newNo) ?? [])
                    : [];

                // Highest severity for the left-border highlight
                // (CRITICAL > WARNING > SUGGESTION).
                const lineSeverity =
                  lineFindings.length === 0
                    ? null
                    : lineFindings.some((f) => f.severity === "CRITICAL")
                      ? "CRITICAL"
                      : lineFindings.some((f) => f.severity === "WARNING")
                        ? "WARNING"
                        : "SUGGESTION";

                const sign =
                  ln.kind === "add"
                    ? "+"
                    : ln.kind === "del"
                      ? "-"
                      : ln.kind === "hunk"
                        ? " "
                        : " ";

                const lineNoDisplay =
                  ln.kind === "hunk" ? "" : (ln.newNo ?? ln.oldNo ?? "");

                return (
                  <div key={i} style={s.diffLine(ln.kind, lineSeverity)}>
                    <span style={s.diffLineNo}>{lineNoDisplay}</span>
                    <span style={s.diffLineSign(ln.kind)}>{sign}</span>
                    <span style={s.diffLineText}>{ln.text}</span>
                    {lineFindings.map((finding) => {
                      const { icon: BadgeIcon, label } =
                        finding.severity === "CRITICAL"
                          ? { icon: Icon.AlertOctagon, label: "blocker" }
                          : finding.severity === "WARNING"
                            ? { icon: Icon.AlertTriangle, label: "warning" }
                            : { icon: Icon.Lightbulb, label: "suggestion" };
                      return (
                        <span
                          key={finding.id}
                          style={s.findingBadge(finding.severity)}
                          title={finding.title}
                          onClick={(e) => {
                            e.stopPropagation();
                            onFindingClick(finding.id);
                          }}
                        >
                          <BadgeIcon size={10} />
                          {label}
                        </span>
                      );
                    })}
                  </div>
                );
              })}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
