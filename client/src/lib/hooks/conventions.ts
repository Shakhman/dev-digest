/* hooks/conventions.ts — React Query hooks for the Conventions extractor (L02).
   Import directly via "@/lib/hooks/conventions". */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { ConventionCandidate, ConventionSkillDraft } from "@devdigest/shared";

export interface ExtractSummary {
  candidates: ConventionCandidate[];
  sample_count: number;
  proposed: number;
}

const listKey = (repoId: string) => ["conventions", repoId] as const;

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionCandidate[]>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
  });
}

export function useExtractConventions(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<ExtractSummary>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (data) => {
      qc.setQueryData(listKey(repoId), data.candidates);
    },
  });
}

export function useUpdateConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<ConventionCandidate, "rule" | "evidence_snippet" | "category" | "accepted">>;
    }) => api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (updated) => {
      qc.setQueryData<ConventionCandidate[]>(listKey(repoId), (prev) =>
        prev?.map((c) => (c.id === updated.id ? updated : c)),
      );
    },
  });
}

export function useRejectConvention(repoId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del<{ ok: boolean }>(`/conventions/${id}`),
    onSuccess: (_d, id) => {
      qc.setQueryData<ConventionCandidate[]>(listKey(repoId), (prev) =>
        prev?.filter((c) => c.id !== id),
      );
    },
  });
}

/** Lazy fetch of the merged-skill draft — enabled only while the modal is open. */
export function useConventionSkillDraft(repoId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["convention-skill-draft", repoId],
    queryFn: () => api.get<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill-draft`),
    enabled: enabled && !!repoId,
    staleTime: 0,
    gcTime: 0,
  });
}
