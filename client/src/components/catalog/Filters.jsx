import React from 'react';
import { Button } from '../ui/button';

const CATEGORY_OPTIONS = ['Seating', 'Tables', 'Storage', 'Lighting', 'Decor', 'Textiles'];
const RATING_OPTIONS = [4, 3, 2, 1];
const MIN_PRICE = 0;
const MAX_PRICE = 2000;

export default function Filters({
    selectedCategories,
    onCategoryChange,
    priceRange,
    onPriceRangeChange,
    minRating,
    onRatingChange,
    showInStockOnly,
    onInStockChange,
    onClearFilters
}) {
    const handleCategoryToggle = (category) => {
        if (selectedCategories.includes(category)) {
            onCategoryChange(selectedCategories.filter((item) => item !== category));
        } else {
            onCategoryChange([...selectedCategories, category]);
        }
    };

    const handlePriceChange = (index, value) => {
        const numeric = Number(value);
        if (index === 0) {
            const nextMin = Math.max(MIN_PRICE, Math.min(numeric, priceRange[1] - 10));
            onPriceRangeChange([nextMin, priceRange[1]]);
        } else {
            const nextMax = Math.min(MAX_PRICE, Math.max(numeric, priceRange[0] + 10));
            onPriceRangeChange([priceRange[0], nextMax]);
        }
    };

    return (
        <div className="filter-card space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Filters</h2>
                <Button size="sm" variant="ghost" onClick={onClearFilters}>
                    Clear All
                </Button>
            </div>

            <section className="space-y-3">
                <div className="flex items-center justify-between">
                    <p className="font-medium">Category</p>
                </div>
                <div className="space-y-2">
                    {CATEGORY_OPTIONS.map((category) => (
                        <label key={category} className="flex items-center gap-3 text-sm font-medium">
                            <input
                                type="checkbox"
                                className="h-4 w-4 rounded border border-border text-primary focus:ring-2 focus:ring-ring"
                                checked={selectedCategories.includes(category)}
                                onChange={() => handleCategoryToggle(category)}
                            />
                            {category}
                        </label>
                    ))}
                </div>
            </section>

            <section className="space-y-4">
                <div className="flex items-center justify-between">
                    <p className="font-medium">Price Range</p>
                    <span className="text-sm text-muted-foreground">
                        ${priceRange[0]} – ${priceRange[1]}
                    </span>
                </div>
                <div className="space-y-3">
                    <input
                        type="range"
                        min={MIN_PRICE}
                        max={MAX_PRICE}
                        step={10}
                        value={priceRange[0]}
                        onChange={(event) => handlePriceChange(0, event.target.value)}
                        className="catalog-range w-full"
                    />
                    <input
                        type="range"
                        min={MIN_PRICE}
                        max={MAX_PRICE}
                        step={10}
                        value={priceRange[1]}
                        onChange={(event) => handlePriceChange(1, event.target.value)}
                        className="catalog-range w-full"
                    />
                    <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <span>${MIN_PRICE}</span>
                        <span>${MAX_PRICE}</span>
                    </div>
                </div>
            </section>

            <section className="space-y-3">
                <p className="font-medium">Minimum Rating</p>
                <div className="space-y-2">
                    {RATING_OPTIONS.map((rating) => (
                        <label key={rating} className="flex items-center gap-3 text-sm font-medium">
                            <input
                                type="radio"
                                name="rating-filter"
                                className="h-4 w-4 border border-border text-primary focus:ring-2 focus:ring-ring"
                                checked={minRating === rating}
                                onChange={() => onRatingChange(rating)}
                            />
                            {rating}+ Stars
                        </label>
                    ))}
                    <label className="flex items-center gap-3 text-sm font-medium">
                        <input
                            type="radio"
                            name="rating-filter"
                            className="h-4 w-4 border border-border text-primary focus:ring-2 focus:ring-ring"
                            checked={minRating === 0}
                            onChange={() => onRatingChange(0)}
                        />
                        Any rating
                    </label>
                </div>
            </section>

            <section className="space-y-3">
                <p className="font-medium">Availability</p>
                <label className="flex items-center gap-3 text-sm font-medium">
                    <input
                        type="checkbox"
                        className="h-4 w-4 rounded border border-border text-primary focus:ring-2 focus:ring-ring"
                        checked={showInStockOnly}
                        onChange={(event) => onInStockChange(event.target.checked)}
                    />
                    In stock only
                </label>
            </section>
        </div>
    );
}
