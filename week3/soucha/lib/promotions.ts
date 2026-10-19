// lib/promotions.ts — Promotion calculation engine for Soucha
// Reusable from both client (UI preview) and server (authoritative calculation).

import { CartItem, DRINKS, SIZES, calcUnitPrice, DrinkItem } from "./menu";

// ─── Types ──────────────────────────────────────────────────────────

export interface Promotion {
  id: string;
  name: string;
  type: "percentage" | "fixed_amount" | "buy_x_get_y" | "free_upsize";
  is_active: boolean;
  allow_stacking: boolean;
  min_quantity: number;
  min_order_value: number;
  discount_value: number;
  buy_quantity: number;
  get_quantity: number;
  scope?: "all" | "products" | "categories";
  promotion_products?: { product_id: string }[];
  promotion_categories?: { category_id: string }[];
  applicable_product_id: string | null; // legacy
  reward_product_id: string | null;
  start_date: string;
  end_date: string | null;
}

export interface AppliedPromotion {
  id: string;
  name: string;
  type: string;
  discount: number;
}

export interface DiscountResult {
  originalTotal: number;
  discountAmount: number;
  finalTotal: number;
  appliedPromotions: AppliedPromotion[];
}

// ─── Helpers ────────────────────────────────────────────────────────

/** Check if a promotion is currently valid (active + within date range). */
function isPromotionValid(promo: Promotion, now: Date = new Date()): boolean {
  if (!promo.is_active) return false;
  if (new Date(promo.start_date) > now) return false;
  if (promo.end_date && new Date(promo.end_date) < now) return false;
  return true;
}

/** Check if a specific cart item falls within the promotion's scope */
function isItemInScope(item: CartItem, promo: Promotion): boolean {
  if (promo.scope === "products") {
    if (promo.promotion_products && promo.promotion_products.length > 0) {
      return promo.promotion_products.some((p) => p.product_id === item.drink.id);
    }
    if (promo.applicable_product_id) return item.drink.id === promo.applicable_product_id;
    return false;
  }
  
  if (promo.scope === "categories") {
    if (promo.promotion_categories && promo.promotion_categories.length > 0) {
      return promo.promotion_categories.some((c) => c.category_id === item.drink.family);
    }
    return false;
  }

  // legacy or 'all'
  if (promo.applicable_product_id) return item.drink.id === promo.applicable_product_id;
  return true;
}

/** Get the total quantity of items matching a promotion's scope. */
function getScopedQuantity(items: CartItem[], promo: Promotion): number {
  return items
    .filter((item) => isItemInScope(item, promo))
    .reduce((sum, item) => sum + item.quantity, 0);
}

