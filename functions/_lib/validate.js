const IMAGE_RE = /^(uploads\/[A-Za-z0-9._\-()%\/ ]{1,200}|\/img\/[A-Za-z0-9_-]{16,64}|https?:\/\/[^\s]{1,450})$/;

function str(v, max) {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length <= max ? s : null;
}

function isValidDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(iso + "T00:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

// Valida y normaliza. Con partial=true solo revisa los campos presentes.
export function validateProduct(input, partial = false) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { error: "Datos inválidos" };
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(input, k);

  if (has("name") || !partial) {
    const v = str(input.name, 120);
    if (!v) return { error: "El nombre es obligatorio (máx. 120 caracteres)" };
    out.name = v;
  }
  if (has("price") || !partial) {
    const n = Number(input.price);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) return { error: "Precio inválido" };
    out.price = Math.round(n * 100) / 100;
  }
  if (has("stock") || !partial) {
    const n = Number(input.stock);
    if (!Number.isInteger(n) || n < 0 || n > 9999) return { error: "Stock inválido (entero 0-9999)" };
    out.stock = n;
  }
  if (has("featured") || !partial) {
    out.featured = input.featured ? 1 : 0;
  }
  if (has("image") || !partial) {
    const v = str(input.image ?? "", 500);
    if (v === null || (v !== "" && (!IMAGE_RE.test(v) || v.includes("..")))) return { error: "Imagen inválida" };
    out.image = v;
  }
  if (has("description") || !partial) {
    const v = str(input.description ?? "", 2000);
    if (v === null) return { error: "Descripción demasiado larga (máx. 2000)" };
    out.description = v;
  }
  if (has("condition") || !partial) {
    const v = input.condition ?? "NEW";
    if (v !== "NEW" && v !== "USED") return { error: "Condición inválida" };
    out.condition = v;
  }
  if (has("brand") || !partial) {
    const v = str(input.brand ?? "", 80);
    if (v === null) return { error: "Marca demasiado larga" };
    out.brand = v;
  }
  if (has("collection") || !partial) {
    const v = str(input.collection ?? "", 80);
    if (v === null) return { error: "Colección demasiado larga" };
    out.collection = v;
  }
  if (has("status") || !partial) {
    const v = input.status ?? "";
    if (v !== "" && v !== "PROXIMO") return { error: "Estado inválido" };
    out.status = v;
  }
  if (has("arrival") || !partial) {
    const v = str(input.arrival ?? "", 10);
    if (v === null || (v !== "" && !isValidDate(v))) return { error: "Fecha de llegada inválida" };
    out.arrival = v;
  }
  return { value: out };
}

export function parseId(raw) {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
