// Genera migrations/0002_seed.sql y migrations/setup.sql (esquema + datos)
// a partir del Sheet publicado y de IMAGE_MAP. Uso: node scripts/make-seed.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "NeckoStore.dc.html"), "utf8");

const csvUrl = /const SHEET_CSV_URL = "([^"]+)"/.exec(html)?.[1];
if (!csvUrl) throw new Error("No encontré SHEET_CSV_URL en NeckoStore.dc.html");

const mapSrc = /const IMAGE_MAP = (\{[\s\S]*?\n\});/.exec(html)?.[1];
if (!mapSrc) throw new Error("No encontré IMAGE_MAP en NeckoStore.dc.html");
const IMAGE_MAP = new Function("return " + mapSrc)();

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = ""; rows.push(row); row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const header = (rows.shift() || []).map((h) => h.trim());
  return rows.filter((r) => r.some((v) => v.trim() !== "")).map((r) => {
    const o = {};
    header.forEach((h, i) => { o[h] = (r[i] ?? "").trim(); });
    return o;
  });
}

const sql = (v) => (typeof v === "number" ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");

function toIsoDate(raw) {
  const s = (raw || "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
  const [d, mo, y] = [Number(m[1]), Number(m[2]), m[3]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const res = await fetch(csvUrl);
if (!res.ok) throw new Error("No pude bajar el CSV: " + res.status);
const rows = parseCSV(await res.text());

const inserts = [];
const unmapped = [];
rows.forEach((r, idx) => {
  const img = (r.image || "").trim();
  let image = IMAGE_MAP[img];
  if (!image) {
    if (/^https?:\/\//i.test(img)) unmapped.push(`${r.name}: ${img}`);
    image = img;
  }
  const isUsed = /^(used|usada|usado|reempacad)/i.test((r.condition || "").trim());
  const isUpcoming = /^(proximo|pr[oó]ximo|pr[oó]xima|coming)/i.test((r.status || "").trim());
  const featured = /^(true|1|si|sí)$/i.test((r.featured || "").trim()) ? 1 : 0;
  const id = Number(r.id) || idx + 1;
  inserts.push(
    "INSERT OR IGNORE INTO products (id, name, price, stock, featured, image, description, condition, brand, collection, status, arrival, sort_order) VALUES (" +
    [
      id, sql(r.name || ""), Number(r.price) || 0, Math.max(0, parseInt(r.stock, 10) || 0), featured,
      sql(image), sql(r.desc || ""), sql(isUsed ? "USED" : "NEW"), sql(r.brand || ""), sql(r.collection || ""),
      sql(isUpcoming ? "PROXIMO" : ""), sql(toIsoDate(r.arrival)), idx + 1
    ].join(", ") + ");"
  );
});

const schema = readFileSync(join(root, "migrations", "0001_init.sql"), "utf8");
const seed = "-- Datos iniciales (generado por scripts/make-seed.mjs)\n" + inserts.join("\n") + "\n";
writeFileSync(join(root, "migrations", "0002_seed.sql"), seed);
writeFileSync(join(root, "migrations", "setup.sql"), schema + "\n" + seed);

console.log(`Filas: ${rows.length}`);
if (unmapped.length) console.log("Imágenes externas SIN copia local (revisar):\n  " + unmapped.join("\n  "));
