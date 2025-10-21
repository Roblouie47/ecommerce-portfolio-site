import React from 'react';

export default function BottomNav() {
    return (
        <nav className="fixed bottom-0 left-0 right-0 h-14 bg-surface/95 backdrop-blur border-t border-border flex md:hidden items-stretch z-40" aria-label="Primary mobile">
            {[
                { label: 'Home', icon: '🏠' },
                { label: 'Shop', icon: '🛍️' },
                { label: 'Search', icon: '🔍' },
                { label: 'Cart', icon: '🛒' },
                { label: 'Account', icon: '👤' }
            ].map(i => (
                <button key={i.label} className="flex flex-col flex-1 items-center justify-center text-[11px] font-medium text-muted hover:text-text">
                    <span>{i.icon}</span>
                    {i.label}
                </button>
            ))}
        </nav>
    );
}
