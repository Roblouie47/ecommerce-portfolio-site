import { state } from '../state/index.js';
import { el } from '../utils/dom.js';
import { getRootEl, notify, renderStarRating } from '../utils/helpers.js';
import { money } from '../utils/currency.js';
import { navigate } from '../router/index.js';
import { fetchProductReviews } from '../api/index.js';

/**
 * Renders a professional product reviews page
 */
export async function renderProductReviews() {
    const rootEl = getRootEl();
    if (!rootEl) return;

    const urlParams = new URLSearchParams(window.location.search || '');
    const productId = state.routeParams?.id || urlParams.get('id') || '';
    const product = state.productsById.get(productId) || state.productsById.get(String(productId)) || null;
    if (!product) {
        notify('Product not found', 'error');
        navigate('catalog');
        return;
    }

    rootEl.innerHTML = '';

    // Main page container
    const page = el('div', { class: 'reviews-page' });

    // Breadcrumb navigation
    const breadcrumb = el('nav', { class: 'reviews-breadcrumb' },
        el('a', { attrs: { 'data-route': 'home' } }, 'Home'),
        el('span', { class: 'breadcrumb-sep' }, '/'),
        el('a', { attrs: { 'data-route': 'catalog' } }, 'Products'),
        el('span', { class: 'breadcrumb-sep' }, '/'),
        el('a', { attrs: { 'data-route': 'product', 'data-id': product.id } }, product.title || 'Product'),
        el('span', { class: 'breadcrumb-sep' }, '/'),
        el('span', { class: 'breadcrumb-current' }, 'Reviews')
    );
    page.appendChild(breadcrumb);

    // Product header card
    const productImg = product.images?.[0] || product.image || '';
    const productHeader = el('div', { class: 'reviews-product-header' },
        productImg ? el('img', { class: 'reviews-product-img', attrs: { src: productImg, alt: product.title || '' } }) : null,
        el('div', { class: 'reviews-product-info' },
            el('h1', { class: 'reviews-product-title' }, product.title || 'Product'),
            el('div', { class: 'reviews-product-meta' },
                renderStarRating(product.reviewSummary?.average ?? 0, product.reviewSummary?.count || 0, { size: 'md' }),
                el('span', { class: 'reviews-product-price' }, money(product.priceCents || 0))
            ),
            el('button', { class: 'btn btn-outline btn-small', attrs: { 'data-route': 'product', 'data-id': product.id } },
                el('span', { class: 'btn-icon' }, '←'),
                'Back to Product'
            )
        )
    );
    page.appendChild(productHeader);

    // Reviews content area with loading state
    const reviewsContent = el('div', { class: 'reviews-content' });
    reviewsContent.innerHTML = `
        <div class="reviews-loading">
            <div class="reviews-loading-spinner"></div>
            <p>Loading reviews...</p>
        </div>
    `;
    page.appendChild(reviewsContent);
    rootEl.appendChild(page);

    // Fetch and render reviews
    try {
        const data = await fetchProductReviews(product.id);
        const reviews = Array.isArray(data.reviews) ? data.reviews : [];
        const summary = data.summary || {};
        renderReviewsContent(reviewsContent, reviews, summary, product);
    } catch (err) {
        reviewsContent.innerHTML = '';
        reviewsContent.appendChild(el('div', { class: 'reviews-error' },
            el('span', { class: 'reviews-error-icon' }, '⚠'),
            el('p', {}, err?.message || 'Failed to load reviews'),
            el('button', { class: 'btn btn-outline btn-small', onclick: () => renderProductReviews() }, 'Try Again')
        ));
    }
}

/**
 * Renders reviews content with summary sidebar and reviews list
 */
