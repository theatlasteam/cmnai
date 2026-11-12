import { VStack } from "@astryxdesign/core/Layout";
import { Section } from "@astryxdesign/core/Section";

/**
 * Dashboard pages share one content line. The events tab opts out of it and
 * takes the whole viewport instead.
 */
export default function DashboardContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Section variant="transparent" padding={0}>
      <VStack
        className="cmn-page"
        width="100%"
        maxWidth={1120}
        paddingInline={6}
        paddingBlock={8}
        gap={6}
      >
        {children}
      </VStack>
    </Section>
  );
}
