import { el } from '../utils/dom.js';
import { renderStarRating } from '../utils/helpers.js';
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
        const summaryData = data.summary || {};
        const totalCount = Number.isFinite(summaryData.count) ? summaryData.count : reviews.length;
        const hasAverage = typeof summaryData.average === 'number' && !Number.isNaN(summaryData.average);
        const avgRating = hasAverage ? summaryData.average : 0;
        const totalQuantity = Number.isFinite(summaryData.totalQuantity) ? summaryData.totalQuantity : 0;
        
        container.innerHTML = '';
        
        // Summary header
        const summary = el('div', { class: 'reviews-summary' },
            el('div', { class: 'reviews-summary-rating' },
                el('span', { class: 'reviews-avg-rating' }, totalCount ? avgRating.toFixed(1) : '—'),
                renderStarRating(totalCount ? avgRating : 0),
                el('span', { class: 'reviews-count muted' }, totalCount ? `${totalCount} review${totalCount !== 1 ? 's' : ''}` : 'No reviews yet'),
                totalQuantity ? el('span', { class: 'reviews-volume tiny muted' }, `${totalQuantity} verified item${totalQuantity === 1 ? '' : 's'}`) : null
            )
        );
        container.appendChild(summary);
        
        // Reviews list
        if (!reviews.length) {
            container.appendChild(el('p', { class: 'muted small reviews-empty' }, 'No reviews yet. Be the first to review!'));
        } else {
            const list = el('div', { class: 'reviews-list' });
            
            for (const review of reviews) {
                const dateSource = review?.publishedAt || review?.createdAt || null;
                let dateLabel = '';
                if (dateSource) {
                    const parsed = new Date(dateSource);
                    if (!Number.isNaN(parsed.getTime())) {
                        dateLabel = parsed.toLocaleDateString();
                    }
                }

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
                        dateLabel
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
    const {
        onSubmit,
        defaultName = '',
        defaultEmail = '',
        defaultRating = 0,
        orderId = null,
        heading = 'Write a Review',
        intro = '',
        lockEmail = false,
        lockName = false
    } = options;

    const productTitle = product?.title || '';
    let selectedRating = Math.max(0, Math.min(5, Math.round(defaultRating || 0)));

    const form = el('form', { class: 'review-form review-modal-form' });
    if (heading) {
        form.appendChild(el('h3', { class: 'review-form-title' }, heading));
    }

    const metaParts = [];
    if (productTitle) metaParts.push(`Reviewing ${productTitle}`);
    if (orderId) metaParts.push(`Order #${String(orderId).slice(0, 12)}`);
    if (metaParts.length) {
        form.appendChild(el('p', { class: 'tiny muted review-form-meta' }, metaParts.join(' • ')));
    }
    if (intro) {
        form.appendChild(el('p', { class: 'tiny muted review-form-intro' }, intro));
    }

    const ratingLabels = {
        1: 'Terrible',
        2: 'Poor',
        3: 'Okay',
        4: 'Great',
        5: 'Outstanding'
    };

    const ratingContainer = el('div', {
        class: 'rating-star-options',
        attrs: { id: 'review-rating', role: 'radiogroup', tabindex: '0' }
    },
        ...[1, 2, 3, 4, 5].map(n => el('button', {
            class: 'rating-star-btn',
            attrs: {
                type: 'button',
                'data-rating': n,
                'aria-label': `${n} star${n === 1 ? '' : 's'}`
            }
        },
            el('span', { class: 'rating-star-icon' }, '★')
        ))
    );
    const ratingCaption = el('span', { class: 'rating-caption', attrs: { 'aria-live': 'polite' } }, 'Select a rating');

    form.appendChild(el('div', { class: 'field rating-field' },
        el('label', { attrs: { for: 'review-rating' } }, 'Rating'),
        ratingContainer,
        ratingCaption
    ));

    const titleInput = /** @type {HTMLInputElement} */ (el('input', { attrs: { id: 'review-title', type: 'text', maxlength: '160', placeholder: 'Add a short headline (optional)' } }));
    const bodyInput = /** @type {HTMLTextAreaElement} */ (el('textarea', { attrs: { id: 'review-body', rows: '4', required: 'true', maxlength: '2000', placeholder: 'What did you love? Anything we could improve?' } }));
    const nameInput = /** @type {HTMLInputElement} */ (el('input', { attrs: { id: 'review-name', type: 'text', required: 'true', autocomplete: 'name' } }));
    const emailInput = /** @type {HTMLInputElement} */ (el('input', { attrs: { id: 'review-email', type: 'email', required: 'true', autocomplete: 'email' } }));

    if (defaultName) nameInput.value = defaultName;
    if (defaultEmail) emailInput.value = defaultEmail;
    if (lockName) nameInput.setAttribute('readonly', 'true');
    if (lockEmail) emailInput.setAttribute('readonly', 'true');

    form.appendChild(el('div', { class: 'field' },
        el('label', { attrs: { for: 'review-title' } }, 'Title (optional)'),
        titleInput
    ));
    form.appendChild(el('div', { class: 'field' },
        el('label', { attrs: { for: 'review-body' } }, 'Your Review'),
        bodyInput
    ));
    form.appendChild(el('div', { class: 'field' },
        el('label', { attrs: { for: 'review-name' } }, 'Your Name'),
        nameInput
    ));
    form.appendChild(el('div', { class: 'field' },
        el('label', { attrs: { for: 'review-email' } }, 'Email (not displayed)'),
        emailInput
    ));

    const submitBtn = /** @type {HTMLButtonElement} */ (el('button', { class: 'btn btn-primary review-submit-btn', attrs: { type: 'submit' } }, 'Submit Review'));
    const status = el('p', { class: 'review-form-status tiny muted', attrs: { role: 'status' } }, '');
    form.appendChild(submitBtn);
    form.appendChild(status);

    function syncStars() {
        ratingContainer.querySelectorAll('.rating-star-btn').forEach((star, idx) => {
            const active = idx < selectedRating;
            star.setAttribute('data-active', active ? 'true' : 'false');
            star.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
        ratingCaption.textContent = selectedRating ? `${selectedRating} star${selectedRating === 1 ? '' : 's'} • ${ratingLabels[selectedRating] || 'Thanks!'}` : 'Select a rating';
    }

    ratingContainer.addEventListener('click', (e) => {
        const btn = /** @type {HTMLElement} */ (e.target).closest('[data-rating]');
        if (!btn) return;
        selectedRating = parseInt(btn.getAttribute('data-rating') || '0', 10);
        syncStars();
    });

    ratingContainer.addEventListener('keydown', (e) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        e.preventDefault();
        if (e.key === 'ArrowRight') selectedRating = Math.min(5, selectedRating + 1 || 1);
        if (e.key === 'ArrowLeft') selectedRating = Math.max(1, selectedRating - 1 || 1);
        syncStars();
    });

    syncStars();

    let submitting = false;

    function setStatus(message, tone = 'info') {
        status.textContent = message || '';
        status.classList.remove('status-error', 'status-success', 'status-info');
        if (!message) return;
        const toneClass = tone === 'error' ? 'status-error' : tone === 'success' ? 'status-success' : 'status-info';
        status.classList.add(toneClass);
    }

    function resetForm() {
        selectedRating = Math.max(0, Math.min(5, Math.round(defaultRating || 0)));
        titleInput.value = '';
        bodyInput.value = '';
        if (!lockName) nameInput.value = defaultName;
        if (!lockEmail) emailInput.value = defaultEmail;
        syncStars();
        setStatus('');
    }

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (submitting) return;

        setStatus('');
        if (!selectedRating) {
            setStatus('Choose a star rating to continue.', 'error');
            return;
        }
        const bodyValue = bodyInput.value.trim();
        if (!bodyValue) {
            setStatus('Tell us a little about your experience.', 'error');
            return;
        }
        const emailValue = emailInput.value.trim();
        if (!emailValue) {
            setStatus('Enter the email used for this order.', 'error');
            return;
        }

        const reviewData = {
            rating: selectedRating,
            title: titleInput.value.trim(),
            body: bodyValue,
            authorName: nameInput.value.trim(),
            authorEmail: emailValue
        };
        if (orderId) reviewData.orderId = orderId;

        submitting = true;
        submitBtn.disabled = true;
        setStatus('Submitting your review…', 'info');

        try {
            if (typeof onSubmit !== 'function') {
                throw new Error('Review submission is unavailable right now.');
            }
            const result = await onSubmit(reviewData);
            const message = result?.message || 'Review submitted! Pending moderation.';
            const tone = result?.tone || 'success';
            const shouldReset = result?.reset !== false;
            const afterSuccess = typeof result?.afterSuccess === 'function' ? result.afterSuccess : null;
            setStatus(message, tone);
            if (shouldReset) resetForm();
            if (afterSuccess) afterSuccess();
        } catch (err) {
            const errorMessage = err?.message || 'Failed to submit review.';
            setStatus(errorMessage, 'error');
        } finally {
            submitting = false;
            submitBtn.disabled = false;
        }
    });

    return form;
}
