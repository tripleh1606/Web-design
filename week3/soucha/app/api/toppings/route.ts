import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { TOPPINGS } from "@/lib/menu";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function GET() {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(TOPPINGS);
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from("toppings")
      .select("*")
      .eq("is_available", true)
      .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) {
      return NextResponse.json(TOPPINGS);
    }

    // Map DB rows to OptionChoice shape
    return NextResponse.json(
      data.map((row: any) => ({
        id: row.id,
        label: row.label,
        price: Number(row.price),
      }))
    );
  } catch {
    return NextResponse.json(TOPPINGS);
  }
}
