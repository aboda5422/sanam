/**
 * Sanam Partner Catalog API
 * Inbound sync for ERP / POS partners (products, prices, stock, offers).
 *
 * Auth: Authorization: Bearer sanam_live_…
 * Base: {SUPABASE_URL}/functions/v1/partner-catalog/v1
 */
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-sanam-api-key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

const MAX_BULK = 200;
const KEY_PREFIX_LEN = 16;

type ApiKeyRow = {
  id: string;
  provider: string;
  key_hash: string;
  scopes: string[] | null;
  is_active: boolean;
  branch_id: string | null;
};

type BranchRow = {
  id: string;
  name: string;
  slug: string;
  partner_code: string | null;
  is_active: boolean;
  city: string | null;
};

type ProductRow = {
  id: string;
  branch_id: string;
  barcode: string | null;
  external_id: string | null;
  name: string;
  name_en: string | null;
  description: string | null;
  price: number;
  original_price: number | null;
  cost_price: number | null;
  stock_quantity: number;
  unit: string;
  brand: string | null;
  origin_country: string | null;
  size_label: string | null;
  product_form: string | null;
  image: string | null;
  gallery_urls: string[] | null;
  extra_label: string | null;
  category_id: string | null;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  updated_at: string;
};

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(body, null, 0), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function err(message: string, status: number, code?: string, details?: unknown) {
  return json(
    {
      ok: false,
      error: { message, code: code || `http_${status}`, details: details ?? null },
    },
    status,
  );
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function extractPartnerKey(req: Request): string {
  const custom = req.headers.get("x-sanam-api-key")?.trim() || "";
  if (custom) return custom;
  const auth = req.headers.get("authorization") || "";
  if (auth.toLowerCase().startsWith("bearer ")) {
    const token = auth.slice(7).trim();
    if (token.startsWith("sanam_live_") || token.startsWith("sanam_test_")) return token;
  }
  return "";
}

function routePath(req: Request): string {
  const url = new URL(req.url);
  // /functions/v1/partner-catalog/v1/...  OR  /partner-catalog/v1/...
  const raw = url.pathname;
  const marker = "/partner-catalog";
  const idx = raw.indexOf(marker);
  let path = idx >= 0 ? raw.slice(idx + marker.length) : raw;
  if (!path.startsWith("/")) path = `/${path}`;
  // normalize trailing slash
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path || "/";
}

function hasScope(key: ApiKeyRow, scope: string): boolean {
  const scopes = key.scopes || [];
  if (scopes.includes("*") || scopes.includes("admin")) return true;
  if (scopes.includes(scope)) return true;
  // write implies read for same resource
  if (scope.endsWith(":read")) {
    const write = scope.replace(":read", ":write");
    if (scopes.includes(write)) return true;
  }
  return false;
}

function requireScope(key: ApiKeyRow, scope: string): Response | null {
  if (!hasScope(key, scope)) {
    return err(`نطاق غير مصرح: ${scope}`, 403, "scope_denied", { required: scope, have: key.scopes });
  }
  return null;
}

function asTrimmedString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function asNumber(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

function asBool(v: unknown, fallback?: boolean): boolean | null {
  if (v === undefined || v === null) return fallback ?? null;
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1 || v === "1") return true;
  if (v === "false" || v === 0 || v === "0") return false;
  return fallback ?? null;
}

function asStringArray(v: unknown): string[] | null {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v)) return null;
  return v.map((x) => String(x).trim()).filter(Boolean);
}

async function authenticate(
  req: Request,
  admin: SupabaseClient,
): Promise<{ key: ApiKeyRow } | Response> {
  const rawKey = extractPartnerKey(req);
  if (!rawKey) {
    return err(
      "مطلوب مفتاح سنام. أرسل Authorization: Bearer sanam_live_… أو رأس X-Sanam-Api-Key",
      401,
      "missing_api_key",
    );
  }
  if (!rawKey.startsWith("sanam_live_") && !rawKey.startsWith("sanam_test_")) {
    return err("صيغة المفتاح غير صحيحة", 401, "invalid_key_format");
  }

  const prefix = rawKey.slice(0, KEY_PREFIX_LEN);
  const hash = await sha256Hex(rawKey);

  const { data, error } = await admin
    .from("pos_api_keys")
    .select("id, provider, key_hash, scopes, is_active, branch_id")
    .eq("key_prefix", prefix)
    .eq("is_active", true)
    .limit(5);

  if (error) {
    console.error("api key lookup", error);
    return err("تعذر التحقق من المفتاح", 500, "auth_lookup_failed");
  }

  const match = (data as ApiKeyRow[] | null)?.find((row) => row.key_hash === hash);
  if (!match) {
    return err("مفتاح غير صالح أو ملغى", 401, "invalid_api_key");
  }

  // fire-and-forget last_used
  void admin.from("pos_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", match.id);

  return { key: match };
}

