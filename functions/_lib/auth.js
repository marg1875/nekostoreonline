const enc = new TextEncoder();
export const COOKIE_NAME = "ns_admin";
export const SESSION_SECONDS = 12 * 60 * 60;

function toHex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function b64url(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(str) {
  const pad = "=".repeat((4 - (str.length % 4)) % 4);
  return atob(str.replace(/-/g, "+").replace(/_/g, "/") + pad);
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}

async function sha256(text) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

// Compara en tiempo constante (se comparan los hashes, no los textos).
export async function safeEqual(a, b) {
  const [ha, hb] = await Promise.all([sha256(String(a)), sha256(String(b))]);
  let diff = 0;
  for (let i = 0; i < ha.length; i++) diff |= ha[i] ^ hb[i];
  return diff === 0;
}

export async function signSession(env) {
  const payload = b64url(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS }));
  const sig = await hmacHex(env.SESSION_SECRET, payload);
  return payload + "." + sig;
}

export async function verifySession(env, token) {
  if (!env.SESSION_SECRET || !token || typeof token !== "string") return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  const expected = await hmacHex(env.SESSION_SECRET, payload);
  if (!(await safeEqual(sig, expected))) return false;
  try {
    const { exp } = JSON.parse(unb64url(payload));
    return typeof exp === "number" && exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

export function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

export function sessionCookie(request, token, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

export const MAX_ATTEMPTS = 5;
export const WINDOW_SECONDS = 15 * 60;

export async function lockoutRemaining(env, ip) {
  const row = await env.DB.prepare("SELECT count, window_start FROM login_attempts WHERE ip = ?").bind(ip).first();
  if (!row) return 0;
  const now = Math.floor(Date.now() / 1000);
  const elapsed = now - row.window_start;
  if (elapsed >= WINDOW_SECONDS) return 0;
  return row.count >= MAX_ATTEMPTS ? WINDOW_SECONDS - elapsed : 0;
}

export async function recordFailure(env, ip) {
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare("SELECT count, window_start FROM login_attempts WHERE ip = ?").bind(ip).first();
  if (!row || now - row.window_start >= WINDOW_SECONDS) {
    await env.DB.prepare("INSERT OR REPLACE INTO login_attempts (ip, count, window_start) VALUES (?, 1, ?)").bind(ip, now).run();
  } else {
    await env.DB.prepare("UPDATE login_attempts SET count = count + 1 WHERE ip = ?").bind(ip).run();
  }
}

export async function clearFailures(env, ip) {
  await env.DB.prepare("DELETE FROM login_attempts WHERE ip = ?").bind(ip).run();
}
