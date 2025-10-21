import React, { useEffect, useRef, useState } from 'react';
import { useCart } from '../context/CartContext';

export default function StickyHeader({ onToggleTheme, searchQuery, onSearchChange, theme }) {
    const { cart, setOpen } = useCart();
    const count = cart?.items?.reduce((s, i) => s + i.quantity, 0) || 0;
    const [internalQuery, setInternalQuery] = useState(searchQuery);
    const debounceRef = useRef();

    useEffect(() => { setInternalQuery(searchQuery); }, [searchQuery]);
    useEffect(() => {
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => { if (internalQuery !== searchQuery) onSearchChange(internalQuery); }, 250);
        return () => clearTimeout(debounceRef.current);
    }, [internalQuery, onSearchChange, searchQuery]);
    return (
        <header className="sticky top-0 z-50 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70 bg-bg/85 border-b border-border/70 shadow-[0_1px_0_0_var(--color-border)/60]">
            <div className="container flex items-center h-16 gap-6 px-4 md:px-6">
                <div className="font-semibold text-lg tracking-tight select-none">TeeShop</div>
                <nav className="hidden md:flex items-center gap-6 text-sm" aria-label="Main">
                    {['Shop', 'New', 'Best', 'Sale'].map(i => <a key={i} href="#" className="nav-link">{i}</a>)}
                </nav>
                <div className="ml-auto flex items-center gap-4">
                    <button
                        className="icon-btn"
                        aria-label="Toggle dark mode"
                        aria-pressed={theme === 'dark'}
                        onClick={onToggleTheme}
                    >🌓</button>
                    <div className="relative hidden md:block">
                        <input
                            aria-label="Search products"
                            placeholder="Search…"
                            value={internalQuery}
                            onChange={e => setInternalQuery(e.target.value)}
                            className="search-input w-56"
                        />
                        {internalQuery && (
                            <button
                                type="button"
                                aria-label="Clear search"
                                onClick={() => setInternalQuery('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-text text-xs focus:outline-none"
                            >✕</button>
                        )}
                    </div>
                    <button className="icon-btn md:hidden" aria-label="Search">🔍</button>
                    <button className="relative icon-btn" aria-label="Cart" onClick={() => setOpen(true)}>🛒{count > 0 && <span className="absolute -top-2 -right-2 bg-accent text-[10px] rounded-pill px-1.5 py-0.5 font-semibold shadow-sm">{count}</span>}</button>
                    <button className="icon-btn" aria-label="Account">👤</button>
                </div>
            </div>
        </header>
    );
}
