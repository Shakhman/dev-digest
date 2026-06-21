"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { ApiError } from "@/lib/api";
import {
  useConventions,
  useExtractConventions,
  useUpdateConvention,
  useRejectConvention,
} from "@/lib/hooks/conventions";
import { ConventionCard } from "../ConventionCard";
import { CreateSkillModal } from "../CreateSkillModal";

export function ConventionsView() {
  const t = useTranslations("conventions");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data: conventions, isLoading, isError, error, refetch } = useConventions(repoId);
  const extract = useExtractConventions(repoId);
  const update = useUpdateConvention(repoId);
  const reject = useRejectConvention(repoId);
  const [modalOpen, setModalOpen] = React.useState(false);

  const repoName = activeRepo?.name ?? activeRepo?.full_name ?? t("page.repoFallback");
  const crumb = [{ label: t("page.crumbLab") }, { label: t("page.crumbConventions") }];

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const list = conventions ?? [];
  const acceptedCount = list.filter((c) => c.accepted).length;
  const hasResults = list.length > 0;
  const scanning = extract.isPending;

  return (
    <AppShell crumb={crumb}>
      {modalOpen && (
        <CreateSkillModal
          repoId={repoId}
          acceptedCount={acceptedCount}
          onClose={() => setModalOpen(false)}
        />
      )}
      <div style={{ padding: "24px 32px", maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 20 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700 }}>
              {t("page.headingPrefix")}
              <span className="mono" style={{ color: "var(--accent-text)" }}>
                {repoName}
              </span>
            </h1>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 6, maxWidth: 640 }}>
              {t("page.subtitle")}
            </p>
          </div>
          {hasResults && (
            <Button
              kind="secondary"
              size="sm"
              icon="RefreshCw"
              loading={scanning}
              onClick={() => extract.mutate()}
            >
              {scanning ? t("page.scanning") : t("page.rescan")}
            </Button>
          )}
        </div>

        {extract.isError && (
          <div style={{ marginBottom: 16 }}>
            <ErrorState
              title={t("page.extractionFailed")}
              body={extract.error instanceof ApiError ? extract.error.message : t("page.loadError")}
              onRetry={() => extract.mutate()}
            />
          </div>
        )}

        {hasResults && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 16,
            }}
          >
            <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              {t("page.acceptedSummary", { accepted: acceptedCount, total: list.length })}
            </span>
            <div style={{ flex: 1 }} />
            <Button
              kind="primary"
              size="sm"
              icon="Sparkles"
              disabled={acceptedCount === 0}
              onClick={() => setModalOpen(true)}
            >
              {t("page.createSkill")}
            </Button>
          </div>
        )}

        {isLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Skeleton height={180} />
            <Skeleton height={180} />
          </div>
        ) : isError ? (
          <ErrorState
            title={t("page.loadError")}
            body={error instanceof ApiError ? error.message : t("page.loadError")}
            onRetry={() => refetch()}
          />
        ) : !hasResults ? (
          <EmptyState
            icon="ListChecks"
            title={t("page.empty.title")}
            body={t("page.empty.body")}
            cta={scanning ? t("page.scanning") : t("page.empty.cta")}
            onCta={() => extract.mutate()}
          />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {list.map((c) => (
              <ConventionCard
                key={c.id}
                convention={c}
                repoFullName={activeRepo?.full_name ?? null}
                defaultBranch={activeRepo?.default_branch ?? null}
                busy={update.isPending && update.variables?.id === c.id}
                onAccept={(accepted) => update.mutate({ id: c.id, patch: { accepted } })}
                onReject={() => reject.mutate(c.id)}
                onEdit={(patch) => update.mutate({ id: c.id, patch })}
              />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
