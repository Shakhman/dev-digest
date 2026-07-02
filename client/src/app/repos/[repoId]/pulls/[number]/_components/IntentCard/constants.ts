import type { IconName } from "@devdigest/ui";
import type { RiskSeverity } from "@devdigest/shared";

export const SEVERITY_COLOR: Record<RiskSeverity, string> = {
  high: "var(--crit)",
  medium: "var(--warn)",
  low: "var(--ok)",
};

// Ordered: first match wins. Tests both `kind` and `title` text.
const KIND_ICON_PATTERNS: Array<[RegExp, IconName]> = [
  [/auth|security|credential|secret|token|permission|access|privilege/i, "Shield"],
  [/depend|package|import|module|library|npm|install|bundle/i, "Boxes"],
  [/perf|latency|speed|redis|cache|round.trip|throughput|slow/i, "Zap"],
  [/api|endpoint|route|http|request|response|webhook/i, "Globe"],
  [/database|schema|migration|sql|query|db\b/i, "Database"],
  [/type|interface|contract|breaking|compat/i, "Code"],
  [/cpu|memory|resource|leak/i, "Cpu"],
  [/test|coverage/i, "FlaskConical"],
];

export function getKindIcon(kind: string, title: string): IconName {
  const text = `${kind} ${title}`;
  for (const [pattern, icon] of KIND_ICON_PATTERNS) {
    if (pattern.test(text)) return icon;
  }
  return "AlertTriangle";
}
