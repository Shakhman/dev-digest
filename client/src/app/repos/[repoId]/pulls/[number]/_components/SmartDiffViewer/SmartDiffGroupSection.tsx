"use client";

import React from "react";
import { Icon } from "@devdigest/ui";
import type { SmartDiffGroup, SmartDiffFile, FindingRecord } from "@devdigest/shared";
import { ROLE_META } from "./constants";
import { SmartDiffFileRow } from "./SmartDiffFileRow";
import { s } from "./styles";

interface SmartDiffGroupSectionProps {
  group: SmartDiffGroup;
  fileFindings: Map<string, FindingRecord[]>;
  filePatches: Map<string, string | null>;
  defaultExpanded: boolean;
  onFindingClick: (findingId: string) => void;
  repoFullName: string | null;
  headSha: string | null;
  /** Triggers per-file summary generation (T-B5/per-file trigger UX). */
  onGenerate: (path: string) => void;
  /** The single path currently generating, or `null` when idle. */
  generatingPath: string | null;
}

export function SmartDiffGroupSection({
  group,
  fileFindings,
  filePatches,
  defaultExpanded,
  onFindingClick,
  repoFullName,
  headSha,
  onGenerate,
  generatingPath,
}: SmartDiffGroupSectionProps) {
  const [expanded, setExpanded] = React.useState(defaultExpanded);
  const meta = ROLE_META[group.role];

  return (
    <div style={s.groupSection}>
      <div style={s.groupHeader} onClick={() => setExpanded((v) => !v)}>
        <div style={s.groupDot(meta.color)} />
        <span style={s.groupLabel}>{meta.label}</span>
        <span style={s.groupSubtitle}>{meta.subtitle}</span>
        <span style={s.groupCount}>{group.files.length} files</span>
        <Icon.ChevronRight size={13} style={s.groupChevron(expanded)} />
      </div>

      {expanded && (
        <div style={s.groupBody}>
          {group.files.map((file: SmartDiffFile, idx: number) => (
            <SmartDiffFileRow
              key={file.path}
              file={file}
              patch={filePatches.get(file.path) ?? null}
              findings={fileFindings.get(file.path) ?? []}
              defaultExpanded={defaultExpanded}
              onFindingClick={onFindingClick}
              isFirst={idx === 0}
              repoFullName={repoFullName}
              headSha={headSha}
              onGenerate={onGenerate}
              generatingPath={generatingPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}
