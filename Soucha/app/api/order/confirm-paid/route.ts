import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
let supabase: any = null;
try {
  if (supabaseUrl && supabaseUrl.startsWith('http') && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
  } else if (supabaseUrl) {
    console.warn('Supabase URL must start with http:// or https://');
  }
} catch (err) {
  console.warn('Failed to initialize Supabase client:', (err as Error).message);
}

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "";

async function sendTelegramMessage(text: string) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
      }),
    });
  } catch (error) {
    console.error("Failed to send Telegram message", error);
  }
}

export async function PATCH(req: Request) {
  try {
    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json({ success: false, error: "Missing orderId" }, { status: 400 });
    }

    if (supabase) {
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: "customer_marked_paid" })
        .eq("id", orderId);

      if (error) {
        console.error("Supabase update error:", error);
      }
    }

    const message = `✅ <b>XÁC NHẬN THANH TOÁN</b>\nKhách hàng đơn <b>DH${orderId}</b> vừa bấm xác nhận Đã Chuyển Khoản. Vui lòng kiểm tra biến động số dư!`;
    await sendTelegramMessage(message);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Confirm paid error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
