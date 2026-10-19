import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DRINKS, TOPPINGS, calcUnitPrice, formatVND, summarizeOptions } from "@/lib/menu";
import { calculateDiscounts, type Promotion } from "@/lib/promotions";

// Initialize Supabase admin client
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

// Telegram Bot configs
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

export async function POST(req: Request) {
  try {
    const order = await req.json();
    const { customer, details, items } = order;
    // NOTE: We intentionally IGNORE order.total from the client.
    // Server recalculates everything from authoritative product data.

    // ─── 1. Server-side price recalculation ─────────────────────────
    // Try to get products from DB first, fallback to DRINKS
    let authorizedDrinks = [...DRINKS];
    if (supabase) {
      try {
        const { data: dbProducts } = await supabase.from("products").select("*");
        if (dbProducts && dbProducts.length > 0) {
          authorizedDrinks = dbProducts.map((row: any) => ({
            id: row.id,
            name: row.name,
            family: row.family,
            basePrice: Number(row.base_price),
            image: row.image,
          }));
        }
      } catch {
        // fallback to DRINKS
      }
    }

    // Try to get options from DB first
    let dbOptions: any[] = [];
    if (supabase) {
      try {
        const { data: optsData } = await supabase.from("options").select("*").eq("is_available", true);
        if (optsData && optsData.length > 0) {
          dbOptions = optsData;
        }
      } catch {
        // fallback
      }
    }

    const validatedItems = items.map((item: any) => {
      const drink = authorizedDrinks.find((d) => d.id === item.drink.id) || DRINKS.find((d) => d.id === item.drink.id);
      if (!drink) {
        return item;
      }
      const authoritativeUnitPrice = calcUnitPrice(drink, item.options, dbOptions);
      return {
        ...item,
        drink,
        unitPrice: authoritativeUnitPrice,
      };
    });

    // ─── 2. Fetch active promotions and recalculate discounts ───────
    let activePromotions: Promotion[] = [];
    if (supabase) {
      const now = new Date().toISOString();
      const { data } = await supabase
        .from("promotions")
        .select(`
          *,
          promotion_products ( product_id ),
          promotion_categories ( category_id )
        `)
        .eq("is_active", true)
        .lte("start_date", now)
        .or(`end_date.is.null,end_date.gte.${now}`);
      if (data) activePromotions = data;
    }

    const discountResult = calculateDiscounts(validatedItems, activePromotions, authorizedDrinks);
    const { originalTotal, discountAmount, finalTotal, appliedPromotions } = discountResult;

    let orderId = Math.floor(1000 + Math.random() * 9000).toString(); // Fallback if no Supabase

    // ─── 3. Save to Supabase ────────────────────────────────────────
    if (supabase) {
      const { data, error } = await supabase
        .from("orders")
        .insert({
          customer_name: customer.name,
          customer_phone: customer.phone,
          fulfillment_type: details.fulfillmentType,
          pickup_option: details.pickupOption,
          pickup_time: details.pickupTime,
          delivery_address: details.address,
          order_note: details.note,
          payment_method: details.paymentMethod,
          items: validatedItems,
          total_amount: finalTotal,
          original_amount: originalTotal,
          discount_amount: discountAmount,
          final_amount: finalTotal,
          applied_promotions: appliedPromotions,
          status: "pending",
          payment_status: "unpaid",
        })
        .select()
        .single();

      if (error) {
        console.error("Supabase insert error:", error);
      } else if (data) {
        orderId = data.id.toString();
      }
    }

    // ─── 4. Format Telegram Alert ───────────────────────────────────
    const fulfillmentStr = details.fulfillmentType === "pickup" 
      ? `🛍️ <b>LẤY TẠI QUÁN</b> (${details.pickupTime})`
      : `🛵 <b>GIAO TẬN NƠI</b>\n📍 Địa chỉ: ${details.address}`;

    const paymentStr = details.paymentMethod === "vietqr" 
      ? `💳 VietQR (Đang chờ thanh toán)`
      : `💵 Tiền mặt`;

    const noteStr = details.note ? `\n📝 <i>Ghi chú: ${details.note}</i>` : "";

    const itemsStr = validatedItems
      .map((i: any) => {
        const priceStr = i.quantity > 1 
          ? `${formatVND(i.unitPrice)} x ${i.quantity} = ${formatVND(i.unitPrice * i.quantity)}`
          : formatVND(i.unitPrice);
        return `▪️ <b>${i.quantity}x ${i.drink.name}</b> (${priceStr})\n  └ ${summarizeOptions(i.options, dbOptions, i.drink)}`;
      })
      .join("\n");

    // Build discount section for Telegram
    let discountStr = "";
    if (discountAmount > 0 && appliedPromotions.length > 0) {
      const promoLines = appliedPromotions
        .map((p) => `  - ${p.name}: -${formatVND(p.discount)}`)
        .join("\n");
      discountStr = `\n\n📋 <b>TẠM TÍNH:</b> ${formatVND(originalTotal)}\n🎉 <b>KHUYẾN MÃI:</b>\n${promoLines}`;
    }

    const message = `
🛎 <b>ĐƠN HÀNG MỚI - DH${orderId}</b>
━━━━━━━━━━━━━━━━━━━━
👤 <b>Khách hàng:</b> ${customer.name}
📞 <b>SĐT:</b> <code>${customer.phone}</code>
${fulfillmentStr}${noteStr}
💵 <b>Hình thức:</b> ${paymentStr}

📦 <b>CHI TIẾT MÓN:</b>
${itemsStr}${discountStr}

💰 <b>TỔNG THANH TOÁN:</b> <b>${formatVND(finalTotal)}</b>
━━━━━━━━━━━━━━━━━━━━
`.trim();

    // ─── 5. Send Telegram Alert ─────────────────────────────────────
    await sendTelegramMessage(message);

    return NextResponse.json({ success: true, orderId });
  } catch (error) {
    console.error("Order processing error:", error);
    return NextResponse.json({ success: false, error: "Internal Server Error" }, { status: 500 });
  }
}
