import { VStack } from "@astryxdesign/core/Layout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { requireAdmin } from "@/lib/auth";
import { dictionaries, getLocale } from "@/lib/i18n";
import { eventModelOptions } from "@/app/actions/events";
import {
  EVENT_PRESETS,
  isEventLive,
  isEventUpcoming,
  listEvents,
  sharedQuotaRemaining,
} from "@/lib/events";
import { AdminEventsPanel } from "@/components/admin-events-panel";

export default async function AdminEventsPage() {
  const [, locale, modelOptions] = await Promise.all([
    requireAdmin(),
    getLocale(),
    eventModelOptions(),
  ]);
  const t = dictionaries[locale];
  const copy = t.events;
  const events = await listEvents();

  const presets = EVENT_PRESETS.map((preset) => ({
    id: preset.id,
    title: copy.presets[preset.id as "free_window" | "shared_quota"].title,
    description:
      copy.presets[preset.id as "free_window" | "shared_quota"].description,
    kind: preset.kind,
    quotaTokens: preset.quota_tokens,
    durationHours: preset.duration_hours,
    badge: copy.presets[preset.id as "free_window" | "shared_quota"].badge,
  }));

  const rows = events.map((event) => {
    const remaining = sharedQuotaRemaining(event);
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      kind:
        event.kind === "shared_quota" ? copy.sharedQuota : copy.freeWindow,
      status: isEventLive(event)
        ? copy.live
        : isEventUpcoming(event)
          ? copy.upcoming
          : event.status === "published"
            ? copy.published
            : event.status === "ended"
              ? copy.ended
              : copy.draft,
      models: event.models || copy.allModels,
      budget:
        event.kind === "shared_quota" && remaining !== null
          ? `${remaining.toLocaleString(locale)} left`
          : "—",
      window: `${new Date(event.starts_at).toLocaleString(locale)} → ${new Date(event.ends_at).toLocaleString(locale)}`,
      live: isEventLive(event),
    };
  });

  return (
    <>
      <VStack gap={1}>
        <Heading level={1}>{copy.title}</Heading>
        <Text type="body" color="secondary">
          {copy.adminSubtitle}
        </Text>
        <Text type="supporting" color="secondary">
          {rows.some((row) => row.live) ? copy.oneAtATimeLive : copy.oneAtATime}
        </Text>
      </VStack>

      <AdminEventsPanel
        rows={rows}
        events={events.map((event) => ({
          id: event.id,
          title: event.title,
          description: event.description,
          kind: event.kind,
          models: event.models,
          quota_tokens: event.quota_tokens,
          duration_hours: event.duration_hours,
          starts_at: event.starts_at,
          status: event.status,
          badge: event.badge,
        }))}
        presets={presets}
        modelOptions={modelOptions}
        copy={copy}
      />
    </>
  );
}
