/* IntentCard — shows the LLM-extracted PR intent, scope, and risk areas.
   Rendered above the PR description on the Overview tab when intent data exists. */
import React from "react";
import { SectionLabel, Badge, Button } from "@devdigest/ui";
import type { Intent } from "@devdigest/shared";
import { s } from "./styles";

interface IntentCardProps {
  intent: Intent;
  onRecompute?: () => void;
  isRecomputing?: boolean;
}

export function IntentCard({ intent, onRecompute, isRecomputing }: IntentCardProps) {
  return (
    <div style={s.card}>
      {/* Header row — Recompute button pinned to top-right */}
      <div style={s.cardHeader}>
        <Button
          kind="ghost"
          size="sm"
          icon="RefreshCw"
          loading={isRecomputing}
          disabled={isRecomputing}
          onClick={onRecompute}
        >
          Recompute
        </Button>
      </div>
      {/* INTENT — always rendered */}
      <section style={s.section}>
        <SectionLabel icon="Sparkles">INTENT</SectionLabel>
        <p style={s.intentText}>{intent.intent}</p>
      </section>

      {/* IN SCOPE — omit when empty */}
      {intent.in_scope.length > 0 && (
        <section style={s.section}>
          <SectionLabel icon="CheckCircle">IN SCOPE</SectionLabel>
          <ul style={s.list}>
            {intent.in_scope.map((item, i) => (
              <li key={i} style={s.inScopeItem}>
                <span style={s.checkMark}>✓</span>
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* OUT OF SCOPE — omit when empty */}
      {intent.out_of_scope.length > 0 && (
        <section style={s.section}>
          <SectionLabel icon="XCircle">OUT OF SCOPE</SectionLabel>
          <ul style={s.list}>
            {intent.out_of_scope.map((item, i) => (
              <li key={i} style={s.outOfScopeItem}>
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* RISK AREAS — omit when empty */}
      {intent.risk_areas.length > 0 && (
        <section style={s.section}>
          <SectionLabel icon="AlertTriangle">RISK AREAS</SectionLabel>
          <div style={s.riskRow}>
            {intent.risk_areas.map((area, i) => (
              <Badge
                key={i}
                color="var(--warning-text, #d97706)"
                bg="var(--warning-bg, rgba(217,119,6,0.1))"
                icon="AlertTriangle"
              >
                {area}
              </Badge>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
