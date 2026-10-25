export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers
    }
  });
}

export async function readJson(request) {
  try {
    const text = await request.text();
    if (text.length > 200_000) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price REAL NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    featured INTEGER NOT NULL DEFAULT 0,
    image TEXT NOT NULL DEFAULT '',
    gallery TEXT NOT NULL DEFAULT '[]',
    description TEXT NOT NULL DEFAULT '',
    condition TEXT NOT NULL DEFAULT 'NEW',
    brand TEXT NOT NULL DEFAULT '',
    collection TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT '',
    arrival TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS login_attempts (
    ip TEXT PRIMARY KEY,
    count INTEGER NOT NULL DEFAULT 0,
    window_start INTEGER NOT NULL DEFAULT 0
  )`
];

let schemaReady = false;
export async function ensureSchema(env) {
  if (schemaReady) return;
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  // Bases creadas antes de la galería: agrega la columna (si ya existe, el error se ignora).
  try {
    await env.DB.prepare("ALTER TABLE products ADD COLUMN gallery TEXT NOT NULL DEFAULT '[]'").run();
  } catch {}
  schemaReady = true;
}

export const PRODUCT_COLUMNS =
  "id, name, price, stock, featured, image, gallery, description, condition, brand, collection, status, arrival, sort_order, updated_at";

function parseGallery(raw) {
  try {
    const v = JSON.parse(raw || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function rowToProduct(r) {
  return {
    id: r.id,
    name: r.name,
    price: r.price,
    stock: r.stock,
    featured: !!r.featured,
    image: r.image,
    gallery: parseGallery(r.gallery),
    description: r.description,
    condition: r.condition,
    brand: r.brand,
    collection: r.collection,
    status: r.status,
    arrival: r.arrival,
    sort_order: r.sort_order,
    updated_at: r.updated_at
  };
}
