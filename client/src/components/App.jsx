import React from 'react';

const NAV_LINKS = [
    { label: 'Home', href: '#home' },
    { label: 'Catalog', href: '#catalog' },
    { label: 'My Orders', href: '#orders' },
    { label: 'Admin', href: '#admin' }
];

const HERO_STATS = [
    { label: 'Catalog entries', value: '07+' },
    { label: 'New this month', value: '07' },
    { label: 'Community score', value: '5.0★' }
];

const HOME_PRODUCTS = [
    {
        id: 'tee-01',
        title: 'Essential Crew Tee',
        price: 38,
        stockLabel: 'In stock',
        rating: 4.9,
        reviews: 287,
        image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80',
        highlight: 'best',
        tags: ['Organic cotton', 'Best seller']
    },
    {
        id: 'tee-02',
        title: 'AirMesh Oversized Tee',
        price: 42,
        stockLabel: 'Low stock (4)',
        rating: 4.8,
        reviews: 198,
        image: 'https://images.unsplash.com/photo-1475180098004-ca77a66827be?auto=format&fit=crop&w=900&q=80',
        highlight: 'best',
        tags: ['Cooling knit', 'Athleisure']
    },
    {
        id: 'tee-03',
        title: 'Heritage Ringer Tee',
        price: 32,
        stockLabel: 'In stock',
        rating: 4.7,
        reviews: 132,
        image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80',
        highlight: 'budget',
        tags: ['Under $35', 'Retro trims']
    },
    {
        id: 'tee-04',
        title: 'Everyday Pocket Tee',
        price: 28,
        stockLabel: 'In stock',
        rating: 4.5,
        reviews: 88,
        image: 'https://images.unsplash.com/photo-1503341455253-b2e723bb3dbb?auto=format&fit=crop&w=900&q=80',
        highlight: 'budget',
        tags: ['Wallet friendly']
    },
    {
        id: 'tee-05',
        title: 'Studio Dye Tee',
        price: 54,
        stockLabel: 'In stock',
        rating: 4.9,
        reviews: 54,
        image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=1000&q=80',
        highlight: 'new',
        tags: ['Hand dyed', 'Limited']
    },
    {
        id: 'tee-06',
        title: 'Featherweight Boxy Tee',
        price: 47,
        stockLabel: 'In stock',
        rating: 4.6,
        reviews: 61,
        image: 'https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?auto=format&fit=crop&w=1000&q=80',
        highlight: 'new',
        tags: ['Drop 07']
    }
];

const SPOTLIGHT_SECTIONS = [
    {
        key: 'best',
        title: 'Best Pick',
        blurb: 'Most purchased with standout reviews.'
    },
    {
        key: 'budget',
        title: 'Budget Friendly',
        blurb: 'Lowest price without compromising on style.'
    },
    {
        key: 'new',
        title: 'New Release',
        blurb: 'Fresh drop added within the last month.'
    }
];

const COUNTRIES = [
    { value: 'PH', label: 'Philippines' },
    { value: 'US', label: 'United States' },
    { value: 'CA', label: 'Canada' },
    { value: 'JP', label: 'Japan' },
    { value: 'AU', label: 'Australia' }
];

const formatPrice = (value) => `$${value.toFixed(2)}`;

const productsByHighlight = (key) => HOME_PRODUCTS.filter((product) => product.highlight === key);

