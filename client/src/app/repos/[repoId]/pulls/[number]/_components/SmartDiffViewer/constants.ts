import type { SmartDiffRole } from "@devdigest/shared";

export const ROLE_META: Record<SmartDiffRole, { label: string; subtitle: string; color: string }> = {
  core: { label: "Core logic", subtitle: "The substance of the change — review closely", color: "var(--accent)" },
  wiring: { label: "Wiring", subtitle: "Hooks the core into the app", color: "var(--warn)" },
  boilerplate: { label: "Boilerplate", subtitle: "Generated / mechanical — skim", color: "var(--text-muted)" },
};

export const DEFAULT_EXPANDED: Record<SmartDiffRole, boolean> = {
  core: true,
  wiring: true,
  boilerplate: false,
};