async function audit(
  admin: SupabaseClient,
  opts: {
    key: ApiKeyRow | null;
    method: string;
    path: string;
    status: number;
    branch_code?: string | null;
    summary?: Record<string, unknown>;
    error?: string | null;
    ip?: string | null;
  },
) {
  try {
    await admin.from("partner_api_audit").insert({
      api_key_id: opts.key?.id ?? null,
      provider: opts.key?.provider ?? null,
      method: opts.method,
      path: opts.path,
      status_code: opts.status,
      branch_code: opts.branch_code ?? null,
      summary: opts.summary ?? {},
      error: opts.error ?? null,
      ip: opts.ip ?? null,
    });
  } catch (e) {
    console.error("audit insert failed", e);
  }
}

async function resolveBranch(
  admin: SupabaseClient,
  branchCode: string,
  key: ApiKeyRow,
): Promise<BranchRow | Response> {
  const code = branchCode.trim();

  // Key locked to a single branch — branch_code optional
  if (key.branch_id) {
    const { data, error } = await admin
      .from("branches")
      .select("id, name, slug, partner_code, is_active, city")
      .eq("id", key.branch_id)
      .maybeSingle();
    if (error) {
      console.error("branch resolve", error);
      return err("تعذر جلب الفرع", 500, "branch_lookup_failed");
    }
    const branch = data as BranchRow | null;
    if (!branch) return err("الفرع المرتبط بالمفتاح غير موجود", 404, "branch_not_found");
    if (code) {
      const matches =
        branch.id === code ||
        branch.slug.toLowerCase() === code.toLowerCase() ||
        (branch.partner_code && branch.partner_code.toLowerCase() === code.toLowerCase());
      if (!matches) return err("هذا المفتاح مقيد بفرع آخر", 403, "branch_scope_denied");
    }
    if (!branch.is_active) return err("الفرع غير نشط", 400, "branch_inactive");
    return branch;
  }

  if (!code) return err("branch_code مطلوب", 400, "branch_code_required");

  // Try partner_code, then slug, then uuid
  const select = "id, name, slug, partner_code, is_active, city";
  const attempts = [
    admin.from("branches").select(select).ilike("partner_code", code).limit(1).maybeSingle(),
    admin.from("branches").select(select).ilike("slug", code).limit(1).maybeSingle(),
    /^[0-9a-f-]{36}$/i.test(code)
      ? admin.from("branches").select(select).eq("id", code).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ];

  for (const attempt of attempts) {
    const { data, error } = await attempt;
    if (error) {
      console.error("branch resolve", error);
      return err("تعذر جلب الفرع", 500, "branch_lookup_failed");
    }
    if (data) {
      const branch = data as BranchRow;
      if (!branch.is_active) return err(`الفرع غير نشط: ${code}`, 400, "branch_inactive");
      return branch;
    }
  }

  return err(`الفرع غير موجود: ${code}`, 404, "branch_not_found");
}

async function resolveCategoryId(
  admin: SupabaseClient,
  branchId: string,
  item: Record<string, unknown>,
): Promise<string | null | Response> {
  const categoryId = asTrimmedString(item.category_id);
  if (categoryId) {
    const { data } = await admin
      .from("categories")
      .select("id")
      .eq("id", categoryId)
      .eq("branch_id", branchId)
      .maybeSingle();
    if (!data) return err(`تصنيف غير موجود في الفرع: ${categoryId}`, 400, "category_not_found");
    return data.id as string;
  }

  const slug = asTrimmedString(item.category_slug);
  if (slug) {
    const { data } = await admin
      .from("categories")
      .select("id")
      .eq("branch_id", branchId)
      .eq("slug", slug)
      .maybeSingle();
    if (!data) return err(`تصنيف غير موجود (slug): ${slug}`, 400, "category_not_found");
    return data.id as string;
  }

  const name = asTrimmedString(item.category_name);
  if (name) {
    const { data } = await admin
      .from("categories")
      .select("id")
      .eq("branch_id", branchId)
      .eq("name", name)
      .limit(1)
      .maybeSingle();
    if (!data) return err(`تصنيف غير موجود (name): ${name}`, 400, "category_not_found");
    return data.id as string;
  }

  return null; // leave unchanged / unset
}

