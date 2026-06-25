/* hooks/intent.ts — React Query hook for the extracted PR Intent.
   Import directly via "@/lib/hooks/intent" or via "@/lib/hooks". */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type { Intent } from "@devdigest/shared";

/**
 * Fetches the extracted PR intent from GET /pulls/:prId/intent and exposes a
 * `recompute()` mutation that hits POST /pulls/:prId/intent/recompute.
 *
 * 404 is the normal pre-extraction state — never an error to surface to the
 * user. `hasIntent` is true only when data is present and no error occurred.
 */
export function useIntent(prId: string | null | undefined) {
  const queryClient = useQueryClient();
  const queryKey = ["pr-intent", prId];

  const { data, isError } = useQuery({
    queryKey,
    queryFn: () => api.get<Intent>(`/pulls/${prId}/intent`),
    enabled: !!prId,
    retry: false,
  });

  const { mutate: recompute, isPending: isRecomputing } = useMutation({
    mutationFn: () => api.post<Intent>(`/pulls/${prId}/intent/recompute`),
    onSuccess: (newIntent) => {
      // Update the cache directly so the UI reflects the new data immediately
      // without an extra GET round-trip.
      queryClient.setQueryData(queryKey, newIntent);
    },
  });

  return {
    data,
    hasIntent: !!data && !isError,
    recompute: prId ? recompute : undefined,
    isRecomputing,
  };
}
