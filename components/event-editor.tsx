"use client";

import { useActionState, useEffect, useState } from "react";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { TextArea } from "@/components/form-fields";
import { TextInput } from "@/components/form-fields";
import { SelectField } from "@/components/select-field";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Sparkles } from "geist-icons";
import {
  createEventAction,
  updateEventAction,
  type EventActionState,
} from "@/app/actions/events";
import type { Dictionary } from "@/lib/i18n";
import { localStartToInstant } from "@/lib/event-time";

export type EventDraft = {
  id: string;
  title: string;
  description: string;
  kind: "free_window" | "shared_quota";
  models: string;
  quotaTokens: number | null;
  durationHours: number;
  startsAt: string;
  badge: string;
  status: "draft" | "published" | "ended";
};

export type PresetOption = {
  id: string;
  title: string;
  description: string;
  kind: "free_window" | "shared_quota";
  quotaTokens: number | null;
  durationHours: number;
  badge: string;
};

/**
 * Event editor. A preset fills every field, and every field stays editable
 * afterwards, so a preset is a starting point rather than a constraint.
 */
export function EventEditor({
  presets,
  draft,
  modelOptions,
  copy,
  onCancel,
}: {
  presets: PresetOption[];
  draft: EventDraft | null;
  modelOptions: string[];
  copy: Dictionary["events"];
  onCancel?: () => void;
}) {
  const isEdit = Boolean(draft);
  const [createState, createAction, creating] = useActionState<
    EventActionState,
    FormData
  >(createEventAction, {});
  const [updateState, updateAction, updating] = useActionState<
    EventActionState,
    FormData
  >(updateEventAction, {});

  const [selectedPreset, setSelectedPreset] = useState<string>(
    draft ? "custom" : (presets[0]?.id ?? ""),
  );
  const [kind, setKind] = useState<"free_window" | "shared_quota">(
    draft?.kind ?? presets[0]?.kind ?? "free_window",
  );
  const [quotaTokens, setQuotaTokens] = useState<string>(
    draft?.quotaTokens != null ? String(draft.quotaTokens) : "",
  );
  const [durationHours, setDurationHours] = useState<string>(
    draft ? String(draft.durationHours) : String(presets[0]?.durationHours ?? 48),
  );
  const [startsAt, setStartsAt] = useState<string>(draft?.startsAt ?? "");
  // The picker gives a local wall-clock value with no timezone. The browser
  // knows the reader's offset, so it converts that value to the absolute
  // instant the admin actually meant before the form is submitted.
  const [startsAtUtc, setStartsAtUtc] = useState<string>("");

  useEffect(() => {
    setStartsAtUtc(localStartToInstant(startsAt));
  }, [startsAt]);
  const [title, setTitle] = useState<string>(draft?.title ?? presets[0]?.title ?? "");
  const [description, setDescription] = useState<string>(
    draft?.description ?? presets[0]?.description ?? "",
  );
  const [badge, setBadge] = useState<string>(draft?.badge ?? presets[0]?.badge ?? "");
  const [models, setModels] = useState<string[]>(
    draft?.models
      ? draft.models.split(",").map((model) => model.trim()).filter(Boolean)
      : [],
  );

  function applyPreset(presetId: string) {
    const preset = presets.find((option) => option.id === presetId);
    setSelectedPreset(presetId);
    if (!preset) return;
    setKind(preset.kind);
    setQuotaTokens(preset.quotaTokens != null ? String(preset.quotaTokens) : "");
    setDurationHours(String(preset.durationHours));
    setTitle(preset.title);
    setDescription(preset.description);
    setBadge(preset.badge);
  }

  const kindOptions = [
    { value: "free_window", label: copy.freeWindow },
    { value: "shared_quota", label: copy.sharedQuota },
  ];
  const statusOptions = [
    { value: "draft", label: copy.draft },
    { value: "published", label: copy.published },
    { value: "ended", label: copy.ended },
  ];

  return (
    <Card padding={5}>
      <VStack gap={4} width="100%">
        <HStack gap={2} align="center" wrap="wrap">
          <Sparkles size={18} />
          <Heading level={3}>{isEdit ? copy.edit : copy.new}</Heading>
          {isEdit ? <Badge variant="neutral" label={copy.editing} /> : null}
        </HStack>

        {!isEdit ? (
          <VStack gap={2} width="100%">
            <Text type="label">{copy.presetTitle}</Text>
            <HStack gap={2} wrap="wrap">
              {presets.map((preset) => (
                <Button
                  key={preset.id}
                  type="button"
                  size="sm"
                  variant={
                    selectedPreset === preset.id ? "primary" : "secondary"
                  }
                  label={preset.title}
                  onClick={() => applyPreset(preset.id)}
                />
              ))}
            </HStack>
            <Text type="supporting" color="secondary">
              {copy.presetHint}
            </Text>
          </VStack>
        ) : null}

        <form action={isEdit ? updateAction : createAction}>
          <VStack gap={4}>
            {isEdit ? (
              <input type="hidden" name="eventId" value={draft?.id} />
            ) : null}
            {createState.error ? (
              <Banner status="error" title={createState.error} />
            ) : null}
            {createState.success ? (
              <Banner status="success" title={createState.success} />
            ) : null}
            {updateState.error ? (
              <Banner status="error" title={updateState.error} />
            ) : null}
            {updateState.success ? (
              <Banner status="success" title={updateState.success} />
            ) : null}

            <FormLayout>
              <TextInput
                label={copy.name}
                htmlName="title"
                value={title}
                onChange={setTitle}
                description={copy.nameHint}
                isRequired
                width="100%"
              />
              <TextArea
                label={copy.description}
                htmlName="description"
                value={description}
                onChange={setDescription}
                rows={3}
                description={copy.descriptionHint}
              />
              <TextInput
                label={copy.badge}
                htmlName="badge"
                value={badge}
                onChange={setBadge}
                description={copy.badgeHint}
                isOptional
                width="100%"
              />
              <SelectField
                label={copy.kind}
                htmlName="kind"
                defaultValue={kind}
                value={kind}
                onChange={(next) =>
                  setKind(next === "shared_quota" ? "shared_quota" : "free_window")
                }
                options={kindOptions}
                description={copy.kindHint}
                width="100%"
              />
              <TextInput
                label={copy.quota}
                htmlName="quotaTokens"
                type="number"
                value={quotaTokens}
                onChange={setQuotaTokens}
                description={copy.quotaHint}
                isRequired={kind === "shared_quota"}
                isOptional={kind !== "shared_quota"}
                width="100%"
              />
              <TextInput
                label={copy.duration}
                htmlName="durationHours"
                type="number"
                value={durationHours}
                onChange={setDurationHours}
                description={copy.durationHint}
                isRequired
                width="100%"
              />
              <TextInput
                label={copy.startsAt}
                htmlName="startsAtLocal"
                type="datetime-local"
                value={startsAt}
                onChange={setStartsAt}
                description={copy.startsAtHint}
                isRequired
                width="100%"
              />
              <input type="hidden" name="startsAt" value={startsAtUtc} />
              {startsAtUtc ? (
                <Text type="supporting" color="secondary">
                  {copy.startsAtUtc} {startsAtUtc}
                </Text>
              ) : null}
              <SelectField
                label={copy.status}
                htmlName="status"
                defaultValue={draft?.status ?? "draft"}
                options={statusOptions}
                width="100%"
              />
            </FormLayout>

            <VStack gap={2} width="100%">
              <Text type="label">{copy.models}</Text>
              <Text type="supporting" color="secondary">
                {copy.modelsHint}
              </Text>
              <HStack gap={3} wrap="wrap" width="100%">
                {modelOptions.map((model) => {
                  const checked = models.includes(model);
                  return (
                    <CheckboxInput
                      key={model}
                      label={model}
                      value={checked}
                      onChange={(next) =>
                        setModels((current) =>
                          next
                            ? [...current, model]
                            : current.filter((entry) => entry !== model),
                        )
                      }
                    />
                  );
                })}
              </HStack>
              <input type="hidden" name="models" value={models.join(", ")} />
            </VStack>

            <HStack gap={2} align="center" wrap="wrap">
              <Button
                type="submit"
                variant="primary"
                label={isEdit ? copy.save : copy.create}
                isLoading={isEdit ? updating : creating}
              />
              {isEdit && onCancel ? (
                <Button
                  type="button"
                  variant="secondary"
                  label={copy.cancel}
                  onClick={onCancel}
                />
              ) : null}
              <Badge
                variant="neutral"
                label={kind === "shared_quota" ? copy.sharedQuota : copy.freeWindow}
              />
            </HStack>
          </VStack>
        </form>
      </VStack>
    </Card>
  );
}
