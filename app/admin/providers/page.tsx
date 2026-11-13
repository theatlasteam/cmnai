import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import {
  PrefilledInput,
  PrefilledTextArea,
  TextArea,
  TextInput,
} from "@/components/form-fields";
import { SelectField } from "@/components/select-field";
import { Check, Pause, Play, Plus, Trash } from "geist-icons";
import { requireAdmin } from "@/lib/auth";
import { all } from "@/lib/db";
import { headersToText, providerHeaderNames } from "@/lib/provider-headers";
import { dictionaries, getLocale } from "@/lib/i18n";
import {
  createProviderAction,
  reviewModelAction,
  reviewProviderAction,
  updateProviderAction,
} from "@/app/actions/admin";
import { updateEndpointModelsAction } from "@/app/actions/keys";
import { StatusBadge } from "@/components/status-badge";



type Provider = {
  id: string;
  name: string;
  base_url: string;
  api_mode: string;
  headers_json: string;
  status: string;
  priority: number;
  notes: string | null;
  contact: string | null;
  created_at: string;
  owner: string | null;
  owner_email: string | null;
};

export default async function AdminProvidersPage() {
  const [locale] = await Promise.all([getLocale(), requireAdmin()]);
  const t = dictionaries[locale];

  const providers = await all<Provider>(
    `SELECT p.id, p.name, p.base_url, p.api_mode, p.headers_json, p.status, p.priority, p.notes, p.contact,
            p.created_at, u.name AS owner, u.email AS owner_email
     FROM providers p LEFT JOIN users u ON u.id = p.user_id
     ORDER BY
       CASE p.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,
       p.priority DESC`,
  );

  const models = await all<{
    id: string;
    provider_id: string;
    model_id: string;
    display_name: string;
    context_window: number | null;
    status: string;
  }>("SELECT * FROM models ORDER BY created_at ASC");

  // A provider that is out of credit still sits in rotation and fails every
  // request until someone pauses it, so the admin needs to see that here.
  const health = await all<{
    provider_id: string;
    errors: number;
    requests: number;
    last_error: string | null;
  }>(
    `SELECT u.provider_id,
            SUM(CASE WHEN u.status = 'error' THEN 1 ELSE 0 END) AS errors,
            COUNT(*) AS requests,
            (SELECT u2.error FROM usage_events u2
              WHERE u2.provider_id = u.provider_id AND u2.status = 'error'
                AND u2.error IS NOT NULL
              ORDER BY u2.created_at DESC LIMIT 1) AS last_error
     FROM usage_events u
     WHERE u.created_at >= datetime('now', '-1 day')
     GROUP BY u.provider_id`,
  );
  const healthByProvider = new Map(health.map((row) => [row.provider_id, row]));

  const apiModeOptions = [
    { value: "chat_completions", label: t.dash.apiModeChat },
    { value: "responses", label: t.dash.apiModeResponses },
    { value: "anthropic_messages", label: t.dash.apiModeAnthropic },
  ];
  const apiModeLabels: Record<string, string> = Object.fromEntries(
    apiModeOptions.map((option) => [option.value, option.label]),
  );

  return (
    <>
      <VStack gap={1}>
        <Heading level={1}>{t.admin.providerTitle}</Heading>
        <Text type="body" color="secondary">
          {t.admin.providerSubtitle}
        </Text>
      </VStack>

      <Card padding={5}>
        <VStack gap={4}>
          <HStack gap={2} align="center">
            <Plus size={18} />
            <Heading level={3}>Add a provider</Heading>
          </HStack>
          <Text type="supporting" color="secondary">
            New providers land in the review queue first. Approve them below to put
            them into rotation.
          </Text>
          <form action={createProviderAction}>
            <VStack gap={3}>
              <HStack gap={3} align="end" wrap="wrap" width="100%">
                <VStack gap={2} width="100%" maxWidth={280}>
                  <TextInput label={t.dash.providerName} htmlName="name" isRequired />
                </VStack>
                <VStack gap={2} width="100%" maxWidth={420}>
                  <TextInput
                    label={t.dash.baseUrl}
                    htmlName="baseUrl"
                    type="url"
                    placeholder="https://api.example.com/v1"
                    isRequired
                  />
                </VStack>
                <VStack gap={2} width={130}>
                  <TextInput label={t.admin.priority} htmlName="priority" type="number" />
                </VStack>
              </HStack>
              <HStack gap={3} align="end" wrap="wrap" width="100%">
                <VStack gap={2} width="100%" maxWidth={280}>
                  <SelectField
                    label={t.dash.apiMode}
                    htmlName="apiMode"
                    defaultValue="chat_completions"
                    options={apiModeOptions}
                    description={t.dash.apiModeHint}
                  />
                </VStack>
                <VStack gap={2} width="100%" maxWidth={420}>
                  <TextInput label={t.dash.apiKey} htmlName="apiKey" type="password" isRequired />
                </VStack>
                <VStack gap={2} width="100%" maxWidth={420}>
                  <TextInput
                    label={t.dash.models}
                    htmlName="models"
                    placeholder="gpt-4o-mini, llama-3.1-70b"
                    isRequired
                  />
                </VStack>
              </HStack>
              <TextArea
                label={t.admin.maskHeaders}
                htmlName="maskHeaders"
                rows={3}
                placeholder={t.admin.maskHeadersPlaceholder}
                description={t.admin.maskHeadersHint}
              />
              <TextArea label={t.admin.reviewNote} htmlName="notes" rows={2} />
              <HStack>
                <Button
                  type="submit"
                  variant="primary"
                  label={t.landing.contributeCta}
                  icon={<Plus size={16} />}
                />
              </HStack>
            </VStack>
          </form>
        </VStack>
      </Card>

      {providers.map((provider) => {
        const providerModels = models.filter((model) => model.provider_id === provider.id);
        const providerHealth = healthByProvider.get(provider.id);
        const errorRate =
          providerHealth && providerHealth.requests > 0
            ? providerHealth.errors / providerHealth.requests
            : 0;
        return (
          <Card key={provider.id} padding={5}>
            <VStack gap={4}>
              <HStack width="100%" justify="between" align="start" wrap="wrap" gap={3}>
                <VStack gap={1}>
                  <HStack gap={2} align="center" wrap="wrap">
                    <Heading level={3}>{provider.name}</Heading>
                    <StatusBadge status={provider.status} t={t} />
                    <Badge
                      variant="neutral"
                      label={apiModeLabels[provider.api_mode] ?? t.dash.apiModeChat}
                    />
                    <Badge variant="neutral" label={`${t.admin.priority}: ${provider.priority}`} />
                    {providerHealth && providerHealth.errors > 0 ? (
                      <Badge
                        variant={errorRate > 0.5 ? "error" : "warning"}
                        label={`${providerHealth.errors}/${providerHealth.requests} failed`}
                      />
                    ) : null}
                  </HStack>
                  <Text type="code">{provider.base_url}</Text>
                  {providerHealth?.last_error ? (
                    <Text type="supporting" color="secondary">
                      {providerHealth.last_error.slice(0, 200)}
                    </Text>
                  ) : null}
                  {providerHeaderNames(provider.headers_json).length > 0 ? (
                    <Text type="supporting" color="secondary">
                      {t.admin.maskHeaders}:{" "}
                      {providerHeaderNames(provider.headers_json).join(", ")}
                    </Text>
                  ) : null}
                  <Text type="supporting" color="secondary">
                    {provider.owner ?? "—"} ({provider.owner_email ?? "—"}) · {provider.contact ?? "—"}
                  </Text>
                </VStack>
                <HStack gap={2} wrap="wrap">
                  {provider.status !== "approved" ? (
                    <form action={reviewProviderAction}>
                      <input type="hidden" name="providerId" value={provider.id} />
                      <input type="hidden" name="decision" value="approve" />
                      <Button type="submit" size="sm" variant="primary" label={t.admin.approve} icon={<Check size={14} />} />
                    </form>
                  ) : (
                    <form action={reviewProviderAction}>
                      <input type="hidden" name="providerId" value={provider.id} />
                      <input type="hidden" name="decision" value="pause" />
                      <Button type="submit" size="sm" variant="secondary" label={t.admin.pause} icon={<Pause size={14} />} />
                    </form>
                  )}
                  {provider.status === "paused" ? (
                    <form action={reviewProviderAction}>
                      <input type="hidden" name="providerId" value={provider.id} />
                      <input type="hidden" name="decision" value="resume" />
                      <Button type="submit" size="sm" variant="secondary" label={t.admin.resume} icon={<Play size={14} />} />
                    </form>
                  ) : null}
                  {provider.status === "pending" ? (
                    <form action={reviewProviderAction}>
                      <input type="hidden" name="providerId" value={provider.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <Button type="submit" size="sm" variant="destructive" label={t.admin.reject} />
                    </form>
                  ) : null}
                  <form action={reviewProviderAction}>
                    <input type="hidden" name="providerId" value={provider.id} />
                    <input type="hidden" name="decision" value="remove" />
                    <Button type="submit" size="sm" variant="ghost" label={t.admin.remove} icon={<Trash size={14} />} />
                  </form>
                </HStack>
              </HStack>

              <Divider />

              <VStack gap={2}>
                <Text type="label">{t.admin.modelsTitle}</Text>
                <HStack gap={2} wrap="wrap">
                  {providerModels.length === 0 ? (
                    <Text type="supporting" color="secondary">
                      {t.admin.empty}
                    </Text>
                  ) : null}
                  {providerModels.map((model) => (
                    <Card key={model.id} padding={3} variant="muted">
                      <HStack gap={2} align="center" wrap="wrap">
                        <Text type="code">{model.model_id}</Text>
                        <StatusBadge status={model.status} t={t} />
                        {model.status === "pending" ? (
                          <HStack gap={1}>
                            <form action={reviewModelAction}>
                              <input type="hidden" name="modelId" value={model.id} />
                              <input type="hidden" name="decision" value="approve" />
                              <Button type="submit" size="sm" variant="ghost" label={t.admin.approve} />
                            </form>
                            <form action={reviewModelAction}>
                              <input type="hidden" name="modelId" value={model.id} />
                              <input type="hidden" name="decision" value="reject" />
                              <Button type="submit" size="sm" variant="ghost" label={t.admin.reject} />
                            </form>
                          </HStack>
                        ) : null}
                      </HStack>
                    </Card>
                  ))}
                </HStack>
                <form action={updateEndpointModelsAction}>
                  <input type="hidden" name="providerId" value={provider.id} />
                  <HStack gap={2} align="end" wrap="wrap" width="100%">
                    <VStack gap={1} width="100%" maxWidth={520}>
                      <TextInput
                        label={t.dash.models}
                        htmlName="models"
                        defaultValue={providerModels.map((m) => m.model_id).join(", ")}
                        placeholder="gpt-4o, claude-3-5-sonnet"
                      />
                    </VStack>
                    <Button type="submit" size="sm" variant="secondary" label="Save" />
                  </HStack>
                </form>
              </VStack>

              <form action={updateProviderAction}>
                <VStack gap={3}>
                  <HStack gap={3} align="end" wrap="wrap" width="100%">
                    <VStack gap={2} width="100%" maxWidth={280}>
                      <TextInput
                        label={t.admin.provider}
                        htmlName="name"
                        defaultValue={provider.name}
                        isRequired
                      />
                    </VStack>
                    <VStack gap={2} width="100%" maxWidth={420}>
                      <TextInput
                        label={t.dash.baseUrl}
                        htmlName="baseUrl"
                        type="url"
                        defaultValue={provider.base_url}
                        isRequired
                      />
                    </VStack>
                    <VStack gap={2} width="100%" maxWidth={280}>
                      <SelectField
                        label={t.dash.apiMode}
                        htmlName="apiMode"
                        defaultValue={provider.api_mode ?? "chat_completions"}
                        options={apiModeOptions}
                      />
                    </VStack>
                    <VStack gap={2} width={130}>
                      <TextInput
                        label={t.admin.priority}
                        htmlName="priority"
                        type="number"
                        defaultValue={String(provider.priority)}
                      />
                    </VStack>
                  </HStack>
                  <VStack gap={2} width="100%">
                    <TextArea
                      label={t.admin.maskHeaders}
                      htmlName="maskHeaders"
                      rows={3}
                      placeholder={t.admin.maskHeadersPlaceholder}
                      description={t.admin.maskHeadersHint}
                      defaultValue={headersToText(provider.headers_json)}
                    />
                  </VStack>
                  <VStack gap={2} width="100%">
                    <TextArea
                      label={t.admin.reviewNote}
                      htmlName="notes"
                      rows={2}
                      defaultValue={provider.notes ?? ""}
                    />
                  </VStack>
                  <input type="hidden" name="providerId" value={provider.id} />
                  <HStack>
                    <Button type="submit" size="sm" variant="secondary" label="Save changes" />
                  </HStack>
                </VStack>
              </form>
            </VStack>
          </Card>
        );
      })}
    </>
  );
}
