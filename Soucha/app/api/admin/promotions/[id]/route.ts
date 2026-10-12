// app/api/admin/promotions/[id]/route.ts — Admin: update & delete a promotion
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

/** PATCH: update a promotion */
export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  try {
    const body = await req.json();
    const { id } = params;

    // Build update object with only provided fields
    const update: Record<string, any> = { updated_at: new Date().toISOString() };

    if (body.name !== undefined) update.name = body.name.trim();
    if (body.type !== undefined) update.type = body.type;
    if (body.is_active !== undefined) update.is_active = body.is_active;
    if (body.allow_stacking !== undefined) update.allow_stacking = body.allow_stacking;
    if (body.min_quantity !== undefined) update.min_quantity = Number(body.min_quantity) || 0;
    if (body.min_order_value !== undefined) update.min_order_value = Number(body.min_order_value) || 0;
    if (body.discount_value !== undefined) update.discount_value = Number(body.discount_value) || 0;
    if (body.buy_quantity !== undefined) update.buy_quantity = Number(body.buy_quantity) || 0;
    if (body.get_quantity !== undefined) update.get_quantity = Number(body.get_quantity) || 1;
    if (body.reward_product_id !== undefined) update.reward_product_id = body.reward_product_id || null;
    if (body.start_date !== undefined) update.start_date = body.start_date;
    if (body.end_date !== undefined) update.end_date = body.end_date || null;
    if (body.scope !== undefined) update.scope = body.scope;
    
    // We do NOT update applicable_product_id since we migrated it to mappings

    const { data: promoData, error: promoError } = await supabase
      .from("promotions")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (promoError) {
      console.error("Update promotion error:", promoError);
      return NextResponse.json({ error: promoError.message }, { status: 500 });
    }

    if (body.scope !== undefined) {
      const scope = body.scope;
      // Delete existing mappings
      await supabase.from("promotion_products").delete().eq("promotion_id", id);
      await supabase.from("promotion_categories").delete().eq("promotion_id", id);

      // Insert new mappings
      if (scope === "products" && body.applicable_product_ids) {
        const productInserts = body.applicable_product_ids.map((pid: string) => ({
          promotion_id: id,
          product_id: pid
        }));
        if (productInserts.length > 0) {
          await supabase.from("promotion_products").insert(productInserts);
        }
      } else if (scope === "categories" && body.applicable_category_ids) {
        const categoryInserts = body.applicable_category_ids.map((cid: string) => ({
          promotion_id: id,
          category_id: cid
        }));
        if (categoryInserts.length > 0) {
          await supabase.from("promotion_categories").insert(categoryInserts);
        }
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
      .eq("id", id)
      .single();

    return NextResponse.json(completePromo || promoData);
  } catch (error) {
    console.error("Update promotion error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** DELETE: remove a promotion */
export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  }

  try {
    const { id } = params;

    const { error } = await supabase
      .from("promotions")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("Delete promotion error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete promotion error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
