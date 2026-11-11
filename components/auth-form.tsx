"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Banner } from "@astryxdesign/core/Banner";
import { Divider } from "@astryxdesign/core/Divider";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@/components/form-fields";
import { Heading } from "@astryxdesign/core/Heading";
import { Key, RefreshClockwise, ShieldCheck } from "geist-icons";
import { loginAction, signupAction, type AuthState } from "@/app/actions/auth";
import { refreshCaptchaAction } from "@/app/actions/auth";
import type { CaptchaChallenge } from "@/lib/captcha";
import type { Dictionary, Locale } from "@/lib/i18n";

type Props = {
  mode: "signup" | "login";
  t: Dictionary;
  locale: Locale;
  captcha?: CaptchaChallenge;
  googleEnabled: boolean;
};

export function AuthForm({ mode, t, locale, captcha: initial, googleEnabled }: Props) {
  const action = mode === "signup" ? signupAction : loginAction;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    {},
  );
  const [captcha, setCaptcha] = useState<CaptchaChallenge | undefined>(initial);
  const [refreshing, startRefresh] = useTransition();
  const searchParams = useSearchParams();
  const oauthError = searchParams.get("error");

  function refresh() {
    startRefresh(async () => {
      const next = await refreshCaptchaAction();
      setCaptcha(next);
    });
  }

  const isSignup = mode === "signup";

  return (
    <Card padding={6} width="100%" maxWidth={460} elevation="low">
      <VStack gap={5} align="stretch">
        <VStack gap={2} align="center">
          <ShieldCheck size={28} />
          <Heading level={1} className="text-center">
            {isSignup ? t.auth.signupTitle : t.auth.loginTitle}
          </Heading>
          <Text type="supporting" color="secondary" justify="center">
            {isSignup ? t.auth.signupSubtitle : t.auth.loginSubtitle}
          </Text>
        </VStack>

        <form action={formAction}>
          <VStack gap={4}>
            <input type="hidden" name="locale" value={locale} />

            {state.error ? (
              <Banner status="error" title={state.error} />
            ) : null}
            {oauthError === "google" || oauthError === "google_state" ? (
              <Banner status="error" title={t.auth.errors.google} />
            ) : null}

            <FormLayout>
              {isSignup ? (
                <TextInput
                  label={t.auth.name}
                  htmlName="name"
                  placeholder="Ada Lovelace"
                  isRequired
                />
              ) : null}
              <TextInput
                label={t.auth.email}
                type="email"
                htmlName="email"
                placeholder="you@example.com"
                isRequired
              />
              <TextInput
                label={t.auth.password}
                type="password"
                htmlName="password"
                placeholder={isSignup ? "At least 8 characters" : "••••••••"}
                isRequired
              />
            </FormLayout>

            {isSignup && captcha ? (
              <VStack gap={2}>
                <input type="hidden" name="captchaId" value={captcha.id} />
                <VStack gap={0.5}>
                  <Text type="label">{t.auth.captcha}</Text>
                  <Text type="supporting" color="secondary">
                    {t.auth.captchaHint}
                  </Text>
                </VStack>
                <div className="cmn-captcha">
                  <img
                    key={captcha.id}
                    src={captcha.imageUrl}
                    alt={t.auth.captcha}
                    width={240}
                    height={80}
                    className="cmn-captcha-image"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    label={t.auth.refresh}
                    isIconOnly
                    icon={<RefreshClockwise size={16} />}
                    isDisabled={refreshing}
                    onClick={refresh}
                  />
                </div>
                <TextInput label="Answer" htmlName="captchaAnswer" isRequired />
              </VStack>
            ) : null}

            <Button
              type="submit"
              variant="primary"
              width="100%"
              size="lg"
              isLoading={pending}
              label={isSignup ? t.auth.signup : t.auth.login}
              icon={<Key size={16} />}
            />
          </VStack>
        </form>

        {googleEnabled ? (
          <>
            <Divider />
            <Button
              variant="secondary"
              width="100%"
              size="lg"
              label={t.auth.google}
              // Full page navigation is required: the route handler responds
              // with a 302 to Google, which client-side routing won't follow.
              // eslint-disable-next-line @next/next/no-location-assign-relative-destination
              onClick={() => (window.location.href = "/api/auth/google")}
            />
          </>
        ) : (
          <Text type="supporting" color="secondary" justify="center">
            {t.auth.googleUnavailable}
          </Text>
        )}

        <HStack justify="center" gap={1} align="center" wrap="wrap">
          <Text type="supporting" color="secondary">
            {isSignup ? t.auth.haveAccount : t.auth.noAccount}
          </Text>
          <Link href={isSignup ? "/login" : "/signup"} className="underline">
            <Text type="supporting" weight="medium">
              {isSignup ? t.auth.login : t.auth.signup}
            </Text>
          </Link>
        </HStack>

        {process.env.NODE_ENV !== "production" ? (
          <Text type="supporting" color="secondary" justify="center">
            {t.auth.adminHint}
          </Text>
        ) : null}
      </VStack>
    </Card>
  );
}
