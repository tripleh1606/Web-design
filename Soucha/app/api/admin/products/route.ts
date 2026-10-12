import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { validateAdminToken } from "@/lib/auth";
import { DRINKS } from "@/lib/menu";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function getSupabase() {
  return createClient(supabaseUrl, supabaseKey);
}

async function checkAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session")?.value;
  return token && validateAdminToken(token);
}

// GET /api/admin/products — all products (including disabled)
export async function GET() {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const supabase = await getSupabase();
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch {
    // Fallback to hardcoded
    return NextResponse.json(DRINKS.map((d, i) => ({
      id: d.id,
      name: d.name,
      family: d.family,
      base_price: d.basePrice,
      image: d.image,
      is_available: true,
      sort_order: i + 1,
    })));
  }
}

// POST /api/admin/products — create new product
export async function POST(req: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { name, family, base_price, image, is_available, sort_order } = body;

    if (!name || !family || base_price === undefined) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Generate ID from name
    const id = body.id || name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const supabase = await getSupabase();

    // Get max sort_order
    const { data: existing } = await supabase
      .from("products")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextOrder = sort_order ?? ((existing?.[0]?.sort_order ?? 0) + 1);

    const { data, error } = await supabase
      .from("products")
      .insert({
        id,
        name,
        family,
        base_price: Number(base_price),
        image: image || null,
        is_available: is_available !== false,
        sort_order: nextOrder,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Failed to create product" }, { status: 500 });
  }
}

