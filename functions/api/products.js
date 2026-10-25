import { json, ensureSchema, rowToProduct, PRODUCT_COLUMNS } from "../_lib/util.js";

// Público: catálogo para el sitio. Caché de solo 5 s para que los cambios del panel se vean casi al instante.
export async function onRequestGet({ env }) {
  try {
    await ensureSchema(env);
    const { results } = await env.DB.prepare(
      `SELECT ${PRODUCT_COLUMNS} FROM products ORDER BY sort_order, id`
    ).all();
    const products = results.map((r) => {
      const p = rowToProduct(r);
      delete p.sort_order;
      delete p.updated_at;
      return p;
    });
    return json({ products }, 200, { "Cache-Control": "public, max-age=5" });
  } catch {
    return json({ error: "No disponible" }, 503);
  }
}
