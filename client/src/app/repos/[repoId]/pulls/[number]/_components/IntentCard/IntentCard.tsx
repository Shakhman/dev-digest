/* IntentCard — shows the LLM-extracted PR intent, scope, and risk areas.
   Rendered above the PR description on the Overview tab when intent data exists.
   RISK AREAS renders brief.risks[] (collapsible rows with kind icon + file ref)
   when a brief exists; falls back to plain intent.risk_areas badges otherwise. */
"use client";

import React from "react";
import { Icon, SectionLabel, Badge, Button } from "@devdigest/ui";
import type { Intent, Risk } from "@devdigest/shared";
import { useBrief } from "@/lib/hooks/brief";
import { githubBlobUrl, parseFileRef } from "@/lib/github-urls";
import { SEVERITY_COLOR, getKindIcon } from "./constants";
import { s } from "./styles";

interface IntentCardProps {
  intent: Intent;
  onRecompute?: () => void;
  isRecomputing?: boolean;
  prId: string | null | undefined;
  repoFullName: string | null;
  headSha: string | null | undefined;
}

export function IntentCard({ intent, onRecompute, isRecomputing, prId, repoFullName, headSha }: IntentCardProps) {
  const { brief, hasBrief } = useBrief(prId);
  const risks = hasBrief && brief ? brief.risks : [];

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

      {/* RISK AREAS — brief.risks[] rows when brief exists, else plain badges */}
      {risks.length > 0 ? (
        <section style={s.section}>
          <SectionLabel icon="AlertTriangle">RISK AREAS</SectionLabel>
          <div style={s.riskList}>
            {risks.map((risk, i) => (
              <RiskRow key={i} risk={risk} repoFullName={repoFullName} headSha={headSha} />
            ))}
          </div>
        </section>
      ) : (
        intent.risk_areas.length > 0 && (
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
        )
      )}
    </div>
  );
}

function RiskRow({
  risk,
  repoFullName,
  headSha,
}: {
  risk: Risk;
  repoFullName: string | null;
  headSha: string | null | undefined;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const color = SEVERITY_COLOR[risk.severity];
  const RiskIcon = Icon[getKindIcon(risk.kind, risk.title)];
  const Chevron = expanded ? Icon.ChevronDown : Icon.ChevronRight;

  const firstRef = risk.file_refs[0];
  const fileLink = firstRef && repoFullName && headSha
    ? (() => {
        const { path, startLine, endLine } = parseFileRef(firstRef);
        return githubBlobUrl(repoFullName, headSha, path, startLine, endLine);
      })()
    : null;

  return (
    <div style={s.riskRowWrap}>
      <button
        type="button"
        style={s.riskRowHeader}
        onClick={() => setExpanded((v) => !v)}
      >
        <RiskIcon size={16} style={{ color, flexShrink: 0 }} />
        <div style={s.riskRowContent}>
          <span style={s.riskRowTitle}>{risk.title}</span>
          {firstRef && (
            fileLink ? (
              <a href={fileLink} target="_blank" rel="noreferrer" style={s.riskRowFileRefLink} onClick={(e) => e.stopPropagation()}>
                <code style={s.riskRowFileRef}>{firstRef}</code>
              </a>
            ) : (
              <code style={s.riskRowFileRef}>{firstRef}</code>
            )
          )}
        </div>
        <Chevron size={14} style={s.riskChevron} />
      </button>
      {expanded && risk.explanation && (
        <div style={s.riskRowBody}>{risk.explanation}</div>
      )}
    </div>
  );
}
