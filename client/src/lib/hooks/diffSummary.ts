/* hooks/diffSummary.ts — React Query hook for Smart Diff `pseudocode_summary`
   generation. Import directly via "@/lib/hooks/diffSummary" or via "@/lib/hooks". */
"use client";

import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { DiffSummaryResponse } from "@devdigest/shared";

/**
 * Fetches the cached Smart Diff file summaries from GET /pulls/:prId/diff-summary
 * and exposes a `generate(path)` mutation that hits POST /pulls/:prId/diff-summary
 * with `{ paths: [path] }` — the same endpoint covers both first-generation and
 * regeneration, now scoped to a single file per the per-file trigger UX. Calling
 * `generate()` with no path is kept for backward compatibility (full-PR batch)
 * but is no longer exposed by the UI.
 *
 * 404 is the normal pre-generation state — never an error to surface to the
 * user (mirrors `useBrief`/`useIntent`). The GET only ever reads the cache;
 * there is no auto-generate-on-mount/refetch — generation only ever happens
 * via the explicit `generate()` call (cost control).
 */
export function useDiffSummary(prId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["diff-summary", prId];

  const { data, isError, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get<DiffSummaryResponse>(`/pulls/${prId}/diff-summary`),
    enabled: !!prId,
    retry: false,
  });

  const hasSummaries = !!data && !isError;

  // Tracks the single path currently generating (per-file loading state) —
  // `null` when idle or when a legacy full-batch generate() was triggered.
  const [generatingPath, setGeneratingPath] = React.useState<string | null>(null);

  const {
    mutate: generateMutate,
    isPending: isGenerating,
    isError: generateFailed,
    reset: resetGenerateError,
  } = useMutation({
    mutationFn: (paths?: string[]) =>
      api.post<DiffSummaryResponse>(`/pulls/${prId}/diff-summary`, paths ? { paths } : undefined),
    onSuccess: (newSummary) => {
      // Write straight into the cache so the UI reflects the fresh summaries
      // immediately, without an extra GET round-trip.
      queryClient.setQueryData(queryKey, newSummary);
    },
    onSettled: () => setGeneratingPath(null),
  });

  const generate = (path?: string) => {
    setGeneratingPath(path ?? null);
    generateMutate(path ? [path] : undefined);
  };

  // Build a Map<path, summary> for the viewer to merge into file rows.
  const summaryByPath = React.useMemo(() => {
    const map = new Map<string, string>();
    if (hasSummaries) {
      for (const s of data.summaries) map.set(s.path, s.summary);
    }
    return map;
  }, [hasSummaries, data]);

  return {
    summaryByPath,
    hasSummaries,
    isStale: hasSummaries ? data.stale : false,
    generate: prId ? generate : undefined,
    isGenerating,
    /** The single path currently in flight — drives per-row loading state
     *  (`generatingPath === file.path`). `null` when nothing is generating. */
    generatingPath,
    /** True after the generate/regenerate mutation has failed — clears on the
     *  next `generate()` call or `resetGenerateError()`. */
    generateFailed,
    resetGenerateError,
  };
}
