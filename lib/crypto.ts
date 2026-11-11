import {
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";

export const SECRET =
  process.env.CMNAI_SECRET ?? "cmnai-dev-secret-change-me-in-production";

// Keep the KDF cheap enough for the Workers CPU budget while still storing
// parameters with every hash so the cost can be raised later.
const SCRYPT_N = 4096;
const SCRYPT_R = 8;
const SCRYPT_P = 1;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  }).toString("hex");
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  if (stored.startsWith("scrypt$")) {
    const [scheme, nRaw, rRaw, pRaw, salt, hash] = stored.split("$");
    if (scheme !== "scrypt" || !salt || !hash) return false;
    const n = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    if (!Number.isFinite(n) || !Number.isFinite(r) || !Number.isFinite(p)) {
      return false;
    }
    const candidate = scryptSync(password, salt, 64, { N: n, r, p });
    const expected = Buffer.from(hash, "hex");
    return (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    );
  }

  // Hashes created before the move to D1 used Node's defaults.
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const candidate = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const raw = randomBytes(24).toString("base64url");
  const key = `cmn_sk_${raw}`;
  return { key, prefix: key.slice(0, 12), hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key + SECRET).digest("hex");
}

export function sign(value: string): string {
  return createHmac("sha256", SECRET).update(value).digest("base64url");
}

export function verifySignature(value: string, signature: string): boolean {
  const expected = Buffer.from(sign(value));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}
