import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";


export default function NotFound() {
  return (
    <VStack
      className="cmn-page"
      maxWidth={720}
      width="100%"
      minHeight="70vh"
      paddingInline={6}
      paddingBlock={10}
      gap={4}
      align="start"
    >
      <Text type="code" color="secondary">
        404
      </Text>
      <Heading level={1}>This page is not in the pool.</Heading>
      <Text type="body" color="secondary">
        The link may be old, or the endpoint was removed. Head back to the pool
        and pick another route.
      </Text>
      <Button variant="primary" label="Back to cmnAI" href="/" />
    </VStack>
  );
}
