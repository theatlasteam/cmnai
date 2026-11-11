import { redirect } from "next/navigation";
import { connection } from "next/server";
import { VStack } from "@astryxdesign/core/Layout";
import { Section } from "@astryxdesign/core/Section";
import { getCurrentUser } from "@/lib/auth";
import { createCaptcha } from "@/lib/captcha";
import { dictionaries, getLocale } from "@/lib/i18n";
import { SiteHeader } from "@/components/site-header";
import { AuthForm } from "@/components/auth-form";



export default async function SignupPage() {
  await connection();
  const [locale, user] = await Promise.all([getLocale(), getCurrentUser()]);
  if (user) redirect(user.role === "admin" ? "/admin" : "/dashboard");
  const t = dictionaries[locale];
  const captcha = await createCaptcha();

  return (
    <VStack width="100%" minHeight="100vh" gap={0}>
      <SiteHeader t={t} locale={locale} user={null} />
      <Section variant="transparent" padding={0}>
        <VStack
          width="100%"
          minHeight="calc(100vh - 64px)"
          align="center"
          justify="center"
          paddingInline={4}
          paddingBlock={8}
        >
          <AuthForm
            mode="signup"
            t={t}
            locale={locale}
            captcha={captcha}
            googleEnabled={Boolean(
              process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
            )}
          />
        </VStack>
      </Section>
    </VStack>
  );
}
