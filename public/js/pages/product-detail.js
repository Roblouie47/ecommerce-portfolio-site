import { el, setBodyRoute } from '../utils/dom.js';
import { state } from '../state/index.js';
import { productPlaceholder, getRootEl, notify, renderStarRating } from '../utils/helpers.js';
import { money } from '../utils/currency.js';
import { navigate } from '../router/index.js';
import { addToCart, createFavoriteButton, isFavorite } from '../components/index.js';
import { renderProductReviews, createReviewForm } from '../components/reviews.js';
import { submitReview } from '../api/index.js';

/**
 * Shows the product detail view
 */
export function showProductDetail() {
    const rootEl = getRootEl();
    if (!rootEl) return;
    
    const params = state.routeParams || {};
    const productId = params.id;
    
    if (!productId) {
        navigate('catalog');
        return;
    }
    
    const product = state.productsById.get(productId) || state.productsById.get(String(productId));
    
    if (!product) {
        rootEl.innerHTML = '';
        rootEl.appendChild(el('div', { class: 'not-found' },
            el('h2', {}, 'Product Not Found'),
            el('p', { class: 'muted' }, 'The product you\'re looking for doesn\'t exist.'),
            el('button', { class: 'btn btn-primary', attrs: { 'data-route': 'catalog' } }, 'Back to Shop')
        ));
        rootEl.querySelector('[data-route]')?.addEventListener('click', () => navigate('catalog'));
        return;
    }
    
    setBodyRoute('product');
    state.currentRoute = 'product';
    rootEl.innerHTML = '';
    
    const images = Array.isArray(product.images) ? product.images.filter(Boolean) : [];
    const mainImage = images[0] || product.image || productPlaceholder(600);
    const stock = getProductStock(product);
    const isOutOfStock = stock <= 0;
    
    // Product layout
    const productPage = el('div', { class: 'product-detail' });
    
    // Back button
    productPage.appendChild(el('button', { class: 'back-btn btn btn-outline btn-sm', attrs: { id: 'back-to-catalog' } }, '← Back to Shop'));
    
    // Main content grid
    const mainContent = el('div', { class: 'product-detail-main' });
    
    // Image gallery
    const gallery = el('div', { class: 'product-gallery' },
        el('div', { class: 'product-main-image' },
            el('img', { attrs: { src: mainImage, alt: product.title, id: 'main-product-image' } })
        ),
        images.length > 1 ? el('div', { class: 'product-thumbnails' },
            ...images.map((img, idx) => 
                el('button', { 
                    class: `product-thumbnail ${idx === 0 ? 'active' : ''}`,
                    attrs: { 'data-image': img }
                },
                    el('img', { attrs: { src: img, alt: `${product.title} view ${idx + 1}` } })
                )
            )
        ) : null
    );
    mainContent.appendChild(gallery);
    
    // Product info
    const info = el('div', { class: 'product-info' },
        el('h1', { class: 'product-title' }, product.title),
        el('p', { class: 'product-price' }, money(product.priceCents)),
        isOutOfStock 
            ? el('span', { class: 'stock-badge out-of-stock' }, 'Out of Stock')
            : (stock <= 5 
                ? el('span', { class: 'stock-badge low-stock' }, `Only ${stock} left!`)
                : el('span', { class: 'stock-badge in-stock' }, 'In Stock')
            ),
        product.description ? el('div', { class: 'product-description' },
            el('h3', {}, 'Description'),
            el('p', {}, product.description)
        ) : null,
        product.tags?.length ? el('div', { class: 'product-tags' },
            ...product.tags.map(tag => el('span', { class: 'tag' }, tag))
        ) : null,
        // Quantity selector
        el('div', { class: 'product-quantity' },
            el('label', { attrs: { for: 'quantity-input' } }, 'Quantity'),
            el('div', { class: 'quantity-selector' },
                el('button', { class: 'qty-btn qty-minus', attrs: { type: 'button' } }, '−'),
                el('input', { 
                    attrs: { 
                        type: 'number', 
                        id: 'quantity-input', 
                        value: '1', 
                        min: '1', 
                        max: String(stock || 99) 
                    } 
                }),
                el('button', { class: 'qty-btn qty-plus', attrs: { type: 'button' } }, '+')
            )
        ),
        // Actions
        el('div', { class: 'product-actions' },
            el('button', { 
                class: 'btn btn-primary btn-lg add-to-cart-btn',
                attrs: { disabled: isOutOfStock ? 'true' : null }
            }, 'Add to Cart'),
            createFavoriteButton(product.id, { size: 'lg' })
        ),
        // Shipping info
        product.shippingFeeCents ? el('p', { class: 'shipping-info tiny muted' }, 
            `Shipping: ${money(product.shippingFeeCents)} per item`
        ) : null
    );
    mainContent.appendChild(info);
    
    productPage.appendChild(mainContent);
    
    // Reviews section
    const reviewsSection = el('section', { class: 'product-reviews-section' },
        el('h2', { class: 'section-title' }, 'Customer Reviews'),
        el('div', { class: 'reviews-container', attrs: { id: 'reviews-container' } },
            el('p', { class: 'muted' }, 'Loading reviews...')
        )
    );
    productPage.appendChild(reviewsSection);
    
    // Review form section
    if (state.customer?.sessionToken) {
        const formSection = el('section', { class: 'review-form-section' },
            el('h3', {}, 'Leave a Review'),
            el('div', { attrs: { id: 'review-form-container' } })
        );
        productPage.appendChild(formSection);
        
        const reviewFormContainer = formSection.querySelector('#review-form-container');
        const reviewForm = createReviewForm(product, {
            onSubmit: async (reviewData) => {
                try {
                    await submitReview(product.id, reviewData);
                    notify('Review submitted! It will appear after moderation.', 'success');
                    // Reload reviews
                    const container = document.getElementById('reviews-container');
                    if (container) renderProductReviews(product, container);
                } catch (err) {
                    notify('Failed to submit review: ' + err.message, 'error');
                }
            }
        });
        reviewFormContainer.appendChild(reviewForm);
    }
    
    rootEl.appendChild(productPage);
    
    // Wire up back button
    document.getElementById('back-to-catalog')?.addEventListener('click', () => navigate('catalog'));
    
    // Wire up thumbnail gallery
    const thumbnails = gallery.querySelectorAll('.product-thumbnail');
    const mainImg = /** @type {HTMLImageElement | null} */ (document.getElementById('main-product-image'));
    thumbnails.forEach(thumb => {
        thumb.addEventListener('click', () => {
            thumbnails.forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
            if (mainImg) mainImg.src = thumb.getAttribute('data-image') || '';
        });
    });
    
    // Wire up quantity selector
    const qtyInput = /** @type {HTMLInputElement | null} */ (document.getElementById('quantity-input'));
    const qtyMinus = productPage.querySelector('.qty-minus');
    const qtyPlus = productPage.querySelector('.qty-plus');
    
    qtyMinus?.addEventListener('click', () => {
        if (!qtyInput) return;
        const val = parseInt(qtyInput.value, 10) || 1;
        if (val > 1) qtyInput.value = String(val - 1);
    });
    
    qtyPlus?.addEventListener('click', () => {
        if (!qtyInput) return;
        const val = parseInt(qtyInput.value, 10) || 1;
        const max = parseInt(qtyInput.max, 10) || 99;
        if (val < max) qtyInput.value = String(val + 1);
    });
    
    // Wire up add to cart
    productPage.querySelector('.add-to-cart-btn')?.addEventListener('click', () => {
        if (!isOutOfStock && qtyInput) {
            const qty = parseInt(qtyInput.value, 10) || 1;
            addToCart(product.id, qty);
        }
    });
    
    // Load reviews
    const reviewsContainer = document.getElementById('reviews-container');
    if (reviewsContainer) {
        renderProductReviews(product, reviewsContainer);
    }
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
