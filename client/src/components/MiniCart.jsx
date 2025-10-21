import React from 'react';
import { useCart } from '../context/CartContext';

export default function MiniCart() {
    const { cart, open, setOpen, subtotalCents, isHydrated } = useCart();
    const items = cart?.items || [];
    return (
        <>
            <button aria-label="Open cart" onClick={() => setOpen(true)} className="fixed bottom-20 right-4 z-40 btn shadow-lg md:hidden">Cart</button>
            <div className={`fixed top-0 right-0 h-full w-full sm:w-[420px] bg-surface/95 backdrop-blur-xl border-l border-border shadow-lg z-50 transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`} role="dialog" aria-label="Mini cart" aria-hidden={!open}>
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <h3 className="font-medium">Your Cart</h3>
                    <button onClick={() => setOpen(false)} className="text-muted hover:text-text" aria-label="Close">✕</button>
                </div>
                <div className="p-4 space-y-4 overflow-y-auto h-[calc(100%-200px)]">
                    {isHydrated && items.length === 0 && <p className="text-sm text-muted">Cart is empty.</p>}
                    {!isHydrated && <p className="text-sm text-muted">Loading cart…</p>}
                    {items.map(it => (
                        <div key={it.id} className="flex gap-3 text-sm">
                            <div className="w-16 h-16 bg-surface-alt border border-border rounded-md" />
                            <div className="flex-1">
                                <div className="font-medium line-clamp-1">{it.title}</div>
                                <div className="text-muted">Qty {it.quantity}</div>
                                <div className="font-semibold">${(it.lineTotalCents / 100).toFixed(2)}</div>
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-4 border-t border-border space-y-3">
                    <div className="flex justify-between text-sm"><span>Subtotal</span><span>{isHydrated ? `$${(subtotalCents / 100).toFixed(2)}` : '—'}</span></div>
                    <div className="flex justify-between text-sm"><span>Shipping</span><span className="text-muted">Calculated at checkout</span></div>
                    <div className="flex justify-between text-sm font-semibold"><span>Total (est)</span><span>{isHydrated ? `$${(subtotalCents / 100).toFixed(2)}` : '—'}</span></div>
                    <button className="btn w-full" disabled={!isHydrated || !items.length}>Checkout</button>
                    <div className="flex items-center justify-center gap-2 pt-2 opacity-70 text-[10px] tracking-wide uppercase">
                        <span>Secure</span><span>•</span><span>Encrypted</span><span>•</span><span>Trusted</span>
                    </div>
                </div>
            </div>
        </>
    );
}
