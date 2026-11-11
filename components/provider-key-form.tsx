"use client";

import { useActionState } from "react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { VStack } from "@astryxdesign/core/Layout";
import { TextInput } from "@/components/form-fields";
import { ShieldCheck } from "geist-icons";
import { addProviderKeyAction, type ActionState } from "@/app/actions/keys";
import type { Dictionary } from "@/lib/i18n";

export function ProviderKeyForm({
  providerId,
  t,
}: {
  providerId: string;
  t: Dictionary;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    addProviderKeyAction,
    {},
  );

  return (
    <form action={formAction}>
      <VStack gap={3}>
        <input type="hidden" name="providerId" value={providerId} />
        {state.error ? <Banner status="error" title={state.error} /> : null}
        {state.success ? <Banner status="success" title={state.success} /> : null}
        <TextInput
          label={t.providers.keyLabel}
          type="password"
          htmlName="apiKey"
          placeholder="sk-…"
          description={t.providers.keyHint}
          isRequired
        />
        <Button
          type="submit"
          variant="primary"
          label={t.providers.verify}
          icon={<ShieldCheck size={16} />}
          isLoading={pending}
        />
      </VStack>
    </form>
  );
}
