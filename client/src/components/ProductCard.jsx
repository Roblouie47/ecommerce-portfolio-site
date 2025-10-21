import React, { useState } from 'react';
import clsx from 'clsx';
import { useCart } from '../context/CartContext';

export default function ProductCard({ product }) {
    const { addToCart } = useCart();
    const [adding, setAdding] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const handleAdd = async () => {
        try { setAdding(true); await addToCart(product, 1); } catch (e) { /* optionally toast */ } finally { setAdding(false); }
    };
    const showDiscount = product.compareAtCents && product.compareAtCents > product.priceCents;
    return (
        <div className="group card relative transition-all duration-300 hover:shadow-hover hover:-translate-y-1 focus-within:shadow-hover">
            <div className="relative aspect-[4/5] overflow-hidden bg-surface-alt">
                {/* Image */}
                {product.images?.[0] && (
                    <img
                        src={product.images[0]}
                        alt={product.title}
                        className={clsx('w-full h-full object-cover transition-all duration-700 ease-[var(--easing-standard)] group-hover:scale-[1.04] opacity-0', loaded && 'opacity-100')}
                        loading="lazy"
                        onLoad={() => setLoaded(true)}
                    />
                )}
                {/* Fallback shimmer while image loads */}
                {!loaded && <div className="absolute inset-0 animate-skeleton bg-surface-alt" aria-hidden="true" />}
                {product.badge && (
                    <span className={clsx('absolute top-2 left-2 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide uppercase shadow-sm ring-1 ring-border/40 backdrop-blur-sm',
                        product.badge === 'Sale' ? 'bg-danger text-danger-contrast' : 'bg-accent text-accent-contrast')}> {product.badge}</span>
                )}
                <button
                    onClick={handleAdd}
                    disabled={adding}
                    className="absolute bottom-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 btn px-3 py-2 text-xs shadow-md"
                >
                    {adding ? 'Adding…' : 'Quick Add'}
                </button>
            </div>
            <div className="p-4 flex-1 flex flex-col">
                <h3 className="font-medium text-sm mb-1 line-clamp-2">
                    {product.__highlight?.title ? product.__highlight.title : product.title}
                </h3>
                <div className="text-muted text-xs mb-2">{product.subtitle || 'Apparel'}</div>
                <div className="mt-auto flex items-center gap-2">
                    <span className="font-semibold text-sm">${(product.priceCents / 100).toFixed(2)}</span>
                    {showDiscount && (
                        <>
                            <span className="text-muted line-through text-xs">${(product.compareAtCents / 100).toFixed(2)}</span>
                            <span className="text-xs text-success font-medium">-{Math.round((1 - product.priceCents / product.compareAtCents) * 100)}%</span>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
