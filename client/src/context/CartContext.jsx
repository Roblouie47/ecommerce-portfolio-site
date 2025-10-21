import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import useSWR from 'swr';

const CartContext = createContext(null);
const fetcher = (url) => fetch(url).then(r => { if (!r.ok) throw new Error('Fetch failed'); return r.json(); });

// Versioned storage keys (allows future schema migrations)
const CART_ID_KEY = 'cartId';
const LOCAL_CART_KEY = 'localCart:v1';

// Validate stored cartId (currently just presence + basic format). Could extend later.
const validateCartId = (val) => typeof val === 'string' && val.length > 0;

// Validate structure of a local cart snapshot (defensive for corruption).
// Current server cart shape (based on usage): { items: [ { id, title, quantity, lineTotalCents, ... } ] }
function validateLocalCartSnapshot(data) {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.items)) return false;
    // Light validation on each item
    for (const it of data.items) {
        if (!it || typeof it !== 'object') return false;
        if (typeof it.id === 'undefined') return false;
        if (typeof it.title !== 'string') return false;
        if (typeof it.quantity !== 'number' || it.quantity <= 0) return false;
        if (typeof it.lineTotalCents !== 'number' || it.lineTotalCents < 0) return false;
    }
    return true;
}

export function CartProvider({ children }) {
    const [cartId, setCartId] = useState(() => {
        try {
            const raw = localStorage.getItem(CART_ID_KEY);
            return validateCartId(raw) ? raw : null;
        } catch { return null; }
    });
    const [open, setOpen] = useState(false);
    // Hydration state to avoid UI flash; becomes true after initial localStorage + (optional) server fetch attempt.
    const [isHydrated, setIsHydrated] = useState(false);

    // SWR fetch of authoritative server cart (if cartId exists)
    const { data: cartData, mutate: mutateCart, isValidating } = useSWR(() => cartId ? `/api/carts/${cartId}` : null, fetcher, { refreshInterval: 0 });

    // Local shadow of last known good cart to allow resilience if user goes offline or server temporarily fails.
    const [shadowCart, setShadowCart] = useState(() => {
        try {
            const raw = localStorage.getItem(LOCAL_CART_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return validateLocalCartSnapshot(parsed) ? parsed : null;
        } catch { return null; }
    });

    // Persist cartId when it changes
    useEffect(() => {
        try {
            if (cartId) localStorage.setItem(CART_ID_KEY, cartId);
        } catch { /* ignore quota/security errors */ }
    }, [cartId]);

    // When server cart updates, persist a trimmed snapshot (only needed fields) for offline resilience.
    useEffect(() => {
        if (cartData && validateLocalCartSnapshot(cartData)) {
            setShadowCart(cartData);
            try { localStorage.setItem(LOCAL_CART_KEY, JSON.stringify({ items: cartData.items.map(it => ({ id: it.id, title: it.title, quantity: it.quantity, lineTotalCents: it.lineTotalCents })) })); } catch { /* ignore */ }
        }
    }, [cartData]);

    // Mark hydrated after first tick (cartId + any shadow load). Delay ensures SSR parity (if SSR introduced later).
    useEffect(() => { setIsHydrated(true); }, []);

    const ensureCart = useCallback(async () => {
        if (cartId) return cartId;
        const res = await fetch('/api/carts', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
        if (!res.ok) throw new Error('Failed to create cart');
        const json = await res.json();
        if (json.id) { setCartId(json.id); }
        return json.id;
    }, [cartId]);

    const addToCart = useCallback(async (product, quantity = 1, variantId = null) => {
        const id = await ensureCart();
        const res = await fetch(`/api/carts/${id}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ productId: product.id, quantity, variantId })
        });
        if (!res.ok) {
            const e = await res.json().catch(() => ({ error: 'Add failed' }));
            throw new Error(e.error || 'Add failed');
        }
        await mutateCart();
        setOpen(true);
    }, [ensureCart, mutateCart]);

    // Prefer live server data; fallback to shadowCart while loading / offline.
    const effectiveCart = cartData || shadowCart || null;
    const subtotalCents = effectiveCart?.items?.reduce((sum, it) => sum + it.lineTotalCents, 0) || 0;

    return (
        <CartContext.Provider value={{ cartId, cart: effectiveCart, addToCart, mutateCart, open, setOpen, subtotalCents, isHydrated, isValidating }}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() { return useContext(CartContext); }
