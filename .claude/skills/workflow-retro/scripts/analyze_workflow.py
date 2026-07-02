#!/usr/bin/env python3
"""Deterministic post-mortem for a multi-agent Claude Code workflow.

Reads the session transcript JSONL (main session + its subagents) and emits a
reproducible retrospective: token spend per session, agents launched, launch
order, a sequential-vs-parallel timeline, per-agent tool histograms, and a set
of health/efficiency signals (cache-hit ratio, error/retry counts, rework,
cross-agent file overlap, "stuck" repeated calls).

Zero model calls — the report is a pure function of the transcript, so the same
session always produces the same numbers.

Transcript layout (Claude Code):
  ~/.claude/projects/<project-hash>/<sessionId>.jsonl          # main session
  ~/.claude/projects/<project-hash>/<sessionId>/subagents/
        agent-<id>.jsonl        # one per launched subagent
        agent-<id>.meta.json    # {agentType, description, toolUseId, ...}

Usage:
  analyze_workflow.py                      # auto: project from cwd, newest session
  analyze_workflow.py --session <id>
  analyze_workflow.py --project-dir <path>
  analyze_workflow.py --ledger-line        # print one compact line (for the ledger)
  analyze_workflow.py --json               # structured output instead of markdown
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from glob import glob

# A repeated identical tool call this many times in one agent = a "stuck" signal.
STUCK_THRESHOLD = 3
# Tool names that mutate files (used for cross-agent overlap detection).
WRITE_TOOLS = {"Edit", "Write", "NotebookEdit", "MultiEdit"}


def parse_ts(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None


def iter_jsonl(path):
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue


def project_dir_from_cwd(cwd):
    """Claude Code encodes the project path by replacing every '/' with '-'."""
    encoded = cwd.replace("/", "-")
    return os.path.join(os.path.expanduser("~/.claude/projects"), encoded)


def newest_session(project_dir):
    """Newest top-level <sessionId>.jsonl — that's the live/just-finished session."""
    candidates = [
        p for p in glob(os.path.join(project_dir, "*.jsonl"))
        if os.path.isfile(p)
    ]
    if not candidates:
        return None
    newest = max(candidates, key=os.path.getmtime)
    return os.path.splitext(os.path.basename(newest))[0]


def analyze_transcript(path):
    """Pull deterministic metrics out of one transcript file (main or subagent)."""
    tok = Counter()           # input/output/cache_read/cache_creation
    tools = Counter()         # tool_use name -> count
    models = set()
    call_sig = Counter()      # (name, signature) -> count, for stuck detection
    files_written = set()
    errors = 0
    permission_denied = 0
    first_ts = last_ts = None
    assistant_turns = 0

    for entry in iter_jsonl(path):
        ts = parse_ts(entry.get("timestamp"))
        if ts:
            first_ts = ts if first_ts is None or ts < first_ts else first_ts
            last_ts = ts if last_ts is None or ts > last_ts else last_ts

        msg = entry.get("message") or {}
        etype = entry.get("type")

        if etype == "assistant":
            model = msg.get("model")
            usage = msg.get("usage") or {}
            # Skip synthetic / usage-less turns (no real token spend).
            if model and model != "<synthetic>" and usage:
                models.add(model)
                assistant_turns += 1
                tok["input"] += usage.get("input_tokens", 0) or 0
                tok["output"] += usage.get("output_tokens", 0) or 0
                tok["cache_read"] += usage.get("cache_read_input_tokens", 0) or 0
                tok["cache_creation"] += usage.get("cache_creation_input_tokens", 0) or 0

        content = msg.get("content")
        if isinstance(content, list):
            for item in content:
                if not isinstance(item, dict):
                    continue
                itype = item.get("type")
                if itype == "tool_use":
                    name = item.get("name", "?")
                    tools[name] += 1
                    inp = item.get("input") or {}
                    sig = inp.get("command") or inp.get("file_path") or inp.get("pattern") or ""
                    call_sig[(name, str(sig)[:200])] += 1
                    if name in WRITE_TOOLS:
                        fp = inp.get("file_path")
                        if fp:
                            files_written.add(fp)
                elif itype == "tool_result":
                    if item.get("is_error"):
                        errors += 1
                        text = json.dumps(item.get("content", ""))[:500].lower()
                        if "permission" in text or "denied" in text:
                            permission_denied += 1

    duration_s = None
    if first_ts and last_ts:
        duration_s = (last_ts - first_ts).total_seconds()

    stuck = {
        f"{name}: {sig}": n
        for (name, sig), n in call_sig.items()
        if n >= STUCK_THRESHOLD and name not in WRITE_TOOLS
    }

    return {
        "tokens": dict(tok),
        # Total tokens the model actually processed (all four components). Cache
        # reads/writes are billed at reduced rates, but they're still real spend,
        # so excluding them would understate the run.
        "total_tokens": tok["input"] + tok["output"] + tok["cache_read"] + tok["cache_creation"],
        "tools": dict(tools),
        "tool_calls": sum(tools.values()),
        "models": sorted(models),
        "errors": errors,
        "permission_denied": permission_denied,
        "files_written": sorted(files_written),
        "first_ts": first_ts.isoformat() if first_ts else None,
        "last_ts": last_ts.isoformat() if last_ts else None,
        "duration_s": duration_s,
        "assistant_turns": assistant_turns,
        "stuck": stuck,
    }


