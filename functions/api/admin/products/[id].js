import { json, readJson, rowToProduct, PRODUCT_COLUMNS } from "../../../_lib/util.js";
import { validateProduct, parseId } from "../../../_lib/validate.js";
import { deleteImageIfOrphan } from "../../../_lib/images.js";

// Lista blanca de columnas editables: los nombres vienen del código, los valores siempre van enlazados (bind).
const EDITABLE = ["name", "price", "stock", "featured", "image", "description", "condition", "brand", "collection", "status", "arrival"];

export async function onRequestPut({ request, env, params }) {
  const id = parseId(params.id);
  if (!id) return json({ error: "ID inválido" }, 400);

  const body = await readJson(request);
  if (!body || typeof body !== "object") return json({ error: "Datos inválidos" }, 400);

  const existing = await env.DB.prepare("SELECT image FROM products WHERE id = ?").bind(id).first();
  if (!existing) return json({ error: "No existe" }, 404);

  const { stockDelta, ...fields } = body;
  const { value, error } = validateProduct(fields, true);
  if (error) return json({ error }, 400);

  const sets = [];
  const binds = [];
  for (const col of EDITABLE) {
    if (Object.prototype.hasOwnProperty.call(value, col)) {
      sets.push(`${col} = ?`);
      binds.push(value[col]);
    }
  }

  if (stockDelta !== undefined) {
    const d = Number(stockDelta);
    if (!Number.isInteger(d) || d < -9999 || d > 9999) return json({ error: "Ajuste de stock inválido" }, 400);
    sets.push("stock = MAX(0, MIN(9999, stock + ?))");
    binds.push(d);
  }

  if (!sets.length) return json({ error: "Nada que actualizar" }, 400);
  sets.push("updated_at = datetime('now')");

  await env.DB.prepare(`UPDATE products SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, id).run();

  if (value.image !== undefined && value.image !== existing.image) {
    await deleteImageIfOrphan(env, existing.image);
  }

  const row = await env.DB.prepare(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = ?`).bind(id).first();
  return json({ product: rowToProduct(row) });
}

export async function onRequestDelete({ env, params }) {
  const id = parseId(params.id);
  if (!id) return json({ error: "ID inválido" }, 400);

  const existing = await env.DB.prepare("SELECT image FROM products WHERE id = ?").bind(id).first();
  if (!existing) return json({ error: "No existe" }, 404);

  await env.DB.prepare("DELETE FROM products WHERE id = ?").bind(id).run();
  await deleteImageIfOrphan(env, existing.image);
  return json({ ok: true });
}
