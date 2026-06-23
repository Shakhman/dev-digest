"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Modal, FormField, TextInput, Textarea, SelectInput, Button, Skeleton, ErrorState, Toggle } from "@devdigest/ui";
import { useTranslations } from "next-intl";
import type { SkillType } from "@devdigest/shared";
import { useConventionSkillDraft } from "@/lib/hooks/conventions";
import { useCreateSkill } from "@/lib/hooks/skills";

const TYPE_OPTIONS: { value: SkillType; label: string }[] = [
  { value: "convention", label: "convention" },
  { value: "rubric", label: "rubric" },
  { value: "security", label: "security" },
  { value: "custom", label: "custom" },
];

export function CreateSkillModal({
  repoId,
  acceptedCount,
  onClose,
}: {
  repoId: string;
  acceptedCount: number;
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const router = useRouter();
  const { data: draft, isLoading, isError, refetch } = useConventionSkillDraft(repoId, true);
  const create = useCreateSkill();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>("convention");
  const [body, setBody] = React.useState("");
  const [enabled, setEnabled] = React.useState(true);
  const [hydrated, setHydrated] = React.useState(false);

  // Seed the editable form once the server draft arrives.
  React.useEffect(() => {
    if (draft && !hydrated) {
      setName(draft.name);
      setDescription(draft.description);
      setBody(draft.body);
      setHydrated(true);
    }
  }, [draft, hydrated]);

  const save = async () => {
    const skill = await create.mutateAsync({
      name: name.trim(),
      description: description.trim(),
      type,
      source: "extracted",
      body,
      enabled,
    });
    onClose();
    router.push(`/skills/${skill.id}?tab=config`);
  };

  return (
    <Modal
      width={760}
      title={t("modal.title")}
      subtitle={t("modal.subtitle", { count: acceptedCount })}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <Button kind="ghost" size="sm" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button
            kind="primary"
            size="sm"
            icon="Sparkles"
            loading={create.isPending}
            disabled={!hydrated || name.trim().length === 0 || body.trim().length === 0}
            onClick={save}
          >
            {t("modal.create")}
          </Button>
        </div>
      }
    >
      <div style={{ padding: 24, overflowY: "auto" }}>
        {isLoading && <Skeleton height={320} />}
        {isError && <ErrorState body={t("modal.loadError")} onRetry={() => refetch()} />}
        {hydrated && (
          <>
            <FormField label={t("modal.name")} required>
              <TextInput value={name} onChange={setName} mono />
            </FormField>
            <FormField label={t("modal.description")}>
              <TextInput value={description} onChange={setDescription} />
            </FormField>
            <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
              <div style={{ flex: 1 }}>
                <FormField label={t("modal.type")}>
                  <SelectInput value={type} onChange={(v) => setType(v as SkillType)} options={TYPE_OPTIONS} />
                </FormField>
              </div>
              <div>
                <FormField label={t("modal.enabled")}>
                  <Toggle on={enabled} onChange={setEnabled} />
                  <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6, whiteSpace: "nowrap" }}>
                    {t("modal.enabledHint")}
                  </p>
                </FormField>
              </div>
            </div>
            <FormField label={t("modal.body")} required hint={t("modal.bodyHint")}>
              <Textarea value={body} onChange={setBody} rows={16} mono />
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}
