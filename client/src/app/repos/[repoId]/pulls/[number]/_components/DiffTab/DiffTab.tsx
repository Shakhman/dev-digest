"use client";

import React from "react";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import { usePrComments, useCreatePrComment, useSmartDiff } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile, ReviewRecord } from "@devdigest/shared";
import { SmartDiffViewer } from "../SmartDiffViewer";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  reviews: ReviewRecord[];
  onFindingClick: (findingId: string) => void;
  repoFullName: string | null;
  headSha: string | null;
}

export function DiffTab({ prId, filesCount, files, canComment, reviews, onFindingClick, repoFullName, headSha }: DiffTabProps) {
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  const { data: smartDiff } = useSmartDiff(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);
  const [viewMode, setViewMode] = React.useState<"smart" | "original">("smart");

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {smartDiff && (
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Button
                  kind={viewMode === "smart" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("smart")}
                >
                  Smart order
                </Button>
                <Button
                  kind={viewMode === "original" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("original")}
                >
                  Original order
                </Button>
              </div>
            )}
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
          </div>
        }
      >
        Files changed · {filesCount} files
      </SectionLabel>

      {viewMode === "smart" && smartDiff ? (
        <SmartDiffViewer
          smartDiff={smartDiff}
          prFiles={files}
          reviews={reviews}
          onFindingClick={onFindingClick}
          repoFullName={repoFullName}
          headSha={headSha}
        />
      ) : (
        <DiffViewer files={files} commenting={commenting} />
      )}
    </section>
  );
}