/** Get the subtotal of items matching a promotion's scope. */
function getScopedSubtotal(items: CartItem[], promo: Promotion): number {
  return items
    .filter((item) => isItemInScope(item, promo))
    .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

/** Check if minimum conditions are satisfied. */
function meetsConditions(
  promo: Promotion,
  items: CartItem[],
  originalTotal: number
): boolean {
  if (promo.min_quantity > 0) {
    const qty = getScopedQuantity(items, promo);
    if (qty < promo.min_quantity) return false;
  }
  if (promo.min_order_value > 0) {
    if (originalTotal < promo.min_order_value) return false;
  }
  return true;
}

// ─── Per-Promotion Discount Calculators ─────────────────────────────

function calcPercentageDiscount(
  promo: Promotion,
  items: CartItem[]
): number {
  const pct = promo.discount_value;
  if (pct <= 0 || pct > 100) return 0;

  const eligibleSubtotal = getScopedSubtotal(items, promo);
  return Math.floor(eligibleSubtotal * pct / 100);
}

function calcFixedAmountDiscount(
  promo: Promotion,
  items: CartItem[],
  originalTotal: number
): number {
  const amount = promo.discount_value;
  if (amount <= 0) return 0;

  // Cap at the eligible subtotal (scoped) or the original total
  const eligibleSubtotal = getScopedSubtotal(items, promo);
  return Math.min(amount, eligibleSubtotal, originalTotal);
}

function calcBuyXGetYDiscount(
  promo: Promotion,
  items: CartItem[],
  allProducts: DrinkItem[] = DRINKS
): number {
  if (promo.buy_quantity <= 0 || promo.get_quantity <= 0) return 0;
  if (!promo.reward_product_id) return 0;

  // Count qualifying items
  const qualifyingQty = getScopedQuantity(items, promo);
  const rewardSets = Math.floor(qualifyingQty / promo.buy_quantity);
  if (rewardSets <= 0) return 0;

  const freeQty = rewardSets * promo.get_quantity;

  // Look up reward product's base price from allProducts
  const rewardDrink = allProducts.find((d) => d.id === promo.reward_product_id);
  if (!rewardDrink) return 0;

  // The discount is the base price of the reward product × free quantity.
  // We use basePrice (Size M, no extras) as the standard free item value.
  return freeQty * rewardDrink.basePrice;
}

function calcFreeUpsizeDiscount(
  promo: Promotion,
  items: CartItem[]
): number {
  // Calculate the actual size price difference from the SIZES array
  const sizeM = SIZES.find((s) => s.id === "m");
  const sizeL = SIZES.find((s) => s.id === "l");
  if (!sizeM || !sizeL) return 0;

  const sizeDiff = sizeL.price - sizeM.price;
  if (sizeDiff <= 0) return 0;

  let discount = 0;
  for (const item of items) {
    // Check product scope
    if (!isItemInScope(item, promo)) {
      continue;
    }
    // Only apply if customer selected size L
    if (item.options.sizeId === "l") {
      discount += sizeDiff * item.quantity;
    }
  }

  return discount;
}

// ─── Main Calculator ────────────────────────────────────────────────

/**
 * Calculate the discount for a single promotion against cart items.
 * Returns the raw discount amount (before capping at total).
 */
function calcSinglePromoDiscount(
  promo: Promotion,
  items: CartItem[],
  originalTotal: number,
  allProducts: DrinkItem[] = DRINKS
): number {
  switch (promo.type) {
    case "percentage":
      return calcPercentageDiscount(promo, items);
    case "fixed_amount":
      return calcFixedAmountDiscount(promo, items, originalTotal);
    case "buy_x_get_y":
      return calcBuyXGetYDiscount(promo, items, allProducts);
    case "free_upsize":
      return calcFreeUpsizeDiscount(promo, items);
    default:
      return 0;
  }
}

/**
 * Main promotion calculation function.
 *
 * Stacking behavior:
 * - If allow_stacking is false (default): only the single best promotion is applied.
 * - If allow_stacking is true: the promotion may be combined with others.
 *
 * When multiple promotions are eligible:
 * 1. Separate into stackable and non-stackable groups.
 * 2. For non-stackable: pick the one with the largest discount.
 * 3. For stackable: apply all in sequence (sorted by discount descending).
 * 4. Compare: total from stacking vs best non-stackable, pick the better result.
 * 5. finalTotal is guaranteed >= 0.
 */
export function calculateDiscounts(
  cartItems: CartItem[],
  activePromotions: Promotion[],
  allProducts: DrinkItem[] = DRINKS
): DiscountResult {
  const originalTotal = cartItems.reduce(
    (sum, item) => sum + item.unitPrice * item.quantity,
    0
  );

  if (!cartItems.length || !activePromotions.length) {
    return {
      originalTotal,
      discountAmount: 0,
      finalTotal: originalTotal,
      appliedPromotions: [],
    };
  }

  const now = new Date();

  // Filter to valid + condition-meeting promotions
  const eligible = activePromotions.filter(
    (p) => isPromotionValid(p, now) && meetsConditions(p, cartItems, originalTotal)
  );

  if (!eligible.length) {
    return {
      originalTotal,
      discountAmount: 0,
      finalTotal: originalTotal,
      appliedPromotions: [],
    };
  }

  // Calculate raw discount for each eligible promotion
  const withDiscounts = eligible.map((p) => ({
    promo: p,
    discount: calcSinglePromoDiscount(p, cartItems, originalTotal, allProducts),
  })).filter((x) => x.discount > 0);

  if (!withDiscounts.length) {
    return {
      originalTotal,
      discountAmount: 0,
      finalTotal: originalTotal,
      appliedPromotions: [],
    };
  }

  // Separate stackable vs non-stackable
  const nonStackable = withDiscounts.filter((x) => !x.promo.allow_stacking);
  const stackable = withDiscounts.filter((x) => x.promo.allow_stacking);

  // Best non-stackable promotion
  let bestNonStackDiscount = 0;
  let bestNonStackPromo: typeof withDiscounts[0] | null = null;
  for (const x of nonStackable) {
    if (x.discount > bestNonStackDiscount) {
      bestNonStackDiscount = x.discount;
      bestNonStackPromo = x;
    }
  }

  // Stackable: apply all, capped at originalTotal
  // Sort by discount descending for deterministic order
  const sortedStackable = [...stackable].sort((a, b) => b.discount - a.discount);
  let stackedTotal = 0;
  const stackedApplied: typeof withDiscounts = [];
  for (const x of sortedStackable) {
    if (stackedTotal + x.discount <= originalTotal) {
      stackedTotal += x.discount;
      stackedApplied.push(x);
    } else {
      // Partially apply: cap at remaining
      const remaining = originalTotal - stackedTotal;
      if (remaining > 0) {
        stackedTotal += remaining;
        stackedApplied.push({ ...x, discount: remaining });
      }
      break;
    }
  }

  // Decide: use best non-stackable OR stacked result (whichever is better)
  let finalDiscount: number;
  let finalApplied: AppliedPromotion[];

  if (bestNonStackDiscount >= stackedTotal) {
    // Non-stackable wins (or tie goes to non-stackable for simplicity)
    finalDiscount = Math.min(bestNonStackDiscount, originalTotal);
    finalApplied = bestNonStackPromo
      ? [
          {
            id: bestNonStackPromo.promo.id,
            name: bestNonStackPromo.promo.name,
            type: bestNonStackPromo.promo.type,
            discount: finalDiscount,
          },
        ]
      : [];
  } else {
    // Stacking wins
    finalDiscount = Math.min(stackedTotal, originalTotal);
    finalApplied = stackedApplied.map((x) => ({
      id: x.promo.id,
      name: x.promo.name,
      type: x.promo.type,
      discount: x.discount,
    }));
  }

  // If there are both stackable and non-stackable, also consider combining
  // the best non-stackable with all stackable (since stackable promos can combine)
  // For this simple app, we keep it straightforward: stackable only combine with each other.

  return {
    originalTotal,
    discountAmount: Math.floor(finalDiscount),
    finalTotal: Math.max(0, originalTotal - Math.floor(finalDiscount)),
    appliedPromotions: finalApplied,
  };
}
