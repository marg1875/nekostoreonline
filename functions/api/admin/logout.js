import { json } from "../../_lib/util.js";
import { sessionCookie } from "../../_lib/auth.js";

export async function onRequestPost({ request }) {
  return json({ ok: true }, 200, { "Set-Cookie": sessionCookie(request, "", 0) });
}
