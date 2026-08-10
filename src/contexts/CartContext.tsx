import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { Product } from "@/data/store-data";
import { supabase } from "@/integrations/supabase/client";
import { getSessionId } from "@/hooks/usePageTracking";

export interface CartItem {
  product: Product;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  markCheckoutReached: () => void;
  markConverted: () => void;
  totalItems: number;
  uniqueItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>([]);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addItem = useCallback((product: Product, quantity = 1) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) {
        return prev.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + quantity } : i
        );
      }
      return [...prev, { product, quantity }];
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((prev) => prev.filter((i) => i.product.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems((prev) => prev.filter((i) => i.product.id !== productId));
    } else {
      setItems((prev) =>
        prev.map((i) => (i.product.id === productId ? { ...i, quantity } : i))
      );
    }
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const uniqueItems = items.length;
  const totalPrice = items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

  // Sync cart to abandoned_carts for analytics (debounced)
  useEffect(() => {
    if (items.length === 0) return;
    if (syncTimer.current) clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const sessionId = getSessionId();
        const payload = {
          session_id: sessionId,
          user_id: session?.user?.id || null,
          items: items.map((i) => ({ id: i.product.id, name: i.product.name, qty: i.quantity, price: i.product.price })),
          total: totalPrice,
          items_count: totalItems,
        };
        await supabase.from("abandoned_carts").upsert(payload, { onConflict: "session_id" });
      } catch {
        // silent
      }
    }, 1500);
    return () => {
      if (syncTimer.current) clearTimeout(syncTimer.current);
    };
  }, [items, totalItems, totalPrice]);

  const markCheckoutReached = useCallback(async () => {
    try {
      await supabase
        .from("abandoned_carts")
        .update({ reached_checkout: true })
        .eq("session_id", getSessionId());
    } catch {
      // silent
    }
  }, []);

  const markConverted = useCallback(async () => {
    try {
      await supabase
        .from("abandoned_carts")
        .update({ converted: true, reached_checkout: true })
        .eq("session_id", getSessionId());
    } catch {
      // silent
    }
  }, []);

  return (
    <CartContext.Provider value={{ items, addItem, removeItem, updateQuantity, clearCart, markCheckoutReached, markConverted, totalItems, uniqueItems, totalPrice }}>
      {children}
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
};
