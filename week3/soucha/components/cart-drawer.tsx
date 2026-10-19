"use client";

import { useEffect, useState } from "react";
import { useCart } from "./cart-provider";
import { Sheet, Stepper } from "./ui";
import { CustomizeSheet } from "./customize-sheet";
import { formatVND, summarizeOptions, type CustomerInfo, type Order } from "@/lib/menu";
import { isShopOpen, getNextOperatingDayName, DEFAULT_HOURS } from "@/lib/operating-hours";

export function CartDrawer({
  onPlaceOrder,
}: {
  onPlaceOrder: (order: Order) => void;
}) {
  const { items, count, subtotal, discount, total, appliedPromotions, setQty, clear, remove, operatingHours } = useCart();
  const [open, setOpen] = useState(false);

  // flow steps: cart -> checkout -> payment (only vietqr) -> done
  const [step, setStep] = useState<"cart" | "checkout" | "payment" | "done">("cart");

  // Fulfillment & Order States
  const [fulfillmentType, setFulfillmentType] = useState<"pickup" | "delivery">("pickup");
  const [pickupOption, setPickupOption] = useState<"asap" | "custom">("asap");
  const [customPickupTime, setCustomPickupTime] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"vietqr" | "cash">("vietqr");

  const [submitting, setSubmitting] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [generatedOrderId, setGeneratedOrderId] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [customer, setCustomer] = useState<CustomerInfo>({
    name: "",
    phone: "",
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem("soucha:customer");
      if (saved) setCustomer(JSON.parse(saved));
    } catch {}
  }, []);

  const close = () => {
    if (step === "done") {
      clear();
    }
    setOpen(false);
    setTimeout(() => {
      setStep("cart");
      setGeneratedOrderId("");
    }, 300);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setToastMessage("Đã sao chép");
    setTimeout(() => setToastMessage(null), 2000);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fulfillmentType === "delivery" && !address.trim()) {
      alert("Vui lòng nhập địa chỉ giao hàng.");
      return;
    }

    setSubmitting(true);
    localStorage.setItem(
      "soucha:customer",
      JSON.stringify({ name: customer.name, phone: customer.phone })
    );

    let orderId = Math.floor(1000 + Math.random() * 9000).toString();

    const orderDetails = {
      fulfillmentType,
      pickupOption: fulfillmentType === "pickup" ? pickupOption : undefined,
      pickupTime: fulfillmentType === "pickup" && pickupOption === "custom" ? customPickupTime : "Lấy liền (trong vòng 1 giờ)",
      address: fulfillmentType === "delivery" ? address : undefined,
      note,
      paymentMethod,
    };

    const order = {
      customer: { name: customer.name, phone: customer.phone },
      details: orderDetails,
      items,
      total: total,
    };

    // Keep parent handler for any logging
    onPlaceOrder(order as any);

    try {
      const res = await fetch("/api/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(order),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.id || data.orderId) {
          orderId = (data.id || data.orderId).toString();
        }
      }
    } catch (err) {
      console.warn("API /api/order call failed, using fallback ID");
    }

    setSubmitting(false);
    setGeneratedOrderId(orderId);

    if (paymentMethod === "vietqr") {
      setStep("payment");
    } else {
      setStep("done");
    }
  };

  const finishPayment = async () => {
    try {
      await fetch('/api/order/confirm-paid', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: generatedOrderId })
      });
    } catch(e) {}
    setStep("done");
    clear();
  };

  const field = "mt-1 block w-full rounded-xl bg-[#fdfcfc] px-3.5 py-3 text-sm border border-transparent shadow-sm outline-none focus:border-[#155727] focus:ring-1 focus:ring-[#155727] placeholder:text-[#43281a]/40 text-[#43281a] font-medium transition-all";

  const vietQrUrl = `https://img.vietqr.io/image/963388-0906691634-qr_only.png?amount=${total}&addInfo=DH${generatedOrderId}&accountName=HOANG%20NGOC%20PHUONG%20NHI`;

  return (
    <>
      {toastMessage && (
        <div className="fixed top-10 left-1/2 -translate-x-1/2 z-[60] rounded-full bg-[#155727] px-6 py-2.5 text-[#fdfcfc] shadow-xl text-sm font-bold transition-all animate-in fade-in slide-in-from-top-4">
          {toastMessage}
        </div>
      )}

      {count > 0 && !open && (
        <div className="fixed inset-x-0 bottom-0 z-40 p-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] drop-shadow-2xl">
          <button
            type="button"
            onClick={() => {
              setStep("cart");
              setOpen(true);
            }}
            className="animate-shake mx-auto flex min-h-[54px] w-full max-w-md md:max-w-lg md:min-h-[60px] items-center gap-3 rounded-2xl bg-[#155727] px-4 text-[#fdfcfc] shadow-xl transition-all hover:bg-[#0f461e] active:scale-[0.99] active:bg-[#0b3517]"
          >
            <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-[#fdfcfc] px-1.5 text-sm font-extrabold text-[#155727]">
              {count}
            </span>
            <span className="flex-1 text-left font-bold text-base">Xem giỏ hàng</span>
            <span className="font-extrabold text-base tracking-wide">{formatVND(total)}</span>
          </button>
        </div>
      )}

      <Sheet
        open={open}
        onClose={close}
        title={step === "cart" ? "Giỏ hàng của bạn" : step === "checkout" ? "Thông tin đặt hàng" : step === "payment" ? "Thanh toán đơn hàng" : "Đặt hàng thành công"}
        subtitle={step === "cart" ? `${count} món` : undefined}
        footer={
          step === "cart" && items.length > 0 ? (
            <button
              type="button"
              onClick={() => setStep("checkout")}
              className="min-h-[48px] w-full rounded-2xl bg-[#155727] font-bold text-[#fdfcfc] shadow-md transition-all hover:bg-[#0f461e] active:scale-[0.99] active:bg-[#0b3517]"
            >
              Tiến hành đặt hàng - {formatVND(total)}
            </button>
          ) : step === "checkout" ? (
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setStep("cart")}
                className="min-h-[48px] rounded-2xl border border-[#155727]/40 px-5 font-bold text-[#155727] hover:bg-[#155727]/5 active:bg-[#155727]/10"
              >
                Quay lại
              </button>
              <button
                type="submit"
                form="checkout-form"
                disabled={submitting}
                className="min-h-[48px] flex-1 rounded-2xl bg-[#155727] font-bold text-[#fdfcfc] shadow-md transition-all hover:bg-[#0f461e] active:scale-[0.99] active:bg-[#0b3517] disabled:opacity-60"
              >
                {submitting ? "Đang gửi đơn..." : `Xác nhận đặt - ${formatVND(total)}`}
              </button>
            </div>
          ) : step === "payment" ? (
            <div className="flex flex-col gap-3 text-center">
              <span className="text-[13px] font-semibold text-[#155727] px-2">
                Bạn nhớ chụp thông tin chuyển khoản lại giúp mình nhé, tiệm sẽ chủ động liên hệ mình ạ.
              </span>
              <button
                type="button"
                onClick={() => { clear(); close(); setStep("cart"); }}
                className="mt-1 min-h-[48px] w-full rounded-2xl bg-[#fdfcfc] border border-[#155727] font-bold text-[#155727] shadow-sm transition-all hover:bg-[#155727]/5 active:scale-[0.99]"
              >
                Đóng
              </button>
            </div>
          ) : step === "done" ? (
             <button
              type="button"
              onClick={close}
              className="mt-2 min-h-[48px] w-full rounded-2xl border border-[#155727]/40 font-bold text-[#155727] hover:bg-[#155727]/5 active:bg-[#155727]/10 transition-all"
            >
              Quay về trang chủ
            </button>
          ) : undefined
        }
      >
        {(!isShopOpen(operatingHours.length ? operatingHours : DEFAULT_HOURS)) && step !== "done" && (
          <div className="mx-3.5 mt-3.5 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900 shadow-xs">
            {getNextOperatingDayName(operatingHours.length ? operatingHours : DEFAULT_HOURS) === "ngày mai"
              ? "Tiệm đã đến giờ nghỉ ngơi mất rồi! Bạn có thể đặt hẹn cho ngày mai, tiệm sẽ chuẩn bị thật chu đáo cho bạn nhé."
              : `Tiệm hiện đang nghỉ. Bạn vẫn có thể đặt đơn, tiệm sẽ chuẩn bị vào ${getNextOperatingDayName(operatingHours.length ? operatingHours : DEFAULT_HOURS)} nhé!`
            }
          </div>
        )}
        {step === "cart" && (
          <>
            <ul className="space-y-2.5 p-3.5">
              {items.length === 0 && (
                <li className="py-12 text-center text-[#43281a]/60">
                  <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#155727]/10 text-2xl text-[#155727]">
                    🍵
                  </div>
                  <p className="font-medium">Giỏ hàng đang trống.</p>
                  <p className="text-xs text-[#43281a]/50 mt-1">Chọn món để bắt đầu thưởng thức trà Soucha nhé!</p>
                </li>
              )}
              {items.map((i) => (
                <li
                  key={i.id}
                  className="rounded-2xl border border-transparent bg-white p-3.5 shadow-xs"
                >
                  <div className="flex gap-3">
                    {i.drink.image && (
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-[#fdfcfc]">
                        <img
                          src={i.drink.image}
                          alt={i.drink.name}
                          className="h-full w-full object-cover"
                        />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <p className="font-bold text-[#43281a] leading-tight">{i.drink.name}</p>
                        <p className="shrink-0 font-extrabold text-[#155727]">
                          {formatVND(i.unitPrice * i.quantity)}
                        </p>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-[#43281a]/70">
                        {summarizeOptions(i.options, undefined, i.drink)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2.5">
                    <span className="text-xs font-semibold text-[#43281a]/60">
                      {formatVND(i.unitPrice)} / ly
                    </span>
                    <Stepper value={i.quantity} min={0} onChange={(q) => setQty(i.id, q)} />
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-black/5 mt-2">
                    <button onClick={() => setEditingItem(i)} className="text-[13px] text-[#155727] font-bold active:scale-95 transition-all flex items-center gap-1.5">
                      <span className="text-lg">✎</span> Sửa tùy chọn
                    </button>
                    <button onClick={() => remove(i.id)} className="text-[13px] text-red-500 font-bold active:scale-95 transition-all flex items-center gap-1">
                      Xóa <span className="text-lg">🗑</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {/* Price Summary with Discount Breakdown */}
            {items.length > 0 && (
              <div className="mx-3.5 mb-3 rounded-2xl bg-white p-4 shadow-xs border border-transparent">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-[#43281a]/70 font-medium">Tạm tính</span>
                  <span className={`font-bold ${discount > 0 ? 'line-through text-[#43281a]/40' : 'text-[#43281a]'}`}>
                    {formatVND(subtotal)}
                  </span>
                </div>
                {appliedPromotions.map((p) => (
                  <div key={p.id} className="flex justify-between items-center text-sm mt-2">
                    <span className="text-[#155727] font-semibold flex items-center gap-1.5">
                      {p.name}
                    </span>
                    <span className="font-bold text-[#155727]">-{formatVND(p.discount)}</span>
                  </div>
                ))}
                {discount > 0 && (
                  <div className="flex justify-between items-center text-sm mt-3 pt-3 border-t border-[#155727]/10">
                    <span className="font-bold text-[#43281a]">Tổng thanh toán</span>
                    <span className="font-extrabold text-[#155727] text-base">{formatVND(total)}</span>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {step === "checkout" && (
          <form id="checkout-form" onSubmit={submit} className="space-y-4 p-4">

            <div className="rounded-xl bg-[#155727]/10 p-3 text-xs text-[#155727] font-semibold leading-relaxed">
              Lưu ý: Quý khách vui lòng để ý điện thoại, quán sẽ liên hệ xác nhận đơn hàng.
            </div>

            {/* FULFILLMENT SELECTOR */}
            <div className="flex rounded-xl bg-white p-1 shadow-sm border border-transparent">
              <button
                type="button"
                onClick={() => setFulfillmentType("pickup")}
                className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-all min-h-[44px] ${fulfillmentType === 'pickup' ? 'bg-[#155727] text-white shadow-sm' : 'text-[#43281a]/70 hover:bg-[#155727]/5'}`}
              >
                Lấy tại quán
              </button>
              <button
                type="button"
                onClick={() => setFulfillmentType("delivery")}
                className={`flex-1 rounded-lg py-2.5 text-sm font-bold transition-all min-h-[44px] ${fulfillmentType === 'delivery' ? 'bg-[#155727] text-white shadow-sm' : 'text-[#43281a]/70 hover:bg-[#155727]/5'}`}
              >
                Giao tận nơi
              </button>
            </div>

            {fulfillmentType === "delivery" && (
              <div className="rounded-xl bg-[#43281a]/5 p-3 text-xs text-[#43281a] font-semibold leading-relaxed border border-[#43281a]/10">
                Phí ship theo cước app, quý khách tự thanh toán phí ship cho tài xế.
              </div>
            )}
            {fulfillmentType === "pickup" && (
              <div className="rounded-xl bg-[#43281a]/5 p-3 text-xs text-[#43281a] font-semibold leading-relaxed border border-[#43281a]/10">
                Khi đến nơi, vui lòng liên hệ hotline quán: 0865191634.
              </div>
            )}

            <div className="space-y-3.5">
              <label className="block">
                <span className="mb-1 block text-sm font-bold text-[#43281a]">Họ tên *</span>
                <input
                  required
                  autoComplete="name"
                  placeholder="VD: Nguyễn Văn A"
                  className={field}
                  value={customer.name}
                  onChange={(e) => setCustomer({ ...customer, name: e.target.value })}
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-bold text-[#43281a]">Số điện thoại *</span>
                <input
                  required
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]{9,11}"
                  autoComplete="tel"
                  title="Nhập 9-11 chữ số"
                  placeholder="VD: 0912345678"
                  className={field}
                  value={customer.phone}
                  onChange={(e) => setCustomer({ ...customer, phone: e.target.value.replace(/\D/g, "") })}
                />
              </label>

              {fulfillmentType === "pickup" && (
                <div className="block">
                  <span className="mb-2 block text-sm font-bold text-[#43281a]">Thời gian nhận</span>
                  <div className="flex flex-col gap-2">
                    <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                      <input
                        type="radio"
                        name="pickupOption"
                        value="asap"
                        checked={pickupOption === "asap"}
                        onChange={() => setPickupOption("asap")}
                        className="h-4 w-4 text-[#155727] accent-[#155727]"
                      />
                      <span className="text-sm font-medium text-[#43281a]">Lấy liền (trong vòng 1 giờ)</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer min-h-[44px]">
                      <input
                        type="radio"
                        name="pickupOption"
                        value="custom"
                        checked={pickupOption === "custom"}
                        onChange={() => setPickupOption("custom")}
                        className="h-4 w-4 text-[#155727] accent-[#155727]"
                      />
                      <span className="text-sm font-medium text-[#43281a]">Hẹn giờ / Ghi chú cho quán</span>
                    </label>
                  </div>
                  {pickupOption === "custom" && (
                    <div className="mt-2 pl-7 animate-in fade-in slide-in-from-top-2">
                      <input
                        required
                        placeholder="VD: 15h30 chiều nay ghé lấy"
                        className={field}
                        value={customPickupTime}
                        onChange={(e) => setCustomPickupTime(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              {fulfillmentType === "delivery" && (
                <label className="block">
                  <span className="mb-1 block text-sm font-bold text-[#43281a]">
                    Địa chỉ giao hàng chi tiết *
                  </span>
                  <textarea
                    required
                    rows={2}
                    placeholder="Số nhà, tên đường, phường, quận..."
                    className={`${field} py-2.5 resize-none`}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-sm font-bold text-[#43281a]">
                  Ghi chú đơn hàng
                </span>
                <textarea
                  rows={2}
                  placeholder="Ghi chú thêm cho quán (tùy chọn)"
                  className={`${field} py-2.5 resize-none`}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </label>

              <div className="pt-2">
                <span className="mb-2 block text-sm font-bold text-[#43281a]">Phương thức thanh toán</span>
                <div className="flex flex-col gap-2">
                  <label className={`flex flex-col gap-2 rounded-xl border p-3 transition-colors cursor-pointer min-h-[44px] ${paymentMethod === 'vietqr' ? 'border-[#155727] bg-[#155727]/5' : 'border-transparent bg-white shadow-sm'}`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="payment"
                        value="vietqr"
                        checked={paymentMethod === 'vietqr'}
                        onChange={() => setPaymentMethod("vietqr")}
                        className="h-4 w-4 text-[#155727] accent-[#155727]"
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-[#43281a]">Chuyển khoản VietQR</span>
                        <span className="text-xs text-[#155727] font-semibold">Khuyên dùng</span>
                      </div>
                    </div>
                    {paymentMethod === 'vietqr' && (
                      <div className="text-[13px] text-[#43281a]/90 bg-white p-2.5 rounded-lg border border-[#155727]/20 shadow-sm ml-7">
                        <span className="font-bold">Lưu ý:</span><br/>Đơn chuyển khoản chỉ được chuẩn bị sau khi quán nhận được thanh toán.<br/>Nếu không thể xác nhận đơn, quán sẽ không chuẩn bị đơn.
                      </div>
                    )}
                  </label>

                  <label className={`flex flex-col gap-2 rounded-xl border p-3 transition-colors min-h-[44px] cursor-pointer ${paymentMethod === 'cash' ? 'border-[#155727] bg-[#155727]/5' : 'border-transparent bg-white shadow-sm'}`}>
                    <div className="flex items-center gap-3">
                      <input
                        type="radio"
                        name="payment"
                        value="cash"
                        checked={paymentMethod === 'cash'}
                        onChange={() => setPaymentMethod("cash")}
                        className="h-4 w-4 text-[#155727] accent-[#155727]"
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-[#43281a]">Tiền mặt</span>
                      </div>
                    </div>
                    {paymentMethod === 'cash' && (
                      <div className="text-[13px] text-[#43281a]/90 bg-white p-2.5 rounded-lg border border-[#155727]/20 shadow-sm ml-7">
                        <span className="font-bold">Lưu ý:</span><br/>Đơn tiền mặt chỉ được chuẩn bị sau khi quán liên hệ xác nhận qua số điện thoại.<br/>Nếu không thể xác nhận đơn, quán sẽ không chuẩn bị đơn.
                      </div>
                    )}
                  </label>
                </div>
              </div>
            </div>
          </form>
        )}

        {step === "payment" && (
          <div className="space-y-4 p-5 text-center">
            <h3 className="text-xl font-extrabold text-[#155727]">Thanh toán đơn hàng</h3>
            <p className="text-sm font-medium text-[#43281a]/80 leading-relaxed -mt-1">
              Quý khách vui lòng quét mã QR hoặc copy thông tin bên dưới để chuyển khoản.
            </p>

            <div className="overflow-hidden rounded-2xl border border-[#155727]/20 bg-white p-2 shadow-sm w-[220px] h-[220px] mx-auto mt-2">
              <img
                src={vietQrUrl}
                alt="VietQR code"
                className="w-full h-full object-contain"
              />
            </div>

            <div className="mt-5 rounded-2xl bg-[#fdfcfc] p-4 text-left shadow-sm border border-[#43281a]/10">
              <ul className="space-y-3 text-sm">
                <li className="flex justify-between items-center border-b border-[#43281a]/5 pb-2">
                  <span className="text-[#43281a]/60 font-medium">Ngân hàng</span>
                  <span className="font-bold text-[#43281a] text-right">TIMO (BVBank)</span>
                </li>
                <li className="flex justify-between items-center border-b border-[#43281a]/5 pb-2">
                  <span className="text-[#43281a]/60 font-medium">Số tài khoản</span>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-[#155727] text-base">0906691634</span>
                    <button onClick={() => copyToClipboard('0906691634')} className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#155727]/10 text-[#155727] active:bg-[#155727]/20">
                      <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                  </div>
                </li>
                <li className="flex justify-between items-center border-b border-[#43281a]/5 pb-2">
                  <span className="text-[#43281a]/60 font-medium">Tên người nhận</span>
                  <span className="font-bold text-[#43281a] text-right">HOANG NGOC PHUONG NHI</span>
                </li>
                <li className="flex justify-between items-center">
                  <span className="text-[#43281a]/60 font-medium">Số tiền</span>
                  <span className="font-bold text-[#155727] text-base">{formatVND(total)}</span>
                </li>
              </ul>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4 p-8 text-center animate-in zoom-in-95 duration-300">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#155727]/10 text-4xl text-[#155727]">
              🎉
            </div>
            <h3 className="text-2xl font-extrabold text-[#43281a]">Cảm ơn bạn!</h3>
            <p className="text-sm font-medium text-[#43281a]/80 leading-relaxed px-4">
              Soucha đã tiếp nhận đơn hàng <span className="font-bold text-[#155727]">DH{generatedOrderId}</span> của bạn. Chúng tôi sẽ chuẩn bị những ly trà thơm ngon nhất ngay bây giờ!
            </p>
          </div>
        )}
      </Sheet>
      {editingItem && (
        <CustomizeSheet drink={editingItem.drink} initialItem={editingItem} onClose={() => setEditingItem(null)} />
      )}
    </>
  );
}