function renderReviewsContent(container, reviews, summary, product) {
    const totalCount = Number.isFinite(summary.count) ? summary.count : reviews.length;
    const avgRating = typeof summary.average === 'number' ? summary.average : 0;
    const distribution = summary.distribution || {};
    
    container.innerHTML = '';

    // Two-column layout
    const layout = el('div', { class: 'reviews-layout' });

    // Left sidebar - Summary
    const sidebar = el('aside', { class: 'reviews-sidebar' });
    
    // Rating summary card
    const summaryCard = el('div', { class: 'reviews-summary-card' },
        el('div', { class: 'reviews-big-rating' },
            el('span', { class: 'reviews-big-number' }, totalCount ? avgRating.toFixed(1) : '—'),
            el('span', { class: 'reviews-out-of' }, '/ 5')
        ),
        el('div', { class: 'reviews-stars-display' },
            renderStarRating(avgRating, null, { size: 'lg' })
        ),
        el('p', { class: 'reviews-total-count' }, 
            totalCount ? `Based on ${totalCount} review${totalCount !== 1 ? 's' : ''}` : 'No reviews yet'
        )
    );
    sidebar.appendChild(summaryCard);

    // Rating distribution bars
    if (totalCount > 0) {
        const distCard = el('div', { class: 'reviews-distribution-card' },
            el('h3', { class: 'reviews-dist-title' }, 'Rating Breakdown')
        );
        const distList = el('div', { class: 'reviews-dist-list' });
        
        for (let star = 5; star >= 1; star--) {
            const count = distribution[star] || 0;
            const pct = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0;
            const row = el('div', { class: 'reviews-dist-row' },
                el('span', { class: 'reviews-dist-label' }, `${star}★`),
                el('div', { class: 'reviews-dist-bar' },
                    el('div', { class: 'reviews-dist-fill', style: `width: ${pct}%` })
                ),
                el('span', { class: 'reviews-dist-count' }, `${count}`)
            );
            distList.appendChild(row);
        }
        distCard.appendChild(distList);
        sidebar.appendChild(distCard);
    }

    layout.appendChild(sidebar);

    // Right main area - Reviews list
    const main = el('div', { class: 'reviews-main' });
    
    // Header with sort (visual only for now)
    const listHeader = el('div', { class: 'reviews-list-header' },
        el('h2', { class: 'reviews-list-title' }, 
            totalCount ? `Customer Reviews (${totalCount})` : 'Customer Reviews'
        ),
        el('div', { class: 'reviews-sort' },
            el('label', { attrs: { for: 'review-sort' } }, 'Sort by:'),
            el('select', { attrs: { id: 'review-sort' } },
                el('option', { attrs: { value: 'recent' } }, 'Most Recent'),
                el('option', { attrs: { value: 'helpful' } }, 'Most Helpful'),
                el('option', { attrs: { value: 'highest' } }, 'Highest Rated'),
                el('option', { attrs: { value: 'lowest' } }, 'Lowest Rated')
            )
        )
    );
    main.appendChild(listHeader);

    // Reviews list
    if (!reviews.length) {
        const emptyState = el('div', { class: 'reviews-empty' },
            el('div', { class: 'reviews-empty-icon' }, '📝'),
            el('h3', {}, 'No Reviews Yet'),
            el('p', {}, 'Be the first to share your thoughts about this product!'),
            el('button', { class: 'btn btn-primary', attrs: { 'data-route': 'product', 'data-id': product.id } }, 'Write a Review')
        );
        main.appendChild(emptyState);
    } else {
        const list = el('div', { class: 'reviews-cards-list' });
        
        for (const review of reviews) {
            const card = renderReviewCard(review);
            list.appendChild(card);
        }
        
        main.appendChild(list);
    }

    layout.appendChild(main);
    container.appendChild(layout);
}

/**
 * Renders a single review card
 */
function renderReviewCard(review) {
    const dateSource = review?.publishedAt || review?.createdAt || null;
    let dateLabel = '';
    let relativeDate = '';
    if (dateSource) {
        const parsed = new Date(dateSource);
        if (!Number.isNaN(parsed.getTime())) {
            dateLabel = parsed.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            relativeDate = getRelativeTime(parsed);
        }
    }

    const authorInitial = (review.authorName || 'A').charAt(0).toUpperCase();
    const rating = review.rating || 0;

    const card = el('article', { class: 'review-card-pro' },
        // Header with avatar and meta
        el('div', { class: 'review-card-header' },
            el('div', { class: 'review-avatar' }, authorInitial),
            el('div', { class: 'review-meta-info' },
                el('div', { class: 'review-author-row' },
                    el('span', { class: 'review-author-name' }, review.authorName || 'Anonymous'),
                    review.verified ? el('span', { class: 'review-verified' }, '✓ Verified Purchase') : null
                ),
                el('div', { class: 'review-date' }, relativeDate || dateLabel)
            ),
            el('div', { class: 'review-rating-badge' },
                el('span', { class: 'review-rating-num' }, rating.toFixed(1)),
                el('span', { class: 'review-rating-star' }, '★')
            )
        ),
        // Star display
        el('div', { class: 'review-stars-row' },
            renderStarRating(rating, null, { size: 'sm' })
        ),
        // Title
        review.title ? el('h4', { class: 'review-card-title' }, review.title) : null,
        // Body
        el('p', { class: 'review-card-body' }, review.body || ''),
        // Footer
        el('div', { class: 'review-card-footer' },
            el('button', { class: 'review-helpful-btn', type: 'button' },
                el('span', { class: 'helpful-icon' }, '👍'),
                'Helpful'
            ),
            el('span', { class: 'review-full-date' }, dateLabel)
        )
    );

    return card;
}

/**
 * Gets relative time string
 */
function getRelativeTime(date) {
    const now = Date.now();
    const diffMs = now - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
    return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''} ago`;
}
