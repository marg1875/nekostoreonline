import { json, ensureSchema } from "../../_lib/util.js";
import { COOKIE_NAME, getCookie, verifySession } from "../../_lib/auth.js";

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  if (!env.DB || !env.SESSION_SECRET || !env.ADMIN_PASSWORD) {
    return json({ error: "Panel no configurado" }, 500);
  }

  // Defensa CSRF extra (además de SameSite=Strict): en métodos que modifican,
  // si el navegador manda Origin debe ser el mismo sitio.
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) return json({ error: "Origen no permitido" }, 403);
  }

  await ensureSchema(env);

  if (url.pathname === "/api/admin/login") return next();

  const ok = await verifySession(env, getCookie(request, COOKIE_NAME));
  if (!ok) return json({ error: "No autorizado" }, 401);
  return next();
}
