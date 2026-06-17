/* PRRow — one clickable row in the PR list table. Ported from screen_dashboard.jsx. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Icon, Avatar, Badge, CircularScore } from "@devdigest/ui";
import type { PrMeta } from "@/lib/types";
import { SIZE_COLOR, STATUS_META } from "../../constants";
import { relativeTime, sizeOf } from "../../helpers";
import { s } from "../../styles";
import { RunCostBadge } from "../../[number]/_components/RunCostBadge/RunCostBadge";
import { usePrReviews } from "@/lib/hooks/reviews";
import { FindingsHover } from "@/components/Findings";
import type { FindingRecord } from "@devdigest/shared";

export function PRRow({ pr, repoId }: { pr: PrMeta; repoId: string }) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const [h, setH] = React.useState(false);
  const st = STATUS_META[pr.status] ?? STATUS_META.needs_review!;
  const { size, lines } = sizeOf(pr);
  const reviewed = pr.score != null; // null score ⇒ PR has never been reviewed

  // Lazy-load findings for the hover card when the user first mouses over the
  // row. The fetch is gated on `h` so it fires once and is then TanStack-cached.
  // "Last run" = all reviews within a 2-minute session window of the newest one
  // (matching the server-side logic for findings_by_severity on the list endpoint).
  const SESSION_WINDOW_MS = 2 * 60 * 1000;
  const { data: reviews, isLoading: reviewsLoading } = usePrReviews(pr.id ?? null, { enabled: h });
  const latestFindings: FindingRecord[] = React.useMemo(() => {
    if (!reviews || reviews.length === 0) return [];
    const first = reviews[0];
    if (!first) return [];
    const newestAt = new Date(first.created_at).getTime();
    return reviews
      .filter((r) => newestAt - new Date(r.created_at).getTime() <= SESSION_WINDOW_MS)
      .flatMap((r) => r.findings.filter((f) => !f.accepted_at && !f.dismissed_at));
  }, [reviews]);
  return (
    <div
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      onClick={() => router.push(`/repos/${repoId}/pulls/${pr.number}`)}
      style={s.row(h)}
    >
      <div style={s.rowTitleCell}>
        <Icon.GitPullRequest size={15} style={s.rowIcon(st.c)} />
        <div style={s.rowTitleWrap}>
          <div style={s.rowTitle(h)}>{pr.title}</div>
          <span className="mono" style={s.rowNumber}>
            #{pr.number}
          </span>
        </div>
      </div>
      <div style={s.authorCell}>
        <Avatar name={pr.author} size={18} />
        {pr.author}
      </div>
      <div>
        <Badge
          color={SIZE_COLOR[size]}
          bg="transparent"
          style={s.sizeBadgeBorder(SIZE_COLOR[size]!)}
        >
          {size} · {lines}
        </Badge>
      </div>
      <div style={s.scoreCell}>
        {reviewed ? (
          <CircularScore score={pr.score!} size={34} stroke={3} />
        ) : (
          <span style={s.muted}>—</span>
        )}
      </div>
      <div>
        <FindingsHover
          counts={pr.findings_by_severity}
          findings={latestFindings}
          isLoading={h && reviewsLoading}
        />
      </div>
      <div>
        <Badge dot color={st.c} bg="transparent">
          {t(`list.status.${st.labelKey}`)}
        </Badge>
      </div>
      <div style={s.costCell}>
        <RunCostBadge costUsd={pr.cost_usd} variant="compact" />
      </div>
      <div style={s.updatedCell}>{relativeTime(pr.updated_at)}</div>
    </div>
  );
}