def cache_hit_ratio(tok):
    read = tok.get("cache_read", 0)
    fresh = tok.get("input", 0) + tok.get("cache_creation", 0)
    denom = read + fresh
    return (read / denom) if denom else 0.0


def collect(project_dir, session_id):
    main_path = os.path.join(project_dir, f"{session_id}.jsonl")
    if not os.path.isfile(main_path):
        raise FileNotFoundError(f"No transcript at {main_path}")

    main = analyze_transcript(main_path)

    agents = []
    sub_dir = os.path.join(project_dir, session_id, "subagents")
    for meta_path in sorted(glob(os.path.join(sub_dir, "agent-*.meta.json"))):
        agent_id = os.path.basename(meta_path)[: -len(".meta.json")]
        jsonl_path = os.path.join(sub_dir, f"{agent_id}.jsonl")
        if not os.path.isfile(jsonl_path):
            continue
        try:
            meta = json.load(open(meta_path, encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            meta = {}
        data = analyze_transcript(jsonl_path)
        data["agent_id"] = agent_id
        data["agent_type"] = meta.get("agentType") or "unknown"
        data["description"] = meta.get("description") or ""
        agents.append(data)

    # Launch order = earliest timestamp.
    agents.sort(key=lambda a: a["first_ts"] or "")
    return main, agents


def detect_parallelism(agents):
    """Return overlapping agent pairs and the parallelism factor."""
    intervals = []
    for a in agents:
        s, e = parse_ts(a["first_ts"]), parse_ts(a["last_ts"])
        if s and e:
            intervals.append((s, e, a["agent_type"]))
    overlaps = []
    for i in range(len(intervals)):
        for j in range(i + 1, len(intervals)):
            s1, e1, n1 = intervals[i]
            s2, e2, n2 = intervals[j]
            if s1 < e2 and s2 < e1:
                overlaps.append((n1, n2))
    # Parallelism factor: summed agent time / wall-clock union of intervals.
    summed = sum((e - s).total_seconds() for s, e, _ in intervals)
    if intervals:
        merged = []
        for s, e, _ in sorted(intervals):
            if merged and s <= merged[-1][1]:
                merged[-1] = (merged[-1][0], max(merged[-1][1], e))
            else:
                merged.append((s, e))
        union = sum((e - s).total_seconds() for s, e in merged)
        factor = (summed / union) if union else 1.0
    else:
        factor = 1.0
    return overlaps, factor


def fmt_dur(s):
    if s is None:
        return "?"
    if s < 60:
        return f"{s:.0f}s"
    return f"{s/60:.1f}m"


def fmt_int(n):
    return f"{n:,}"


def build_report(project_dir, session_id):
    main, agents = collect(project_dir, session_id)
    overlaps, factor = detect_parallelism(agents)

    grand_tokens = main["total_tokens"] + sum(a["total_tokens"] for a in agents)
    type_counts = Counter(a["agent_type"] for a in agents)
    rework = {t: n for t, n in type_counts.items() if n > 1}

    # Cross-agent file overlap (coordination risk among writers).
    writers = [(a["agent_type"], a["agent_id"], set(a["files_written"])) for a in agents if a["files_written"]]
    file_overlaps = []
    for i in range(len(writers)):
        for j in range(i + 1, len(writers)):
            shared = writers[i][2] & writers[j][2]
            if shared:
                file_overlaps.append((writers[i][0], writers[j][0], sorted(shared)))

    L = []
    L.append(f"# Workflow retro — `{session_id[:8]}`")
    L.append("")
    def agg(key):
        return main["tokens"].get(key, 0) + sum(a["tokens"].get(key, 0) for a in agents)
    t_in, t_out = agg("input"), agg("output")
    t_cr, t_cw = agg("cache_read"), agg("cache_creation")
    L.append(f"- **Agents launched:** {len(agents)}  ({', '.join(f'{n}× {t}' for t, n in type_counts.most_common())})")
    L.append(f"- **Tokens processed:** {fmt_int(grand_tokens)} total — "
             f"in {fmt_int(t_in)}, out {fmt_int(t_out)}, cache-read {fmt_int(t_cr)}, cache-write {fmt_int(t_cw)}")
    L.append(f"- **Parallelism factor:** {factor:.2f}×  (1.0 = fully sequential)")
    if main["first_ts"] and agents:
        all_ts = [parse_ts(main["first_ts"])] + [parse_ts(a["last_ts"]) for a in agents if a["last_ts"]]
        all_ts = [t for t in all_ts if t]
        if len(all_ts) >= 2:
            L.append(f"- **Wall-clock span:** {fmt_dur((max(all_ts)-min(all_ts)).total_seconds())}")
    L.append("")

    # Launch order / timeline
    L.append("## Launch order & timeline")
    L.append("")
    L.append("| # | Agent | Description | Tokens | Tool calls | Duration | Errors |")
    L.append("|---|-------|-------------|-------:|-----------:|---------:|-------:|")
    for idx, a in enumerate(agents, 1):
        desc = (a["description"][:48] + "…") if len(a["description"]) > 49 else a["description"]
        L.append(f"| {idx} | {a['agent_type']} | {desc} | {fmt_int(a['total_tokens'])} | {a['tool_calls']} | {fmt_dur(a['duration_s'])} | {a['errors']} |")
    L.append("")

    # Per-agent tool histogram + token share
    L.append("## Per-agent breakdown")
    L.append("")
    for a in agents:
        share = (a["total_tokens"] / grand_tokens * 100) if grand_tokens else 0
        hist = ", ".join(f"{n}× {name}" for name, n in Counter(a["tools"]).most_common()) or "—"
        L.append(f"- **{a['agent_type']}** ({a['agent_id'][:14]}) — {fmt_int(a['total_tokens'])} tok ({share:.0f}% of run), "
                 f"cache-hit {cache_hit_ratio(a['tokens'])*100:.0f}%, model {', '.join(a['models']) or '?'}")
        L.append(f"  - tools: {hist}")
        if a["stuck"]:
            for sig, n in a["stuck"].items():
                L.append(f"  - ⚠️ repeated {n}×: `{sig}`")
    L.append("")
    main_share = (main["total_tokens"] / grand_tokens * 100) if grand_tokens else 0
    L.append(f"- **orchestrator (main)** — {fmt_int(main['total_tokens'])} tok ({main_share:.0f}% of run), "
             f"cache-hit {cache_hit_ratio(main['tokens'])*100:.0f}%, {main['tool_calls']} tool calls")
    L.append("")

    # Health / efficiency signals
    L.append("## Health & efficiency signals")
    L.append("")
    total_errors = main["errors"] + sum(a["errors"] for a in agents)
    total_denied = main["permission_denied"] + sum(a["permission_denied"] for a in agents)
    L.append(f"- **Errors / failed tool results:** {total_errors}" + (f" (incl. {total_denied} permission-denied)" if total_denied else ""))
    if rework:
        L.append(f"- **Rework (role launched >1×):** " + ", ".join(f"{t} ×{n}" for t, n in rework.items())
                 + "  — iteration or a retried pass; check whether each pass was warranted.")
    else:
        L.append("- **Rework:** none (each role launched once).")
    if file_overlaps:
        for t1, t2, shared in file_overlaps:
            files = ", ".join(os.path.basename(f) for f in shared[:4]) + ("…" if len(shared) > 4 else "")
            L.append(f"- **⚠️ File overlap:** `{t1}` and `{t2}` both wrote: {files} — possible duplicated effort / merge risk.")
    else:
        L.append("- **File overlap between agents:** none.")
    stuck_agents = [a["agent_type"] for a in agents if a["stuck"]]
    if stuck_agents:
        L.append(f"- **⚠️ Stuck signal:** repeated identical calls in {', '.join(stuck_agents)} (see breakdown).")
    # Deterministic superlatives — each on its own axis so none is misleading.
    if agents:
        most_errors = max(agents, key=lambda a: a["errors"])
        longest = max(agents, key=lambda a: a["duration_s"] or 0)
        biggest = max(agents, key=lambda a: a["total_tokens"])
        if most_errors["errors"] > 0:
            L.append(f"- **Most error-prone agent:** {most_errors['agent_type']} ({most_errors['errors']} errors) — likely where it struggled.")
        L.append(f"- **Longest-running agent:** {longest['agent_type']} ({fmt_dur(longest['duration_s'])}).")
        L.append(f"- **Largest token consumer (sub-agent):** {biggest['agent_type']} ({fmt_int(biggest['total_tokens'])} tok).")
    L.append("")
    L.append("_Signals are deterministic proxies, not judgments: high errors/duration/repeats hint at where an agent struggled; "
             "file overlap and rework hint at duplicated effort. Read the flagged transcripts to confirm._")

    return "\n".join(L), main, agents, grand_tokens, type_counts


def abbrev_role(t):
    """Compact but collision-free role tag (planner vs plan-verifier)."""
    parts = t.split("-")
    if len(parts) == 1:
        return parts[0][:5]
    return parts[0][:4] + "-" + "".join(p[0] for p in parts[1:])


def ledger_line(session_id, main, agents, grand_tokens, type_counts):
    when = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    roles = "+".join(f"{n}{abbrev_role(t)}" for t, n in type_counts.most_common())
    total_errors = main["errors"] + sum(a["errors"] for a in agents)
    return (f"| {when} | `{session_id[:8]}` | {len(agents)} | {roles} | "
            f"{fmt_int(grand_tokens)} | {total_errors} |")


LEDGER_HEADER = (
    "# Workflow retro ledger\n\n"
    "Append-only. One row per multi-agent workflow run, newest at the bottom.\n"
    "Generated by `.claude/skills/workflow-retro`.\n\n"
    "| When (UTC) | Session | Agents | Roles | Tokens processed | Errors |\n"
    "|------------|---------|-------:|-------|-----------------:|-------:|\n"
)


def append_to_ledger(path, line):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fresh = not os.path.isfile(path) or os.path.getsize(path) == 0
    with open(path, "a", encoding="utf-8") as fh:
        if fresh:
            fh.write(LEDGER_HEADER)
        fh.write(line + "\n")


def main_cli():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--session", help="Session id (default: newest in project dir)")
    ap.add_argument("--project-dir", help="~/.claude/projects/<hash> (default: derived from cwd)")
    ap.add_argument("--cwd", default=os.getcwd(), help="Project cwd used to locate transcripts")
    ap.add_argument("--ledger-line", action="store_true", help="Print one compact ledger row only")
    ap.add_argument("--append-ledger", metavar="PATH", help="Append the ledger row to PATH (creates it with a header if missing)")
    ap.add_argument("--json", action="store_true", help="Emit structured JSON instead of markdown")
    args = ap.parse_args()

    project_dir = args.project_dir or project_dir_from_cwd(args.cwd)
    if not os.path.isdir(project_dir):
        sys.exit(f"error: project transcript dir not found: {project_dir}")
    session_id = args.session or newest_session(project_dir)
    if not session_id:
        sys.exit(f"error: no session transcript found in {project_dir}")

    report, main, agents, grand_tokens, type_counts = build_report(project_dir, session_id)
    line = ledger_line(session_id, main, agents, grand_tokens, type_counts)

    if args.append_ledger:
        append_to_ledger(args.append_ledger, line)

    if args.ledger_line:
        print(line)
        return
    if args.json:
        print(json.dumps({"session": session_id, "main": main, "agents": agents,
                          "grand_tokens": grand_tokens}, indent=2, default=str))
        return
    print(report)
    if args.append_ledger:
        print(f"\n_Appended to {args.append_ledger}_")


if __name__ == "__main__":
    main_cli()
