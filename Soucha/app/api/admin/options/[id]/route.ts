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

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const supabase = createClient(supabaseUrl, supabaseKey);

    const updateData = { ...body, updated_at: new Date().toISOString() };
    delete updateData.category_ids; // Handle separately

    // If setting as default, unset others first
    if (updateData.is_default && updateData.option_group) {
      await supabase
        .from("options")
        .update({ is_default: false })
        .eq("option_group", updateData.option_group);
    } else if (updateData.is_default && !updateData.option_group) {
        // Need to find group first if not provided
        const { data: currentOpt } = await supabase.from("options").select("option_group").eq("id", params.id).single();
        if (currentOpt) {
            await supabase
                .from("options")
                .update({ is_default: false })
                .eq("option_group", currentOpt.option_group);
        }
    }

    const { data, error } = await supabase
      .from("options")
      .update(updateData)
      .eq("id", params.id)
      .select()
      .single();

    if (error) throw error;

    if (Array.isArray(body.category_ids)) {
      // Delete old mappings
      await supabase.from("category_options").delete().eq("option_id", params.id);
      
      // Insert new mappings
      if (body.category_ids.length > 0) {
        const catInserts = body.category_ids.map((cId: string) => ({
          category_id: cId,
          option_id: params.id
        }));
        await supabase.from("category_options").insert(catInserts);
      }
    }

    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to update option" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  if (!(await checkAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { error } = await supabase
      .from("options")
      .delete()
      .eq("id", params.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Failed to delete option" },
      { status: 500 }
    );
  }
}
