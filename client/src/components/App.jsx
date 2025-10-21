import React, { useEffect, useState } from 'react';
import Hero from './Hero';
import ProductGrid from './ProductGrid';
import MiniCart from './MiniCart';
import StickyHeader from './StickyHeader';
import BottomNav from './BottomNav';
import { CartProvider } from '../context/CartContext';

export default function App() {
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    const [searchQuery, setSearchQuery] = useState('');
    useEffect(() => {
        if (theme === 'light') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        localStorage.setItem('theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);
    return (
        <CartProvider>
            <div className="min-h-screen flex flex-col bg-bg text-text">
                <StickyHeader
                    onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                    theme={theme}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                />
                <main className="flex-1">
                    <Hero />
                    <div className="container py-12">
                        <ProductGrid searchQuery={searchQuery} />
                    </div>
                </main>
                <MiniCart />
                <BottomNav />
            </div>
        </CartProvider>
    );
}