function applyOfferFields(
  patch: Record<string, unknown>,
  item: Record<string, unknown>,
): string | null {
  // Direct price fields
  if ("price" in item) {
    const p = asNumber(item.price);
    if (p === null || p < 0) return "price يجب أن يكون رقماً >= 0";
    patch.price = p;
  }
  if ("original_price" in item) {
    if (item.original_price === null || item.original_price === "") {
      patch.original_price = null;
    } else {
      const o = asNumber(item.original_price);
      if (o === null || o < 0) return "original_price غير صالح";
      patch.original_price = o;
    }
  }
  if ("cost_price" in item) {
    if (item.cost_price === null || item.cost_price === "") patch.cost_price = null;
    else {
      const c = asNumber(item.cost_price);
      if (c === null || c < 0) return "cost_price غير صالح";
      patch.cost_price = c;
    }
  }

  // Convenience offer object
  const offer = item.offer;
  if (offer && typeof offer === "object" && !Array.isArray(offer)) {
    const o = offer as Record<string, unknown>;
    const enabled = asBool(o.enabled, true);
    if (enabled === false) {
      // clear offer: move sale back to list if provided
      const list = asNumber(o.list_price) ?? asNumber(o.price) ?? asNumber(item.price);
      if (list !== null) patch.price = list;
      patch.original_price = null;
      if ("label" in o) patch.extra_label = asTrimmedString(o.label);
    } else {
      const listPrice = asNumber(o.list_price) ?? asNumber(o.original_price);
      const salePrice = asNumber(o.sale_price) ?? asNumber(o.price);
      if (listPrice === null || salePrice === null) {
        return "offer يتطلب list_price و sale_price";
      }
      if (salePrice < 0 || listPrice < 0) return "أسعار العرض غير صالحة";
      patch.original_price = listPrice;
      patch.price = salePrice;
      if ("label" in o) {
        const label = asTrimmedString(o.label);
        if (label) patch.extra_label = label;
      }
    }
  }

  return null;
}

async function syncProductOverlay(admin: SupabaseClient, productId: string) {
  try {
    await admin.rpc("catalog_sync_product_overlay", { p_product_id: productId });
  } catch {
    // non-fatal: Phase 1 trigger may already dual-write
  }
}

async function findProduct(
  admin: SupabaseClient,
  branchId: string,
  barcode: string | null,
  externalId: string | null,
): Promise<ProductRow | null> {
  if (barcode) {
    const { data } = await admin
      .from("products")
      .select("*")
      .eq("branch_id", branchId)
      .eq("barcode", barcode)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as ProductRow;

    // Shared catalog: barcode exists on another branch → resolve this branch overlay
    const { data: anyHit } = await admin
      .from("products")
      .select("id")
      .eq("barcode", barcode)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (anyHit?.id) {
      const { data: map } = await admin
        .from("product_id_map")
        .select("canonical_product_id")
        .eq("legacy_product_id", anyHit.id)
        .maybeSingle();
      const canonicalId = (map as { canonical_product_id?: string } | null)?.canonical_product_id || anyHit.id;
      const { data: pb } = await admin
        .from("product_branch")
        .select("legacy_product_id, product_id, stock_quantity, price, original_price, cost_price, is_active, is_featured, category_id")
        .eq("product_id", canonicalId)
        .eq("branch_id", branchId)
        .maybeSingle();
      if (pb?.legacy_product_id) {
        const { data: legacy } = await admin
          .from("products")
          .select("*")
          .eq("id", pb.legacy_product_id)
          .maybeSingle();
        if (legacy) return dataWithOverlay(legacy as ProductRow, pb);
      }
      if (pb) {
        const { data: canon } = await admin
          .from("products")
          .select("*")
          .eq("id", canonicalId)
          .maybeSingle();
        if (canon) {
          return dataWithOverlay(
            { ...(canon as ProductRow), branch_id: branchId, id: canonicalId },
            pb,
          );
        }
      }
    }
  }
  if (externalId) {
    const { data } = await admin
      .from("products")
      .select("*")
      .eq("branch_id", branchId)
      .eq("external_id", externalId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) return data as ProductRow;
  }
  return null;
}

function dataWithOverlay(
  base: ProductRow,
  pb: {
    stock_quantity?: number | null;
    price?: number | null;
    original_price?: number | null;
    cost_price?: number | null;
    is_active?: boolean | null;
    is_featured?: boolean | null;
    category_id?: string | null;
  },
): ProductRow {
  return {
    ...base,
    stock_quantity: Number(pb.stock_quantity ?? base.stock_quantity ?? 0),
    price: Number(pb.price ?? base.price ?? 0),
    original_price: pb.original_price ?? base.original_price,
    cost_price: pb.cost_price ?? base.cost_price,
    is_active: pb.is_active ?? base.is_active,
    is_featured: pb.is_featured ?? base.is_featured,
    category_id: pb.category_id ?? base.category_id,
  };
}

