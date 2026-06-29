/* BlastGraph — the "Graph" view of the Blast Radius map. Renders the SAME
   BlastMap data as BlastCard's tree, as a dependency-free SVG node-link graph:
   callers (inbound) → changed symbols (the hub) → endpoints/crons (outbound).
   Caller nodes deep-link to the file:line on GitHub, exactly like the tree. */
"use client";

import React from "react";
import type { BlastMapNode } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";

interface BlastGraphProps {
  symbols: BlastMapNode[];
  repoFullName: string | null;
  headSha: string | null | undefined;
}

// --- layout constants (SVG user units; the viewBox scales to the container) ---
const COL_X = { caller: 16, symbol: 286, sink: 524 };
const COL_W = { caller: 168, symbol: 156, sink: 188 };
const NODE_H = 26;
const ROW_GAP = 12;
const PAD_Y = 14;
const VIEW_W = 728;
const MAX_PER_COL = 12;

type Kind = "caller" | "symbol" | "endpoint" | "cron";

interface GNode {
  id: string;
  col: "caller" | "symbol" | "sink";
  kind: Kind;
  label: string;
  title: string;
  href?: string;
  x: number;
  y: number;
  w: number;
}

const COLORS: Record<Kind, { fg: string; bg: string; stroke: string }> = {
  caller: { fg: "var(--text-secondary)", bg: "var(--bg-hover)", stroke: "var(--border)" },
  symbol: { fg: "var(--accent-text)", bg: "var(--accent-bg, rgba(59,130,246,0.12))", stroke: "var(--accent-text)" },
  endpoint: { fg: "var(--accent-text)", bg: "var(--accent-bg, rgba(59,130,246,0.12))", stroke: "var(--border)" },
  cron: { fg: "var(--warning-text, #d97706)", bg: "var(--warning-bg, rgba(217,119,6,0.1))", stroke: "var(--border)" },
};

/** Truncate a label to roughly fit a node width (mono ~7px/char). */
function fit(text: string, width: number): string {
  const max = Math.floor((width - 20) / 7);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

/** Lay one column out vertically, centered in the available height. */
function placeColumn<T>(items: T[], colHeight: number, totalHeight: number): number[] {
  const top = PAD_Y + Math.max(0, (totalHeight - colHeight)) / 2;
  return items.map((_, i) => top + i * (NODE_H + ROW_GAP));
}

export function BlastGraph({ symbols, repoFullName, headSha }: BlastGraphProps) {
  const { nodes, edges, height } = React.useMemo(
    () => buildGraph(symbols, repoFullName, headSha),
    [symbols, repoFullName, headSha],
  );

  return (
    <div style={{ overflowX: "auto", paddingTop: 4 }}>
      <svg
        viewBox={`0 0 ${VIEW_W} ${height}`}
        width="100%"
        style={{ minWidth: 520, display: "block" }}
        role="img"
        aria-label="Blast radius graph: callers, changed symbols, and reachable endpoints"
      >
        {/* Edges (behind nodes) */}
        {edges.map((e, i) => {
          const from = nodes.find((n) => n.id === e.from)!;
          const to = nodes.find((n) => n.id === e.to)!;
          const x1 = from.x + from.w;
          const y1 = from.y + NODE_H / 2;
          const x2 = to.x;
          const y2 = to.y + NODE_H / 2;
          const dx = Math.max(30, (x2 - x1) / 2);
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="var(--border)"
              strokeWidth={1.25}
              opacity={0.8}
            />
          );
        })}

        {/* Nodes */}
        {nodes.map((n) => (
          <GraphNode key={n.id} node={n} />
        ))}
      </svg>
    </div>
  );
}

function GraphNode({ node }: { node: GNode }) {
  const c = COLORS[node.kind];
  const rect = (
    <g style={node.href ? { cursor: "pointer" } : undefined}>
      <title>{node.title}</title>
      <rect
        x={node.x}
        y={node.y}
        width={node.w}
        height={NODE_H}
        rx={6}
        fill={c.bg}
        stroke={c.stroke}
        strokeWidth={node.kind === "symbol" ? 1.5 : 1}
      />
      <text
        x={node.x + 10}
        y={node.y + NODE_H / 2 + 4}
        fontSize={11.5}
        fontFamily="var(--font-mono, ui-monospace, monospace)"
        fill={c.fg}
        style={{ textDecoration: node.href ? "underline" : "none" }}
      >
        {node.label}
      </text>
    </g>
  );

  if (node.href) {
    return (
      <a href={node.href} target="_blank" rel="noopener noreferrer">
        {rect}
      </a>
    );
  }
  return rect;
}

interface GEdge {
  from: string;
  to: string;
}

