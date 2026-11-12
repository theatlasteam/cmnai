import { listApiKeys, requireUser } from "@/lib/auth";
import { dictionaries, getLocale } from "@/lib/i18n";
import { KeyManager } from "@/components/key-manager";



export default async function KeysPage() {
  const [locale, user] = await Promise.all([getLocale(), requireUser()]);
  const t = dictionaries[locale];
  const keys = (await listApiKeys(user.id)).filter((key) => !key.revoked_at);

  return <KeyManager t={t} keys={keys} locale={locale} />;
}