function publicProduct(p: ProductRow, branch?: BranchRow) {
  const onOffer =
    p.original_price !== null &&
    p.original_price !== undefined &&
    Number(p.original_price) > Number(p.price);
  return {
    id: p.id,
    branch_id: p.branch_id,
    branch_code: branch?.partner_code || branch?.slug || null,
    barcode: p.barcode,
    external_id: p.external_id,
    name: p.name,
    name_en: p.name_en,
    description: p.description,
    price: Number(p.price),
    original_price: p.original_price === null || p.original_price === undefined ? null : Number(p.original_price),
    cost_price: p.cost_price === null || p.cost_price === undefined ? null : Number(p.cost_price),
    stock_quantity: Number(p.stock_quantity ?? 0),
    unit: p.unit,
    brand: p.brand,
    origin_country: p.origin_country,
    size_label: p.size_label,
    product_form: p.product_form,
    image: p.image,
    gallery_urls: p.gallery_urls || [],
    extra_label: p.extra_label,
    category_id: p.category_id,
    is_active: p.is_active,
    is_featured: p.is_featured,
    sort_order: p.sort_order,
    on_offer: onOffer,
    updated_at: p.updated_at,
  };
}

function apiDocs(baseUrl: string) {
  return {
    name: "Sanam Partner Catalog API",
    version: "v1",
    base_url: baseUrl,
    auth: {
      recommended: {
        Authorization: "Bearer <Sanam_ANON_OR_PUBLISHABLE_KEY>",
        "X-Sanam-Api-Key": "sanam_live_YOUR_KEY",
      },
      alternate: {
        Authorization: "Bearer sanam_live_YOUR_KEY",
        apikey: "<Sanam_ANON_OR_PUBLISHABLE_KEY>",
      },
      note: "مفتاح sanam_live_ سري. مفتاح anon/publishable عام للبوابة فقط وليس صلاحية إدارة.",
    },
    matching: {
      primary: "barcode + branch_code",
      secondary: "external_id + branch_code",
      notes: "كل منتج في سنام مربوط بفرع. نفس الباركود يمكن أن يتكرر بين الفروع.",
    },
    offers: {
      model: "عندما original_price > price يكون المنتج عليه عرض",
      clear: "أرسل original_price: null مع price = السعر العادي، أو offer.enabled = false",
    },
    endpoints: [
      { method: "GET", path: "/v1/ping", scope: "any", desc: "فحص الاتصال" },
      { method: "GET", path: "/v1/docs", scope: "any", desc: "هذا التوثيق" },
      { method: "GET", path: "/v1/branches", scope: "branches:read", desc: "قائمة الفروع" },
      { method: "GET", path: "/v1/categories?branch_code=", scope: "categories:read", desc: "تصنيفات فرع" },
      {
        method: "POST",
        path: "/v1/products",
        scope: "products:write",
        desc: "إنشاء أو تحديث منتج كامل (فردي أو دفعة items[])",
      },
      {
        method: "PATCH",
        path: "/v1/products/stock",
        scope: "stock:write",
        desc: "تحديث المخزون فقط",
      },
      {
        method: "PATCH",
        path: "/v1/products/prices",
        scope: "prices:write",
        desc: "تحديث الأسعار والعروض",
      },
      {
        method: "POST",
        path: "/v1/products/offers",
        scope: "offers:write",
        desc: "تطبيق عرض",
      },
      {
        method: "DELETE",
        path: "/v1/products/offers",
        scope: "offers:write",
        desc: "إزالة عرض",
      },
      {
        method: "GET",
        path: "/v1/products?branch_code=&barcode=",
        scope: "products:read",
        desc: "جلب منتج",
      },
    ],
    limits: { max_items_per_request: MAX_BULK },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey) {
    return err("إعداد الخادم غير مكتمل", 500, "server_misconfigured");
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const path = routePath(req);
  const method = req.method.toUpperCase();
  const requestId = crypto.randomUUID();
  const baseUrl = `${supabaseUrl}/functions/v1/partner-catalog`;
  const ip =
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null;

  let key: ApiKeyRow | null = null;

  try {
    // Public-ish docs ping still need a valid key for professional security
    const authResult = await authenticate(req, admin);
    if (authResult instanceof Response) {
      await audit(admin, {
        key: null,
        method,
        path,
        status: 401,
        error: "auth_failed",
        ip,
      });
      return authResult;
    }
    key = authResult.key;

    // ── GET /v1 or /v1/docs or /v1/ping ───────────────────────────────────
    if (method === "GET" && (path === "/v1" || path === "/v1/docs")) {
      const body = { ok: true, request_id: requestId, ...apiDocs(baseUrl) };
      await audit(admin, { key, method, path, status: 200, summary: { action: "docs" }, ip });
      return json(body);
    }

    if (method === "GET" && path === "/v1/ping") {
      await audit(admin, { key, method, path, status: 200, summary: { action: "ping" }, ip });
      return json({
        ok: true,
        request_id: requestId,
        status: "pong",
        provider: key.provider,
        scopes: key.scopes,
        server_time: new Date().toISOString(),
      });
    }

    // ── GET /v1/branches ──────────────────────────────────────────────────
    if (method === "GET" && path === "/v1/branches") {
      const denied = requireScope(key, "branches:read");
      if (denied) return denied;

      let q = admin
        .from("branches")
        .select("id, name, slug, partner_code, is_active, city")
        .eq("is_active", true)
        .order("name");
      if (key.branch_id) q = q.eq("id", key.branch_id);

      const { data, error } = await q;
      if (error) throw error;

      const branches = ((data || []) as BranchRow[]).map((b) => ({
        id: b.id,
        name: b.name,
        branch_code: b.partner_code || b.slug,
        slug: b.slug,
        partner_code: b.partner_code,
        city: b.city,
        is_active: b.is_active,
      }));

      await audit(admin, {
        key,
        method,
        path,
        status: 200,
        summary: { action: "list_branches", count: branches.length },
        ip,
      });
      return json({ ok: true, request_id: requestId, branches });
    }

    // ── GET /v1/categories ────────────────────────────────────────────────
    if (method === "GET" && path === "/v1/categories") {
      const denied = requireScope(key, "categories:read");
      if (denied) return denied;

      const url = new URL(req.url);
      const branchCode = url.searchParams.get("branch_code") || "";
      const branchOrErr = await resolveBranch(admin, branchCode, key);
      if (branchOrErr instanceof Response) return branchOrErr;
      const branch = branchOrErr;

      const { data, error } = await admin
        .from("catalog_branch_categories")
        .select("id, catalog_id, name, name_en, slug, section, is_active, sort_order, image")
        .eq("branch_id", branch.id)
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;

      await audit(admin, {
        key,
        method,
        path,
        status: 200,
        branch_code: branch.partner_code || branch.slug,
        summary: { action: "list_categories", count: (data || []).length },
        ip,
      });
      return json({
        ok: true,
        request_id: requestId,
        branch_code: branch.partner_code || branch.slug,
        categories: data || [],
      });
    }

    // ── GET /v1/products ──────────────────────────────────────────────────
    if (method === "GET" && path === "/v1/products") {
      const denied = requireScope(key, "products:read");
      if (denied) return denied;

      const url = new URL(req.url);
      const branchCode = url.searchParams.get("branch_code") || "";
      const barcode = asTrimmedString(url.searchParams.get("barcode"));
      const externalId = asTrimmedString(url.searchParams.get("external_id"));

      const branchOrErr = await resolveBranch(admin, branchCode, key);
      if (branchOrErr instanceof Response) return branchOrErr;
      const branch = branchOrErr;

      if (!barcode && !externalId) {
        return err("أرسل barcode أو external_id", 400, "identifier_required");
      }

      const product = await findProduct(admin, branch.id, barcode, externalId);
      if (!product) return err("المنتج غير موجود", 404, "product_not_found");

      await audit(admin, {
        key,
        method,
        path,
        status: 200,
        branch_code: branch.partner_code || branch.slug,
        summary: { action: "get_product", product_id: product.id },
        ip,
      });
      return json({ ok: true, request_id: requestId, product: publicProduct(product, branch) });
    }

    // Parse JSON body for write methods
    let body: Record<string, unknown> = {};
    if (method === "POST" || method === "PATCH" || method === "DELETE") {
      try {
        body = (await req.json()) as Record<string, unknown>;
      } catch {
        return err("جسم الطلب يجب أن يكون JSON صالحاً", 400, "invalid_json");
      }
    }

    const itemsFromBody = (): Record<string, unknown>[] => {
      if (Array.isArray(body.items)) return body.items as Record<string, unknown>[];
      if (body.product && typeof body.product === "object") {
        return [body.product as Record<string, unknown>];
      }
      // single object at root (excluding meta keys)
      const meta = new Set(["items", "product", "dry_run"]);
      const keys = Object.keys(body).filter((k) => !meta.has(k));
      if (keys.length > 0 && (body.barcode || body.external_id || body.branch_code)) {
        return [body];
      }
      return [];
    };

    // ── POST /v1/products  (upsert full) ──────────────────────────────────
    if (method === "POST" && path === "/v1/products") {
      const denied = requireScope(key, "products:write");
      if (denied) return denied;

      const items = itemsFromBody();
      if (!items.length) return err("أرسل product أو items[]", 400, "empty_payload");
      if (items.length > MAX_BULK) {
        return err(`الحد الأقصى ${MAX_BULK} عنصراً في الطلب`, 400, "bulk_limit");
      }

      const results: unknown[] = [];
      let created = 0;
      let updated = 0;
      let failed = 0;

      for (const item of items) {
        const branchCode =
          asTrimmedString(item.branch_code) ||
          asTrimmedString(body.branch_code) ||
          "";
        const branchOrErr = await resolveBranch(admin, branchCode, key);
        if (branchOrErr instanceof Response) {
          const e = await branchOrErr.json();
          failed++;
          results.push({
            barcode: item.barcode ?? null,
            external_id: item.external_id ?? null,
            status: "error",
            error: e?.error || e,
          });
          continue;
        }
        const branch = branchOrErr;
        const barcode = asTrimmedString(item.barcode);
        const externalId = asTrimmedString(item.external_id);

        if (!barcode && !externalId) {
          failed++;
          results.push({
            status: "error",
            error: { message: "barcode أو external_id مطلوب", code: "identifier_required" },
          });
          continue;
        }

        const catResult = await resolveCategoryId(admin, branch.id, item);
        if (catResult instanceof Response) {
          const e = await catResult.json();
          failed++;
          results.push({
            barcode,
            external_id: externalId,
            status: "error",
            error: e?.error || e,
          });
          continue;
        }

        const existing = await findProduct(admin, branch.id, barcode, externalId);
        const patch: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        const name = asTrimmedString(item.name);
        if (name) patch.name = name;
        else if (!existing) {
          failed++;
          results.push({
            barcode,
            external_id: externalId,
            status: "error",
            error: { message: "name مطلوب عند الإنشاء", code: "name_required" },
          });
          continue;
        }

        if ("name_en" in item) patch.name_en = asTrimmedString(item.name_en);
        if ("description" in item) patch.description = asTrimmedString(item.description);
        if ("unit" in item) patch.unit = asTrimmedString(item.unit) || "قطعة";
        if ("brand" in item) patch.brand = asTrimmedString(item.brand);
        if ("origin_country" in item) patch.origin_country = asTrimmedString(item.origin_country);
        if ("size_label" in item) patch.size_label = asTrimmedString(item.size_label);
        if ("product_form" in item) patch.product_form = asTrimmedString(item.product_form);
        if ("image" in item) patch.image = asTrimmedString(item.image);
        if ("gallery_urls" in item) patch.gallery_urls = asStringArray(item.gallery_urls) || [];
        if ("extra_label" in item) patch.extra_label = asTrimmedString(item.extra_label);
        if ("is_active" in item) patch.is_active = asBool(item.is_active, true);
        if ("is_featured" in item) patch.is_featured = asBool(item.is_featured, false);
        if ("sort_order" in item) {
          const so = asNumber(item.sort_order);
          if (so !== null) patch.sort_order = Math.trunc(so);
        }
        if ("stock_quantity" in item) {
          const sq = asNumber(item.stock_quantity);
          if (sq === null || sq < 0) {
            failed++;
            results.push({
              barcode,
              status: "error",
              error: { message: "stock_quantity غير صالح", code: "invalid_stock" },
            });
            continue;
          }
          patch.stock_quantity = Math.trunc(sq);
        }
        if (barcode) patch.barcode = barcode;
        if (externalId) patch.external_id = externalId;
        if (catResult) patch.category_id = catResult;

        const offerErr = applyOfferFields(patch, item);
        if (offerErr) {
          failed++;
          results.push({
            barcode,
            external_id: externalId,
            status: "error",
            error: { message: offerErr, code: "invalid_price" },
          });
          continue;
        }

        // Default price on create
        if (!existing && patch.price === undefined) {
          const p = asNumber(item.price);
          if (p === null) {
            failed++;
            results.push({
              barcode,
              status: "error",
              error: { message: "price مطلوب عند الإنشاء", code: "price_required" },
            });
            continue;
          }
          patch.price = p;
        }

        if (existing) {
          const { data, error } = await admin
            .from("products")
            .update(patch)
            .eq("id", existing.id)
            .select("*")
            .single();
          if (error) {
            failed++;
            results.push({
              barcode,
              external_id: externalId,
              status: "error",
              error: { message: error.message, code: "update_failed" },
            });
            continue;
          }
          await syncProductOverlay(admin, (data as ProductRow).id);
          updated++;
          results.push({
            barcode,
            external_id: externalId,
            status: "updated",
            product: publicProduct(data as ProductRow, branch),
          });
        } else {
          const insertRow = {
            branch_id: branch.id,
            name: patch.name as string,
            name_en: (patch.name_en as string | null) ?? null,
            description: (patch.description as string | null) ?? null,
            price: (patch.price as number) ?? 0,
            original_price: (patch.original_price as number | null) ?? null,
            cost_price: (patch.cost_price as number | null) ?? null,
            stock_quantity: (patch.stock_quantity as number) ?? 0,
            unit: (patch.unit as string) || "قطعة",
            brand: (patch.brand as string | null) ?? null,
            origin_country: (patch.origin_country as string | null) ?? null,
            size_label: (patch.size_label as string | null) ?? null,
            product_form: (patch.product_form as string | null) ?? null,
            image: (patch.image as string | null) ?? null,
            gallery_urls: (patch.gallery_urls as string[]) || [],
            extra_label: (patch.extra_label as string | null) ?? null,
            category_id: (patch.category_id as string | null) ?? null,
            barcode: barcode,
            external_id: externalId,
            is_active: (patch.is_active as boolean) ?? true,
            is_featured: (patch.is_featured as boolean) ?? false,
            sort_order: (patch.sort_order as number) ?? 0,
          };
          const { data, error } = await admin.from("products").insert(insertRow).select("*").single();
          if (error) {
            failed++;
            results.push({
              barcode,
              external_id: externalId,
              status: "error",
              error: { message: error.message, code: "create_failed" },
            });
            continue;
          }
          await syncProductOverlay(admin, (data as ProductRow).id);
          created++;
          results.push({
            barcode,
            external_id: externalId,
            status: "created",
            product: publicProduct(data as ProductRow, branch),
          });
        }
      }

      const status = failed && !created && !updated ? 400 : 200;
      await audit(admin, {
        key,
        method,
        path,
        status,
        summary: { action: "upsert_products", created, updated, failed, total: items.length },
        ip,
      });
      return json(
        {
          ok: failed === 0,
          request_id: requestId,
          summary: { created, updated, failed, total: items.length },
          results,
        },
        status,
      );
    }

    // Shared helper for stock / prices / offers bulk patches
    async function patchByIdentifier(
      scope: string,
      action: string,
      apply: (
        item: Record<string, unknown>,
        existing: ProductRow,
      ) => { patch: Record<string, unknown> } | { error: string; code: string },
    ) {
      const denied = requireScope(key!, scope);
      if (denied) return denied;

      const items = itemsFromBody();
      if (!items.length) return err("أرسل product أو items[]", 400, "empty_payload");
      if (items.length > MAX_BULK) {
        return err(`الحد الأقصى ${MAX_BULK} عنصراً في الطلب`, 400, "bulk_limit");
      }

      const results: unknown[] = [];
      let updated = 0;
      let failed = 0;

      for (const item of items) {
        const branchCode =
          asTrimmedString(item.branch_code) || asTrimmedString(body.branch_code) || "";
        const branchOrErr = await resolveBranch(admin, branchCode, key!);
        if (branchOrErr instanceof Response) {
          const e = await branchOrErr.json();
          failed++;
          results.push({ barcode: item.barcode ?? null, status: "error", error: e?.error || e });
          continue;
        }
        const branch = branchOrErr;
        const barcode = asTrimmedString(item.barcode);
        const externalId = asTrimmedString(item.external_id);
        if (!barcode && !externalId) {
          failed++;
          results.push({
            status: "error",
            error: { message: "barcode أو external_id مطلوب", code: "identifier_required" },
          });
          continue;
        }

        const existing = await findProduct(admin, branch.id, barcode, externalId);
        if (!existing) {
          failed++;
          results.push({
            barcode,
            external_id: externalId,
            status: "error",
            error: { message: "المنتج غير موجود", code: "product_not_found" },
          });
          continue;
        }

        const applied = apply(item, existing);
        if ("error" in applied) {
          failed++;
          results.push({
            barcode,
            external_id: externalId,
            status: "error",
            error: { message: applied.error, code: applied.code },
          });
          continue;
        }

        const { data, error } = await admin
          .from("products")
          .update({ ...applied.patch, updated_at: new Date().toISOString() })
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) {
          failed++;
          results.push({
            barcode,
            status: "error",
            error: { message: error.message, code: "update_failed" },
          });
          continue;
        }
        await syncProductOverlay(admin, (data as ProductRow).id);
        updated++;
        results.push({
          barcode,
          external_id: externalId,
          status: "updated",
          product: publicProduct(data as ProductRow, branch),
        });
      }

      const status = failed && !updated ? 400 : 200;
      await audit(admin, {
        key,
        method,
        path,
        status,
        summary: { action, updated, failed, total: items.length },
        ip,
      });
      return json(
        {
          ok: failed === 0,
          request_id: requestId,
          summary: { updated, failed, total: items.length },
          results,
        },
        status,
      );
    }

    // ── PATCH /v1/products/stock ──────────────────────────────────────────
    if (method === "PATCH" && path === "/v1/products/stock") {
      return await patchByIdentifier("stock:write", "update_stock", (item, existing) => {
        const mode = (asTrimmedString(item.mode) || "set").toLowerCase();
        if (mode === "set") {
          const qty = asNumber(item.stock_quantity ?? item.quantity);
          if (qty === null || qty < 0) {
            return { error: "stock_quantity مطلوب ويجب أن يكون >= 0", code: "invalid_stock" };
          }
          return { patch: { stock_quantity: Math.trunc(qty) } };
        }
        if (mode === "delta" || mode === "adjust") {
          const delta = asNumber(item.delta ?? item.quantity ?? item.stock_quantity);
          if (delta === null) return { error: "delta مطلوب مع mode=delta", code: "invalid_stock" };
          const next = Math.trunc(Number(existing.stock_quantity || 0) + delta);
          if (next < 0) return { error: "النتيجة تكون سالبة", code: "negative_stock" };
          return { patch: { stock_quantity: next } };
        }
        return { error: "mode يجب أن يكون set أو delta", code: "unsupported_mode" };
      });
    }

    // ── PATCH /v1/products/prices ─────────────────────────────────────────
    if (method === "PATCH" && path === "/v1/products/prices") {
      return await patchByIdentifier("prices:write", "update_prices", (item) => {
        const patch: Record<string, unknown> = {};
        const offerErr = applyOfferFields(patch, item);
        if (offerErr) return { error: offerErr, code: "invalid_price" };
        if (Object.keys(patch).length === 0) {
          return { error: "لا توجد حقول سعر للتحديث", code: "empty_price_patch" };
        }
        return { patch };
      });
    }

    // ── POST /v1/products/offers ──────────────────────────────────────────
    if (method === "POST" && path === "/v1/products/offers") {
      return await patchByIdentifier("offers:write", "apply_offers", (item, existing) => {
        const patch: Record<string, unknown> = {};
        // Normalize into offer object if percent given
        if (item.discount_percent !== undefined && item.offer === undefined) {
          const pct = asNumber(item.discount_percent);
          if (pct === null || pct <= 0 || pct >= 100) {
            return { error: "discount_percent بين 1 و 99", code: "invalid_discount" };
          }
          const list =
            asNumber(item.list_price) ??
            asNumber(existing.original_price) ??
            Number(existing.price);
          const sale = +(list * (1 - pct / 100)).toFixed(2);
          patch.original_price = list;
          patch.price = sale;
          const label = asTrimmedString(item.label) || asTrimmedString(item.extra_label);
          if (label) patch.extra_label = label;
          return { patch };
        }
        const withOffer = {
          ...item,
          offer: item.offer ?? {
            enabled: true,
            list_price: item.list_price ?? item.original_price ?? existing.original_price ?? existing.price,
            sale_price: item.sale_price ?? item.price,
            label: item.label ?? item.extra_label,
          },
        };
        const offerErr = applyOfferFields(patch, withOffer);
        if (offerErr) return { error: offerErr, code: "invalid_offer" };
        return { patch };
      });
    }

    // ── DELETE /v1/products/offers ────────────────────────────────────────
    if (method === "DELETE" && path === "/v1/products/offers") {
      return await patchByIdentifier("offers:write", "clear_offers", (item, existing) => {
        const restore = asNumber(item.price) ?? asNumber(existing.original_price) ?? Number(existing.price);
        return {
          patch: {
            price: restore,
            original_price: null,
            ...(item.clear_label ? { extra_label: null } : {}),
          },
        };
      });
    }

    await audit(admin, {
      key,
      method,
      path,
      status: 404,
      error: "not_found",
      ip,
    });
    return err(`المسار غير موجود: ${method} ${path}`, 404, "route_not_found", {
      hint: "راجع GET /v1/docs",
    });
  } catch (e) {
    console.error("partner-catalog error", e);
    await audit(admin, {
      key,
      method,
      path,
      status: 500,
      error: e instanceof Error ? e.message : "unknown",
      ip,
    });
    return err("خطأ داخلي في الخادم", 500, "internal_error");
  }
});
