"use client";

import { createContext, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";
import type { CartItem } from "@/lib/menu";
import { calculateDiscounts, type AppliedPromotion, type Promotion } from "@/lib/promotions";

type Action =
  | { type: "add"; item: CartItem }
  | { type: "setQty"; id: string; quantity: number } // quantity < 1 removes the item
  | { type: "remove"; id: string }
  | { type: "clear" }
  | { type: "update"; id: string; item: Omit<import("@/lib/menu").CartItem, "id"> };

function reducer(state: CartItem[], a: Action): CartItem[] {
  switch (a.type) {
    case "add":
      return [...state, a.item];
    case "setQty":
      return a.quantity < 1
        ? state.filter((i) => i.id !== a.id)
        : state.map((i) => (i.id === a.id ? { ...i, quantity: a.quantity } : i));
    case "remove":
      return state.filter((i) => i.id !== a.id);
    case "clear":
      return [];
    case "update":
      return state.map(item => item.id === a.id ? { ...(a as any).item, id: (a as any).id } : item);
  }
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotal: number;
  discount: number;
  total: number;
  appliedPromotions: AppliedPromotion[];
  activePromotions: Promotion[];
  operatingHours: any[];
  add: (item: Omit<CartItem, "id">) => void;
  setQty: (id: string, quantity: number) => void;
  remove: (id: string) => void;
  update: (id: string, item: Omit<import("@/lib/menu").CartItem, "id">) => void;
  clear: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, dispatch] = useReducer(reducer, []);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [operatingHours, setOperatingHours] = useState<any[]>([]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [resPromos, resHours] = await Promise.all([
          fetch(`/api/promotions?_t=${Date.now()}`),
          fetch(`/api/operating-hours?_t=${Date.now()}`)
        ]);
        if (resPromos.ok) {
          setPromotions(await resPromos.json());
        }
        if (resHours.ok) {
          setOperatingHours(await resHours.json());
        }
      } catch (e) {
        console.error("Failed to fetch data:", e);
      }
    }
    fetchData();
  }, []);

  const value = useMemo<CartContextValue>(() => {
    const calc = calculateDiscounts(items, promotions);
    return {
      items,
      count: items.reduce((n, i) => n + i.quantity, 0),
      subtotal: calc.originalTotal,
      discount: calc.discountAmount,
      total: calc.finalTotal,
      appliedPromotions: calc.appliedPromotions,
      activePromotions: promotions,
      operatingHours,
      add: (item) =>
        dispatch({ type: "add", item: { ...item, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` } }),
      setQty: (id, quantity) => dispatch({ type: "setQty", id, quantity }),
      remove: (id) => dispatch({ type: "remove", id }),
      update: (id, item) => dispatch({ type: "update", id, item }),
      clear: () => dispatch({ type: "clear" }),
    };
  }, [items, promotions, operatingHours]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside <CartProvider>");
  return ctx;
}
