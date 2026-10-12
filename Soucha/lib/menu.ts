// lib/menu.ts — types, menu data and pricing logic for Soucha. Prices in VND.

export type DrinkFamily = string; // fallback if needed

export interface DrinkItem {
  id: string;
  name: string;
  family: string;
  basePrice: number;
  image?: string;
}

export interface OptionChoice {
  id: string;
  label: string;
  price: number;
  /** Legacy powder family */
  family?: string;
  extraPricePerGram?: number;
  
  // Generic DB fields
  option_group?: string;
  category_ids?: string[];
  is_default?: boolean;
}

export interface CustomizationOptions {
  sizeId: string;
  powderId: string;
  extraPowderGrams: 0 | 1 | 2 | 3 | 4 | 5 | number;
  milkId: string;
  toppingIds?: string[]; // Backwards compatibility for old carts
  toppings: { id: string; quantity: number }[];
  toppingNote: string;
  sweetness: 0 | 25 | 50 | 75 | 100 | number;
  ice: "shared" | "separate" | string;
}

export interface CartItem {
  id: string;
  drink: DrinkItem;
  options: CustomizationOptions;
  quantity: number;
  unitPrice: number;
}

export interface CustomerInfo {
  name: string;
  phone: string;
}

export interface OrderDetails {
  fulfillmentType: 'pickup' | 'delivery';
  pickupOption?: 'asap' | 'custom';
  pickupTime?: string;
  address?: string;
  note?: string;
  paymentMethod: 'vietqr' | 'cash';
}

export interface Order {
  customer: CustomerInfo;
  details: OrderDetails;
  items: CartItem[];
  total: number;
}

export const EXTRA_POWDER_PRICE_PER_GRAM = 0;

export const DRINKS: DrinkItem[] = [
  { id: "matcha-latte", name: "Matcha Latte", family: "matcha", basePrice: 30000, image: "/beverages/matcha-latte.jpeg" },
  { id: "matcha-cold-whisk", name: "Matcha Cold Whisk", family: "matcha", basePrice: 32000, image: "/beverages/matcha-cold-whisk.jpeg" },
  { id: "matcha-dau", name: "Matcha Dâu", family: "matcha", basePrice: 37000, image: "/beverages/matcha-dau.jpeg" },
  { id: "matcha-caramel", name: "Matcha Caramel", family: "matcha", basePrice: 35000, image: "/beverages/matcha-caramel.jpeg" },
  { id: "matcha-oreo", name: "Matcha Oreo Kem Cheese Dẻo", family: "matcha", basePrice: 44000, image: "/beverages/matcha-oreo.jpeg" },
  { id: "matcha-kem-muoi", name: "Matcha Kem Muối", family: "matcha", basePrice: 40000, image: "/beverages/matcha-kem-muoi.jpeg" },
  { id: "houjicha-latte", name: "Houjicha Latte", family: "houjicha", basePrice: 30000, image: "/beverages/houjicha-latte.jpeg" },
  { id: "houjicha-cold-whisk", name: "Houjicha Cold Whisk", family: "houjicha", basePrice: 32000, image: "/beverages/houjicha-cold-whisk.jpeg" },
];

export const SIZES: OptionChoice[] = [
  { id: "m", label: "M", price: 0 },
  { id: "l", label: "L", price: 5000 },
];

export const POWDERS: OptionChoice[] = [
  { id: "dai", label: "Đài", price: 0, family: "matcha", extraPricePerGram: 3000 },
  { id: "olong", label: "Olong", price: 0, family: "matcha", extraPricePerGram: 3000 },
  { id: "satoen", label: "Satoen Premium", price: 0, family: "matcha", extraPricePerGram: 3000 },
  { id: "fuji", label: "Fuji no haru", price: 10000, family: "matcha", extraPricePerGram: 5000 },
  { id: "mk4", label: "MK4", price: 12000, family: "matcha", extraPricePerGram: 6000 },
  { id: "chiran", label: "Chiran", price: 15000, family: "matcha", extraPricePerGram: 8000 },
  { id: "houjicha", label: "Houjicha", price: 0, family: "houjicha", extraPricePerGram: 3000 },
];

export const EXTRA_POWDER_GRAMS = [0, 1, 2, 3, 4, 5] as const;

export const MILKS: OptionChoice[] = [
  { id: "mlekovita", label: "Sữa Mlekovita (mặc định)", price: 0 },
  { id: "meji", label: "Sữa Meji đỏ", price: 8000 },
  { id: "oat", label: "Sữa Alternative (Oat)", price: 7000 },
];

