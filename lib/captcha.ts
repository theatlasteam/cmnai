import { id, now, one, run } from "./db";

export type CaptchaChallenge = {
  id: string;
  imageUrl: string;
};

const TTL_MS = 10 * 60 * 1000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 5): string {
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

export async function createCaptcha(): Promise<CaptchaChallenge> {
  await run("DELETE FROM captchas WHERE expires_at < ?", now());
  const captchaId = id("cap_");
  const expires = new Date(Date.now() + TTL_MS).toISOString();
  await run(
    "INSERT INTO captchas (id, answer, expires_at, created_at) VALUES (?, ?, ?, ?)",
    captchaId,
    randomCode(),
    expires,
    now(),
  );
  return { id: captchaId, imageUrl: `/api/captcha/${captchaId}` };
}

export async function consumeCaptcha(
  captchaId: string | undefined,
  answer: string,
): Promise<boolean> {
  if (!captchaId) return false;
  const row = await one<{ answer: string; expires_at: string }>(
    "SELECT answer, expires_at FROM captchas WHERE id = ?",
    captchaId,
  );
  if (!row) return false;
  await run("DELETE FROM captchas WHERE id = ?", captchaId);
  if (row.expires_at < now()) return false;
  return row.answer.toLowerCase() === answer.trim().toLowerCase();
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (char) => {
    switch (char) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      default:
        return "&apos;";
    }
  });
}

/** Renders the stored captcha code as a noisy, distorted SVG image. */
export async function renderCaptchaSvg(captchaId: string): Promise<string | null> {
  const row = await one<{ answer: string; expires_at: string }>(
    "SELECT answer, expires_at FROM captchas WHERE id = ?",
    captchaId,
  );
  if (!row || row.expires_at < now()) return null;

  const width = 240;
  const height = 80;
  const code = row.answer;
  const palette = ["#F1F1F1", "#A4D6A3", "#88BCFF", "#E496F6", "#81C9BB"];
  const noise: string[] = [];

  for (let i = 0; i < 9; i += 1) {
    const x1 = Math.random() * width;
    const y1 = Math.random() * height;
    const x2 = Math.random() * width;
    const y2 = Math.random() * height;
    noise.push(
      `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} Q ${((x1 + x2) / 2 + 20).toFixed(1)} ${((y1 + y2) / 2 - 20).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="rgba(255,255,255,0.22)" stroke-width="1.2" fill="none"/>`,
    );
  }
  for (let i = 0; i < 45; i += 1) {
    noise.push(
      `<circle cx="${(Math.random() * width).toFixed(1)}" cy="${(Math.random() * height).toFixed(1)}" r="${(Math.random() * 1.6 + 0.4).toFixed(1)}" fill="rgba(255,255,255,0.26)"/>`,
    );
  }

  const glyphs = code
    .split("")
    .map((char, index) => {
      const x = 34 + index * 36;
      const y = 52 + (Math.random() * 10 - 5);
      const rotate = (Math.random() * 26 - 13).toFixed(1);
      const scale = (0.92 + Math.random() * 0.22).toFixed(2);
      const color = palette[Math.floor(Math.random() * palette.length)];
      return `<text x="${x}" y="${y.toFixed(1)}" font-family="'Geist Mono', 'Courier New', monospace" font-size="36" font-weight="700" fill="${color}" transform="rotate(${rotate} ${x} ${y}) scale(${scale})" textLength="30" lengthAdjust="spacingAndGlyphs">${escapeXml(char)}</text>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Verification code">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#232326"/>
      <stop offset="55%" stop-color="#2A2A2E"/>
      <stop offset="100%" stop-color="#1E1E21"/>
    </linearGradient>
    <filter id="warp">
      <feTurbulence type="fractalNoise" baseFrequency="0.02 0.04" numOctaves="2" seed="${Math.floor(Math.random() * 100)}" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="1.6" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>
  <rect width="${width}" height="${height}" rx="12" fill="url(#bg)"/>
  <g filter="url(#warp)">${glyphs}</g>
  <g opacity="0.55">${noise.join("")}</g>
  <rect x="0.75" y="0.75" width="${width - 1.5}" height="${height - 1.5}" rx="12" fill="none" stroke="rgba(255,255,255,0.14)"/>
</svg>`;
}
