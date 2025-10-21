import React from 'react';
import ProductCard from './ProductCard';
import SkeletonProductCard from './SkeletonProductCard';
import { useProducts } from '../hooks/useProducts';
import { useProductSearch } from '../hooks/useProductSearch';

export default function ProductGrid({ searchQuery = '' }) {
    const { products, isLoading, isSkeleton, error } = useProducts();
    const { results, highlights } = useProductSearch(products, searchQuery);
    return (
        <section aria-label="Featured products" className="pb-16">
            <div className="flex items-end justify-between mb-6">
                <h2 className="text-2xl font-semibold tracking-tight">Featured</h2>
                <button className="text-sm text-accent hover:underline">View all</button>
            </div>
            {error && <p className="text-sm text-danger">Failed to load products.</p>}
            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {isSkeleton && Array.from({ length: 8 }).map((_, i) => <SkeletonProductCard key={i} />)}
                {!isSkeleton && results.map(p => <ProductCard key={p.id} product={{ ...p, __highlight: highlights.get(p.id) }} />)}
                {!isSkeleton && !results.length && !error && (
                    <div className="col-span-full text-sm text-muted">No products match “{searchQuery}”.</div>
                )}
            </div>
        </section>
    );
}
