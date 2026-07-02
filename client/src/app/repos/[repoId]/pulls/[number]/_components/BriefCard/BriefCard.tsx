/* BriefCard — the "PR BRIEF" card (SPEC-09 Why+Risk Brief), shown at the top
   of the Overview tab, above the Intent/Blast row. Renders a short one-glance
   `what`+`why` narrative next to the existing review's score/verdict/finding
   counts (AC-4a, read never recomputed). `risks[]` render inside IntentCard's
   "RISK AREAS" section and `review_focus[]` renders in its own ReviewFocusCard
   below the Intent/Blast row — this card stays intentionally short, matching
   the mockup. Generation is always an explicit user action; a 404 (no brief
   yet) is the normal pre-generation state, not an error. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { useBrief } from "@/lib/hooks/brief";
import { usePrReviews } from "@/lib/hooks/reviews";
import { VerdictBanner } from "../VerdictBanner";
import { s } from "./styles";

interface BriefCardProps {
  prId: string | null | undefined;
}

export function BriefCard({ prId }: BriefCardProps) {
  const t = useTranslations("prReview");
  const {
    brief,
    hasBrief,
    isLoading,
    isStale,
    missingSections,
    cost,
    generate,
    isGenerating,
    generateFailed,
  } = useBrief(prId);
  // Score/verdict/finding-counts are composed by READING the latest review —
  // never recomputed and never sourced from the brief call itself (AC-4a).
  // Reviews arrive newest-first (see page.tsx), but a `kind:'summary'` row
  // (verdict/score always null) can sit above the last actual review run —
  // skip those so the card always reflects the last real review run.
  const { data: reviews } = usePrReviews(prId);
  const latestReview = reviews?.find((r) => r.kind === "review");
  const blockers =
    latestReview?.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length ?? 0;

  // One short flowing paragraph — "what" then "why" — matching the mockup's
  // single-narrative PR BRIEF card (no separate What/Why headers here).
  const narrative = hasBrief && brief ? [brief.what, brief.why].filter(Boolean).join(" ") : null;

  // Auto-generate the brief on tab load when a review has run but no brief
  // exists yet. The brief service uses review findings to enrich file refs, so
  // it produces the most useful output after a review has completed.
  React.useEffect(() => {
    if (!isLoading && !hasBrief && !isGenerating && !generateFailed && latestReview && generate) {
      generate();
    }
  }, [isLoading, hasBrief, isGenerating, generateFailed, latestReview, generate]);

  return (
    <div style={s.card}>
      <div style={s.header}>
        <SectionLabel icon="Sparkles">{t("brief.title")}</SectionLabel>
        <div style={s.headerRight}>
          {generate && !latestReview?.verdict && (
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              loading={isGenerating}
              disabled={isGenerating}
              onClick={() => generate()}
            />
          )}
        </div>
      </div>

      {(isStale || missingSections.length > 0) && (
        <div style={s.badgeRow}>
          {isStale && (
            <Badge icon="Clock" color="var(--warn)" bg="var(--warn-bg)">
              {t("brief.stale")}
            </Badge>
          )}
          {missingSections.length > 0 && <p style={s.note}>{t("brief.missingSections")}</p>}
        </div>
      )}

      {isLoading && (
        <div style={s.loadingRow}>
          <Skeleton height={16} width="50%" />
          <Skeleton height={40} />
        </div>
      )}

      {!isLoading && generateFailed && (
        <ErrorState title={t("brief.errorTitle")} body={t("brief.errorBody")} onRetry={() => generate?.()} />
      )}

      {!isLoading && !generateFailed && !hasBrief && (
        <EmptyState icon="Sparkles" title={t("brief.emptyTitle")} body={t("brief.emptyBody")} />
      )}

      {!isLoading && hasBrief && brief && (
        <>
          {latestReview?.verdict ? (
            <VerdictBanner
              verdict={latestReview.verdict}
              summary={narrative}
              score={latestReview.score}
              findingsCount={latestReview.findings.length}
              blockers={blockers}
              agentName={latestReview.agent_name}
              onRegenerate={generate}
              isGenerating={isGenerating}
              cost={cost}
            />
          ) : (
            narrative && <p style={s.text}>{narrative}</p>
          )}
        </>
      )}
    </div>
  );
}
