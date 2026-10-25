export async function onRequestGet({ env, params }) {
  const key = String(params.key || "");
  if (!env.IMAGES || !/^[A-Za-z0-9_-]{16,64}$/.test(key)) return new Response("Not found", { status: 404 });

  const { value, metadata } = await env.IMAGES.getWithMetadata("img:" + key, "arrayBuffer");
  if (!value) return new Response("Not found", { status: 404 });

  const type = metadata && ["image/jpeg", "image/png", "image/webp"].includes(metadata.type) ? metadata.type : "application/octet-stream";
  return new Response(value, {
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
