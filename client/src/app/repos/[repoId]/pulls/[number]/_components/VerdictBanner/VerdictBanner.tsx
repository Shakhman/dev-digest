/* VerdictBanner — ported from findings.jsx.
   request_changes / approve / comment + summary + finding/blocker counts + score. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, CircularScore, Button } from "@devdigest/ui";
import type { Verdict } from "@devdigest/shared";
import { formatCost } from "@/lib/cost";
import type { BriefCost } from "@/lib/hooks/brief";
import { VERDICT_META } from "./constants";
import { s } from "./styles";

export function VerdictBanner({
  verdict,
  summary,
  score,
  findingsCount,
  blockers,
  onRegenerate,
  isGenerating,
  cost,
}: {
  verdict: Verdict;
  summary: string | null;
  score: number | null;
  findingsCount: number;
  blockers: number;
  onRegenerate?: () => void;
  isGenerating?: boolean;
  cost?: BriefCost;
}) {
  const t = useTranslations("prReview");
  const m = VERDICT_META[verdict] ?? VERDICT_META.comment;
  const VIcon = Icon[m.icon];
  return (
    <div style={s.wrap}>
      <div style={s.iconBox(m.bg, m.c)}>
        <VIcon size={22} />
      </div>
      <div style={s.main}>
        <div style={s.titleRow}>
          <span style={s.label(m.c)}>{t(`verdict.${m.labelKey}`)}</span>
          <Badge color="var(--text-secondary)">
            {t("verdict.findingsCount", { count: findingsCount })}
            {blockers > 0 ? t("verdict.blockers", { count: blockers }) : ""}
          </Badge>
          {onRegenerate && (
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              loading={isGenerating}
              disabled={isGenerating}
              onClick={onRegenerate}
              style={s.regenerateBtn}
            />
          )}
        </div>
        {summary && <p style={s.summary}>{summary}</p>}
      </div>
      {score != null && (
        <div style={s.scoreCol}>
          <CircularScore score={score} size={52} stroke={5} />
          <span style={s.scoreLabel}>{t("verdict.prScore")}</span>
          {cost && (
            <span style={s.costText}>
              {cost.costUsd != null ? formatCost(cost.costUsd) : ""} {cost.tokensIn}→{cost.tokensOut}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