export const TOPPINGS: OptionChoice[] = [
  { id: "oreo", label: "Extra vụn Oreo", price: 5000 },
  { id: "dau", label: "Extra mứt dâu", price: 5000 },
  { id: "caramel", label: "Extra caramel", price: 5000 },
  { id: "kem-muoi", label: "Kem muối", price: 10000 },
  { id: "kem-cheese", label: "Kem cheese dẻo", price: 12000 },
];

export const SWEETNESS = [0, 25, 50, 75, 100] as const;

export const ICE_OPTIONS = [
  { id: "shared", label: "Đá chung" },
  { id: "separate", label: "Đá riêng" },
] as const;

export const formatVND = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

export const formatDelta = (p: number) => (p === 0 ? "" : `+${formatVND(p)}`);

export function getActiveOptionsGroup(groupName: string, dbOptions?: any[], fallback: OptionChoice[] = []): OptionChoice[] {
  if (dbOptions && dbOptions.length > 0) {
    const group = dbOptions.filter(o => o.option_group === groupName);
    if (group.length > 0) {
      return group.map(o => {
        let extractedId = o.id.replace(`${groupName}-`, '');
        if (groupName === 'extra_powder') extractedId = extractedId.replace('extra-', '');
        if (groupName === 'sweetness') extractedId = extractedId.replace('sweet-', '');
        return {
        id: extractedId,
        label: o.label,
        price: Number(o.price) || 0,
        extraPricePerGram: Number(o.extra_price) || 0,
        category_ids: o.category_ids || [],
        is_default: !!o.is_default,
      };
    });
    }
  }
  return fallback;
}

export function isOptionAllowedForCategory(opt: OptionChoice, categoryId: string): boolean {
  if (opt.category_ids && opt.category_ids.length > 0) {
    return opt.category_ids.includes(categoryId);
  }
  // Legacy fallback for powders
  if (opt.family) {
    return opt.family === categoryId;
  }
  return true;
}

export function defaultOptions(drink: DrinkItem, dbOptions?: any[]): CustomizationOptions {
  const sizes = getActiveOptionsGroup("size", dbOptions, [...SIZES]);
  const powders = getActiveOptionsGroup("powder", dbOptions, [...POWDERS]);
  const milks = getActiveOptionsGroup("milk", dbOptions, [...MILKS]);
  const sweetnessList = getActiveOptionsGroup("sweetness", dbOptions, SWEETNESS.map(s => ({ id: s.toString(), label: `${s}%`, price: 0 })));
  const ices = getActiveOptionsGroup("ice", dbOptions, ICE_OPTIONS.map(i => ({ ...i, price: 0 })));

  const defaultSize = sizes.find(s => s.is_default)?.id || sizes[0]?.id || "m";
  
  const allowedPowders = powders.filter(p => isOptionAllowedForCategory(p, drink.family));
  const defaultPowder = allowedPowders.find(p => p.is_default)?.id || allowedPowders[0]?.id || (drink.family === "houjicha" ? "houjicha" : "dai");
  
  const allowedMilks = milks.filter(m => isOptionAllowedForCategory(m, drink.family));
  const defaultMilk = allowedMilks.find(m => m.is_default)?.id || allowedMilks[0]?.id || "";
  const defaultSweetness = sweetnessList.find(s => s.is_default)?.id || "75";
  const defaultIce = ices.find(i => i.is_default)?.id || ices[0]?.id || "shared";

  return {
    sizeId: defaultSize,
    powderId: defaultPowder,
    extraPowderGrams: 0,
    milkId: defaultMilk,
    toppings: [],
    toppingNote: "",
    sweetness: Number(defaultSweetness) || 75,
    ice: defaultIce,
  };
}

