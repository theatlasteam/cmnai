import { requireUser } from "@/lib/auth";
import { createCaptcha } from "@/lib/captcha";
import { listProviderKeysForUser } from "@/lib/provider-keys";
import { dictionaries, getLocale } from "@/lib/i18n";
import { getOwnEndpoints } from "@/app/actions/keys";
import { EndpointManager } from "@/components/endpoint-manager";



export default async function EndpointsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { submitted } = await searchParams;
  const [locale, user] = await Promise.all([getLocale(), requireUser()]);
  const t = dictionaries[locale];
  const endpoints = await getOwnEndpoints(user.id);
  const providerKeys = await listProviderKeysForUser(user.id);

  return (
    <EndpointManager
      t={t}
      locale={locale}
      endpoints={endpoints}
      captcha={await createCaptcha()}
      notice={submitted}
      providerKeys={providerKeys}
      isAdmin={user.role === "admin"}
    />
  );
}
