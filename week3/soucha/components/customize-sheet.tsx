"use client";

import { useState, useEffect } from "react";
import {
  EXTRA_POWDER_GRAMS, ICE_OPTIONS, MILKS, POWDERS, SIZES, SWEETNESS, TOPPINGS,
  calcUnitPrice, defaultOptions, formatVND, isOptionAllowedForCategory, getActiveOptionsGroup,
  type CustomizationOptions, type DrinkItem, type OptionChoice,
} from "@/lib/menu";
import { useCart } from "./cart-provider";
import { Chips, OptionGroup, OptionTile, Sheet, Stepper } from "./ui";

import { CartItem } from "@/lib/menu";

export function CustomizeSheet({ drink, onClose, initialItem }: { drink: DrinkItem; onClose: () => void; initialItem?: CartItem }) {
  const { add, update, activePromotions } = useCart();
  const [dbOptions, setDbOptions] = useState<any[]>([]);
  const [o, setO] = useState<CustomizationOptions>(() => initialItem ? initialItem.options : defaultOptions(drink));
  const [qty, setQty] = useState(initialItem ? initialItem.quantity : 1);

  useEffect(() => {
    fetch(`/api/options?_t=${Date.now()}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && Array.isArray(data) && data.length > 0) {
          setDbOptions(data);
          if (!initialItem) {
            setO(defaultOptions(drink, data));
          }
        }
      })
      .catch(() => {});
  }, [drink, initialItem]);

  const set = <K extends keyof CustomizationOptions>(k: K, v: CustomizationOptions[K]) =>
    setO((prev) => ({ ...prev, [k]: v }));

  const unit = calcUnitPrice(drink, o, dbOptions);
  let total = unit * qty;

  const promo = activePromotions.find(
    (p) =>
      p.applicable_product_id === drink.id &&
      (p.type === "percentage" || p.type === "fixed_amount" || p.type === "free_upsize")
  );

  const sizes = getActiveOptionsGroup("size", dbOptions, [...SIZES]);
  const powders = getActiveOptionsGroup("powder", dbOptions, [...POWDERS]);
  const extraPowders = getActiveOptionsGroup("extra_powder", dbOptions, []);
  const milks = getActiveOptionsGroup("milk", dbOptions, [...MILKS]);
  const toppings = getActiveOptionsGroup("topping", dbOptions, [...TOPPINGS]);
  const sweetnessList = getActiveOptionsGroup("sweetness", dbOptions, SWEETNESS.map(s => ({ id: s.toString(), label: `${s}%`, price: 0 })));
  const ices = getActiveOptionsGroup("ice", dbOptions, ICE_OPTIONS.map(i => ({ ...i, price: 0 })));

  const allowedPowders = powders.filter(p => isOptionAllowedForCategory(p, drink.family));
  const allowedMilks = milks.filter(m => isOptionAllowedForCategory(m, drink.family));

  if (promo) {
    if (promo.type === "percentage") {
      total = total - (total * promo.discount_value) / 100;
    } else if (promo.type === "fixed_amount") {
      total = Math.max(0, total - promo.discount_value);
    } else if (promo.type === "free_upsize" && o.sizeId === "l") {
      const sizeM = sizes.find((s) => s.id === "m")?.price || 0;
      const sizeL = sizes.find((s) => s.id === "l")?.price || 5000;
      total = Math.max(0, total - ((sizeL - sizeM) * qty));
    }
  }

  const toggleTopping = (id: string) => {
    const current = o.toppings || [];
    const exists = current.find((t) => t.id === id);
    if (exists) {
      set("toppings", current.filter((t) => t.id !== id));
    } else {
      set("toppings", [...current, { id, quantity: 1 }]);
    }
  };

  const updateToppingQty = (id: string, quantity: number) => {
    const current = o.toppings || [];
    set("toppings", current.map((t) => (t.id === id ? { ...t, quantity } : t)));
  };

  const submit = () => {
    if (initialItem) {
      update(initialItem.id, { drink, options: o, quantity: qty, unitPrice: unit });
    } else {
      add({ drink, options: o, quantity: qty, unitPrice: unit });
    }
    onClose();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={drink.name}
      subtitle={formatVND(drink.basePrice)}
      footer={
        <div className="flex items-center gap-3">
          <Stepper value={qty} onChange={setQty} />
          <button
            type="button"
            onClick={submit}
            className="min-h-[48px] flex-1 rounded-2xl bg-[#155727] px-4 text-[15px] font-bold text-[#fdfcfc] shadow-md transition-all hover:bg-[#0f461e] active:scale-[0.99] active:bg-[#0b3517]"
          >
            {initialItem ? "Lưu thay đổi" : "Thêm vào giỏ hàng"} - {formatVND(total)}
          </button>
        </div>
      }
    >
      <OptionGroup title="Size" required>
        {sizes.map((s) => (
          <OptionTile key={s.id} kind="radio" label={s.label} price={s.price} checked={o.sizeId === s.id} onSelect={() => set("sizeId", s.id)} />
        ))}
      </OptionGroup>

      {allowedPowders.length > 0 && (
        <OptionGroup title="Chọn bột" required>
          {allowedPowders.map((p) => (
            <OptionTile
              key={p.id}
              kind="radio"
              label={p.label}
              price={p.price}
              checked={o.powderId === p.id}
              onSelect={() => set("powderId", p.id)}
            />
          ))}
        </OptionGroup>
      )}

      {allowedPowders.length > 0 && (
        extraPowders.length > 0 ? (
          <OptionGroup title="Extra bột (gam)">
            <Chips 
              values={extraPowders.map(e => Number(e.id))} 
              value={o.extraPowderGrams} 
              onChange={(g) => set("extraPowderGrams", g)} 
              renderLabel={(g) => extraPowders.find(e => e.id === g.toString())?.label || `+${g}g`} 
            />
          </OptionGroup>
        ) : (
          <OptionGroup title="Extra bột (gam)">
            <Chips values={EXTRA_POWDER_GRAMS} value={o.extraPowderGrams} onChange={(g) => set("extraPowderGrams", g)} renderLabel={(g) => (g === 0 ? "0g" : `+${g}g`)} />
          </OptionGroup>
        )
      )}

      {allowedMilks.length > 0 && (
        <OptionGroup title="Sữa">
          {allowedMilks.map((m) => (
            <OptionTile key={m.id} kind="radio" label={m.label} price={m.price} checked={o.milkId === m.id} onSelect={() => set("milkId", m.id)} />
          ))}
        </OptionGroup>
      )}

      <OptionGroup title="Topping">
        {toppings.map((t) => {
          const allowed = isOptionAllowedForCategory(t, drink.family);
          if (!allowed) return null;
          
          const current = (o.toppings || []).find((x) => x.id === t.id);
          const isSelected = !!current;
          return (
            <div key={t.id} className="flex flex-col gap-1.5">
              <OptionTile
                kind="checkbox"
                label={t.label}
                price={t.price}
                checked={isSelected}
                onSelect={() => toggleTopping(t.id)}
              />
              {isSelected && (
                <div className="flex items-center justify-between rounded-xl border border-dashed border-[#155727]/30 bg-[#155727]/5 px-3 py-2 ml-4 mb-2">
                  <span className="text-sm font-semibold text-[#155727]">Số lượng:</span>
                  <Stepper value={current.quantity} onChange={(val) => updateToppingQty(t.id, val)} min={1} max={5} />
                </div>
              )}
            </div>
          );
        })}
        <div className="pt-1.5">
          <input
            type="text"
            placeholder="Mục khác (ghi chú thêm topping)..."
            value={o.toppingNote}
            onChange={(e) => set("toppingNote", e.target.value)}
            className="min-h-[44px] w-full rounded-xl border border-transparent bg-white px-3 text-sm text-[#43281a] placeholder:text-[#43281a]/50 outline-none focus:border-[#155727]"
          />
        </div>
      </OptionGroup>

      <OptionGroup title="Độ ngọt">
        {sweetnessList.length > 0 ? (
          <Chips 
            values={sweetnessList.map(s => Number(s.id))} 
            value={o.sweetness} 
            onChange={(s) => set("sweetness", s)} 
            renderLabel={(s) => sweetnessList.find(sw => sw.id === s.toString())?.label || `${s}%`} 
          />
        ) : (
          <Chips values={SWEETNESS} value={o.sweetness} onChange={(s) => set("sweetness", s)} renderLabel={(s) => `${s}%`} />
        )}
      </OptionGroup>

      <OptionGroup title="Đá">
        {ices.map((i) => (
          <OptionTile key={i.id} kind="radio" label={i.label} checked={o.ice === i.id} onSelect={() => set("ice", i.id)} />
        ))}
      </OptionGroup>
    </Sheet>
  );
}
