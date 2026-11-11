import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { Divider } from "@astryxdesign/core/Divider";
import { StatusBadge } from "./status-badge";
import type { Dictionary } from "@/lib/i18n";

export function SiteFooter({ t }: { t: Dictionary }) {
  return (
    <>
      <Divider />
      <VStack
        className="cmn-page"
        maxWidth={1120}
        width="100%"
        paddingInline={6}
        paddingBlock={6}
        gap={2}
      >
        <HStack width="100%" justify="between" align="center" wrap="wrap" gap={3}>
          <Text type="supporting" color="secondary">
            {t.landing.footer}
          </Text>
          <HStack gap={4} align="center" wrap="wrap">
            <Text type="supporting" color="secondary">
              OpenAI-compatible · /v1/chat/completions
            </Text>
            <StatusBadge status="active" t={t} />
          </HStack>
        </HStack>
      </VStack>
    </>
  );
}
