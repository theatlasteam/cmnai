import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Section } from "@astryxdesign/core/Section";
import { Clock, Sparkles } from "geist-icons";
import { Link } from "@astryxdesign/core/Link";
import { dictionaries, getLocale } from "@/lib/i18n";
import { requireUser } from "@/lib/auth";
import {
  isEventLive,
  isEventUpcoming,
  listEvents,
  sharedQuotaRemaining,
} from "@/lib/events";

/** Human countdown to the end of a window, in the visitor's language. */
function timeLeftLabel(endsAt: string, locale: string): string {
  const hours = Math.round((Date.parse(endsAt) - Date.now()) / (60 * 60 * 1000));
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(hours) < 24) return relative.format(hours, "hour");
  return relative.format(Math.round(hours / 24), "day");
}

export default async function DashboardEventsPage() {
  const [, locale] = await Promise.all([requireUser(), getLocale()]);
  const t = dictionaries[locale];
  const copy = t.events;

  const events = await listEvents();
  const live = events.find((event) => isEventLive(event));
  const upcoming = events.find((event) => isEventUpcoming(event));
  const current = live ?? upcoming ?? null;

  const number = new Intl.NumberFormat(locale);
  const remaining = current ? sharedQuotaRemaining(current) : null;
  const used = current?.tokens_used ?? 0;
  const quota = current?.quota_tokens ?? 0;

  return (
    <Section variant="transparent" padding={0} minHeight="100dvh">
      <VStack
        className="cmn-page"
        width="100%"
        height="100%"
        minHeight="100dvh"
        paddingInline={6}
        paddingBlock={10}
        gap={5}
        align="center"
        justify="center"
      >
        {current ? (
          <>
            <HStack gap={2} align="center" wrap="wrap" justify="center">
              <Sparkles size={20} />
              <Text type="label" color="secondary">
                {live ? copy.live : copy.upcoming}
              </Text>
              {current.badge ? (
                <Badge variant="success" label={current.badge} />
              ) : null}
            </HStack>

            <Heading level={1} type="display-1" justify="center" textWrap="balance">
              {current.title}
            </Heading>

            {current.description ? (
              <Text
                type="large"
                color="secondary"
                justify="center"
                className="max-w-2xl"
                textWrap="pretty"
              >
                {current.description}
              </Text>
            ) : null}

            <HStack gap={3} align="center" wrap="wrap" justify="center">
              <Badge
                variant="neutral"
                label={
                  current.kind === "shared_quota"
                    ? copy.sharedQuota
                    : copy.freeWindow
                }
              />
              <HStack gap={1} align="center">
                <Clock size={14} />
                <Text type="supporting" color="secondary">
                  {live ? copy.until : copy.startsAt}{" "}
                  {live
                    ? timeLeftLabel(current.ends_at, locale)
                    : new Date(current.starts_at).toLocaleString(locale)}
                </Text>
              </HStack>
              {current.models ? (
                <Text type="supporting" color="secondary">
                  {current.models}
                </Text>
              ) : null}
            </HStack>

            {remaining !== null && quota > 0 ? (
              <VStack gap={2} width="100%" maxWidth={520}>
                <ProgressBar
                  label={copy.quota}
                  value={used}
                  max={quota}
                  variant="accent"
                  hasValueLabel
                />
                <Text type="supporting" color="secondary" justify="center">
                  {number.format(remaining)} {copy.tokensLeft}
                </Text>
              </VStack>
            ) : null}

            <HStack gap={2} align="center" wrap="wrap" justify="center">
              <Button
                variant="primary"
                label={copy.joinCta}
                href="/dashboard/keys"
                icon={<Sparkles size={16} />}
              />
              <Button variant="secondary" label={copy.backToPool} href="/providers" />
            </HStack>
          </>
        ) : (
          <>
            <HStack gap={2} align="center" justify="center">
              <Sparkles size={20} />
              <Text type="label" color="secondary">
                {copy.title}
              </Text>
            </HStack>
            <Heading level={1} type="display-1" justify="center" textWrap="balance">
              {copy.nothingRunning}
            </Heading>
            <Text
              type="large"
              color="secondary"
              justify="center"
              className="max-w-2xl"
              textWrap="pretty"
            >
              {copy.nothingRunningBody}
            </Text>
            <Button variant="primary" label={copy.backToPool} href="/providers" />
          </>
        )}

        <Text type="supporting" color="secondary" justify="center">
          <Link href="/dashboard">{copy.backToDashboard}</Link>
        </Text>
      </VStack>
    </Section>
  );
}
