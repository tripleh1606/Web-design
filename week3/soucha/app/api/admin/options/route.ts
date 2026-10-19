import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { validateAdminToken } from "@/lib/auth";

export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

async function checkAdmin() {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_session")?.value;
  return token && validateAdminToken(token);
}

export async function GET() {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: options, error } = await supabase
      .from("options")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) throw error;
    
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

    const merged = options?.map(opt => ({
      ...opt,
      category_ids: categoryMap[opt.id] || []
    })) || [];

    return NextResponse.json(merged);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to fetch options" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { label, option_group, price, extra_price, is_available, is_default, category_ids } = body;

    if (!label || !option_group) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const id = body.id || `${option_group}-${Date.now()}`;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: existing } = await supabase
      .from("options")
      .select("sort_order")
      .eq("option_group", option_group)
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextOrder = (existing?.[0]?.sort_order ?? 0) + 1;

    // Handle is_default logic - if this is default, unset others in the same group
    if (is_default) {
      await supabase
        .from("options")
        .update({ is_default: false })
        .eq("option_group", option_group);
    }

    const { data, error } = await supabase
      .from("options")
      .insert({
        id,
        option_group,
        label,
        price: Number(price) || 0,
        extra_price: Number(extra_price) || 0,
        is_available: is_available !== false,
        is_default: is_default === true,
        sort_order: nextOrder,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    if (Array.isArray(category_ids) && category_ids.length > 0) {
      const catInserts = category_ids.map(cId => ({
        category_id: cId,
        option_id: id
      }));
      await supabase.from("category_options").insert(catInserts);
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to create option" },
      { status: 500 }
    );
  }
}
