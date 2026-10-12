import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DEFAULT_HOURS } from "@/lib/operating-hours";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET() {
  try {
    const { data, error } = await supabase.from("shop_operating_hours").select("*");
    if (error || !data || data.length === 0) {
      return NextResponse.json(DEFAULT_HOURS);
    }
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(DEFAULT_HOURS);
  }
}

