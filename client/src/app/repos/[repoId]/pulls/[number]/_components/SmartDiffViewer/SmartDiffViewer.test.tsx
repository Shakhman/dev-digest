import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, SmartDiff } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { SmartDiffViewer } from "./SmartDiffViewer";

// SmartDiffViewer reads/generates summaries through useDiffSummary — mock it
// so the test drives the pre/post-generation states directly (the hook's own
// GET/POST wiring is covered by mirroring `useBrief`'s established pattern).
const useDiffSummary = vi.fn();
vi.mock("@/lib/hooks/diffSummary", () => ({ useDiffSummary: () => useDiffSummary() }));

afterEach(() => {
  cleanup();
  useDiffSummary.mockReset();
});

const SMART_DIFF: SmartDiff = {
  groups: [
    {
      role: "core",
      files: [
        { path: "src/foo.ts", pseudocode_summary: null, additions: 3, deletions: 1, finding_lines: [] },
        { path: "src/bar.ts", pseudocode_summary: null, additions: 2, deletions: 0, finding_lines: [] },
      ],
    },
  ],
  split_suggestion: { too_big: false, total_lines: 6, proposed_splits: [] },
};

// Both files have a real patch — the per-file "Summary" trigger is disabled
// when `patch == null` (nothing to summarize), so give both a patch here.
const PR_FILES: PrFile[] = [
  { path: "src/foo.ts", additions: 3, deletions: 1, patch: "@@ -1 +1,3 @@\n+foo" },
  { path: "src/bar.ts", additions: 2, deletions: 0, patch: "@@ -1 +1,2 @@\n+bar" },
];

function renderViewer() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <SmartDiffViewer
        smartDiff={SMART_DIFF}
        prFiles={PR_FILES}
        reviews={[]}
        onFindingClick={() => {}}
        repoFullName={null}
        headSha={null}
        prId="pr1"
      />
    </NextIntlClientProvider>,
  );
}

/** Scope queries to the row that owns `filePath`'s collapsed header. */
function rowHeaderFor(filePath: string) {
  const pathEl = screen.getByText(filePath);
  // filePath span -> fileNameWrap div -> fileHeader div (the row's clickable header).
  const fileNameWrap = pathEl.closest("div");
  const fileHeader = fileNameWrap?.parentElement;
  if (!fileHeader) throw new Error(`Could not locate file header for ${filePath}`);
  return fileHeader as HTMLElement;
}

describe("SmartDiffViewer — per-file pseudocode summary generation", () => {
  it("each file row has its own trigger; clicking one only loads/shows that file's row", () => {
    const generate = vi.fn();

    // Pre-generation: both rows show an idle "Summary" trigger, no bodies.
    useDiffSummary.mockReturnValue({
      summaryByPath: new Map(),
      generate,
      generatingPath: null,
    });
    const { rerender } = renderViewer();

    expect(screen.queryByText("What this does:")).not.toBeInTheDocument();
    const fooButton = within(rowHeaderFor("src/foo.ts")).getByRole("button", { name: /summary/i });
    const barButton = within(rowHeaderFor("src/bar.ts")).getByRole("button", { name: /summary/i });
    expect(fooButton).toHaveTextContent("Summary");
    expect(barButton).toHaveTextContent("Summary");

    // Click ONLY src/foo.ts's trigger.
    fireEvent.click(fooButton);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate).toHaveBeenCalledWith("src/foo.ts");

    // Simulate the hook now tracking src/foo.ts as in-flight — only ITS row
    // should show the loading state; src/bar.ts stays idle.
    useDiffSummary.mockReturnValue({
      summaryByPath: new Map(),
      generate,
      generatingPath: "src/foo.ts",
    });
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <SmartDiffViewer
          smartDiff={SMART_DIFF}
          prFiles={PR_FILES}
          reviews={[]}
          onFindingClick={() => {}}
          repoFullName={null}
          headSha={null}
          prId="pr1"
        />
      </NextIntlClientProvider>,
    );

    expect(within(rowHeaderFor("src/foo.ts")).getByRole("button")).toHaveTextContent("Generating…");
    expect(within(rowHeaderFor("src/bar.ts")).getByRole("button")).toHaveTextContent("Summary");

    // Simulate success: only src/foo.ts got a summary written into the cache.
    useDiffSummary.mockReturnValue({
      summaryByPath: new Map([["src/foo.ts", "Adds the foo helper."]]),
      generate,
      generatingPath: null,
    });
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <SmartDiffViewer
          smartDiff={SMART_DIFF}
          prFiles={PR_FILES}
          reviews={[]}
          onFindingClick={() => {}}
          repoFullName={null}
          headSha={null}
          prId="pr1"
        />
      </NextIntlClientProvider>,
    );

    // Only ONE "What this does:" row rendered — the summarized file's. Rows
    // in the "core" group default to expanded, so both bodies are already
    // visible; src/bar.ts's stays absent because `pseudocode_summary` is
    // still null for it.
    const whatThisDoes = screen.getAllByText("What this does:");
    expect(whatThisDoes).toHaveLength(1);
    expect(whatThisDoes[0]!.parentElement).toHaveTextContent("Adds the foo helper.");

    // Both triggers are idle again (post-generation), including bar's — it
    // never got a summary.
    expect(within(rowHeaderFor("src/foo.ts")).getByRole("button", { name: /summary/i })).toHaveTextContent(
      "Summary",
    );
    expect(within(rowHeaderFor("src/bar.ts")).getByRole("button", { name: /summary/i })).toHaveTextContent(
      "Summary",
    );
  });
});
