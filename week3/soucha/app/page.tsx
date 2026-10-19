"use client";

import { useEffect, useMemo, useState } from "react";
import { CartDrawer } from "@/components/cart-drawer";
import { CartProvider, useCart } from "@/components/cart-provider";
import { CustomizeSheet } from "@/components/customize-sheet";
import { DRINKS, formatVND, type DrinkFamily, type DrinkItem, type Order } from "@/lib/menu";
import { normalizeVietnameseText } from "@/lib/string";
import { isShopOpen, formatScheduleText, DEFAULT_HOURS } from "@/lib/operating-hours";

async function placeOrder(order: Order) {
  console.log("SOUCHA ORDER SUBMITTED:", order);
}

function MainContent() {
  const { activePromotions, operatingHours } = useCart();
  const [activeDrink, setActiveDrink] = useState<DrinkItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFamily, setSelectedFamily] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"default" | "price-asc" | "price-desc">("default");
  const [drinks, setDrinks] = useState<DrinkItem[]>(DRINKS);
  const [categories, setCategories] = useState<any[]>([
    { id: "matcha", name: "Matcha" },
    { id: "houjicha", name: "Houjicha" }
  ]);

  useEffect(() => {
    fetch(`/api/products?_t=${Date.now()}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data && Array.isArray(data) && data.length > 0) setDrinks(data); })
      .catch(() => {});

    fetch(`/api/categories?_t=${Date.now()}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data && Array.isArray(data) && data.length > 0) setCategories(data); })
      .catch(() => {});
  }, []);

  const filteredDrinks = useMemo(() => {
    let list = drinks;

    if (selectedFamily !== "all") {
      list = list.filter((d) => d.family === selectedFamily);
    }

    if (searchQuery.trim()) {
      const q = normalizeVietnameseText(searchQuery);
      list = list.filter(
        (d) =>
          normalizeVietnameseText(d.name).includes(q) ||
          normalizeVietnameseText(d.family).includes(q)
      );
    }

    if (sortBy === "price-asc") {
      return [...list].sort((a, b) => a.basePrice - b.basePrice);
    }
    if (sortBy === "price-desc") {
      return [...list].sort((a, b) => b.basePrice - a.basePrice);
    }
    return list;
  }, [drinks, selectedFamily, searchQuery, sortBy]);

  return (
    <div className="mx-auto min-h-dvh max-w-7xl bg-[#fdfcfc] text-[#43281a] shadow-xl transition-all flex flex-col">
      {/* 1. TOP HEADER (Large centered logo + search bar) */}
      <div className="flex items-center justify-center py-4 md:py-8 bg-[#155727]">
        <img
          src="/logo_and_name_sameline.svg"
          alt="Soucha Logo"
          className="h-28 md:h-36 w-auto object-contain drop-shadow-sm transition-transform cursor-pointer"
        />
      </div>

      {/* STICKY SEARCH BAR */}
      <div className="sticky top-0 z-30 bg-[#155727] px-4 py-3 shadow-sm">
        <div className="relative max-w-2xl mx-auto">
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Xin chào, bạn cần gì hôm nay?"
            className="h-11 md:h-12 w-full rounded-full bg-white pl-5 pr-12 text-sm md:text-base text-[#43281a] placeholder:text-[#43281a]/50 outline-none transition-colors focus:border-[#155727] focus:ring-1 focus:ring-[#155727] shadow-xs"
          />
          <button
            type="button"
            aria-label="Tìm kiếm"
            className="absolute right-1.5 top-1.5 flex h-8 w-8 md:h-9 md:w-9 items-center justify-center rounded-full bg-[#155727] text-white transition-opacity active:opacity-80"
          >
            <svg
              className="h-4 w-4 stroke-white"
              fill="none"
              strokeWidth="2.5"
              viewBox="0 0 24 24"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </div>
      </div>

      {/* 2.5 CATEGORY TABS */}
      <div className="w-full px-4 md:px-8 pt-6 pb-2 max-w-7xl mx-auto overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSelectedFamily("all")}
            className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
              selectedFamily === "all" ? "bg-[#155727] text-white" : "bg-gray-100 text-[#43281a] hover:bg-gray-200"
            }`}
          >
            Tất cả
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedFamily(c.id)}
              className={`px-4 py-2 rounded-full text-sm font-bold whitespace-nowrap transition-colors ${
                selectedFamily === c.id ? "bg-[#155727] text-white" : "bg-gray-100 text-[#43281a] hover:bg-gray-200"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* 3. SECTION HEADER & SORTING */}
      <div className="w-full px-4 md:px-8 pt-6 pb-4 flex items-center justify-between max-w-7xl mx-auto">
        <h2 className="text-xl md:text-2xl font-black text-[#43281a]">
          Menu
        </h2>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-[#43281a]/70 font-medium">Sắp xếp:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="rounded-lg border border-transparent bg-white/90 px-2 py-1 text-xs font-bold text-[#155727] outline-none focus:border-[#155727]"
          >
            <option value="default">Thứ tự</option>
            <option value="price-asc">Giá tăng dần</option>
            <option value="price-desc">Giá giảm dần</option>
          </select>
        </div>
      </div>

      {/* 4. TWO-COLUMN PRODUCT GRID */}
      <div className="px-4 md:px-8 pt-1 max-w-7xl mx-auto">
        {filteredDrinks.length === 0 ? (
          <div className="py-12 text-center text-[#43281a]/70">
            <p className="font-semibold">Không tìm thấy món trà phù hợp.</p>
            <button
              onClick={() => {
                setSearchQuery("");
                setSelectedFamily("all");
              }}
              className="mt-2 text-xs font-bold text-[#155727] underline"
            >
              Xem lại tất cả món
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 md:gap-5">
            {filteredDrinks.map((drink) => (
              <div
                key={drink.id}
                onClick={() => setActiveDrink(drink)}
                className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-transparent bg-white shadow-xs transition-all duration-200 hover:shadow-md active:scale-[0.99] cursor-pointer"
              >
                <div className="relative aspect-square w-full overflow-hidden bg-[#fdfcfc]/50">
                  {drink.image ? (
                    <img
                      src={drink.image}
                      alt={drink.name}
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl">
                      🍵
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col justify-between p-3 pt-2">
                  <div>
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-[#155727]/75">
                      {categories.find(c => c.id === drink.family)?.name || drink.family}
                    </span>
                    <h3 className="mt-0.5 line-clamp-2 text-sm font-bold leading-tight text-[#43281a] min-h-[2rem]">
                      {drink.name}
                    </h3>
                  </div>

                  <div className="mt-3 flex items-center justify-between pt-1 border-t border-neutral-100">
                    <div className="flex flex-col">
                      {(() => {
                        const promo = activePromotions.find(
                          (p: any) =>
                            p.applicable_product_id === drink.id &&
                            (p.type === "percentage" || p.type === "fixed_amount")
                        );
                        if (promo) {
                          let newPrice = drink.basePrice;
                          if (promo.type === "percentage") {
                            newPrice = newPrice - (newPrice * promo.discount_value) / 100;
                          } else if (promo.type === "fixed_amount") {
                            newPrice = Math.max(0, newPrice - promo.discount_value);
                          }
                          return (
                            <>
                              <span className="text-[12px] font-medium text-[#43281a]/50 line-through">
                                {formatVND(drink.basePrice)}
                              </span>
                              <span className="text-[15px] font-black text-[#155727]">
                                {formatVND(newPrice)}
                              </span>
                            </>
                          );
                        }
                        return (
                          <span className="text-[15px] font-black text-[#155727]">
                            {formatVND(drink.basePrice)}
                          </span>
                        );
                      })()}
                    </div>

                    <button
                      type="button"
                      aria-label={`Chọn ${drink.name}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDrink(drink);
                      }}
                      className="flex h-8 w-8 md:h-10 md:w-10 items-center justify-center rounded-full bg-[#155727] text-lg font-bold text-[#fdfcfc] shadow-xs transition-transform hover:bg-[#0f461e] active:scale-90"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. FOOTER SHOP INFO */}
      <footer className="mt-10 px-5 pt-12 pb-[max(7rem,env(safe-area-inset-bottom))] bg-[#155727] text-white shadow-inner">
        <div className="flex flex-col gap-3 max-w-7xl mx-auto">
          <span className="font-bold text-white text-sm">SOUCHA TEA &amp; MATCHA</span>
          <p className="text-xs text-white/80 leading-relaxed">
            55 đường số 6, phường An Hội Đông, thành phố HCM
          </p>
          <p className="text-xs font-bold text-white/90">
            Hotline/Zalo: <a href="tel:0865191634" className="underline hover:text-[#fdfcfc] transition-colors">0865191634</a>
          </p>
          <div className="flex items-center justify-between text-xs text-white font-semibold pt-3 border-t border-white/20">
            <span>Giờ mở cửa: {formatScheduleText(operatingHours.length ? operatingHours : DEFAULT_HOURS)}</span>
            <span className={`rounded-full px-2 py-0.5 ${isShopOpen(operatingHours.length ? operatingHours : DEFAULT_HOURS) ? 'bg-white/20' : 'bg-red-500/30 text-white'}`}>
              {isShopOpen(operatingHours.length ? operatingHours : DEFAULT_HOURS) ? 'Đang mở cửa' : 'Đang đóng cửa'}
            </span>
          </div>
        </div>
      </footer>

      {activeDrink && (
        <CustomizeSheet
          key={activeDrink.id}
          drink={activeDrink}
          onClose={() => setActiveDrink(null)}
        />
      )}

      <CartDrawer
        onPlaceOrder={placeOrder}
      />
    </div>
  );
}

export default function Page() {
  return (
    <CartProvider>
      <MainContent />
    </CartProvider>
  );
}
