"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { useIntent } from "@/lib/hooks/intent";
import { IntentCard } from "../IntentCard";
import { BlastCard } from "../BlastCard";
import { BriefCard } from "../BriefCard";
import { ReviewFocusCard } from "../ReviewFocusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null | undefined;
  /** owner/repo + head sha — for the Blast map's caller deep-links. */
  repoFullName: string | null;
  headSha: string | null | undefined;
}

export function OverviewTab({ prBody, prId, repoFullName, headSha }: OverviewTabProps) {
  const { data: intent, hasIntent, recompute, isRecomputing } = useIntent(prId);
  const showIntent = hasIntent && intent;

  return (
    <>
      {/* PR BRIEF — full-width, above the Intent/Blast row (AC-19). Rendered
          first so it never disturbs the existing 2-col layout below it. */}
      <BriefCard prId={prId} />

      {/* Intent + Blast Radius, side by side (Blast spans full width without intent) */}
      <div style={showIntent ? s.twoCol : undefined}>
        {showIntent && (
          <IntentCard
            intent={intent}
            onRecompute={recompute}
            isRecomputing={isRecomputing}
            prId={prId}
            repoFullName={repoFullName}
            headSha={headSha}
          />
        )}
        <BlastCard prId={prId} repoFullName={repoFullName} headSha={headSha} />
      </div>

      {/* REVIEW FOCUS — full-width, below the Intent/Blast row. */}
      <ReviewFocusCard prId={prId} repoFullName={repoFullName} headSha={headSha} />

      {prBody && (
        <section style={{ marginTop: 20 }}>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
