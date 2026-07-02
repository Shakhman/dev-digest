/* hooks/context-docs.ts — React Query hooks for the Project Context feature.
   Agent & skill context-doc attachment, effective-context preview. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ContextDocLink, EffectiveContextDoc } from "@devdigest/shared";

// ---- Agent context docs (GET/PUT /agents/:id/context-docs) ----

export function useAgentContextDocs(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-context-docs", agentId],
    queryFn: () => api.get<ContextDocLink[]>(`/agents/${agentId}/context-docs`),
    enabled: !!agentId,
  });
}

export function useSetAgentContextDocs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ agentId, paths }: { agentId: string; paths: string[] }) =>
      api.put<ContextDocLink[]>(`/agents/${agentId}/context-docs`, { paths }),
    // Optimistic update: cancel in-flight fetches, snapshot the previous cache
    // value, and write the new ordered list into the cache immediately so the
    // UI reflects the reorder/toggle before the round trip completes.
    onMutate: async ({ agentId, paths }) => {
      const queryKey = ["agent-context-docs", agentId];
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<ContextDocLink[]>(queryKey);
      const optimistic: ContextDocLink[] = paths.map((path, order) => ({
        path,
        order,
        missing: previous?.find((l) => l.path === path)?.missing ?? false,
      }));
      qc.setQueryData<ContextDocLink[]>(queryKey, optimistic);
      return { previous, queryKey };
    },
    // Roll back to the snapshot on failure.
    onError: (_err, _vars, context) => {
      if (context) {
        qc.setQueryData(context.queryKey, context.previous);
      }
    },
    // Invalidate on BOTH success and error (INSIGHTS.md: use onSettled to avoid
    // stale optimistic state after a failed mutation).
    onSettled: (_d, _err, { agentId }) => {
      qc.invalidateQueries({ queryKey: ["agent-context-docs", agentId] });
    },
  });
}

// ---- Agent effective-context preview (GET /agents/:id/effective-context) ----

export function useAgentEffectiveContext(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-effective-context", agentId],
    queryFn: () => api.get<EffectiveContextDoc[]>(`/agents/${agentId}/effective-context`),
    enabled: !!agentId,
  });
}

// ---- Skill context docs (GET/PUT /skills/:id/context-docs) ----

export function useSkillContextDocs(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-context-docs", skillId],
    queryFn: () => api.get<ContextDocLink[]>(`/skills/${skillId}/context-docs`),
    enabled: !!skillId,
  });
}

export function useSetSkillContextDocs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ skillId, paths }: { skillId: string; paths: string[] }) =>
      api.put<ContextDocLink[]>(`/skills/${skillId}/context-docs`, { paths }),
    // Optimistic update: cancel in-flight fetches, snapshot the previous cache
    // value, and write the new ordered list into the cache immediately so the
    // UI reflects the reorder/toggle before the round trip completes.
    onMutate: async ({ skillId, paths }) => {
      const queryKey = ["skill-context-docs", skillId];
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<ContextDocLink[]>(queryKey);
      const optimistic: ContextDocLink[] = paths.map((path, order) => ({
        path,
        order,
        missing: previous?.find((l) => l.path === path)?.missing ?? false,
      }));
      qc.setQueryData<ContextDocLink[]>(queryKey, optimistic);
      return { previous, queryKey };
    },
    // Roll back to the snapshot on failure.
    onError: (_err, _vars, context) => {
      if (context) {
        qc.setQueryData(context.queryKey, context.previous);
      }
    },
    // Invalidate on both success and error (INSIGHTS.md: onSettled).
    onSettled: (_d, _err, { skillId }) => {
      qc.invalidateQueries({ queryKey: ["skill-context-docs", skillId] });
    },
  });
}
