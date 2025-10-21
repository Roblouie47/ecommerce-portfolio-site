import React from 'react';

export default function Hero() {
    return (
        <section className="relative overflow-hidden bg-radial-hero before:absolute before:inset-0 before:pointer-events-none before:bg-hero-angle">
            {/* Decorative subtle grid or noise overlay could be added via ::after if desired */}
            <div className="container py-20 md:py-28 grid md:grid-cols-12 gap-10 items-center relative">
                <div className="md:col-span-6 space-y-7 animate-fade-in">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/15 text-[11px] font-semibold tracking-wide uppercase text-accent ring-1 ring-accent/30 backdrop-blur-sm shadow-sm">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /> New Drop
                    </div>
                    <div className="glass-panel max-w-xl p-6 md:p-8 rounded-xl shadow-card/40 ring-1 ring-border/60 space-y-6">
                        <h1 className="font-semibold tracking-tight leading-tight text-balance text-4xl sm:text-5xl md:text-6xl [text-wrap:balance]">
                            Elevated Essentials
                        </h1>
                        <p className="text-base sm:text-lg text-muted max-w-prose">
                            Premium everyday apparel engineered for comfort, durability and timeless style. Built with sustainable materials.
                        </p>
                        <div className="flex flex-wrap gap-4">
                            <button className="btn shadow-focus hover:shadow-hover transition-shadow">Shop Now</button>
                            <button className="btn btn-quiet">Explore</button>
                        </div>
                        <div className="flex gap-2 pt-2 flex-wrap" aria-label="Category tabs">
                            {['Tees', 'Hoodies', 'Caps', 'Shorts', 'Pants'].map(c => (
                                <button key={c} className="category-chip" role="tab">{c}</button>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="md:col-span-6 relative aspect-[4/5] rounded-2xl overflow-hidden shadow-xl ring-1 ring-border/60 group">
                    <img
                        src="https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=1200&q=70"
                        alt="Featured apparel"
                        className="w-full h-full object-cover transition-transform duration-[1400ms] ease-[var(--easing-emphasized)] group-hover:scale-105"
                        loading="eager"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-bg/60 via-bg/0 to-bg/10 pointer-events-none" />
                </div>
            </div>
        </section>
    );
}
