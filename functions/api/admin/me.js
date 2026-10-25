import { json } from "../../_lib/util.js";

// Si llegó aquí, el middleware ya validó la sesión.
export async function onRequestGet() {
  return json({ ok: true });
}
