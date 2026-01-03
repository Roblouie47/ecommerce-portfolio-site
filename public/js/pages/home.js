import { el, setBodyRoute } from '../utils/dom.js';
import { state } from '../state/index.js';
import { productPlaceholder, getRootEl, renderStarRating, productStock } from '../utils/helpers.js';
import { money } from '../utils/currency.js';
import { navigate } from '../router/index.js';
import { addToCart, isFavorite, toggleFavorite, updateFavoriteIcons } from '../components/index.js';

/**
 * Renders the home page - matches original app.js design
 */
export function renderHome() {
    const rootEl = getRootEl();
    if (!rootEl) return;
    
    setBodyRoute('home');
    state.currentRoute = 'home';
    rootEl.innerHTML = '';

    // Hero section
    const hero = el('section', { class: 'hero-section snap-section' },
        el('div', { class: 'hero-eyebrow' }, 'Original apparel'),
        el('h1', { class: 'hero-title' },
            el('span', { class: 'hero-gradient-text' }, 'Premium Tees'), ' Crafted with Simplicity.'
        ),
        el('p', { class: 'hero-copy' }, 'Browse a curated list of minimal, high‑quality shirts. Experiment with product management.'),
        el('div', { class: 'hero-actions' },
            el('button', { class: 'btn btn-primary hero-btn', attrs: { 'data-route': 'catalog' } }, 'Explore Catalog'),
            el('button', { class: 'btn btn-outline hero-btn', attrs: { 'data-route': 'cart' } }, 'View Cart'),
            el('button', { class: 'btn btn-outline hero-btn', attrs: { 'data-route': 'favorites' } }, 'Favorites')
        )
    );
    rootEl.appendChild(hero);

    // Feature stats helper
    const makeFeatureStat = (value, label) => el('div', { class: 'hero-feature-stat' },
        el('span', { class: 'stat-value' }, value),
        el('span', { class: 'stat-label' }, label)
    );
    const featureTags = ['Classic tees', 'Essential picks', 'Breathable cotton', 'New drops'];

    // Hero feature band with video
    const heroFeature = el('section', { class: 'hero-feature-band mt-lg snap-section' },
        el('video', {
            class: 'hero-feature-video',
            attrs: {
                autoplay: '',
                muted: '',
                loop: '',
                playsinline: '',
                preload: 'auto',
                poster: '/uploads/6a0e3f98-67be-46ce-be31-cafb591885d5.avif',
                'aria-hidden': 'true'
            }
        },
            el('source', {
                attrs: {
                    src: '/uploads/videoplayback.mp4',
                    type: 'video/mp4'
                }
            }),
            'Your browser does not support the video tag.'
        ),
        el('div', { class: 'hero-feature-overlay' },
            el('span', { class: 'feature-eyebrow' }, 'Season 07 · Daily Essentials'),
            el('h2', { class: 'feature-title' }, 'Refresh Your Everyday Rotation'),
            el('p', { class: 'feature-blurb' }, 'Discover breathable staples built to flex with your day. Explore balanced color stories and premium cotton blends curated by our merch team.'),
            el('div', { class: 'hero-feature-stats' },
                makeFeatureStat('7+', 'Catalog entries'),
                makeFeatureStat('7', 'New this month'),
                makeFeatureStat('5.0★', 'Community score')
            ),
            el('div', { class: 'hero-feature-tags' },
                ...featureTags.map((tag) => el('span', { class: 'hero-feature-tag' }, tag))
            )
        ),
        el('span', { class: 'hero-feature-badge' }, 'New drop every Friday')
    );
    rootEl.appendChild(heroFeature);

    // Video autoplay handling
    const featureVideo = /** @type {HTMLVideoElement | null} */ (heroFeature.querySelector('.hero-feature-video'));
    if (featureVideo) {
        const markFallback = () => heroFeature.classList.add('video-fallback');
        featureVideo.addEventListener('error', markFallback);
        featureVideo.addEventListener('emptied', markFallback);
        featureVideo.addEventListener('loadeddata', () => heroFeature.classList.remove('video-fallback'));
        try {
            featureVideo.muted = true;
            const playPromise = featureVideo.play();
            if (playPromise && typeof playPromise.then === 'function') {
                playPromise.catch(() => {
                    featureVideo.setAttribute('data-autoplay-failed', 'true');
                    featureVideo.removeAttribute('autoplay');
                    featureVideo.setAttribute('controls', 'true');
                });
            }
        } catch (err) {
            featureVideo.setAttribute('data-autoplay-failed', 'true');
            featureVideo.removeAttribute('autoplay');
            featureVideo.setAttribute('controls', 'true');
            markFallback();
        }
    }

    // Catalog preview
    const previewWrap = el('div', { class: 'home-catalog-preview mt-md' });
    const topRow = el('div', { class: 'catalog-preview-top' });
    topRow.appendChild(
        el('div', { class: 'catalog-preview-summary' },
            el('p', { class: 'catalog-preview-subhead' }, 'One standout pick, a wallet-friendly option, and a fresh release—curated straight from the catalog.')
        )
    );
    previewWrap.appendChild(topRow);

    const previewProducts = state.products.filter(p => !p.deletedAt);
    const SECTION_LIMIT = 4;
    const usedAcrossSections = new Set();

    const toTimestamp = (val) => {
        if (!val) return 0;
        const time = new Date(val).getTime();
        return Number.isFinite(time) ? time : 0;
    };

    // Sorting functions
    const bestPickSorter = (a, b) => {
        const qtyA = a.reviewSummary?.totalQuantity ?? 0;
        const qtyB = b.reviewSummary?.totalQuantity ?? 0;
        if (qtyB !== qtyA) return qtyB - qtyA;
        const ratingA = a.reviewSummary?.average ?? 0;
        const ratingB = b.reviewSummary?.average ?? 0;
        if (ratingB !== ratingA) return ratingB - ratingA;
        const countA = a.reviewSummary?.count ?? 0;
        const countB = b.reviewSummary?.count ?? 0;
        if (countB !== countA) return countB - countA;
        return toTimestamp(b.createdAt) - toTimestamp(a.createdAt);
    };

    const priceSorter = (a, b) => {
        const priceA = a.priceCents ?? Number.MAX_SAFE_INTEGER;
        const priceB = b.priceCents ?? Number.MAX_SAFE_INTEGER;
        if (priceA !== priceB) return priceA - priceB;
        return bestPickSorter(a, b);
    };

    const newestSorter = (a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt);

    const selectTop = (candidates, limit, avoidSet) => {
        const picks = [];
        const seen = new Set();
        const tryCollect = (skipAvoid) => {
            for (const product of candidates) {
                if (!product || picks.length >= limit) break;
                if (seen.has(product.id)) continue;
                if (!skipAvoid && avoidSet?.has(product.id)) continue;
                picks.push(product);
                seen.add(product.id);
            }
        };
        tryCollect(false);
        if (picks.length < limit) tryCollect(true);
        return picks;
    };

    // Select products for each section
    const bestCandidates = [...previewProducts].sort(bestPickSorter);
    const bestPickItems = selectTop(bestCandidates, SECTION_LIMIT, usedAcrossSections);
    bestPickItems.forEach(p => usedAcrossSections.add(p.id));

    const budgetCandidates = [...previewProducts].sort(priceSorter);
    const budgetItems = selectTop(budgetCandidates, SECTION_LIMIT, usedAcrossSections);
    budgetItems.forEach(p => usedAcrossSections.add(p.id));

    const nowMs = Date.now();
    const THIRTY_DAYS = 1000 * 60 * 60 * 24 * 30;
    const newReleaseFilter = (p) => {
        const created = toTimestamp(p.createdAt);
        return created && (nowMs - created) <= THIRTY_DAYS;
    };
    const newReleaseBase = (() => {
        const within = previewProducts.filter(newReleaseFilter);
        if (within.length) return within.sort(newestSorter);
        return [...previewProducts].sort(newestSorter);
    })();
    const newReleaseItems = selectTop(newReleaseBase, SECTION_LIMIT, usedAcrossSections);
    newReleaseItems.forEach(p => usedAcrossSections.add(p.id));

    // Build preview card
    const buildPreviewCard = (p) => {
        const card = el('article', { class: 'home-product-card', attrs: { 'data-product-id': p.id } });

        const imgWrap = el('div', { class: 'hpc-img-wrap' });
        const primaryImage = Array.isArray(p.images) && p.images.length ? p.images[0] : productPlaceholder(720);
        imgWrap.appendChild(el('img', { attrs: { src: primaryImage, alt: p.title || 'Product image', loading: 'lazy' } }));
        card.appendChild(imgWrap);

        const body = el('div', { class: 'hpc-body' });
        body.appendChild(el('h3', { class: 'hpc-title' }, p.title || 'Untitled product'));

        const meta = el('div', { class: 'hpc-meta' },
            el('span', { class: 'hpc-price price', attrs: { 'data-price-cents': p.priceCents || 0 } }, money(p.priceCents || 0))
        );

        const stockCount = productStock(p);
        const stockLabel = stockCount <= 0 ? 'Out of stock' : stockCount < 5 ? `Low stock (${stockCount})` : `${stockCount} in stock`;
        meta.appendChild(el('span', { class: 'hpc-stock' }, stockLabel));
        body.appendChild(meta);

        if (p.reviewSummary && p.reviewSummary.count > 0) {
            const rating = renderStarRating(p.reviewSummary.average, p.reviewSummary.count, { size: 'xs' });
            rating.classList.add('hpc-rating');
            body.appendChild(rating);
        }

        const favActive = isFavorite(p.id);
        const actions = el('div', { class: 'hpc-actions' },
            el('button', {
                class: 'hpc-action hpc-view',
                attrs: { type: 'button', 'data-view-id': p.id }
            }, 'View'),
            el('button', {
                class: 'hpc-action hpc-add',
                attrs: { type: 'button', 'data-add': p.id }
            }, 'Add'),
            el('button', {
                class: 'hpc-heart' + (favActive ? ' active' : ''),
                attrs: {
                    type: 'button',
                    'data-fav': p.id,
                    'aria-pressed': favActive ? 'true' : 'false',
                    'aria-label': favActive ? 'Remove from favorites' : 'Add to favorites'
                }
            }, favActive ? '♥' : '♡')
        );

        body.appendChild(actions);
        card.appendChild(body);
        return card;
    };

    // Define sections
    const sections = [
        {
            key: 'best',
            title: 'Best Pick',
            blurb: 'Most purchased with standout reviews.',
            products: bestPickItems
        },
        {
            key: 'budget',
            title: 'Budget Friendly',
            blurb: 'Lowest price without compromising on style.',
            products: budgetItems
        },
        {
            key: 'new',
            title: 'New Release',
            blurb: 'Fresh drop added within the last month.',
            products: newReleaseItems
        }
    ];

    // Format metrics for each section
    const formatMetrics = (sectionKey, products) => {
        if (!products || !products.length) return null;
        const primary = products[0];
        const bits = [];
        if (sectionKey === 'best') {
            const sold = primary.reviewSummary?.totalQuantity ?? 0;
            if (sold > 0) bits.push(`${sold} bought`);
            const rating = primary.reviewSummary?.average;
            if (rating) bits.push(`${rating.toFixed(1)}★ rating`);
        }
        if (sectionKey === 'budget') {
            bits.push('From ' + money(primary.priceCents));
        }
        if (sectionKey === 'new') {
            const created = toTimestamp(primary.createdAt);
            if (created) bits.push('Added ' + new Date(created).toLocaleDateString());
        }
        if (!bits.length) return null;
        return el('div', { class: 'spotlight-meta' }, bits.join(' • '));
    };

    // Build spotlight sections
    const spotlightSections = el('div', { class: 'spotlight-sections' });
    sections.forEach(section => {
        const container = el('section', { class: 'spotlight-section' });
        const header = el('div', { class: 'spotlight-header' },
            el('div', { class: 'spotlight-title-row' },
                el('h3', { class: 'spotlight-title' }, section.title),
                el('button', {
                    class: 'spotlight-more',
                    attrs: {
                        type: 'button',
                        'data-route': 'catalog',
                        'data-spotlight-section': section.key
                    }
                }, 'More')
            ),
            el('p', { class: 'spotlight-desc' }, section.blurb)
        );
        const metrics = formatMetrics(section.key, section.products);
        if (metrics) header.appendChild(metrics);
        container.appendChild(header);

        if (section.products.length) {
            const grid = el('div', { class: 'home-catalog-grid spotlight-grid' });
            section.products.forEach(p => grid.appendChild(buildPreviewCard(p)));
            container.appendChild(grid);
        } else {
            container.appendChild(el('div', { class: 'spotlight-empty muted small' }, 'No qualifying product yet. Check back soon.'));
        }

        spotlightSections.appendChild(container);
    });

    previewWrap.appendChild(spotlightSections);
    const moreBtn = el('div', { class: 'mt-md' }, el('button', { class: 'btn btn-outline', attrs: { 'data-route': 'catalog' } }, 'View Full Catalog'));
    rootEl.appendChild(previewWrap);
    rootEl.appendChild(moreBtn);

    // Update favorite icons and wire up events
    updateFavoriteIcons(previewWrap);
    previewWrap.addEventListener('click', e => {
        const target = /** @type {HTMLElement} */ (e.target);
        const favBtn = target.closest('[data-fav]');
        if (favBtn) { 
            e.preventDefault(); 
            e.stopPropagation();
            const productId = favBtn.getAttribute('data-fav');
            const newState = toggleFavorite(productId); 
            // Update button visual state
            favBtn.classList.toggle('active', newState);
            favBtn.setAttribute('aria-pressed', newState ? 'true' : 'false');
            favBtn.textContent = newState ? '♥' : '♡';
            return; 
        }
        const btnAdd = target.closest('[data-add]');
        if (btnAdd) { 
            addToCart(btnAdd.getAttribute('data-add'), 1); 
            return; 
        }
        const btnView = target.closest('[data-view-id]');
        if (btnView) { 
            navigate('product', { id: btnView.getAttribute('data-view-id') }); 
        }
    });
}

