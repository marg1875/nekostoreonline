import { json, readJson } from "../../_lib/util.js";
import {
  signSession, sessionCookie, SESSION_SECONDS,
  safeEqual, lockoutRemaining, recordFailure, clearFailures
} from "../../_lib/auth.js";

export async function onRequestPost({ request, env }) {
  const ip = request.headers.get("CF-Connecting-IP") || "local";

  const wait = await lockoutRemaining(env, ip);
  if (wait > 0) {
    return json({ error: "Demasiados intentos. Intenta más tarde." }, 429, { "Retry-After": String(wait) });
  }

  const body = await readJson(request);
  const password = body && typeof body.password === "string" ? body.password : "";

  const ok = password.length > 0 && password.length <= 200 && (await safeEqual(password, env.ADMIN_PASSWORD));
  if (!ok) {
    await recordFailure(env, ip);
    return json({ error: "Contraseña incorrecta" }, 401);
  }

  await clearFailures(env, ip);
  const token = await signSession(env);
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(request, token, SESSION_SECONDS) });
}
