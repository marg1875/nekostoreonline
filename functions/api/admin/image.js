import { json, readJson } from "../../_lib/util.js";
import {
  detectImageType, storeImage, fetchRemoteImage, MAX_UPLOAD_BYTES
} from "../../_lib/images.js";

// POST multipart (campo "file") = subir foto. POST JSON {url} = traer y guardar copia propia.
export async function onRequestPost({ request, env }) {
  if (!env.IMAGES) return json({ error: "Almacén de imágenes no configurado" }, 500);

  const ctype = request.headers.get("Content-Type") || "";
  let bytes;

  if (ctype.includes("multipart/form-data")) {
    let form;
    try { form = await request.formData(); } catch { return json({ error: "Archivo inválido" }, 400); }
    const file = form.get("file");
    if (!file || typeof file === "string") return json({ error: "Falta el archivo" }, 400);
    if (file.size > MAX_UPLOAD_BYTES) return json({ error: "La imagen pesa más de 3 MB" }, 413);
    bytes = await file.arrayBuffer();
  } else {
    const body = await readJson(request);
    if (!body || typeof body.url !== "string") return json({ error: "Falta la URL" }, 400);
    const res = await fetchRemoteImage(body.url.trim());
    if (res.error) return json({ error: res.error }, 400);
    bytes = res.bytes;
  }

  const type = detectImageType(bytes);
  if (!type) return json({ error: "Solo se aceptan imágenes JPG, PNG o WEBP" }, 415);

  const path = await storeImage(env, bytes, type);
  return json({ path }, 201);
}
