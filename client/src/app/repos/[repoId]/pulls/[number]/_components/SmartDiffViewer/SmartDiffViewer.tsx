"use client";

import React from "react";
import type { SmartDiff, PrFile, ReviewRecord, FindingRecord } from "@devdigest/shared";
import { DEFAULT_EXPANDED } from "./constants";
import { SmartDiffGroupSection } from "./SmartDiffGroupSection";
import { s } from "./styles";

export interface SmartDiffViewerProps {
  smartDiff: SmartDiff;
  prFiles: PrFile[];
  reviews: ReviewRecord[];
  onFindingClick: (findingId: string) => void;
  repoFullName: string | null;
  headSha: string | null;
}

export function SmartDiffViewer({
  smartDiff,
  prFiles,
  reviews,
  onFindingClick,
  repoFullName,
  headSha,
}: SmartDiffViewerProps) {
  // Build patch map from prFiles
  const filePatches = React.useMemo(() => {
    const map = new Map<string, string | null>();
    for (const f of prFiles) {
      map.set(f.path, f.patch ?? null);
    }
    return map;
  }, [prFiles]);

  // Build findings map from the latest review (newest-first)
  const fileFindings = React.useMemo(() => {
    const map = new Map<string, FindingRecord[]>();
    // reviews come newest-first — take the first one that has findings
    const latestReview = reviews[0];
    if (!latestReview) return map;
    for (const finding of latestReview.findings) {
      const existing = map.get(finding.file);
      if (existing) {
        existing.push(finding);
      } else {
        map.set(finding.file, [finding]);
      }
    }
    return map;
  }, [reviews]);

  // Compute total stats across all groups
  const totalAdditions = React.useMemo(
    () =>
      smartDiff.groups.reduce(
        (sum, g) => sum + g.files.reduce((s2, f) => s2 + f.additions, 0),
        0,
      ),
    [smartDiff],
  );
  const totalDeletions = React.useMemo(
    () =>
      smartDiff.groups.reduce(
        (sum, g) => sum + g.files.reduce((s2, f) => s2 + f.deletions, 0),
        0,
      ),
    [smartDiff],
  );
  const totalFiles = React.useMemo(
    () => smartDiff.groups.reduce((sum, g) => sum + g.files.length, 0),
    [smartDiff],
  );

  return (
    <div style={s.root}>
      <div style={s.viewerHeader}>
        <span>Reviewer-ordered diff</span>
        <span style={s.viewerHeaderStats}>
          {totalFiles} files &middot;{" "}
          <span style={{ color: "var(--code-add-text)" }}>+{totalAdditions}</span>{" "}
          <span style={{ color: "var(--code-del-text)" }}>−{totalDeletions}</span>
        </span>
      </div>

      {smartDiff.groups.map((group) => (
        <SmartDiffGroupSection
          key={group.role}
          group={group}
          fileFindings={fileFindings}
          filePatches={filePatches}
          defaultExpanded={DEFAULT_EXPANDED[group.role]}
          onFindingClick={onFindingClick}
          repoFullName={repoFullName}
          headSha={headSha}
        />
      ))}
    </div>
  );
}
