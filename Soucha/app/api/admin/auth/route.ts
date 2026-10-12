// app/api/admin/auth/route.ts — Admin PIN authentication
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createToken } from "@/lib/auth";

const ADMIN_PIN = process.env.ADMIN_PIN || "";

export async function POST(req: Request) {
  try {
    if (!ADMIN_PIN) {
      return NextResponse.json(
        { error: "Admin PIN not configured" },
        { status: 500 }
      );
    }

    const { pin } = await req.json();

    if (!pin || pin !== ADMIN_PIN) {
      return NextResponse.json({ error: "Mã PIN không đúng" }, { status: 401 });
    }

    const token = createToken();

    const cookieStore = await cookies();
    cookieStore.set("admin_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 24 * 60 * 60, // 24h
      path: "/",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin auth error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

/** DELETE: logout */
export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete("admin_session");
  return NextResponse.json({ success: true });
}
