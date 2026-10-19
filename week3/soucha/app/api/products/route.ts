import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DRINKS } from "@/lib/menu";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function GET() {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(DRINKS);
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("is_available", true)
      .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) {
      return NextResponse.json(DRINKS);
    }

    // Map DB rows to DrinkItem shape
    const drinks = data.map((row: any) => ({
      id: row.id,
      name: row.name,
      family: row.family,
      basePrice: Number(row.base_price),
      image: row.image || undefined,
    }));

    return NextResponse.json(drinks);
  } catch {
    return NextResponse.json(DRINKS);
  }
}