function SiteHeader() {
    return (
        <header className="ts-header" role="banner">
            <div className="ts-logo" aria-label="T-Shirt Shop logo">
                <img src="/uploads/Untitled1045_20251105174933.png" alt="T-Shirt Shop" loading="lazy" />
            </div>
            <nav className="ts-nav" aria-label="Primary">
                {NAV_LINKS.map((link) => (
                    <a key={link.label} href={link.href} className="ts-nav-link">
                        {link.label}
                    </a>
                ))}
            </nav>
            <div className="ts-actions">
                <div className="ts-auth">
                    <button type="button" className="ts-btn ts-btn-ghost">
                        Sign In
                    </button>
                    <button type="button" className="ts-btn ts-btn-outline">
                        Sign Up
                    </button>
                </div>
                <button type="button" className="ts-cart">
                    <span className="ts-cart-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="9" cy="21" r="1" />
                            <circle cx="20" cy="21" r="1" />
                            <path d="M1 1h4l2.68 11.39a2 2 0 0 0 2 1.61h8.72a2 2 0 0 0 2-1.61L23 6H6" />
                        </svg>
                    </span>
                    <span>View cart</span>
                </button>
                <label className="ts-country">
                    <span>Country</span>
                    <select>
                        {COUNTRIES.map((country) => (
                            <option key={country.value} value={country.value}>
                                {country.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
        </header>
    );
}

function HeroSection() {
    return (
        <section className="ts-hero" id="home">
            <p className="ts-hero-eyebrow">Original apparel</p>
            <h1 className="ts-hero-title">
                <span>Premium Tees</span> Crafted with Simplicity.
            </h1>
            <p className="ts-hero-copy">
                Browse a curated list of minimal, high-quality shirts. Experiment with product management while keeping the
                experience ultra-clean.
            </p>
            <div className="ts-hero-actions">
                <button type="button" className="ts-btn ts-btn-solid">
                    Explore Catalog
                </button>
                <button type="button" className="ts-btn ts-btn-outline">
                    View Cart
                </button>
                <button type="button" className="ts-btn ts-btn-ghost">
                    Favorites
                </button>
            </div>
            <div className="ts-hero-stats">
                {HERO_STATS.map((stat) => (
                    <div key={stat.label} className="ts-hero-stat">
                        <span>{stat.value}</span>
                        <p>{stat.label}</p>
                    </div>
                ))}
            </div>
        </section>
    );
}

function FeatureBand() {
    return (
        <section className="ts-hero-feature">
            <div className="ts-feature-media">
                <video autoPlay muted loop playsInline poster="/uploads/6a0e3f98-67be-46ce-be31-cafb591885d5.avif">
                    <source src="/uploads/videoplayback.mp4" type="video/mp4" />
                </video>
            </div>
            <div className="ts-feature-overlay">
                <p className="ts-feature-eyebrow">Season 07 · Daily Essentials</p>
                <h2 className="ts-feature-title">Refresh Your Everyday Rotation</h2>
                <p className="ts-feature-blurb">
                    Discover breathable staples built to flex with your day. Explore balanced color stories and premium cotton blends curated
                    by our merch team.
                </p>
                <div className="ts-feature-stats">
                    {HERO_STATS.map((stat) => (
                        <div key={`feature-${stat.label}`}>
                            <p>{stat.value}</p>
                            <span>{stat.label}</span>
                        </div>
                    ))}
                </div>
                <div className="ts-feature-tags">
                    {['Classic tees', 'Essential picks', 'Breathable cotton', 'New drops'].map((tag) => (
                        <span key={tag}>{tag}</span>
                    ))}
                </div>
            </div>
            <span className="ts-feature-badge">New drop every Friday</span>
        </section>
    );
}

function SpotlightCard({ product }) {
    return (
        <article className="ts-card">
            <div className="ts-card-image">
                <img src={product.image} alt={product.title} loading="lazy" />
            </div>
            <div className="ts-card-body">
                <div className="ts-card-title-row">
                    <h3>{product.title}</h3>
                    <span className="ts-price">{formatPrice(product.price)}</span>
                </div>
                <div className="ts-card-meta">
                    <p className="ts-stock">{product.stockLabel}</p>
                    <p className="ts-rating">
                        {product.rating.toFixed(1)}★ · {product.reviews} reviews
                    </p>
                </div>
                <div className="ts-card-tags">
                    {product.tags?.map((tag) => (
                        <span key={`${product.id}-${tag}`}>{tag}</span>
                    ))}
                </div>
                <div className="ts-card-actions">
                    <button type="button" className="ts-btn ts-btn-solid">
                        View
                    </button>
                    <button type="button" className="ts-btn ts-btn-outline">
                        Add
                    </button>
                    <button type="button" className="ts-favorite" aria-label="Toggle favorite">
                        ♡
                    </button>
                </div>
            </div>
        </article>
    );
}

function SpotlightSection({ section }) {
    const products = productsByHighlight(section.key);
    return (
        <section className="ts-spotlight-section" aria-labelledby={`section-${section.key}`}>
            <div className="ts-spotlight-heading">
                <div>
                    <p className="ts-section-eyebrow">Product spotlight</p>
                    <h3 className="ts-section-title" id={`section-${section.key}`}>
                        {section.title}
                    </h3>
                    <p className="ts-section-blurb">{section.blurb}</p>
                </div>
                <button type="button" className="ts-more">
                    More
                </button>
            </div>
            <div className="ts-section-grid">
                {products.map((product) => (
                    <SpotlightCard key={product.id} product={product} />
                ))}
            </div>
        </section>
    );
}

function CatalogPreview() {
    return (
        <section className="ts-spotlight" id="catalog">
            {SPOTLIGHT_SECTIONS.map((section) => (
                <SpotlightSection key={section.key} section={section} />
            ))}
            <div className="ts-preview-cta">
                <button type="button" className="ts-btn ts-btn-outline">
                    View full catalog
                </button>
            </div>
        </section>
    );
}

function SiteFooter() {
    return (
        <footer className="ts-footer">
            <p>© {new Date().getFullYear()} T-Shirt Shop. All rights reserved 2025.</p>
            <p className="ts-foot-note">Nicolas Shop.</p>
        </footer>
    );
}

export default function App() {
    return (
        <div className="ts-app">
            <SiteHeader />
            <main>
                <HeroSection />
                <FeatureBand />
                <CatalogPreview />
            </main>
            <SiteFooter />
        </div>
    );
}
