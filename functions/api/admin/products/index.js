import { json, readJson, rowToProduct, PRODUCT_COLUMNS } from "../../../_lib/util.js";
import { validateProduct } from "../../../_lib/validate.js";

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT ${PRODUCT_COLUMNS} FROM products ORDER BY sort_order, id`
  ).all();
  return json({ products: results.map(rowToProduct) });
}

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  const { value, error } = validateProduct(body, false);
  if (error) return json({ error }, 400);

  const res = await env.DB.prepare(
    `INSERT INTO products (name, price, stock, featured, image, description, condition, brand, collection, status, arrival, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM products))`
  ).bind(
    value.name, value.price, value.stock, value.featured, value.image, value.description,
    value.condition, value.brand, value.collection, value.status, value.arrival
  ).run();

  const id = res.meta.last_row_id;
  const row = await env.DB.prepare(`SELECT ${PRODUCT_COLUMNS} FROM products WHERE id = ?`).bind(id).first();
  return json({ product: rowToProduct(row) }, 201);
}
