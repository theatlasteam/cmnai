import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Table } from "@/components/data-table";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { ChartActivity, Check, Clock, Servers, ShieldCheck, Sparkles, Users } from "geist-icons";
import { requireAdmin } from "@/lib/auth";
import { all, one } from "@/lib/db";
import { utcDayStart } from "@/lib/pool";
import { normalizeProviderMode } from "@/lib/provider-mode";
import { dictionaries, getLocale } from "@/lib/i18n";
import { reviewProviderAction } from "@/app/actions/admin";
import { StatusBadge } from "@/components/status-badge";
import { AdminPendingModelsTable } from "@/components/admin-tables";



type PendingProvider = {
  id: string;
  name: string;
  base_url: string;
  api_mode: string;
  notes: string | null;
  contact: string | null;
  created_at: string;
  status: string;
  owner: string | null;
  owner_email: string | null;
  models: string | null;
};

export default async function AdminPage() {
  const [locale] = await Promise.all([getLocale(), requireAdmin()]);
  const t = dictionaries[locale];
  const apiModeLabels: Record<string, string> = {
    chat_completions: t.dash.apiModeChat,
    responses: t.dash.apiModeResponses,
    anthropic_messages: t.dash.apiModeAnthropic,
  };

  const pendingProviders = await all<PendingProvider>(
    `SELECT p.id, p.name, p.base_url, p.api_mode, p.notes, p.contact, p.created_at, p.status,
            u.name AS owner, u.email AS owner_email,
            GROUP_CONCAT(m.model_id, ', ') AS models
     FROM providers p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN models m ON m.provider_id = p.id
     WHERE p.status = 'pending'
     GROUP BY p.id
     ORDER BY p.created_at ASC`,
  );

  const pendingModels = await all<{
    id: string;
    model_id: string;
    display_name: string;
    provider_name: string;
    provider_status: string;
    created_at: string;
  }>(
    `SELECT m.id, m.model_id, m.display_name, p.name AS provider_name,
            p.status AS provider_status, m.created_at
     FROM models m JOIN providers p ON p.id = m.provider_id
     WHERE m.status = 'pending' AND p.status = 'approved'
     ORDER BY m.created_at ASC`,
  );

  const counts = await one<{
    pending_providers: number;
    pending_models: number;
    live: number;
    suspended: number;
    requests_today: number;
    tokens_today: number;
  }>(
    `SELECT
      (SELECT COUNT(*) FROM providers WHERE status = 'pending') AS pending_providers,
      (SELECT COUNT(*) FROM models WHERE status = 'pending') AS pending_models,
      (SELECT COUNT(*) FROM providers WHERE status = 'approved') AS live,
      (SELECT COUNT(*) FROM users WHERE status = 'suspended') AS suspended,
      (SELECT COUNT(*) FROM usage_events WHERE created_at >= ?) AS requests_today,
      (SELECT COALESCE(SUM(prompt_tokens + completion_tokens), 0)
        FROM usage_events WHERE created_at >= ?) AS tokens_today`,
    utcDayStart(),
    utcDayStart(),
  );

  const audit = await all<{
    action: string;
    target_type: string;
    target_id: string;
    detail: string | null;
    created_at: string;
    actor: string | null;
  }>(
    `SELECT a.action, a.target_type, a.target_id, a.detail, a.created_at, u.name AS actor
     FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id
     ORDER BY a.created_at DESC LIMIT 8`,
  );

  const upstreamErrors = await all<{
    model: string;
    error: string;
    created_at: string;
    provider_name: string | null;
  }>(
    `SELECT u.model, u.error, u.created_at, p.name AS provider_name
     FROM usage_events u LEFT JOIN providers p ON p.id = u.provider_id
     WHERE u.status = 'error' AND u.error IS NOT NULL
     ORDER BY u.created_at DESC LIMIT 10`,
  );

  const statCards = [
    { label: t.admin.pendingProviders, value: counts?.pending_providers ?? 0, icon: <Clock size={18} /> },
    { label: t.admin.pendingModels, value: counts?.pending_models ?? 0, icon: <Servers size={18} /> },
    { label: t.admin.approvedProviders, value: counts?.live ?? 0, icon: <ShieldCheck size={18} /> },
    { label: t.admin.suspended, value: counts?.suspended ?? 0, icon: <Users size={18} /> },
    { label: t.dash.requestsToday, value: counts?.requests_today ?? 0, icon: <ChartActivity size={18} /> },
    { label: t.dash.usedToday, value: counts?.tokens_today ?? 0, icon: <Sparkles size={18} /> },
  ];

  const auditData = audit.map((entry) => ({
    action: entry.action,
    target: `${entry.target_type}: ${entry.target_id}`,
    detail: entry.detail ?? "—",
    actor: entry.actor ?? "—",
    when: new Date(entry.created_at).toLocaleString(locale),
  }));
  const modelRows = pendingModels.map((model) => ({
    id: model.id,
    model_id: model.model_id,
    display_name: model.display_name,
    provider_name: model.provider_name,
  }));
  const auditColumns = [
    { key: "action", header: t.admin.actions },
    { key: "target", header: "Target" },
    { key: "detail", header: t.admin.provider },
    { key: "actor", header: t.admin.submittedBy },
    { key: "when", header: t.admin.submitted },
  ];
  const errorData = upstreamErrors.map((entry) => ({
    model: entry.model,
    provider: entry.provider_name ?? "—",
    error: entry.error,
    when: new Date(entry.created_at).toLocaleString(locale),
  }));
  const errorColumns = [
    { key: "model", header: t.admin.model },
    { key: "provider", header: t.admin.provider },
    { key: "error", header: t.admin.errorMessage },
    { key: "when", header: t.admin.submitted },
  ];

  return (
    <>
      <VStack gap={1}>
        <Heading level={1}>{t.admin.title}</Heading>
        <Text type="body" color="secondary">
          {t.admin.providerSubtitle}
        </Text>
      </VStack>

      <Grid columns={{ minWidth: 200, max: 3 }} gap={4} width="100%">
        {statCards.map((stat) => (
          <Card key={stat.label} padding={4}>
            <VStack gap={2}>
              {stat.icon}
              <Heading level={2} className="tabular-nums">
                {new Intl.NumberFormat(locale).format(Number(stat.value))}
              </Heading>
              <Text type="supporting" color="secondary">
                {stat.label}
              </Text>
            </VStack>
          </Card>
        ))}
      </Grid>

      <VStack gap={3}>
        <Heading level={2}>{t.admin.reviewTitle}</Heading>
        {pendingProviders.length === 0 && modelRows.length === 0 ? (
          <EmptyState
            icon={<Check size={28} />}
            title={t.admin.reviewEmpty}
            description={t.admin.providerSubtitle}
            isCompact
          />
        ) : null}

        {pendingProviders.map((provider) => (
          <Card key={provider.id} padding={5}>
            <VStack gap={4}>
              <HStack width="100%" justify="between" align="start" wrap="wrap" gap={3}>
                <VStack gap={1}>
                  <HStack gap={2} align="center" wrap="wrap">
                    <StatusDot variant="warning" label={t.common.status.pending} />
                    <Heading level={3}>{provider.name}</Heading>
                    <StatusBadge status={provider.status} t={t} />
                    <Badge
                      variant="neutral"
                      label={
                        apiModeLabels[normalizeProviderMode(provider.api_mode)] ??
                        t.dash.apiModeChat
                      }
                    />
                  </HStack>
                  <Text type="code">{provider.base_url}</Text>
                  <Text type="supporting" color="secondary">
                    {t.admin.submittedBy}: {provider.owner ?? "—"} ({provider.owner_email ?? "—"}) ·{" "}
                    {new Date(provider.created_at).toLocaleString(locale)}
                  </Text>
                  {provider.notes ? (
                    <Text type="body">{provider.notes}</Text>
                  ) : null}
                </VStack>
                <HStack gap={2} wrap="wrap">
                  <form action={reviewProviderAction}>
                    <input type="hidden" name="providerId" value={provider.id} />
                    <input type="hidden" name="decision" value="approve" />
                    <Button type="submit" variant="primary" label={t.admin.approve} icon={<Check size={16} />} />
                  </form>
                  <form action={reviewProviderAction}>
                    <input type="hidden" name="providerId" value={provider.id} />
                    <input type="hidden" name="decision" value="reject" />
                    <Button type="submit" variant="destructive" label={t.admin.reject} />
                  </form>
                </HStack>
              </HStack>
              <HStack gap={2} wrap="wrap">
                {(provider.models ?? "").split(",").filter(Boolean).map((model) => (
                  <Badge key={model} variant="neutral" label={model.trim()} />
                ))}
              </HStack>
            </VStack>
          </Card>
        ))}

        {modelRows.length > 0 ? (
          <Card padding={0}>
            <AdminPendingModelsTable rows={modelRows} t={t} />
          </Card>
        ) : null}
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>{t.admin.recentErrors}</Heading>
        {errorData.length > 0 ? (
          <Card padding={0}>
            <Table data={errorData} columns={errorColumns} />
          </Card>
        ) : (
          <Banner status="info" title={t.admin.empty} />
        )}
      </VStack>

      <VStack gap={3}>
        <Heading level={2}>{t.admin.auditTitle}</Heading>
        {auditData.length > 0 ? (
          <Card padding={0}>
            <Table data={auditData} columns={auditColumns} />
          </Card>
        ) : (
          <Banner status="info" title={t.admin.empty} />
        )}
      </VStack>
    </>
  );
}
