/* ReviewFocusCard — "REVIEW FOCUS — READ THESE FIRST" (SPEC-09 Why+Risk
   Brief `review_focus[]`), a full-width section below the Intent/Blast row
   on the Overview tab. Renders nothing when there is no brief yet or its
   `review_focus[]` is empty — this is a bonus section, not a required state.
   Each entry's short description is sourced from the matching `risks[]`
   explanation (same file) when one exists — never fabricated. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { useBrief } from "@/lib/hooks/brief";
import { githubBlobUrl, parseFileRef } from "@/lib/github-urls";
import { s } from "./styles";

interface ReviewFocusCardProps {
  prId: string | null | undefined;
  repoFullName: string | null;
  headSha: string | null | undefined;
}

/** file path (line suffix stripped) → first risk explanation that cites it. */
function descriptionsByPath(risks: Risk[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const risk of risks) {
    for (const ref of risk.file_refs) {
      const { path } = parseFileRef(ref);
      if (!map.has(path)) map.set(path, risk.explanation);
    }
  }
  return map;
}

export function ReviewFocusCard({ prId, repoFullName, headSha }: ReviewFocusCardProps) {
  const t = useTranslations("prReview");
  const { brief, hasBrief } = useBrief(prId);
  const paths = hasBrief && brief ? brief.review_focus : [];
  const canLink = repoFullName != null && headSha != null;
  const descriptions = hasBrief && brief ? descriptionsByPath(brief.risks) : new Map<string, string>();

  if (paths.length === 0) return null;

  return (
    <div style={s.card}>
      <div style={s.header}>
        <Icon.ListChecks size={14} style={s.headerIcon} />
        <span style={s.headerTitle}>{t("brief.reviewFocusTitle")}</span>
        <Badge color="var(--text-secondary)">{paths.length}</Badge>
      </div>
      <ul style={s.list}>
        {paths.map((raw) => {
          const { path, startLine, endLine } = parseFileRef(raw);
          const desc = descriptions.get(path);
          return (
            <li key={raw} style={s.item}>
              <span style={s.bullet}>•</span>
              <span style={s.itemContent}>
                {canLink ? (
                  <a
                    className="mono"
                    href={githubBlobUrl(repoFullName, headSha, path, startLine, endLine)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={s.link}
                  >
                    {raw}
                  </a>
                ) : (
                  <span className="mono" style={s.itemNoLink}>
                    {raw}
                  </span>
                )}
                {desc && <span style={s.desc}> — {desc}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
