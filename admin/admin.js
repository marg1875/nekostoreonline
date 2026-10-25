(() => {
  const $ = (id) => document.getElementById(id);
  const state = { products: [], filter: "stock", query: "", editing: null, image: "" };

  function el(tag, props, ...kids) {
    const n = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === "class") n.className = v;
        else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
        else if (v !== undefined && v !== null) n.setAttribute(k, v);
      }
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      n.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return n;
  }

  let toastTimer;
  function toast(msg, kind) {
    const t = $("toast");
    t.textContent = msg;
    t.className = "toast " + (kind || "");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add("hidden"), 3200);
  }

  async function api(method, path, body, isForm) {
    const opts = { method, credentials: "same-origin", headers: {} };
    if (body !== undefined) {
      if (isForm) opts.body = body;
      else { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
    }
    const res = await fetch(path, opts);
    let data = null;
    try { data = await res.json(); } catch { /* sin cuerpo */ }
    if (res.status === 401 && path !== "/api/admin/login") { showLogin(); throw new Error("Sesión expirada"); }
    if (!res.ok) throw new Error((data && data.error) || "Error " + res.status);
    return data;
  }

  const imgSrc = (p) => (!p ? "" : /^(https?:)?\/\//.test(p) || p.startsWith("/") ? p : "/" + p);
  const money = (n) => "$" + Number(n).toLocaleString("es-MX") + " MXN";

  function showLogin() {
    $("appView").classList.add("hidden");
    $("loginView").classList.remove("hidden");
    $("loginPassword").value = "";
    $("loginPassword").focus();
  }

  function showApp() {
    $("loginView").classList.add("hidden");
    $("appView").classList.remove("hidden");
  }

  async function load() {
    const data = await api("GET", "/api/admin/products");
    state.products = data.products;
    render();
  }

  // ---- Lista ----
  const isUp = (p) => p.status === "PROXIMO";
  const isSold = (p) => !isUp(p) && p.stock <= 0;
  const inStock = (p) => !isUp(p) && p.stock > 0;

  function filtered() {
    const q = state.query.trim().toLowerCase();
    return state.products.filter((p) => {
      if (state.filter === "stock" && !inStock(p)) return false;
      if (state.filter === "sold" && !isSold(p)) return false;
      if (state.filter === "upcoming" && !isUp(p)) return false;
      if (!q) return true;
      return [p.name, p.brand, p.collection].some((s) => (s || "").toLowerCase().includes(q));
    });
  }

  function render() {
    const all = state.products;
    $("stats").replaceChildren(
      ...[
        [all.filter(inStock).length, "En stock"],
        [all.filter(isSold).length, "Agotadas"],
        [all.filter(isUp).length, "Próximas"],
        [all.length, "Total"]
      ].map(([n, label]) => el("div", { class: "stat" }, el("b", null, n), el("span", null, label)))
    );
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.filter === state.filter));

    const list = filtered();
    $("list").replaceChildren(...list.map(card));
    $("empty").classList.toggle("hidden", list.length > 0);
  }

  function card(p) {
    const badges = [
      p.featured && el("span", { class: "badge star" }, "★ Destacada"),
      isUp(p) && el("span", { class: "badge up" }, "Próxima" + (p.arrival ? " · " + p.arrival : "")),
      isSold(p) && el("span", { class: "badge sold" }, "Agotada"),
      p.condition === "USED" && el("span", { class: "badge" }, "Usada")
    ];
    return el("article", { class: "card" + (isSold(p) ? " sold" : "") },
      el("img", { class: "thumb", src: imgSrc(p.image), alt: "", loading: "lazy" }),
      el("div", null,
        el("p", { class: "card-name" }, p.name),
        el("p", { class: "meta" }, [money(p.price), p.brand, p.collection].filter(Boolean).join(" · ")),
        el("div", { class: "badges" }, badges)
      ),
      el("div", { class: "card-actions" },
        el("div", { class: "stepper" },
          el("button", { type: "button", "aria-label": "Quitar uno", onclick: () => adjustStock(p, -1) }, "−"),
          el("output", null, p.stock),
          el("button", { type: "button", "aria-label": "Agregar uno", onclick: () => adjustStock(p, 1) }, "+")
        ),
        p.stock > 0 && el("button", { type: "button", class: "btn small", onclick: () => update(p, { stock: 0 }, "Marcada como vendida") }, "Vendida"),
        el("button", { type: "button", class: "btn small", onclick: () => update(p, { featured: !p.featured }, p.featured ? "Quitada de destacadas" : "Destacada") }, p.featured ? "★" : "☆"),
        el("span", { class: "spacer" }),
        el("button", { type: "button", class: "btn small", onclick: () => openEdit(p) }, "Editar")
      )
    );
  }

  async function adjustStock(p, delta) {
    const next = Math.max(0, Math.min(9999, p.stock + delta));
    if (next === p.stock) return;
    const prev = p.stock;
    p.stock = next; render();
    try {
      const { product } = await api("PUT", "/api/admin/products/" + p.id, { stockDelta: delta });
      Object.assign(p, product); render();
    } catch (e) {
      p.stock = prev; render(); toast(e.message, "err");
    }
  }

  async function update(p, fields, okMsg) {
    const prev = { ...p };
    Object.assign(p, fields); render();
    try {
      const { product } = await api("PUT", "/api/admin/products/" + p.id, fields);
      Object.assign(p, product); render();
      if (okMsg) toast(okMsg, "ok");
    } catch (e) {
      Object.assign(p, prev); render(); toast(e.message, "err");
    }
  }

  // ---- Editor ----
  function fillDatalists() {
    const uniq = (key) => [...new Set(state.products.map((p) => p[key]).filter(Boolean))].sort();
    $("brandList").replaceChildren(...uniq("brand").map((v) => el("option", { value: v })));
    $("collectionList").replaceChildren(...uniq("collection").map((v) => el("option", { value: v })));
  }

  function toggleArrival() {
    $("arrivalRow").classList.toggle("hidden", $("fStatus").value !== "PROXIMO");
  }

  function setPreview(path) {
    state.image = path;
    const img = $("imgPreview");
    if (path) img.src = imgSrc(path); else img.removeAttribute("src");
  }

  function openEdit(p) {
    state.editing = p ? p.id : null;
    fillDatalists();
    $("editTitle").textContent = p ? "Editar figura" : "Nueva figura";
    $("fName").value = p ? p.name : "";
    $("fPrice").value = p ? p.price : "";
    $("fStock").value = p ? p.stock : 1;
    $("fCondition").value = p ? p.condition : "NEW";
    $("fStatus").value = p ? p.status : "";
    $("fArrival").value = p ? p.arrival : "";
    $("fBrand").value = p ? p.brand : "";
    $("fCollection").value = p ? p.collection : "";
    $("fDescription").value = p ? p.description : "";
    $("fFeatured").checked = p ? p.featured : false;
    $("imgUrl").value = "";
    $("imgMsg").textContent = "";
    $("editError").classList.add("hidden");
    $("deleteBtn").classList.toggle("hidden", !p);
    setPreview(p ? p.image : "");
    toggleArrival();
    $("editDialog").showModal();
  }

  async function resizeToJpeg(file) {
    const bmp = await createImageBitmap(file);
    const max = 1400;
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo procesar la imagen"))), "image/jpeg", 0.9));
  }

  async function uploadFile(file) {
    $("imgMsg").textContent = "Subiendo…";
    try {
      const blob = await resizeToJpeg(file);
      const form = new FormData();
      form.append("file", blob, "foto.jpg");
      const { path } = await api("POST", "/api/admin/image", form, true);
      setPreview(path);
      $("imgMsg").textContent = "Foto lista. Recuerda guardar.";
    } catch (e) {
      $("imgMsg").textContent = e.message;
    }
  }

  async function fetchUrl() {
    const url = $("imgUrl").value.trim();
    if (!url) return;
    $("imgMsg").textContent = "Descargando y guardando copia propia…";
    $("imgFetch").disabled = true;
    try {
      const { path } = await api("POST", "/api/admin/image", { url });
      setPreview(path);
      $("imgUrl").value = "";
      $("imgMsg").textContent = "Foto lista. Recuerda guardar.";
    } catch (e) {
      $("imgMsg").textContent = e.message;
    } finally {
      $("imgFetch").disabled = false;
    }
  }

  function formPayload() {
    return {
      name: $("fName").value.trim(),
      price: Number($("fPrice").value),
      stock: Number($("fStock").value),
      condition: $("fCondition").value,
      status: $("fStatus").value,
      arrival: $("fStatus").value === "PROXIMO" ? $("fArrival").value : "",
      brand: $("fBrand").value.trim(),
      collection: $("fCollection").value.trim(),
      description: $("fDescription").value.trim(),
      featured: $("fFeatured").checked,
      image: state.image
    };
  }

  async function save(e) {
    e.preventDefault();
    const err = $("editError");
    err.classList.add("hidden");
    $("saveBtn").disabled = true;
    try {
      const payload = formPayload();
      if (state.editing) {
        const { product } = await api("PUT", "/api/admin/products/" + state.editing, payload);
        const i = state.products.findIndex((p) => p.id === state.editing);
        if (i >= 0) state.products[i] = product;
      } else {
        const { product } = await api("POST", "/api/admin/products", payload);
        state.products.push(product);
      }
      $("editDialog").close();
      render();
      toast("Guardado", "ok");
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove("hidden");
    } finally {
      $("saveBtn").disabled = false;
    }
  }

  async function remove() {
    const p = state.products.find((x) => x.id === state.editing);
    if (!p || !confirm("¿Eliminar \"" + p.name + "\"? Esta acción no se puede deshacer.")) return;
    try {
      await api("DELETE", "/api/admin/products/" + p.id);
      state.products = state.products.filter((x) => x.id !== p.id);
      $("editDialog").close();
      render();
      toast("Figura eliminada", "ok");
    } catch (ex) {
      toast(ex.message, "err");
    }
  }

  function exportCsv() {
    const cols = ["id", "name", "price", "stock", "featured", "image", "description", "condition", "brand", "collection", "status", "arrival"];
    const q = (v) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const lines = [cols.join(",")].concat(state.products.map((p) => cols.map((c) => q(p[c])).join(",")));
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = el("a", { href: URL.createObjectURL(blob), download: "inventario-nekostore-" + new Date().toISOString().slice(0, 10) + ".csv" });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---- Eventos ----
  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("loginError");
    err.classList.add("hidden");
    try {
      await api("POST", "/api/admin/login", { password: $("loginPassword").value });
      showApp();
      await load();
    } catch (ex) {
      err.textContent = ex.message;
      err.classList.remove("hidden");
    }
  });
  $("logoutBtn").addEventListener("click", async () => { try { await api("POST", "/api/admin/logout", {}); } catch { /* ya salió */ } showLogin(); });
  $("newBtn").addEventListener("click", () => openEdit(null));
  $("exportBtn").addEventListener("click", exportCsv);
  $("search").addEventListener("input", (e) => { state.query = e.target.value; render(); });
  $("tabs").addEventListener("click", (e) => { const t = e.target.closest(".tab"); if (t) { state.filter = t.dataset.filter; render(); } });
  $("editForm").addEventListener("submit", save);
  $("cancelBtn").addEventListener("click", () => $("editDialog").close());
  $("deleteBtn").addEventListener("click", remove);
  $("fStatus").addEventListener("change", toggleArrival);
  $("imgFile").addEventListener("change", (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) uploadFile(f); });
  $("imgFetch").addEventListener("click", fetchUrl);

  (async () => {
    try {
      await api("GET", "/api/admin/me");
      showApp();
      await load();
    } catch {
      showLogin();
    }
  })();
})();
