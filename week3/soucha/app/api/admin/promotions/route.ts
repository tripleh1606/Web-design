// app/api/admin/promotions/route.ts — Admin: list all & create promotions
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { validateAdminToken } from "@/lib/auth";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function getSupabase() {
  if (!supabaseUrl || !supabaseKey) return null;
  return createClient(supabaseUrl, supabaseKey);
}

async function requireAdmin(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session")?.value;
  return !!token && validateAdminToken(token);
}

// ─── Validation ─────────────────────────────────────────────────────

interface ValidationError {
  field: string;
  message: string;
}

function validatePromotion(body: any): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    errors.push({ field: "name", message: "Tên khuyến mãi là bắt buộc" });
  }

  const validTypes = ["percentage", "fixed_amount", "buy_x_get_y", "free_upsize"];
  if (!validTypes.includes(body.type)) {
    errors.push({ field: "type", message: "Loại khuyến mãi không hợp lệ" });
  }

  if (body.type === "percentage") {
    const v = Number(body.discount_value);
    if (isNaN(v) || v <= 0 || v > 100) {
      errors.push({ field: "discount_value", message: "Phần trăm giảm phải từ 1 đến 100" });
    }
  }

  if (body.type === "fixed_amount") {
    const v = Number(body.discount_value);
    if (isNaN(v) || v <= 0) {
      errors.push({ field: "discount_value", message: "Số tiền giảm phải lớn hơn 0" });
    }
  }

  if (body.type === "buy_x_get_y") {
    if (!body.buy_quantity || Number(body.buy_quantity) <= 0) {
      errors.push({ field: "buy_quantity", message: "Số lượng mua phải lớn hơn 0" });
    }
    if (!body.get_quantity || Number(body.get_quantity) <= 0) {
      errors.push({ field: "get_quantity", message: "Số lượng tặng phải lớn hơn 0" });
    }
    if (!body.reward_product_id) {
      errors.push({ field: "reward_product_id", message: "Phải chọn sản phẩm được tặng" });
    }
  }

  if (body.min_quantity !== undefined && body.min_quantity !== null) {
    const v = Number(body.min_quantity);
    if (isNaN(v) || v < 0) {
      errors.push({ field: "min_quantity", message: "Số lượng tối thiểu không hợp lệ" });
    }
  }

  if (body.min_order_value !== undefined && body.min_order_value !== null) {
    const v = Number(body.min_order_value);
    if (isNaN(v) || v < 0) {
      errors.push({ field: "min_order_value", message: "Giá trị đơn tối thiểu không hợp lệ" });
    }
  }

  const validScopes = ["all", "products", "categories"];
  if (!validScopes.includes(body.scope || "all")) {
    errors.push({ field: "scope", message: "Phạm vi áp dụng không hợp lệ" });
  } else {
    if (body.scope === "products" && (!Array.isArray(body.applicable_product_ids) || body.applicable_product_ids.length === 0)) {
      errors.push({ field: "applicable_product_ids", message: "Vui lòng chọn ít nhất một sản phẩm" });
    }
    if (body.scope === "categories" && (!Array.isArray(body.applicable_category_ids) || body.applicable_category_ids.length === 0)) {
      errors.push({ field: "applicable_category_ids", message: "Vui lòng chọn ít nhất một danh mục" });
    }
  }

  return errors;
}

// ─── Routes ─────────────────────────────────────────────────────────

/** GET: list ALL promotions (including inactive) for admin */
export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("promotions")
    .select(`
      *,
      promotion_products ( product_id ),
      promotion_categories ( category_id )
    `)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Admin promotions fetch error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

/** POST: create a new promotion */
export async function POST(req: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();

    // Validate
    const errors = validatePromotion(body);
    if (errors.length > 0) {
      return NextResponse.json({ errors }, { status: 400 });
    }

    const scope = body.scope || "all";
    const insert = {
      name: body.name.trim(),
      type: body.type,
      is_active: body.is_active ?? true,
      allow_stacking: body.allow_stacking ?? false,
      min_quantity: Number(body.min_quantity) || 0,
      min_order_value: Number(body.min_order_value) || 0,
      discount_value: Number(body.discount_value) || 0,
      buy_quantity: Number(body.buy_quantity) || 0,
      get_quantity: Number(body.get_quantity) || 1,
      reward_product_id: body.reward_product_id || null,
      start_date: body.start_date || new Date().toISOString(),
      end_date: body.end_date || null,
      scope: scope
    };

    // Keep legacy single ID nullified or pointing to first to avoid crash if some old code checks it.
    // We will rely on mapping tables.

    const { data: promoData, error: promoError } = await supabase
      .from("promotions")
      .insert(insert)
      .select()
      .single();

    if (promoError) {
      console.error("Create promotion error:", promoError);
      return NextResponse.json({ error: promoError.message }, { status: 500 });
    }

    // Insert mappings
    if (scope === "products" && body.applicable_product_ids) {
      const productInserts = body.applicable_product_ids.map((id: string) => ({
        promotion_id: promoData.id,
        product_id: id
      }));
      if (productInserts.length > 0) {
        await supabase.from("promotion_products").insert(productInserts);
      }
    } else if (scope === "categories" && body.applicable_category_ids) {
      const categoryInserts = body.applicable_category_ids.map((id: string) => ({
        promotion_id: promoData.id,
        category_id: id
      }));
      if (categoryInserts.length > 0) {
        await supabase.from("promotion_categories").insert(categoryInserts);
      }
    }

    // Refetch the complete promotion with relations
    const { data: completePromo } = await supabase
      .from("promotions")
      .select(`
        *,
        promotion_products ( product_id ),
        promotion_categories ( category_id )
      `)
      .eq("id", promoData.id)
      .single();

    return NextResponse.json(completePromo || promoData, { status: 201 });
  } catch (error) {
    console.error("Create promotion error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