function buildGraph(
  symbols: BlastMapNode[],
  repoFullName: string | null,
  headSha: string | null | undefined,
): { nodes: GNode[]; edges: GEdge[]; height: number } {
  const canLink = repoFullName != null && headSha != null;

  // Dedupe each column; remember which ids each symbol links to.
  const callerMap = new Map<string, { file: string; line: number }>();
  const sinkMap = new Map<string, Kind>();
  const symbolIds: string[] = [];
  const edges: GEdge[] = [];

  for (const s of symbols) {
    const sid = `sym:${s.file}:${s.name}`;
    symbolIds.push(sid);
    for (const cal of s.callers) {
      const cid = `cal:${cal.file}:${cal.line}`;
      if (!callerMap.has(cid)) callerMap.set(cid, { file: cal.file, line: cal.line });
      edges.push({ from: cid, to: sid });
    }
    for (const ep of s.endpoints) {
      const eid = `ep:${ep}`;
      sinkMap.set(eid, "endpoint");
      edges.push({ from: sid, to: eid });
    }
    for (const cr of s.crons) {
      const kid = `cr:${cr}`;
      sinkMap.set(kid, "cron");
      edges.push({ from: sid, to: kid });
    }
  }

  // Apply per-column caps with a "+N more" overflow node.
  const callerEntries = cap([...callerMap.entries()]);
  const sinkEntries = cap([...sinkMap.entries()]);
  const symbolCap = cap(symbolIds.map((id) => [id, id] as const));

  const colCount = (n: number) => n * NODE_H + Math.max(0, n - 1) * ROW_GAP;
  const callerRows = callerEntries.kept.length + (callerEntries.overflow > 0 ? 1 : 0);
  const symbolRows = symbolCap.kept.length + (symbolCap.overflow > 0 ? 1 : 0);
  const sinkRows = sinkEntries.kept.length + (sinkEntries.overflow > 0 ? 1 : 0);
  const maxRows = Math.max(callerRows, symbolRows, sinkRows, 1);
  const height = PAD_Y * 2 + colCount(maxRows);
  const inner = colCount(maxRows);

  const nodes: GNode[] = [];

  // Callers (left, inbound).
  const callerYs = placeColumn(Array(callerRows).fill(0), colCount(callerRows), inner);
  callerEntries.kept.forEach(([id, info], i) => {
    const label = `${basename(info.file)}:${info.line}`;
    nodes.push({
      id,
      col: "caller",
      kind: "caller",
      label: fit(label, COL_W.caller),
      title: `${info.file}:${info.line}`,
      href: canLink ? githubBlobUrl(repoFullName!, headSha!, info.file, info.line) : undefined,
      x: COL_X.caller,
      y: callerYs[i]!,
      w: COL_W.caller,
    });
  });
  if (callerEntries.overflow > 0) {
    nodes.push(overflowNode("cal:more", "caller", "caller", COL_X.caller, COL_W.caller, callerYs[callerEntries.kept.length]!, callerEntries.overflow));
  }

  // Changed symbols (middle, the hub).
  const symbolYs = placeColumn(Array(symbolRows).fill(0), colCount(symbolRows), inner);
  symbolCap.kept.forEach(([id], i) => {
    const s = symbols.find((x) => `sym:${x.file}:${x.name}` === id)!;
    nodes.push({
      id,
      col: "symbol",
      kind: "symbol",
      label: fit(`${s.name}()`, COL_W.symbol),
      title: `${s.name} — ${s.file}`,
      x: COL_X.symbol,
      y: symbolYs[i]!,
      w: COL_W.symbol,
    });
  });
  if (symbolCap.overflow > 0) {
    nodes.push(overflowNode("sym:more", "symbol", "symbol", COL_X.symbol, COL_W.symbol, symbolYs[symbolCap.kept.length]!, symbolCap.overflow));
  }

  // Endpoints + crons (right, outbound).
  const sinkYs = placeColumn(Array(sinkRows).fill(0), colCount(sinkRows), inner);
  sinkEntries.kept.forEach(([id, kind], i) => {
    const raw = id.startsWith("ep:") ? id.slice(3) : id.slice(3);
    nodes.push({
      id,
      col: "sink",
      kind,
      label: fit(raw, COL_W.sink),
      title: raw,
      x: COL_X.sink,
      y: sinkYs[i]!,
      w: COL_W.sink,
    });
  });
  if (sinkEntries.overflow > 0) {
    nodes.push(overflowNode("sink:more", "sink", "endpoint", COL_X.sink, COL_W.sink, sinkYs[sinkEntries.kept.length]!, sinkEntries.overflow));
  }

  // Drop edges pointing at capped-away nodes so we never reference a missing
  // node (the `live` set holds only kept + overflow nodes).
  const live = new Set(nodes.map((n) => n.id));
  const liveEdges = edges.filter((e) => live.has(e.from) && live.has(e.to));

  return { nodes, edges: liveEdges, height };
}

function cap<T extends readonly [string, unknown]>(entries: T[]): { kept: T[]; overflow: number } {
  if (entries.length <= MAX_PER_COL) return { kept: entries, overflow: 0 };
  return { kept: entries.slice(0, MAX_PER_COL), overflow: entries.length - MAX_PER_COL };
}

function overflowNode(
  id: string,
  col: GNode["col"],
  kind: Kind,
  x: number,
  w: number,
  y: number,
  n: number,
): GNode {
  return { id, col, kind, label: `+${n} more`, title: `${n} more`, x, y, w };
}
