import React from 'react';
import clsx from 'clsx';
import { Star } from 'lucide-react';
import { Button } from '../ui/button';

function RatingStars({ rating }) {
    const rounded = Math.round(rating * 10) / 10;
    return (
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
            <div className="flex">
                {Array.from({ length: 5 }).map((_, index) => {
                    const filled = rating >= index + 1;
                    const partial = !filled && rating > index;
                    return (
                        <Star
                            key={index}
                            className={clsx('h-4 w-4', filled || partial ? 'text-amber-500' : 'text-muted-foreground')}
                            fill={filled || partial ? 'currentColor' : 'none'}
                        />
                    );
                })}
            </div>
            <span className="font-semibold text-foreground">{rounded.toFixed(1)}</span>
        </div>
    );
}

export default function ProductCard({ product }) {
    const discountPercent = product.originalPrice && product.originalPrice > product.price
        ? Math.round(100 - (product.price / product.originalPrice) * 100)
        : null;

    return (
        <article className="group flex h-full flex-col overflow-hidden rounded-3xl border bg-card shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-card">
            <div className="relative aspect-[4/3] overflow-hidden">
                <img
                    src={product.image}
                    alt={product.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                />
                {product.isNew && (
                    <span className="catalog-badge absolute left-4 top-4 bg-blue-600 text-white">New</span>
                )}
                {discountPercent ? (
                    <span className="catalog-badge absolute left-4 top-12 bg-red-500 text-white">-{discountPercent}%</span>
                ) : null}
            </div>

            <div className="flex flex-1 flex-col gap-4 p-6">
                <div className="space-y-1">
                    <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">{product.category}</p>
                    <h3 className="text-xl font-semibold text-foreground">{product.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <RatingStars rating={product.rating} />
                        <span className="text-muted-foreground">({product.reviews})</span>
                    </div>
                </div>

                <div className="mt-auto space-y-3">
                    <div className="flex flex-wrap items-baseline gap-2">
                        <p className="text-2xl font-semibold text-foreground">${product.price.toFixed(2)}</p>
                        {product.originalPrice ? (
                            <span className="text-base text-muted-foreground line-through">
                                ${product.originalPrice.toFixed(2)}
                            </span>
                        ) : null}
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span
                            className={clsx('h-2.5 w-2.5 rounded-full', product.inStock ? 'bg-emerald-500' : 'bg-rose-400')}
                            aria-hidden="true"
                        />
                        <span>{product.inStock ? 'In stock' : 'Backordered'}</span>
                    </div>
                    <Button className="w-full" disabled={!product.inStock}>
                        {product.inStock ? 'Add to Cart' : 'Notify Me'}
                    </Button>
                </div>
            </div>
        </article>
    );
}
