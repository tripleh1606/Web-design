import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export async function GET() {
  try {
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json([]);
    }
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    // Fetch options
    const { data: options, error: optionsError } = await supabase
      .from("options")
      .select("*")
      .eq("is_available", true)
      .order("sort_order", { ascending: true });

    if (optionsError || !options) {
      return NextResponse.json([]);
    }

    // Fetch category_options
    const { data: catOptions, error: catError } = await supabase
      .from("category_options")
      .select("*");

    const categoryMap: Record<string, string[]> = {};
    if (!catError && catOptions) {
      catOptions.forEach(row => {
        if (!categoryMap[row.option_id]) {
          categoryMap[row.option_id] = [];
        }
        categoryMap[row.option_id].push(row.category_id);
      });
    }

    const merged = options.map(opt => ({
      ...opt,
      category_ids: categoryMap[opt.id] || []
    }));

    return NextResponse.json(merged);
  } catch {
    return NextResponse.json([]);
  }
}