/**
 * Creates a product card (exported for use by other pages)
 * @param {Object} product - Product object
 * @returns {HTMLElement}
 */
export function createProductCard(product) {
    const p = product;
    const card = el('article', { class: 'home-product-card', attrs: { 'data-product-id': p.id } });

    const imgWrap = el('div', { class: 'hpc-img-wrap' });
    const primaryImage = Array.isArray(p.images) && p.images.length ? p.images[0] : productPlaceholder(720);
    imgWrap.appendChild(el('img', { attrs: { src: primaryImage, alt: p.title || 'Product image', loading: 'lazy' } }));
    card.appendChild(imgWrap);

    const body = el('div', { class: 'hpc-body' });
    body.appendChild(el('h3', { class: 'hpc-title' }, p.title || 'Untitled product'));

    const meta = el('div', { class: 'hpc-meta' },
        el('span', { class: 'hpc-price price', attrs: { 'data-price-cents': p.priceCents || 0 } }, money(p.priceCents || 0))
    );

    const stockCount = productStock(p);
    const stockLabel = stockCount <= 0 ? 'Out of stock' : stockCount < 5 ? `Low stock (${stockCount})` : `${stockCount} in stock`;
    meta.appendChild(el('span', { class: 'hpc-stock' }, stockLabel));
    body.appendChild(meta);

    if (p.reviewSummary && p.reviewSummary.count > 0) {
        const rating = renderStarRating(p.reviewSummary.average, p.reviewSummary.count, { size: 'xs' });
        rating.classList.add('hpc-rating');
        body.appendChild(rating);
    }

    const favActive = isFavorite(p.id);
    const actions = el('div', { class: 'hpc-actions' },
        el('button', {
            class: 'hpc-action hpc-view',
            attrs: { type: 'button', 'data-view-id': p.id }
        }, 'View'),
        el('button', {
            class: 'hpc-action hpc-add',
            attrs: { type: 'button', 'data-add': p.id }
        }, 'Add'),
        el('button', {
            class: 'hpc-heart' + (favActive ? ' active' : ''),
            attrs: {
                type: 'button',
                'data-fav': p.id,
                'aria-pressed': favActive ? 'true' : 'false',
                'aria-label': favActive ? 'Remove from favorites' : 'Add to favorites'
            }
        }, favActive ? '♥' : '♡')
    );

    body.appendChild(actions);
    card.appendChild(body);
    return card;
}