export function calcUnitPrice(drink: DrinkItem, opts: CustomizationOptions, dbOptions?: any[]): number {
  let total = drink.basePrice;
  const sizes = getActiveOptionsGroup("size", dbOptions, [...SIZES]);
  const powders = getActiveOptionsGroup("powder", dbOptions, [...POWDERS]);
  const milks = getActiveOptionsGroup("milk", dbOptions, [...MILKS]);
  const toppings = getActiveOptionsGroup("topping", dbOptions, [...TOPPINGS]);

  const size = sizes.find((s) => s.id === opts.sizeId);
  if (size) total += size.price;

  const powder = powders.find((p) => p.id === opts.powderId);
  if (powder && isOptionAllowedForCategory(powder, drink.family)) {
    total += powder.price;
  } else {
    // If invalid powder submitted, we should ideally fallback to default, but for now we just don't add price, 
    // or maybe fallback to default price? We'll just add the price if it's allowed.
    // To be perfectly safe, we'll only add price if allowed.
  }

  const allowedPowders = powders.filter(p => isOptionAllowedForCategory(p, drink.family));
  const allowedMilks = milks.filter(m => isOptionAllowedForCategory(m, drink.family));

  const extraPowders = getActiveOptionsGroup("extra_powder", dbOptions, []);
  // Use extra_price from powder if defined, otherwise fallback to 3000
  const perGramPrice = powder?.extraPricePerGram || 3000;
  
  // Extra powder price is determined by the selected powder's extraPricePerGram
  const extraGrams = Number(opts.extraPowderGrams) || 0;
  
  if (allowedPowders.length === 0) {
    // Extra powder is not allowed if there are no powders for this category
  } else if (extraPowders.length > 0) {
    const chosenExtra = extraPowders.find(ep => ep.id === extraGrams.toString());
    if (chosenExtra) {
      total += extraGrams * perGramPrice;
    }
  } else {
    // Legacy calculation if no DB options exist
    total += extraGrams * perGramPrice;
  }

  const milk = allowedMilks.find((m) => m.id === opts.milkId);
  if (milk) total += milk.price;

  // Backward compatibility + current format
  const currentToppings = opts.toppings || (opts.toppingIds || []).map((id: string) => ({ id, quantity: 1 }));
  
  for (const tSelect of currentToppings) {
    const t = toppings.find((top) => top.id === tSelect.id);
    if (t && isOptionAllowedForCategory(t, drink.family)) {
      // Clamp quantity between 1 and 5 to prevent client manipulation
      const safeQty = Math.max(1, Math.min(5, Number(tSelect.quantity) || 1));
      total += t.price * safeQty;
    }
  }

  return total;
}

export function summarizeOptions(opts: CustomizationOptions, dbOptions?: any[], drink?: DrinkItem): string {
  const parts: string[] = [];
  
  const sizes = getActiveOptionsGroup("size", dbOptions, [...SIZES]);
  const powders = getActiveOptionsGroup("powder", dbOptions, [...POWDERS]);
  const milks = getActiveOptionsGroup("milk", dbOptions, [...MILKS]);
  const toppings = getActiveOptionsGroup("topping", dbOptions, [...TOPPINGS]);

  const allowedPowders = drink ? powders.filter(p => isOptionAllowedForCategory(p, drink.family)) : powders;
  const allowedMilks = drink ? milks.filter(m => isOptionAllowedForCategory(m, drink.family)) : milks;

  const size = sizes.find((s) => s.id === opts.sizeId);
  if (size) parts.push(`Size ${size.label}`);

  const powder = allowedPowders.find((p) => p.id === opts.powderId);
  if (powder) parts.push(`Bột ${powder.label}`);

  if (opts.extraPowderGrams > 0 && allowedPowders.length > 0) {
    parts.push(`Extra ${opts.extraPowderGrams}g bột`);
  }

  const milk = allowedMilks.find((m) => m.id === opts.milkId);
  if (milk) parts.push(milk.label);

  const currentToppings = opts.toppings || (opts.toppingIds || []).map((id: string) => ({ id, quantity: 1 }));
  const toppingsList = currentToppings
    .map((tSelect: any) => {
      const t = toppings.find((top) => top.id === tSelect.id);
      if (!t) return null;
      return tSelect.quantity > 1 ? `${t.label} × ${tSelect.quantity}` : t.label;
    })
    .filter(Boolean);
  
  if (toppingsList.length) parts.push(toppingsList.join(", "));
  if (opts.toppingNote?.trim()) parts.push(`Khác: ${opts.toppingNote.trim()}`);

  const sweetnessList = getActiveOptionsGroup("sweetness", dbOptions, []);
  if (sweetnessList.length > 0) {
    const sweetOpt = sweetnessList.find(s => s.id === opts.sweetness.toString());
    if (sweetOpt) parts.push(`Đường ${sweetOpt.label}`);
    else parts.push(`Đường ${opts.sweetness}%`);
  } else {
    parts.push(`Đường ${opts.sweetness}%`);
  }
  
  const ices = getActiveOptionsGroup("ice", dbOptions, []);
  if (ices.length > 0) {
    const iceOpt = ices.find(i => i.id === opts.ice);
    if (iceOpt) parts.push(iceOpt.label);
    else parts.push(opts.ice === "separate" ? "Đá riêng" : "Đá chung");
  } else {
    parts.push(opts.ice === "separate" ? "Đá riêng" : "Đá chung");
  }

  return parts.join(" • ");
}
