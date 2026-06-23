"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { useIntent } from "@/lib/hooks/intent";
import { IntentCard } from "../IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prBody: string | null | undefined;
  prId: string | null | undefined;
}

export function OverviewTab({ prBody, prId }: OverviewTabProps) {
  const { data: intent, hasIntent, recompute, isRecomputing } = useIntent(prId);

  return (
    <>
      {/* Intent Layer — shown above the description when extraction has run */}
      {hasIntent && intent && (
        <IntentCard
          intent={intent}
          onRecompute={recompute}
          isRecomputing={isRecomputing}
        />
      )}

      {prBody && (
        <section style={{ marginTop: hasIntent ? 20 : 0 }}>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </>
  );
}
