/* BlastCard — the PR "Blast Radius" impact map, shown on the Overview tab next
   to the Intent card. Reads the pre-built repo-intel index (zero model tokens)
   and renders a tree: changed symbol → its callers (file:line) → reachable
   endpoints/crons. Clicking a caller opens that file at that line on GitHub. */
"use client";

import React from "react";
import { SectionLabel, Badge, Skeleton, EmptyState, Icon, MonoLink } from "@devdigest/ui";
import type { BlastMapNode } from "@devdigest/shared";
import { useBlast } from "@/lib/hooks/reviews";
import { githubBlobUrl } from "@/lib/github-urls";
import { BlastGraph } from "./BlastGraph";
import { s } from "./styles";

type BlastView = "tree" | "graph";

interface BlastCardProps {
  prId: string | null | undefined;
  /** owner/repo — needed to build caller deep-links; null until repo loads. */
  repoFullName: string | null;
  /** PR head sha — pins blob links so line numbers stay accurate. */
  headSha: string | null | undefined;
}

export function BlastCard({ prId, repoFullName, headSha }: BlastCardProps) {
  const { data, isLoading, isError } = useBlast(prId);
  const [view, setView] = React.useState<BlastView>("tree");

  return (
    <div style={s.card}>
      <SectionLabel icon="Boxes">BLAST RADIUS</SectionLabel>

      {isLoading && (
        <div style={s.loadingRow}>
          <Skeleton height={16} width="60%" />
          <Skeleton height={40} />
          <Skeleton height={40} />
        </div>
      )}

      {!isLoading && (isError || !data) && (
        <p style={s.degradedNote}>Couldn’t load the impact map for this PR.</p>
      )}

      {!isLoading && data && data.state === "empty" && (
        <EmptyState
          icon="Boxes"
          title="No impact mapped"
          body="No callers of the changed symbols were found in the index."
        />
      )}

      {!isLoading && data && data.state !== "empty" && (
        <>
          {/* Header counts */}
          <div style={s.stats}>
            <span style={s.stat}>
              <Icon.Code size={14} />
              <span style={s.statNum}>{data.symbol_count}</span> symbols
            </span>
            <span style={s.stat}>
              <Icon.CornerDownRight size={14} />
              <span style={s.statNum}>{data.caller_count}</span> callers
            </span>
            <span style={s.stat}>
              <Icon.Globe size={14} />
              <span style={s.statNum}>{data.endpoint_count}</span> endpoints
            </span>
            <span style={s.stat}>
              <Icon.Clock size={14} />
              <span style={s.statNum}>{data.cron_count}</span> cron
            </span>
            {/* Tree | Graph toggle — same row as the stats, pushed right. */}
            <ViewToggle view={view} onChange={setView} />
          </div>

          {/* Degraded badge — render the partial tree below it, never blank. */}
          {data.state === "degraded" && (
            <Badge
              icon="AlertTriangle"
              color="var(--warning-text, #d97706)"
              bg="var(--warning-bg, rgba(217,119,6,0.1))"
            >
              {degradedLabel(data.degraded_reason)}
            </Badge>
          )}

          {/* Tree or Graph view of the same map */}
          {view === "tree" ? (
            <div style={s.tree}>
              {data.symbols.map((node, i) => (
                <SymbolNode
                  key={`${node.file}:${node.name}`}
                  node={node}
                  defaultOpen={i === 0}
                  repoFullName={repoFullName}
                  headSha={headSha}
                />
              ))}
            </div>
          ) : (
            <BlastGraph
              symbols={data.symbols}
              repoFullName={repoFullName}
              headSha={headSha}
            />
          )}
        </>
      )}
    </div>
  );
}

/** Segmented Tree | Graph control (matches the screenshot's header toggle). */
function ViewToggle({
  view,
  onChange,
}: {
  view: BlastView;
  onChange: (v: BlastView) => void;
}) {
  return (
    <div style={s.toggle} role="tablist" aria-label="Blast radius view">
      {(["tree", "graph"] as const).map((v) => {
        const active = v === view;
        return (
          <button
            key={v}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(v)}
            style={{ ...s.toggleBtn, ...(active ? s.toggleBtnActive : null) }}
          >
            {v === "tree" ? "Tree" : "Graph"}
          </button>
        );
      })}
    </div>
  );
}

function SymbolNode({
  node,
  defaultOpen,
  repoFullName,
  headSha,
}: {
  node: BlastMapNode;
  defaultOpen: boolean;
  repoFullName: string | null;
  headSha: string | null | undefined;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  const Chevron = open ? Icon.ChevronDown : Icon.ChevronRight;

  return (
    <div>
      <button style={s.nodeHeader} onClick={() => setOpen((v) => !v)}>
        <Chevron size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <Icon.Code size={14} style={{ color: "var(--accent-text)", flexShrink: 0 }} />
        <span className="mono" style={s.nodeName}>
          {node.name}()
        </span>
        <span style={s.nodeCount}>
          {node.callers.length} {node.callers.length === 1 ? "caller" : "callers"}
        </span>
      </button>

      {open && (
        <div style={s.nodeBody}>
          {node.callers.map((c) => {
            const label = `${c.file}:${c.line}`;
            const canLink = repoFullName != null && headSha != null;
            return (
              <div key={`${c.file}:${c.line}:${c.symbol}`} style={s.callerRow}>
                <Icon.CornerDownRight size={13} style={{ flexShrink: 0 }} />
                {canLink ? (
                  <MonoLink href={githubBlobUrl(repoFullName, headSha, c.file, c.line)}>
                    {label}
                  </MonoLink>
                ) : (
                  <span className="mono" style={s.callerNoLink}>
                    {label}
                  </span>
                )}
              </div>
            );
          })}

          {(node.endpoints.length > 0 || node.crons.length > 0) && (
            <div style={s.badgeRow}>
              {node.endpoints.map((e) => (
                <Badge
                  key={e}
                  mono
                  icon="Globe"
                  color="var(--accent-text)"
                  bg="var(--accent-bg, rgba(59,130,246,0.12))"
                >
                  {e}
                </Badge>
              ))}
              {node.crons.map((cr) => (
                <Badge
                  key={cr}
                  mono
                  icon="Clock"
                  color="var(--warning-text, #d97706)"
                  bg="var(--warning-bg, rgba(217,119,6,0.1))"
                >
                  {cr}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Human-readable explanation for a degraded map. */
function degradedLabel(reason: string | null): string {
  switch (reason) {
    case "flag_off":
      return "Repo intelligence is disabled — showing best-effort results.";
    case "index_partial":
      return "Index still building — showing partial results.";
    case "no_data":
    default:
      return "Index not built yet — showing best-effort results.";
  }
}
