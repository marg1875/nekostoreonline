export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
export const MAX_MIRROR_BYTES = 5 * 1024 * 1024;

// El tipo se decide por los primeros bytes, nunca por lo que diga el cliente.
export function detectImageType(bytes) {
  const b = new Uint8Array(bytes.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return "image/png";
  const riff = String.fromCharCode(b[0], b[1], b[2], b[3]);
  const webp = String.fromCharCode(b[8], b[9], b[10], b[11]);
  if (riff === "RIFF" && webp === "WEBP") return "image/webp";
  return null;
}

function randomKey() {
  const raw = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function storeImage(env, bytes, type) {
  const key = randomKey();
  await env.IMAGES.put("img:" + key, bytes, { metadata: { type } });
  return "/img/" + key;
}

// Borra la foto de KV solo si ningún otro producto la sigue usando.
export async function deleteImageIfOrphan(env, imagePath) {
  if (!imagePath || !imagePath.startsWith("/img/")) return;
  const still = await env.DB.prepare("SELECT 1 FROM products WHERE image = ? LIMIT 1").bind(imagePath).first();
  if (!still) await env.IMAGES.delete("img:" + imagePath.slice(5));
}

function isPrivateHost(host) {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (h.includes(":")) return true; // cualquier IPv6 literal
  return false;
}

function checkUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password) return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  if (isPrivateHost(u.hostname)) return null;
  return u;
}

// Descarga una imagen externa (para guardar copia propia y no depender de otras tiendas).
export async function fetchRemoteImage(rawUrl) {
  let url = checkUrl(rawUrl);
  if (!url) return { error: "URL no permitida" };

  for (let hop = 0; hop < 4; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    let res;
    try {
      res = await fetch(url.toString(), {
        redirect: "manual",
        signal: ctrl.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          "Referer": url.origin + "/",
          "Accept": "image/*"
        }
      });
    } catch {
      clearTimeout(timer);
      return { error: "No se pudo descargar la imagen" };
    }

    if (res.status >= 300 && res.status < 400) {
      clearTimeout(timer);
      const loc = res.headers.get("Location");
      url = loc ? checkUrl(new URL(loc, url).toString()) : null;
      if (!url) return { error: "Redirección no permitida" };
      continue;
    }
    if (!res.ok) { clearTimeout(timer); return { error: "El sitio respondió " + res.status }; }

    const declared = Number(res.headers.get("Content-Length") || 0);
    if (declared > MAX_MIRROR_BYTES) { clearTimeout(timer); return { error: "La imagen es demasiado grande" }; }

    const chunks = [];
    let total = 0;
    try {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > MAX_MIRROR_BYTES) { ctrl.abort(); clearTimeout(timer); return { error: "La imagen es demasiado grande" }; }
        chunks.push(value);
      }
    } catch {
      clearTimeout(timer);
      return { error: "Falló la descarga" };
    }
    clearTimeout(timer);

    const bytes = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { bytes.set(c, off); off += c.length; }
    return { bytes: bytes.buffer };
  }
  return { error: "Demasiadas redirecciones" };
}
