import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

/**
 * Mijoz portal parollari (ClientCredential) uchun AES-256-GCM shifrlash.
 * Kalit CREDENTIALS_SECRET (bo'lmasa AUTH_SECRET) dan scrypt orqali olinadi.
 * Saqlash formati: "v1:<iv>:<authTag>:<ciphertext>" (base64).
 * Formatga mos kelmagan qiymat legacy (ochiq matn) deb qaytariladi.
 */

function getKey(): Buffer {
  const secret = process.env.CREDENTIALS_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("CREDENTIALS_SECRET yoki AUTH_SECRET o'rnatilishi shart");
  }
  return scryptSync(secret, "asro-credentials-v1", 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith("v1:")) return stored; // legacy ochiq matn
  const [, ivB64, tagB64, dataB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !dataB64) return stored;
  try {
    const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return "";
  }
}
