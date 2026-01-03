import { el } from '../utils/dom.js';
import { state } from '../state/index.js';
import { renderStarRating } from '../utils/helpers.js';
import { money } from '../utils/currency.js';
import { fetchProductReviews } from '../api/index.js';

/**
 * Renders product reviews section
 * @param {Object} product - Product object
 * @param {HTMLElement} container - Container element
 * @param {Object} [options] - Display options
 */
export async function renderProductReviews(product, container, options = {}) {
    if (!container || !product) return;
    
    container.innerHTML = '<p class="muted small">Loading reviews...</p>';
    
    try {
        const data = await fetchProductReviews(product.id);
        const reviews = Array.isArray(data.reviews) ? data.reviews : [];
        const avgRating = data.averageRating || 0;
        const totalCount = data.totalCount || reviews.length;
        
        container.innerHTML = '';
        
        // Summary header
        const summary = el('div', { class: 'reviews-summary' },
            el('div', { class: 'reviews-summary-rating' },
                el('span', { class: 'reviews-avg-rating' }, avgRating.toFixed(1)),
                renderStarRating(avgRating),
                el('span', { class: 'reviews-count muted' }, `${totalCount} review${totalCount !== 1 ? 's' : ''}`)
            )
        );
        container.appendChild(summary);
        
        // Reviews list
        if (!reviews.length) {
            container.appendChild(el('p', { class: 'muted small reviews-empty' }, 'No reviews yet. Be the first to review!'));
        } else {
            const list = el('div', { class: 'reviews-list' });
            
            for (const review of reviews) {
                const reviewCard = el('article', { class: 'review-card' },
                    el('div', { class: 'review-header' },
                        el('div', { class: 'review-author' },
                            el('span', { class: 'review-author-name' }, review.authorName || 'Anonymous'),
                            review.verified ? el('span', { class: 'review-verified-badge tiny' }, '✓ Verified') : null
                        ),
                        renderStarRating(review.rating, null, { size: 'xs' })
                    ),
                    review.title ? el('h4', { class: 'review-title' }, review.title) : null,
                    el('p', { class: 'review-body' }, review.body || ''),
                    el('div', { class: 'review-meta tiny muted' },
                        review.createdAt ? new Date(review.createdAt).toLocaleDateString() : ''
                    )
                );
                list.appendChild(reviewCard);
            }
            
            container.appendChild(list);
        }
        
    } catch (err) {
        container.innerHTML = '';
        container.appendChild(el('p', { class: 'alert alert-error small' }, 'Failed to load reviews'));
    }
}

/**
 * Creates a review submission form
 * @param {Object} product - Product object
 * @param {Object} [options] - Form options
 * @returns {HTMLElement}
 */
export function createReviewForm(product, options = {}) {
    const { onSubmit } = options;
    
    const form = el('form', { class: 'review-form' },
        el('h4', {}, 'Write a Review'),
        el('div', { class: 'field' },
            el('label', {}, 'Rating'),
            el('div', { class: 'rating-input', attrs: { id: 'review-rating' } },
                ...[1, 2, 3, 4, 5].map(n => 
                    el('button', { 
                        class: 'star-btn', 
                        attrs: { type: 'button', 'data-rating': n, 'aria-label': `${n} stars` } 
                    }, '★')
                )
            )
        ),
        el('div', { class: 'field' },
            el('label', { attrs: { for: 'review-title' } }, 'Title (optional)'),
            el('input', { attrs: { id: 'review-title', type: 'text', maxlength: '100' } })
        ),
        el('div', { class: 'field' },
            el('label', { attrs: { for: 'review-body' } }, 'Your Review'),
            el('textarea', { attrs: { id: 'review-body', rows: '4', required: 'true' } })
        ),
        el('div', { class: 'field' },
            el('label', { attrs: { for: 'review-name' } }, 'Your Name'),
            el('input', { attrs: { id: 'review-name', type: 'text', required: 'true' } })
        ),
        el('div', { class: 'field' },
            el('label', { attrs: { for: 'review-email' } }, 'Email (not displayed)'),
            el('input', { attrs: { id: 'review-email', type: 'email', required: 'true' } })
        ),
        el('button', { class: 'btn btn-primary', attrs: { type: 'submit' } }, 'Submit Review')
    );
    
    // Rating selection
    let selectedRating = 0;
    const ratingContainer = form.querySelector('.rating-input');
    ratingContainer.addEventListener('click', (e) => {
        const btn = /** @type {HTMLElement} */ (e.target).closest('[data-rating]');
        if (!btn) return;
        selectedRating = parseInt(btn.getAttribute('data-rating'), 10);
        ratingContainer.querySelectorAll('.star-btn').forEach((star, idx) => {
            star.classList.toggle('active', idx < selectedRating);
        });
    });
    
    // Get form input references
    const titleInput = /** @type {HTMLInputElement} */ (form.querySelector('#review-title'));
    const bodyInput = /** @type {HTMLTextAreaElement} */ (form.querySelector('#review-body'));
    const nameInput = /** @type {HTMLInputElement} */ (form.querySelector('#review-name'));
    const emailInput = /** @type {HTMLInputElement} */ (form.querySelector('#review-email'));

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (selectedRating === 0) {
            alert('Please select a rating');
            return;
        }
        
        const reviewData = {
            rating: selectedRating,
            title: titleInput.value.trim(),
            body: bodyInput.value.trim(),
            authorName: nameInput.value.trim(),
            authorEmail: emailInput.value.trim()
        };
        
        if (onSubmit) {
            onSubmit(reviewData);
        }
    });
    
    return form;
}
