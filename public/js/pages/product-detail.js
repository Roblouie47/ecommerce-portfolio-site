import { el } from '../utils/dom.js';
import { state } from '../state/index.js';
import { productPlaceholder, getRootEl, notify, renderStarRating } from '../utils/helpers.js';
import { money } from '../utils/currency.js';
import { navigate } from '../router/index.js';
import { addToCart } from '../components/index.js';
import { fetchProductReviews } from '../api/index.js';

/**
 * Shows the product detail view
 */
// --- Modern product detail view implementation ---
export function showProductDetail(id, _retryCount = 0) {
    // Allow calling with no argument (router usage)
    if (!id) {
        id = state.routeParams && state.routeParams.id;
    }
    const rootEl = getRootEl();
    if (!rootEl) return;
    const prod = state.productsById.get(id);
    if (!prod) {
        // Wait for products to load, retry up to 10 times (2s total)
        if (_retryCount < 10) {
            setTimeout(() => showProductDetail(id, _retryCount + 1), 200);
            return;
        }
        notify('Product missing', 'error');
        navigate('catalog');
        return;
    }
    rootEl.innerHTML = '';
    let selectedVariant = null;
    // Gallery
    const images = (prod.images && prod.images.length ? prod.images : [productPlaceholder(1024)]);
    const hasMultipleImages = images.length > 1;
    let currentIdx = 0;
    const mainImg = el('img', { class: 'pd-main-img', attrs: { src: images[0], alt: prod.title, loading: 'eager' } });
    const mainWrap = el('div', { class: 'pd-main-wrap' });
    const prevBtn = el('button', { class: 'pd-gallery-nav pd-prev', attrs: { type: 'button', 'aria-label': 'Previous image' } }, '‹');
    const nextBtn = el('button', { class: 'pd-gallery-nav pd-next', attrs: { type: 'button', 'aria-label': 'Next image' } }, '›');
    mainWrap.appendChild(prevBtn);
    mainWrap.appendChild(mainImg);
    mainWrap.appendChild(nextBtn);
    if (!hasMultipleImages) {
        prevBtn.classList.add('disabled');
        nextBtn.classList.add('disabled');
        /** @type {HTMLButtonElement} */(prevBtn).disabled = true;
        /** @type {HTMLButtonElement} */(nextBtn).disabled = true;
    }

    const imageIndicator = hasMultipleImages ? el('div', { class: 'pd-gallery-indicator tiny muted' }, `Image 1 of ${images.length}`) : null;

    function selectImage(i) {
        if (i < 0 || i >= images.length) return;
        currentIdx = i;
        /** @type {HTMLImageElement} */(mainImg).src = images[i];
        if (imageIndicator) imageIndicator.textContent = `Image ${i + 1} of ${images.length}`;
    }

    if (hasMultipleImages) {
        const step = (delta) => {
            const nextIndex = (currentIdx + delta + images.length) % images.length;
            selectImage(nextIndex);
        };
        prevBtn.addEventListener('click', () => step(-1));
        nextBtn.addEventListener('click', () => step(1));
    }

    const galleryWrap = el('div', { class: 'pd-gallery pv-gallery-card', attrs: { tabIndex: '0' } }, mainWrap, imageIndicator);
    if (hasMultipleImages) {
        galleryWrap.addEventListener('keydown', e => {
            if (e.key === 'ArrowRight') { selectImage((currentIdx + 1) % images.length); e.preventDefault(); }
            else if (e.key === 'ArrowLeft') { selectImage((currentIdx - 1 + images.length) % images.length); e.preventDefault(); }
        });
    }
    // Variant grouping
    const variantsBox = (function buildVariants() {
        if (!prod.variants || !prod.variants.length) return el('div');
        const byOption = {};
        prod.variants.forEach(v => Object.entries(v.optionValues || {}).forEach(([k, val]) => { if (!byOption[k]) byOption[k] = new Set(); byOption[k].add(val); }));
        const selection = {};
        function renderGroup(name, values) {
            const wrap = el('div', { class: 'variant-group' }, el('div', { class: 'tiny muted' }, name));
            const row = el('div', { class: 'vg-row flex gap-sm flex-wrap' });
            values.forEach(val => { row.appendChild(el('button', { class: 'btn btn-xs btn-outline', attrs: { type: 'button', 'data-opt': name, 'data-val': val } }, val)); });
            row.addEventListener('click', e => {
                const b = (e.target && (/** @type {Element} */(e.target)).closest('[data-opt]'));
                if (!b) return; const opt = b.getAttribute('data-opt'); const val = b.getAttribute('data-val');
                row.querySelectorAll('[data-opt="' + opt + '"]').forEach(x => x.classList.remove('active'));
                b.classList.add('active'); selection[opt] = val; computeVariant();
            });
            wrap.appendChild(row); return wrap;
        }
        function computeVariant() {
            const match = prod.variants.find(v => Object.entries(v.optionValues || {}).every(([k, val]) => selection[k] === val));
            selectedVariant = match ? match.id : null;
            const info = box.querySelector('.variant-info');
            if (selectedVariant) { const v = prod.variants.find(v => v.id === selectedVariant); info.textContent = v.inventory > 0 ? `In stock: ${v.inventory}` : 'Out of stock'; }
            else info.textContent = 'Select options';
        }
        const box = el('div', { class: 'variant-selector flex flex-col gap-sm' });
        Object.entries(byOption).forEach(([k, set]) => box.appendChild(renderGroup(k, Array.from(set))));
        box.appendChild(el('div', { class: 'variant-info tiny muted' }, 'Select options'));
        return box;
    })();
    variantsBox.classList.add('pv-variant-card');
    const stockAmount = getProductStock(prod);
    const stockSummary = stockAmount <= 0 ? 'Out of stock' : stockAmount < 5 ? `Only ${stockAmount} left` : `${stockAmount} ready to ship`;
    // Simple inventory badge implementation
    function inventoryBadge(product) {
        const stock = getProductStock(product);
        let badgeClass = 'pv-stock-chip';
        let label = '';
        if (stock <= 0) { badgeClass += ' out'; label = 'Out of stock'; }
        else if (stock < 5) { badgeClass += ' low'; label = `Only ${stock} left`; }
        else { badgeClass += ' ok'; label = 'In stock'; }
        return el('span', { class: badgeClass }, label);
    }
    const stockChip = inventoryBadge(prod);
    const ratingView = (prod.reviewSummary && prod.reviewSummary.count > 0)
        ? renderStarRating(prod.reviewSummary.average, prod.reviewSummary.count, { size: 'md' })
        : el('div', { class: 'tiny muted' }, 'No reviews yet');

    const tagRow = prod.tags && prod.tags.length
        ? el('div', { class: 'pv-tag-row' }, ...prod.tags.slice(0, 6).map(t => el('span', { class: 'pv-tag' }, t)))
        : null;

    const qtyInput = el('input', { attrs: { id: 'prod-qty', type: 'number', min: '1', value: '1' } });
    const qtyField = el('div', { class: 'pv-qty-field' },
        el('span', { class: 'pv-qty-label tiny muted' }, 'Qty'),
        qtyInput
    );
    const addBtn = el('button', { class: 'btn btn-success', attrs: { id: 'add-cart-btn', type: 'button' } }, 'Add to Cart');
    const backBtn = el('button', { class: 'btn btn-outline', attrs: { 'data-route': 'catalog', type: 'button' } }, 'Back');
    const ctaRow = el('div', { class: 'pv-cta-row' }, qtyField, el('div', { class: 'pv-cta-buttons' }, addBtn, backBtn));

    const assuranceItem = (title, copy) => el('div', { class: 'pv-assurance-item' },
        el('span', { class: 'pv-assurance-title' }, title),
        el('span', { class: 'tiny muted' }, copy)
    );
    const assuranceRow = el('div', { class: 'pv-assurance-row' },
        assuranceItem('Ships fast', 'Dispatches within 24 hours'),
        assuranceItem('Easy returns', 'Free exchanges within 30 days'),
        assuranceItem('Secure checkout', '256-bit SSL protection')
    );

    const derivedFeatures = (prod.tags && prod.tags.length
        ? prod.tags.slice(0, 4).map(tag => `- ${tag.replace(/[-_]/g, ' ')}`)
        : ['- Soft-touch premium fabric', '- Everyday relaxed fit', '- Breathable comfort', '- Easy to pair with staples']);
    const buildFeatureList = () => el('div', { class: 'pv-feature-list' }, ...derivedFeatures.map(text => el('span', {}, text.replace(/^\-\s*/, ''))));

    const priceRow = el('div', { class: 'pv-price-row' },
        el('span', { class: 'pv-price', attrs: { 'data-price-cents': prod.priceCents } }, money(prod.priceCents)),
        stockChip,
    );

    const infoNodes = [
        el('span', { class: 'pv-status-pill tiny muted' }, 'Featured drop'),
        el('h1', { class: 'product-detail-title' }, prod.title),
        ratingView,
        priceRow,
        tagRow,
        el('p', { class: 'pv-description' }, prod.description || 'No description available.'),
        variantsBox,
        ctaRow,
        assuranceRow
    ].filter(Boolean);

    const infoCol = el('div', { class: 'pv-info-card pv-summary-card flex flex-col gap-md' }, ...infoNodes);

    const hero = el('section', { class: 'pv-stage' },
        el('div', { class: 'pv-hero' },
            el('div', { class: 'pv-media-card' }, galleryWrap),
            infoCol
        )
    );

    const reviewCount = prod.reviewSummary?.count || 0;
    const deliveryWindowLabel = '2-4 days';
    const deliveryWindowDetail = 'Priority handling';
    const insightCard = (label, value, detail) => el('div', { class: 'pv-insight-card' },
        el('span', { class: 'pv-insight-label' }, label),
        el('span', { class: 'pv-insight-value' }, value),
        detail ? el('span', { class: 'pv-insight-detail tiny muted' }, detail) : null
    );
    const insightGrid = el('section', { class: 'pv-insight-grid' },
        insightCard('Inventory', stockSummary, 'Live studio count'),
        insightCard('Arrives', deliveryWindowLabel, deliveryWindowDetail),
        insightCard('Reviews', reviewCount ? `${reviewCount} verified` : 'Be the first', reviewCount ? 'Loved by the community' : 'Collect the first story'),
        insightCard('Care', 'Easy upkeep', 'Machine wash cold')
    );

    const careSteps = [
        'Wash cold, gentle cycle',
        'Lay flat or tumble dry low',
        'Do not bleach',
        'Warm iron inside out if needed'
    ];
    const careList = el('ul', { class: 'pv-panel-list' }, ...careSteps.map(step => el('li', {}, step)));
    const styleTags = (prod.tags || []).slice(0, 4);
    const styleTagRow = styleTags.length ? el('div', { class: 'pv-tag-row' }, ...styleTags.map(t => el('span', { class: 'pv-tag' }, t))) : null;
    const reviewButton = el('button', { class: 'btn btn-small btn-outline', attrs: { 'data-route': 'product-reviews', 'data-id': prod.id } }, reviewCount ? 'Read reviews' : 'Start a review');

    const panel = (title, nodes) => el('article', { class: 'pv-panel' },
        el('h3', { class: 'pv-panel-title' }, title),
        ...nodes
    );
    const detailGrid = el('section', { class: 'pv-panel-grid' },
        panel('Fabric & Feel', [
            el('p', {}, 'Premium mid-weight cotton meant for all-day comfort.'),
            buildFeatureList()
        ]),
        panel('Care & Fit', [careList, styleTagRow].filter(Boolean)),
        panel('Story & Support', [
            el('p', {}, prod.description || 'Crafted in small batches to reduce waste and dyed with low-water techniques.'),
            el('div', { class: 'pv-panel-actions' }, reviewButton),
            el('span', { class: 'tiny muted' }, 'Need styling help? support@Nicolas.shop')
        ])
    );

    const viewSections = [hero, insightGrid, detailGrid];
    // Related items
    const related = [];
    const seenProducts = new Set([prod.id]);
    if (Array.isArray(prod.tags) && prod.tags.length) {
        for (const candidate of state.products) {
            if (seenProducts.has(candidate.id) || candidate.deletedAt) continue;
            if (!candidate.tags || !candidate.tags.length) continue;
            if (!candidate.tags.some(tag => prod.tags.includes(tag))) continue;
            seenProducts.add(candidate.id);
            related.push(candidate);
            if (related.length >= 4) break;
        }
    }
    if (related.length) {
        const relGrid = el('div', { class: 'pv-related-grid' }, ...related.map(r => el('article', { class: 'pv-related-card', attrs: { 'data-rel-id': r.id } },
            el('div', { class: 'pv-related-media' },
                el('img', { attrs: { src: (Array.isArray(r.images) && r.images.length ? r.images[0] : productPlaceholder(420)), alt: r.title || 'Related product', loading: 'lazy' } })
            ),
            el('div', { class: 'pv-related-body' },
                el('span', { class: 'pv-related-chip tiny muted' }, 'Pairs well'),
                el('p', { class: 'pv-related-name' }, r.title || 'Product'),
                el('div', { class: 'pv-related-row flex align-center justify-between' },
                    el('span', { class: 'pv-related-price', attrs: { 'data-price-cents': r.priceCents } }, money(r.priceCents))
                )
            )
        )));
        const relWrap = el('section', { class: 'pv-related mt-lg' },
            el('div', { class: 'pv-related-head' },
                el('div', {},
                    el('span', { class: 'pv-eyebrow tiny muted' }, 'Styled for you'),
                    el('h3', { class: 'pv-related-title' }, 'Related Items')
                ),
                el('button', { class: 'btn btn-small btn-outline', attrs: { 'data-route': 'catalog', type: 'button' } }, 'Shop catalog')
            ),
            relGrid
        );
        viewSections.push(relWrap);
        relWrap.addEventListener('click', e => { const c = (e.target && (/** @type {Element} */(e.target)).closest('[data-rel-id]')); if (c) showProductDetail(c.getAttribute('data-rel-id')); });
    }
    // Recently viewed
    const RV_KEY = 'recentlyViewed';
    let rv = []; try { rv = JSON.parse(localStorage.getItem(RV_KEY) || '[]'); } catch { rv = []; }
    rv = rv.filter(x => x !== prod.id); rv.unshift(prod.id); if (rv.length > 20) rv = rv.slice(0, 20);
    localStorage.setItem(RV_KEY, JSON.stringify(rv));
    const recents = rv.filter(pid => pid !== prod.id).map(pid => state.productsById.get(pid)).filter(Boolean).slice(0, 6);
    if (recents.length) {
        const rvGrid = el('div', { class: 'pv-recent-grid' }, ...recents.map(r => el('div', { class: 'pv-recent-card', attrs: { 'data-rv-id': r.id } },
            el('div', { class: 'pv-recent-media' },
                el('img', { attrs: { src: (r.images && r.images[0]) || productPlaceholder(320), alt: r.title, loading: 'lazy' } })
            ),
            el('div', { class: 'pv-recent-body' },
                el('span', { class: 'pv-recent-chip tiny muted' }, 'Viewed'),
                el('p', { class: 'pv-recent-name' }, r.title || 'Product'),
                el('span', { class: 'pv-recent-price tiny', attrs: { 'data-price-cents': r.priceCents } }, money(r.priceCents))
            )
        )));
        const rvWrap = el('section', { class: 'pv-recently-viewed mt-lg' },
            el('div', { class: 'pv-recent-head' },
                el('div', {},
                    el('span', { class: 'pv-eyebrow tiny muted' }, 'Keep browsing'),
                    el('h3', { class: 'pv-recent-title' }, 'Recently Viewed')
                ),
                el('button', { class: 'btn btn-small btn-outline', attrs: { 'data-route': 'catalog', type: 'button' } }, 'All products')
            ),
            rvGrid
        );
        viewSections.push(rvWrap);
        rvWrap.addEventListener('click', e => { const c = (e.target && (/** @type {Element} */(e.target)).closest('[data-rv-id]')); if (c) showProductDetail(c.getAttribute('data-rv-id')); });
    }
    const initialSummary = prod.reviewSummary || { count: 0, average: null, totalQuantity: 0 };
    let currentSummary = initialSummary;

    const getTeaserCopy = (count) => count
        ? 'See how the drop wears, fits, and ages from verified buyers.'
        : 'Be the first to leave a fit check for the community.';

    const getSentimentLabel = (summary) => {
        const count = summary?.count || 0;
        if (!count) return 'New drop';
        const avg = summary?.average ?? 0;
        if (avg >= 4.6) return 'Glowing';
        if (avg >= 4) return 'Warm';
        if (avg >= 3.4) return 'Balanced';
        return 'Mixed';
    };

    const statCard = (label, value, detail) => el('div', { class: 'prp-stat-card' },
        el('span', { class: 'prp-stat-label tiny muted' }, label),
        el('span', { class: 'prp-stat-value' }, value),
        detail ? el('span', { class: 'prp-stat-detail tiny muted' }, detail) : null
    );

    const buildSummaryCard = (summary) => {
        const safe = summary || { count: 0, average: null, totalQuantity: 0 };
        const count = safe.count || 0;
        const wrap = el('div', { class: 'review-summary-preview flex flex-col gap-sm' });
        wrap.appendChild(el('div', { class: 'review-summary-main flex gap-sm align-center' },
            renderStarRating(safe.average ?? null, count || null, { size: 'lg' }),
            el('div', { class: 'flex flex-col' },
                el('span', { class: 'summary-average' }, count ? `${(safe.average ?? 0).toFixed(1)} / 5` : 'No ratings yet'),
                el('span', { class: 'summary-count tiny muted' }, count ? `${count} review${count === 1 ? '' : 's'}` : 'Be the first to review')
            )
        ));
        wrap.appendChild(el('div', { class: 'summary-total tiny muted' }, count
            ? `Verified units purchased: ${safe.totalQuantity || 0}`
            : 'Awaiting the first verified take.'));
        return wrap;
    };

    const buildStatsGrid = (summary) => {
        const safe = summary || { count: 0, totalQuantity: 0 };
        const count = safe.count || 0;
        return el('div', { class: 'prp-stats-grid' },
            statCard('Verified stories', count ? `${count}` : 'Soon', count ? 'Published reviews' : 'Collecting impressions'),
            statCard('Units loved', safe.totalQuantity ? `${safe.totalQuantity}` : '—', 'Orders tied to reviews'),
            statCard('Sentiment', getSentimentLabel(safe), count ? 'Community mood' : 'Awaiting first notes')
        );
    };

    const buildStoryCard = (review) => {
        const safe = review || {};
        const bodyText = (safe.body || '').trim();
        const snippet = bodyText.length > 240 ? `${bodyText.slice(0, 240).trimEnd()}…` : bodyText;
        const dateSource = safe.publishedAt || safe.createdAt || null;
        const dateLabel = dateSource ? new Date(dateSource).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
        const purchaseMeta = safe.quantityPurchased ? `${safe.quantityPurchased} unit${safe.quantityPurchased === 1 ? '' : 's'} verified` : '';
        const detailMeta = purchaseMeta ? el('span', { class: 'tiny muted prp-story-meta' }, purchaseMeta) : null;
        return el('article', { class: 'review-card prp-story-card flex flex-col gap-xs' },
            el('div', { class: 'prp-story-head flex align-center justify-between gap-sm' },
                el('div', { class: 'flex align-center gap-xs' },
                    renderStarRating(safe.rating ?? null, null, { size: 'xs' }),
                    el('span', { class: 'review-author' }, safe.authorName || 'Verified buyer')
                ),
                dateLabel ? el('span', { class: 'tiny muted' }, dateLabel) : null
            ),
            safe.title ? el('h4', { class: 'review-title' }, safe.title) : null,
            snippet ? el('p', { class: 'review-body' }, snippet) : null,
            detailMeta
        );
    };

    let summaryCard = buildSummaryCard(currentSummary);
    summaryCard.classList.add('prp-score-card');

    const teaserParagraph = el('p', { class: 'prp-copy tiny muted' }, getTeaserCopy(currentSummary.count || 0));
    const storiesWrap = el('div', { class: 'prp-stories flex flex-col gap-sm' });
    storiesWrap.appendChild(el('p', { class: 'tiny muted' }, currentSummary.count
        ? 'Loading community stories…'
        : 'No community stories yet. Share your first take.'));

    const prpLeft = el('div', { class: 'prp-left flex flex-col gap-sm' },
        summaryCard,
        teaserParagraph,
        storiesWrap
    );

    let statsGrid = buildStatsGrid(currentSummary);
    const ctaTextNode = el('p', { class: 'prp-cta-text' }, currentSummary.count
        ? 'Dive deeper into detailed fit notes, fabric impressions, and styling inspo.'
        : 'Set the tone for this drop with the first review.');
    const ctaButton = el('button', { class: 'btn btn-small btn-outline', attrs: { 'data-route': 'product-reviews', 'data-id': prod.id } }, currentSummary.count ? 'Read full reviews' : 'Open review hub');
    const ctaCard = el('div', { class: 'prp-cta-card flex flex-col gap-sm' }, ctaTextNode, ctaButton);
    const prpRight = el('div', { class: 'prp-right flex flex-col gap-md' }, statsGrid, ctaCard);

    const reviewTeaser = el('section', { class: 'panel product-reviews-preview mt-lg' },
        el('div', { class: 'prp-head flex flex-col gap-xxs' },
            el('span', { class: 'pv-eyebrow tiny muted' }, 'Community voices'),
            el('h3', { class: 'prp-title' }, 'Reviews & stories')
        ),
        el('div', { class: 'prp-body' }, prpLeft, prpRight)
    );

    viewSections.push(reviewTeaser);

    const updateReviewPreview = (summary, reviews) => {
        const safeSummary = summary || { count: 0, average: null, totalQuantity: 0 };
        currentSummary = safeSummary;

        const nextSummaryCard = buildSummaryCard(safeSummary);
        nextSummaryCard.classList.add('prp-score-card');
        prpLeft.replaceChild(nextSummaryCard, summaryCard);
        summaryCard = nextSummaryCard;

        const nextStatsGrid = buildStatsGrid(safeSummary);
        prpRight.replaceChild(nextStatsGrid, statsGrid);
        statsGrid = nextStatsGrid;

        teaserParagraph.textContent = getTeaserCopy(safeSummary.count || 0);
        ctaTextNode.textContent = safeSummary.count
            ? 'Dive deeper into detailed fit notes, fabric impressions, and styling inspo.'
            : 'Set the tone for this drop with the first review.';
        ctaButton.textContent = safeSummary.count ? 'Read full reviews' : 'Open review hub';

        storiesWrap.innerHTML = '';
        const storyList = Array.isArray(reviews) ? reviews : [];
        if (storyList.length) {
            storyList.slice(0, 2).forEach((review) => storiesWrap.appendChild(buildStoryCard(review)));
            if (storyList.length > 2) {
                const extra = storyList.length - 2;
                storiesWrap.appendChild(el('p', { class: 'tiny muted' }, `+${extra} more community stor${extra === 1 ? 'y' : 'ies'} in the review hub.`));
            }
        } else {
            storiesWrap.appendChild(el('p', { class: 'tiny muted' }, 'No community stories yet. Share your first take.'));
        }
    };

    const persistSummary = (summary) => {
        if (!summary) return;
        prod.reviewSummary = summary;
        state.productsById.set(prod.id, prod);
        const idx = state.products.findIndex((p) => p.id === prod.id);
        if (idx >= 0) {
            state.products[idx] = { ...state.products[idx], reviewSummary: summary };
        }
    };

    const hydrateReviewPreview = async () => {
        try {
            const data = await fetchProductReviews(prod.id);
            if (!data) return;
            state.reviewsByProduct.set(prod.id, data);
            const summary = data.summary || currentSummary;
            updateReviewPreview(summary, data.reviews);
            persistSummary(summary);
        } catch (err) {
            storiesWrap.innerHTML = '';
            storiesWrap.appendChild(el('p', { class: 'alert alert-error tiny' }, 'Community stories are unavailable right now.'));
            console.warn('[ProductDetail] Failed to load reviews', err);
        }
    };

    const cachedReviews = state.reviewsByProduct?.get?.(prod.id);
    if (cachedReviews) {
        updateReviewPreview(cachedReviews.summary || currentSummary, cachedReviews.reviews);
        persistSummary(cachedReviews.summary);
    } else {
        hydrateReviewPreview();
    }
    const shell = el('div', { class: 'product-view-shell container' }, ...viewSections);
    rootEl.appendChild(shell);

    document.getElementById('add-cart-btn').addEventListener('click', () => {
        const qtyInput = /** @type {HTMLInputElement|null} */(document.getElementById('prod-qty'));
        const qty = Math.max(1, parseInt(qtyInput && qtyInput.value ? qtyInput.value : '1', 10) || 1);
        if (prod.variants && prod.variants.length && !selectedVariant) { notify('Select a variant', 'warn'); return; }
        if (selectedVariant) { const v = prod.variants.find(v => v.id === selectedVariant); if (v && v.inventory < qty) { notify('Not enough variant stock', 'warn'); return; } }
        // addToCart expects 1-2 arguments: (id, qty)
        addToCart(prod.id, qty);
    });
    setTimeout(() => galleryWrap.focus(), 30);
}

/**
 * Gets product stock level
 * @param {Object} product - Product object
 * @returns {number}
 */
function getProductStock(product) {
    if (!product) return 0;
    if (typeof product.totalInventory === 'number') return product.totalInventory;
    if (typeof product.baseInventory === 'number') return product.baseInventory;
    if (typeof product.inventory === 'number') return product.inventory;
    return 0;
}
