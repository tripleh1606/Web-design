// app/api/promotions/route.ts — Public endpoint: returns active promotions
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function GET() {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json([]);
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("promotions")
      .select(`
        *,
        promotion_products ( product_id ),
        promotion_categories ( category_id )
      `)
      .eq("is_active", true)
      .lte("start_date", now)
      .or(`end_date.is.null,end_date.gte.${now}`);

    if (error) {
      console.error("Failed to fetch promotions:", error);
      return NextResponse.json([]);
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error("Promotions fetch error:", error);
    return NextResponse.json([]);
  }
}
