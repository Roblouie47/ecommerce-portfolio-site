import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Search, Grid3x3, LayoutGrid, SlidersHorizontal } from 'lucide-react';
import Filters from './catalog/Filters';
import ProductCard from './catalog/ProductCard';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

const mockProducts = [
    {
        id: '1',
        name: 'Modern Accent Chair',
        category: 'Seating',
        price: 299.99,
        originalPrice: 399.99,
        rating: 4.5,
        reviews: 127,
        image: 'https://images.unsplash.com/photo-1760716478137-d861d5b354e8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBmdXJuaXR1cmUlMjBjaGFpcnxlbnwxfHx8fDE3NjMwMzUzOTV8MA&ixlib=rb-4.1.0&q=80&w=1080',
        inStock: true,
        isNew: true,
        isSale: true
    },
    {
        id: '2',
        name: 'Contemporary Desk Lamp',
        category: 'Lighting',
        price: 89.99,
        rating: 4.8,
        reviews: 89,
        image: 'https://images.unsplash.com/photo-1621447980929-6638614633c8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkZXNrJTIwbGFtcCUyMGxpZ2h0fGVufDF8fHx8MTc2MzA0MDg5MHww&ixlib=rb-4.1.0&q=80&w=1080',
        inStock: true,
        isNew: true
    },
    {
        id: '3',
        name: 'Solid Wood Office Desk',
        category: 'Tables',
        price: 549.99,
        originalPrice: 699.99,
        rating: 4.6,
        reviews: 203,
        image: 'https://images.unsplash.com/photo-1637762646936-29b68cd6670d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxvZmZpY2UlMjBkZXNrJTIwd29vZGVufGVufDF8fHx8MTc2MzA5MjkxMnww&ixlib=rb-4.1.0&q=80&w=1080',
        inStock: true,
        isSale: true
    },
    {
        id: '4',
        name: 'Industrial Bookshelf',
        category: 'Storage',
        price: 379.99,
        rating: 4.4,
        reviews: 156,
        image: 'https://images.unsplash.com/photo-1587386263376-d2b58fdd86f9?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxib29rc2hlbGYlMjBzaGVsdmluZ3xlbnwxfHx8fDE3NjMwOTI5MTJ8MA&ixlib=rb-4.1.0&q=80&w=1080',
        inStock: true
    },
    {
        id: '5',
        name: 'Velvet Lounge Sofa',
        category: 'Seating',
        price: 1299.99,
        rating: 4.9,
        reviews: 342,
        image: 'https://images.unsplash.com/photo-1748309025784-d16e142b1cb1?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxzb2ZhJTIwY291Y2glMjBsaXZpbmd8ZW58MXx8fHwxNzYzMDkyOTEyfDA&ixlib=rb-4.1.0&q=80&w=1080',
        inStock: false
    },
    {
        id: '6',
        name: 'Round Coffee Table',
        category: 'Tables',
        price: 249.99,
        originalPrice: 329.99,
        rating: 4.3,
        reviews: 98,
        image: 'https://images.unsplash.com/photo-1642657547271-722df15ce6d6?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjb2ZmZWUlMjB0YWJsZSUyMG1vZGVybnxlbnwxfHx8fDE3NjMwOTI1MTB8MA&ixlib=rb-4.1.0&q=80&w=1080',
        inStock: true,
        isSale: true
    },
    {
        id: '7',
        name: 'Handwoven Area Rug',
        category: 'Textiles',
        price: 189.99,
        rating: 4.7,
        reviews: 167,
        image: 'https://images.unsplash.com/photo-1752568583323-92145f90e6a8?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxydWclMjBjYXJwZXQlMjBmbG9vcnxlbnwxfHx8fDE3NjMwOTI5MTN8MA&ixlib=rb-4.1.0&q=80&w=1080',
        inStock: true,
        isNew: true
    },
    {
        id: '8',
        name: 'Ceramic Planter Set',
        category: 'Decor',
        price: 59.99,
        rating: 4.5,
        reviews: 234,
        image: 'https://images.unsplash.com/photo-1602522431179-f6552611447e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxwbGFudCUyMHBvdCUyMGluZG9vcnxlbnwxfHx8fDE3NjMwMjA5NTV8MA&ixlib=rb-4.1.0&q=80&w=1080',
        inStock: true
    },
    {
        id: '9',
        name: 'Abstract Wall Art',
        category: 'Decor',
        price: 149.99,
        originalPrice: 199.99,
        rating: 4.6,
        reviews: 112,
        image: 'https://images.unsplash.com/photo-1616782541155-9aafbfa7c97e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3YWxsJTIwYXJ0JTIwZnJhbWV8ZW58MXx8fHwxNjMwMzk3MzF8MA&ixlib=rb-4.1.0&q=80&w=1080',
        inStock: true,
        isSale: true
    },
    {
        id: '10',
        name: 'Velvet Throw Pillows',
        category: 'Textiles',
        price: 39.99,
        rating: 4.4,
        reviews: 276,
        image: 'https://images.unsplash.com/photo-1668371558883-dfdfc921da3b?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjdXNoaW9uJTIwcGlsbG93JTIwZGVjb3J8ZW58MXx8fHwxNzYzMDkyOTE0fDA&ixlib=rb-4.1.0&q=80&w=1080',
        inStock: true
    },
    {
        id: '11',
        name: 'Rustic Dining Table',
        category: 'Tables',
        price: 899.99,
        rating: 4.8,
        reviews: 189,
        image: 'https://images.unsplash.com/photo-1758977403438-1b8546560d31?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxkaW5pbmclMjB0YWJsZSUyMHdvb2RlbnxlbnwxfHx8fDE3NjMwMTk1MTZ8MA&ixlib=rb-4.1.0&q=80&w=1080',
        inStock: true
    },
    {
        id: '12',
        name: 'Round Wall Mirror',
        category: 'Decor',
        price: 129.99,
        originalPrice: 179.99,
        rating: 4.7,
        reviews: 145,
        image: 'https://images.unsplash.com/photo-1612152668368-4ffd30ce2d8d?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxtaXJyb3IlMjB3YWxsJTIwZGVjb3J8ZW58MXx8fHwxNzYzMDkyOTE1fDA&ixlib=rb-4.1.0&q=80&w=1080',
        inStock: true,
        isSale: true
    }
];

