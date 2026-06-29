import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import type { BlastMap } from "@devdigest/shared";
import { BlastCard } from "./BlastCard";

// BlastCard reads its data through useBlast — mock it so the test drives state.
const useBlast = vi.fn();
vi.mock("@/lib/hooks/reviews", () => ({ useBlast: () => useBlast() }));

afterEach(() => {
  cleanup();
  useBlast.mockReset();
});

const OK: BlastMap = {
  state: "ok",
  symbols: [
    {
      file: "src/mw/rate-limit.ts",
      name: "rateLimit",
      kind: "function",
      callers: [
        { file: "src/api/public/index.ts", symbol: "register", line: 23, rank: 0.9 },
        { file: "src/api/public/webhooks.ts", symbol: "webhooks", line: 45, rank: 0.4 },
      ],
      endpoints: ["GET /api/public/items"],
      crons: ["reset-rate-buckets"],
    },
  ],
  symbol_count: 1,
  caller_count: 2,
  endpoint_count: 1,
  cron_count: 1,
  degraded_reason: null,
};

describe("BlastCard", () => {
  it("renders the symbol tree and links a caller to its file:line on GitHub", () => {
    useBlast.mockReturnValue({ data: OK, isLoading: false, isError: false });
    render(<BlastCard prId="p1" repoFullName="acme/api" headSha="sha123" />);

    expect(screen.getByText("rateLimit()")).toBeInTheDocument();
    expect(screen.getByText("GET /api/public/items")).toBeInTheDocument();
    expect(screen.getByText("reset-rate-buckets")).toBeInTheDocument();

    // The caller file:line is an anchor opening the exact line in a new tab.
    const link = screen.getByRole("link", { name: "src/api/public/index.ts:23" });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/api/blob/sha123/src/api/public/index.ts#L23",
    );
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("toggles to the Graph view, keeping the caller deep-link", () => {
    useBlast.mockReturnValue({ data: OK, isLoading: false, isError: false });
    render(<BlastCard prId="p1" repoFullName="acme/api" headSha="sha123" />);

    // Tree is the default; switch to Graph.
    fireEvent.click(screen.getByRole("tab", { name: "Graph" }));
    expect(screen.getByRole("tab", { name: "Graph" })).toHaveAttribute("aria-selected", "true");

    // The graph renders as an SVG and caller nodes still deep-link by line.
    const graph = screen.getByRole("img", { name: /blast radius graph/i });
    const hrefs = within(graph)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(
      "https://github.com/acme/api/blob/sha123/src/api/public/index.ts#L23",
    );
  });

  it("falls back to plain text (no link) when repo/sha are unknown", () => {
    useBlast.mockReturnValue({ data: OK, isLoading: false, isError: false });
    render(<BlastCard prId="p1" repoFullName={null} headSha={null} />);

    expect(screen.getByText("src/api/public/index.ts:23")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("shows a degraded badge and still renders partial data — never blank", () => {
    const degraded: BlastMap = { ...OK, state: "degraded", degraded_reason: "no_data" };
    useBlast.mockReturnValue({ data: degraded, isLoading: false, isError: false });
    render(<BlastCard prId="p1" repoFullName="acme/api" headSha="sha123" />);

    expect(screen.getByText(/Index not built yet/i)).toBeInTheDocument();
    expect(screen.getByText("rateLimit()")).toBeInTheDocument();
  });

  it("shows an empty state when there is no impact", () => {
    const empty: BlastMap = {
      state: "empty",
      symbols: [],
      symbol_count: 0,
      caller_count: 0,
      endpoint_count: 0,
      cron_count: 0,
      degraded_reason: null,
    };
    useBlast.mockReturnValue({ data: empty, isLoading: false, isError: false });
    render(<BlastCard prId="p1" repoFullName="acme/api" headSha="sha123" />);

    expect(screen.getByText("No impact mapped")).toBeInTheDocument();
    expect(screen.queryByText("rateLimit()")).not.toBeInTheDocument();
  });
});
