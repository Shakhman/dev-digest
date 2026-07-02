/* hooks/brief.ts — React Query hook for the PR Brief (SPEC-09 Why+Risk Brief).
   Import directly via "@/lib/hooks/brief" or via "@/lib/hooks". */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { PrBrief } from "@devdigest/shared";

/**
 * Route response envelope (server): the cached `PrBrief` plus generation
 * metadata — staleness vs. the PR's current HEAD, the model call's own
 * reported cost/tokens, and which input sections were absent/degraded when
 * it was generated. Never hand-duplicate `PrBrief` here — it's imported from
 * `@devdigest/shared`.
 */
export interface BriefResponse extends PrBrief {
  stale: boolean;
  cost_usd: number | null;
  tokens_in: number;
  tokens_out: number;
  missing_sections: string[];
}

/** Cost/token readout, shaped for `formatCost` + a simple "in→out" display. */
export interface BriefCost {
  costUsd: number | null;
  tokensIn: number;
  tokensOut: number;
}

/**
 * Fetches the cached PR brief from GET /pulls/:prId/brief and exposes a
 * `generate()` mutation that hits POST /pulls/:prId/brief — the same endpoint
 * covers both first-generation and regeneration.
 *
 * 404 is the normal pre-generation state — never an error to surface to the
 * user (mirrors `useIntent`). The GET only ever reads the cache; there is no
 * auto-generate-on-mount/refetch behavior — generation only ever happens via
 * the explicit `generate()` call (AC-9).
 */
export function useBrief(prId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["pr-brief", prId];

  const { data, isError, isLoading } = useQuery({
    queryKey,
    queryFn: () => api.get<BriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
    retry: false,
  });

  const hasBrief = !!data && !isError;

  const {
    mutate: generate,
    isPending: isGenerating,
    isError: generateFailed,
    reset: resetGenerateError,
  } = useMutation({
    mutationFn: () => api.post<BriefResponse>(`/pulls/${prId}/brief`),
    onSuccess: (newBrief) => {
      // Write straight into the cache so the UI reflects the fresh brief
      // immediately, without an extra GET round-trip.
      queryClient.setQueryData(queryKey, newBrief);
    },
  });

  const cost: BriefCost | undefined = hasBrief
    ? { costUsd: data.cost_usd, tokensIn: data.tokens_in, tokensOut: data.tokens_out }
    : undefined;

  return {
    brief: hasBrief ? data : undefined,
    hasBrief,
    /** True only while the initial GET is in flight — distinct from `hasBrief
     *  === false`, so the card can show a loading skeleton instead of flashing
     *  the "Generate Brief" CTA before the cache read resolves. */
    isLoading,
    isStale: hasBrief ? data.stale : false,
    missingSections: hasBrief ? data.missing_sections : [],
    cost,
    generate: prId ? generate : undefined,
    isGenerating,
    /** True after the generate/regenerate mutation has failed — drives the
     *  retryable "couldn't generate — retry" card state. Cleared by calling
     *  `generate()` again or `resetGenerateError()`. */
    generateFailed,
    resetGenerateError,
  };
}