const SORT_OPTIONS = [
    { label: 'Featured', value: 'featured' },
    { label: 'Price: Low to High', value: 'price-low' },
    { label: 'Price: High to Low', value: 'price-high' },
    { label: 'Highest Rated', value: 'rating' },
    { label: 'Newest', value: 'newest' }
];

export default function App() {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [priceRange, setPriceRange] = useState([0, 2000]);
    const [minRating, setMinRating] = useState(0);
    const [showInStockOnly, setShowInStockOnly] = useState(false);
    const [sortBy, setSortBy] = useState('featured');
    const [gridColumns, setGridColumns] = useState(3);
    const [showMobileFilters, setShowMobileFilters] = useState(false);

    const filteredAndSortedProducts = useMemo(() => {
        const filtered = mockProducts.filter((product) => {
            if (searchQuery && !product.name.toLowerCase().includes(searchQuery.toLowerCase())) {
                return false;
            }

            if (selectedCategories.length && !selectedCategories.includes(product.category)) {
                return false;
            }

            if (product.price < priceRange[0] || product.price > priceRange[1]) {
                return false;
            }

            if (minRating > 0 && product.rating < minRating) {
                return false;
            }

            if (showInStockOnly && !product.inStock) {
                return false;
            }

            return true;
        });

        const sorted = [...filtered].sort((a, b) => {
            switch (sortBy) {
                case 'price-low':
                    return a.price - b.price;
                case 'price-high':
                    return b.price - a.price;
                case 'rating':
                    return b.rating - a.rating;
                case 'newest':
                    return Number(b.isNew) - Number(a.isNew);
                default:
                    return 0;
            }
        });

        return sorted;
    }, [searchQuery, selectedCategories, priceRange, minRating, showInStockOnly, sortBy]);

    const handleClearFilters = () => {
        setSelectedCategories([]);
        setPriceRange([0, 2000]);
        setMinRating(0);
        setShowInStockOnly(false);
        setSearchQuery('');
    };

    return (
        <div className="min-h-screen bg-background px-4 py-10 sm:px-6 lg:px-12">
            <div className="mx-auto max-w-7xl space-y-10">
                <header className="space-y-3">
                    <p className="text-sm font-medium uppercase tracking-[0.2em] text-muted-foreground">Product Catalog</p>
                    <div className="space-y-2">
                        <h1 className="text-4xl font-semibold leading-tight sm:text-5xl">Discover our curated collection</h1>
                        <p className="text-lg text-muted-foreground">
                            Modern furniture, thoughtful textiles, and lighting pieces selected by our design team.
                        </p>
                    </div>
                </header>

                <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                    <div className="relative flex-1">
                        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search products..."
                            value={searchQuery}
                            onChange={(event) => setSearchQuery(event.target.value)}
                            className="pl-12"
                        />
                    </div>
                    <div className="flex flex-1 flex-wrap items-center justify-end gap-3 md:flex-none">
                        <Select value={sortBy} onValueChange={setSortBy}>
                            <SelectTrigger className="w-full min-w-[200px] md:w-[220px]">
                                <SelectValue placeholder="Sort by" />
                            </SelectTrigger>
                            <SelectContent>
                                {SORT_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>

                        <div className="hidden rounded-full border bg-card p-1 md:flex">
                            <Button
                                variant={gridColumns === 3 ? 'secondary' : 'ghost'}
                                size="sm"
                                className="rounded-full"
                                onClick={() => setGridColumns(3)}
                                aria-label="Show three columns"
                            >
                                <Grid3x3 className="h-4 w-4" />
                            </Button>
                            <Button
                                variant={gridColumns === 4 ? 'secondary' : 'ghost'}
                                size="sm"
                                className="rounded-full"
                                onClick={() => setGridColumns(4)}
                                aria-label="Show four columns"
                            >
                                <LayoutGrid className="h-4 w-4" />
                            </Button>
                        </div>

                        <Button
                            variant="outline"
                            size="sm"
                            className="md:hidden"
                            onClick={() => setShowMobileFilters((prev) => !prev)}
                        >
                            <SlidersHorizontal className="mr-2 h-4 w-4" />
                            Filters
                        </Button>
                    </div>
                </div>

                <div className="flex flex-col gap-6 lg:flex-row">
                    <aside
                        className={clsx(
                            'w-full flex-shrink-0 transition-all md:w-64 lg:w-72',
                            showMobileFilters ? 'block' : 'hidden md:block'
                        )}
                    >
                        <Filters
                            selectedCategories={selectedCategories}
                            onCategoryChange={setSelectedCategories}
                            priceRange={priceRange}
                            onPriceRangeChange={setPriceRange}
                            minRating={minRating}
                            onRatingChange={setMinRating}
                            showInStockOnly={showInStockOnly}
                            onInStockChange={setShowInStockOnly}
                            onClearFilters={handleClearFilters}
                        />
                    </aside>

                    <main className="flex-1 space-y-6">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-sm text-muted-foreground">
                                {filteredAndSortedProducts.length} product{filteredAndSortedProducts.length === 1 ? '' : 's'}
                                &nbsp;found
                            </p>
                            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
                                {gridColumns === 4 ? 'Compact Grid' : 'Comfort Grid'}
                            </p>
                        </div>

                        {filteredAndSortedProducts.length === 0 ? (
                            <div className="rounded-3xl border bg-card p-10 text-center shadow-sm">
                                <p className="text-lg font-medium text-foreground">No products match your filters</p>
                                <p className="mt-2 text-sm text-muted-foreground">
                                    Try adjusting the filters or clearing them to start over.
                                </p>
                                <Button className="mt-6" variant="outline" onClick={handleClearFilters}>
                                    Clear filters
                                </Button>
                            </div>
                        ) : (
                            <div
                                className={clsx(
                                    'grid gap-6',
                                    'sm:grid-cols-2',
                                    gridColumns === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
                                )}
                            >
                                {filteredAndSortedProducts.map((product) => (
                                    <ProductCard key={product.id} product={product} />
                                ))}
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
}
