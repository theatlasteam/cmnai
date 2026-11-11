import { Card } from "@astryxdesign/core/Card";
import { VStack } from "@astryxdesign/core/Layout";

import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { requireAdmin } from "@/lib/auth";
import { all } from "@/lib/db";
import { utcDayStart } from "@/lib/pool";
import { dictionaries, getLocale } from "@/lib/i18n";
import { AdminUsersTable } from "@/components/admin-tables";


export default async function AdminUsersPage() {
  const [locale] = await Promise.all([getLocale(), requireAdmin()]);
  const t = dictionaries[locale];

  const users = await all<{
    id: string;
    name: string;
    email: string;
    role: string;
    status: string;
    created_at: string;
    keys: number;
    endpoints: number;
    requests_today: number;
    tokens_today: number;
  }>(
    `SELECT u.id, u.name, u.email, u.role, u.status, u.created_at,
            (SELECT COUNT(*) FROM api_keys k WHERE k.user_id = u.id AND k.revoked_at IS NULL) AS keys,
            (SELECT COUNT(*) FROM providers p WHERE p.user_id = u.id) AS endpoints,
            (SELECT COUNT(*) FROM usage_events e
              WHERE e.user_id = u.id AND e.created_at >= ?) AS requests_today,
            (SELECT COALESCE(SUM(e.prompt_tokens + e.completion_tokens), 0)
              FROM usage_events e WHERE e.user_id = u.id AND e.created_at >= ?) AS tokens_today
     FROM users u ORDER BY u.created_at DESC`,
    utcDayStart(),
    utcDayStart(),
  );

  const rows = users.map((user) => ({ ...user }));

  return (
    <>
      <VStack gap={1}>
        <Heading level={1}>{t.admin.usersTitle}</Heading>
        <Text type="body" color="secondary">
          {t.admin.usersSubtitle}
        </Text>
      </VStack>

      <Card padding={0}>
        <AdminUsersTable rows={rows} t={t} locale={locale} />
      </Card>
    </>
  );
}
