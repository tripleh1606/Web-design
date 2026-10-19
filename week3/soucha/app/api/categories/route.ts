import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const FALLBACK_CATEGORIES = [
  { id: "matcha", name: "Matcha" },
  { id: "houjicha", name: "Houjicha" }
];

export async function GET() {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json(FALLBACK_CATEGORIES);
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await supabase
      .from("categories")
      .select("*")
      .eq("is_available", true)
      .order("sort_order", { ascending: true });

    if (error || !data || data.length === 0) {
      return NextResponse.json(FALLBACK_CATEGORIES);
    }

    return NextResponse.json(data);
  } catch {
    return NextResponse.json(FALLBACK_CATEGORIES);
  }
}
