import { el, setBodyRoute } from '../utils/dom.js';
import { state } from '../state/index.js';
import { productPlaceholder, getRootEl, productStock } from '../utils/helpers.js';
import { money } from '../utils/currency.js';
import { navigate } from '../router/index.js';
import { addToCart, isFavorite, toggleFavorite, updateFavoriteIcons } from '../components/index.js';

/**
 * Renders the favorites page - matches original app.js design
 */
export function renderFavorites() {
    const rootEl = getRootEl();
    if (!rootEl) return;
    
    setBodyRoute('favorites');
    state.currentRoute = 'favorites';
    rootEl.innerHTML = '';
    
    const layout = el('div', { class: 'favorites-layout' });

    const storeName = (state.meta?.storeName || '').trim();
    let storedProfile = null;
    try { storedProfile = JSON.parse(localStorage.getItem('customerProfile') || 'null'); } catch { storedProfile = null; }
    const shopperName = (localStorage.getItem('shopperName') || storeName || '').trim();
    const customerProfile = state.customer || storedProfile || null;
    const displayName = (customerProfile?.name || customerProfile?.email || shopperName || 'Guest Shopper').trim();

    const content = el('section', { class: 'favorites-content' });
    const header = el('div', { class: 'favorites-header' },
        el('div', { class: 'favorites-header-copy' },
            el('h1', { class: 'favorites-title' }, 'Favorites'),
            el('p', { class: 'favorites-subtitle' }, `Hey ${displayName}, here are the products you saved for later.`)
        )
    );
    const searchWrap = el('div', { class: 'favorites-search' },
        el('input', { class: 'favorites-search-input', attrs: { type: 'search', placeholder: 'Search favorites…', id: 'favorites-search' } })
    );
    header.appendChild(searchWrap);
    content.appendChild(header);

    const grid = el('div', { class: 'favorites-grid', attrs: { id: 'favorites-grid' } });
    content.appendChild(grid);

    layout.appendChild(content);
    rootEl.appendChild(layout);

    function currentFavorites() {
        return state.favorites
            .map(id => state.productsById.get(String(id)))
            .filter(p => !!p && !p.deletedAt);
    }

    function renderGrid(list) {
        grid.innerHTML = '';
        if (!list.length) {
            grid.appendChild(el('div', { class: 'favorites-empty' },
                el('h3', {}, 'No favorites yet'),
                el('p', { class: 'muted' }, 'Browse the catalog and tap the heart icon to save products you love.'),
                el('button', { class: 'btn btn-outline', attrs: { 'data-route': 'catalog' } }, 'Back to Catalog')
            ));
            return;
        }
        list.forEach(p => {
            const card = el('article', { class: 'favorite-card', attrs: { 'data-id': p.id } },
                el('div', { class: 'favorite-card-img' },
                    el('img', { attrs: { src: p.images[0] || productPlaceholder(640), alt: p.title, loading: 'lazy' } })
                ),
                el('button', { class: 'favorite-card-heart', attrs: { type: 'button', 'data-fav': p.id, 'aria-pressed': isFavorite(p.id) ? 'true' : 'false' } }, '♥'),
                el('div', { class: 'favorite-card-body' },
                    el('h3', { class: 'favorite-card-title' }, p.title),
                    el('div', { class: 'favorite-card-meta' },
                        el('span', { class: 'favorite-card-price' }, money(p.priceCents)),
                        el('span', { class: 'favorite-card-stock' }, `Stock: ${productStock(p)}`)
                    ),
                    p.tags && p.tags.length ? el('div', { class: 'favorite-card-tags' }, ...p.tags.slice(0, 3).map(tag => el('span', { class: 'favorite-card-tag' }, tag))) : null,
                    el('div', { class: 'favorite-card-actions' },
                        el('button', { class: 'btn-fav-buy', attrs: { type: 'button', 'data-buy': p.id } }, 'Buy'),
                        el('button', { class: 'btn-fav-secondary', attrs: { type: 'button', 'data-view-id': p.id } }, 'View')
                    )
                )
            );
            grid.appendChild(card);
        });
        updateFavoriteIcons(grid);
    }

    const searchInput = /** @type {HTMLInputElement | null} */ (searchWrap.querySelector('input'));
    function applyFilter() {
        const term = (searchInput?.value || '').toLowerCase().trim();
        let list = currentFavorites();
        if (term) {
            list = list.filter(p => (
                p.title.toLowerCase().includes(term) ||
                (p.tags || []).some(tag => tag.toLowerCase().includes(term)) ||
                (p.description || '').toLowerCase().includes(term)
            ));
        }
        renderGrid(list);
    }

    applyFilter();

    content.addEventListener('click', e => {
        const target = /** @type {HTMLElement} */ (e.target);
        const favBtn = target.closest('[data-fav]');
        if (favBtn) {
            e.preventDefault();
            toggleFavorite(favBtn.getAttribute('data-fav'));
            applyFilter();
            return;
        }
        const buyBtn = target.closest('[data-buy]');
        if (buyBtn) {
            addToCart(buyBtn.getAttribute('data-buy'), 1);
            return;
        }
        const viewBtn = target.closest('[data-view-id]');
        if (viewBtn) {
            navigate('product', { id: viewBtn.getAttribute('data-view-id') });
        }
    });

    content.addEventListener('input', e => {
        if (e.target === searchInput) {
            applyFilter();
        }
    });
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
