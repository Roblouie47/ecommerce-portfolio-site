import { el, setBodyRoute } from '../utils/dom.js';
import { state } from '../state/index.js';
import { productPlaceholder, getRootEl, productStock, renderStarRating } from '../utils/helpers.js';
import { money } from '../utils/currency.js';
import { navigate } from '../router/index.js';
import { addToCart, isFavorite, toggleFavorite, updateFavoriteIcons } from '../components/index.js';

/**
 * Renders the catalog page - matches original app.js design
 */
export function renderCatalog() {
    const rootEl = getRootEl();
    if (!rootEl) return;
    
    setBodyRoute('catalog');
    state.currentRoute = 'catalog';
    rootEl.innerHTML = '';

    const availableProducts = state.products.filter(p => !p.deletedAt);
    const baseProducts = availableProducts.slice();
    const priceValues = baseProducts.map(p => p.priceCents || 0);
    const maxPrice = priceValues.length ? Math.max(...priceValues) : 0;
    const minPrice = 0;

    const page = el('section', { class: 'catalog-page' });
    const header = el('header', { class: 'catalog-page-header' },
        el('div', {},
            el('h1', { class: 'catalog-page-title' }, 'Product Catalog'),
            el('p', { class: 'catalog-page-subtitle muted' }, 'Discover our curated collection of clothes designed for comfort and style.')
        )
    );
    page.appendChild(header);

    const controlsBar = el('div', { class: 'catalog-controls' });
    const searchForm = el('form', { class: 'catalog-search-bar', attrs: { role: 'search' } },
        el('span', { class: 'catalog-search-icon' },
            el('img', {
                attrs: {
                    src: 'https://img.icons8.com/ios/120/search--v1.png',
                    width: '18',
                    height: '18',
                    alt: 'Search icon'
                }
            })
        ),
        el('label', { class: 'sr-only', attrs: { for: 'catalog-search-input' } }, 'Search products'),
        el('input', {
            class: 'catalog-search-input',
            attrs: {
                id: 'catalog-search-input',
                type: 'search',
                placeholder: 'Search products…',
                autocomplete: 'off'
            }
        })
    );
    controlsBar.appendChild(searchForm);

    const actionsGroup = el('div', { class: 'catalog-actions-group' },
        el('label', { class: 'catalog-sort-label', attrs: { for: 'catalog-sort-select' } }, 'Sort by'),
        el('select', { class: 'catalog-sort-select', attrs: { id: 'catalog-sort-select' } },
            el('option', { attrs: { value: 'recommended' } }, 'Recommended'),
            el('option', { attrs: { value: 'price-asc' } }, 'Price: Low to High'),
            el('option', { attrs: { value: 'price-desc' } }, 'Price: High to Low'),
            el('option', { attrs: { value: 'newest' } }, 'Newest Arrivals')
        )
    );
    controlsBar.appendChild(actionsGroup);
    page.appendChild(controlsBar);

    const metaRow = el('div', { class: 'catalog-meta-row' });
    const resultCountEl = el('span', { class: 'catalog-result-count muted' }, '');
    metaRow.appendChild(resultCountEl);
    page.appendChild(metaRow);

    const layout = el('div', { class: 'catalog-layout' });
    const aside = el('aside', { class: 'catalog-filters' });
    const filterHeader = el('div', { class: 'filters-header' },
        el('h2', {}, 'Filters'),
        el('button', { class: 'filters-clear', attrs: { type: 'button' } }, 'Clear All')
    );
    aside.appendChild(filterHeader);

    const filterContent = el('div', { class: 'filters-content' });

    // Category filter group
    const categoryGroup = el('div', { class: 'filter-group' });
    categoryGroup.appendChild(el('div', { class: 'filter-group-header' },
        el('span', { class: 'filter-title' }, 'Category')
    ));
    const categoryList = el('div', { class: 'filter-list' });
    const categoryMap = new Map();
    baseProducts.forEach(p => {
        (Array.isArray(p.tags) ? p.tags : []).forEach(tag => {
            const norm = (tag || '').toString().trim().toLowerCase();
            if (!norm) return;
            const label = norm.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
            if (!categoryMap.has(norm)) categoryMap.set(norm, label);
        });
    });
    let categoryEntries = Array.from(categoryMap.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .slice(0, 8);
    if (!categoryEntries.length) {
        categoryEntries = [
            ['seating', 'Seating'],
            ['lighting', 'Lighting']
        ];
    }
    const categoryCheckboxes = [];
    categoryEntries.forEach(([value, label]) => {
        const checkbox = el('label', { class: 'filter-checkbox' },
            el('input', { attrs: { type: 'checkbox', value } }),
            el('span', {}, label)
        );
        categoryList.appendChild(checkbox);
        categoryCheckboxes.push(/** @type {HTMLInputElement} */ (checkbox.querySelector('input')));
    });
    categoryGroup.appendChild(categoryList);
    filterContent.appendChild(categoryGroup);

    // Price filter group
    const priceGroup = el('div', { class: 'filter-group' },
        el('div', { class: 'filter-group-header' },
            el('span', { class: 'filter-title' }, 'Price Range')
        )
    );
    const sliderWrap = el('div', { class: 'price-slider' });
    const priceValueLabel = el('span', { class: 'price-value tiny muted' }, maxPrice ? `Up to ${money(maxPrice)}` : 'All prices');
    const priceSlider = /** @type {HTMLInputElement} */ (el('input', {
        class: 'price-input',
        attrs: {
            type: 'range',
            min: String(minPrice),
            max: String(maxPrice || 0),
            value: String(maxPrice || 0),
            step: '1000'
        }
    }));
    sliderWrap.appendChild(priceSlider);
    sliderWrap.appendChild(priceValueLabel);
    priceGroup.appendChild(sliderWrap);
    filterContent.appendChild(priceGroup);

    // Rating filter group
    const ratingGroup = el('div', { class: 'filter-group' },
        el('div', { class: 'filter-group-header' },
            el('span', { class: 'filter-title' }, 'Minimum Rating')
        )
    );
    const ratingList = el('div', { class: 'filter-list rating-list' });
    const ratingButtons = [4, 3, 2, 1].map(star => {
        const btn = el('button', {
            class: 'rating-chip',
            attrs: { type: 'button', 'data-rating': String(star) }
        }, `${star}+ stars`);
        ratingList.appendChild(btn);
        return btn;
    });
    ratingGroup.appendChild(ratingList);
    filterContent.appendChild(ratingGroup);

    // Availability filter group
    const availabilityGroup = el('div', { class: 'filter-group' },
        el('div', { class: 'filter-group-header' },
            el('span', { class: 'filter-title' }, 'Availability')
        )
    );
    const inStockToggle = el('label', { class: 'filter-checkbox' },
        el('input', { attrs: { type: 'checkbox', id: 'filter-in-stock' } }),
        el('span', {}, 'In stock only')
    );
    availabilityGroup.appendChild(inStockToggle);
    filterContent.appendChild(availabilityGroup);

    aside.appendChild(filterContent);
    layout.appendChild(aside);

    const productsWrap = el('section', { class: 'catalog-products' });
    const grid = el('div', { class: 'catalog-grid' });
    productsWrap.appendChild(grid);
    layout.appendChild(productsWrap);
    page.appendChild(layout);

    rootEl.appendChild(page);

    let productsShown = baseProducts.slice();
    const filtersState = {
        searchTerm: '',
        categories: new Set(),
        maxPrice: maxPrice || 0,
        minRating: 0,
        inStockOnly: false,
        sort: 'recommended'
    };

    function productCategoryLabel(product) {
        const tags = Array.isArray(product.tags) ? product.tags : [];
        if (tags.length) {
            return (tags[0] || '').toString().replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        }
        return 'Collection';
    }

    function productIsNew(product) {
        const createdDate = new Date(product.createdAt || '');
        if (!Number.isFinite(createdDate.getTime())) return false;
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        return createdDate >= oneMonthAgo;
    }

    function productDiscount(product) {
        const compare = product.compareAtPriceCents;
        const price = product.priceCents;
        if (compare && compare > price) {
            const percent = Math.round(((compare - price) / compare) * 100);
            return percent > 0 ? percent : 0;
        }
        const match = (Array.isArray(product.tags) ? product.tags : [])
            .map(t => String(t))
            .find(t => /(\d+)%/.test(t));
        if (match) {
            const num = parseInt(match, 10);
            return Number.isFinite(num) ? num : 0;
        }
        return 0;
    }

    function buildCard(product) {
        const card = el('article', { class: 'catalog-card', attrs: { 'data-id': product.id } });
        const badges = el('div', { class: 'catalog-card-badges' });
        if (productIsNew(product)) badges.appendChild(el('span', { class: 'catalog-badge badge-new' }, 'New'));
        const discount = productDiscount(product);
        if (discount > 0) badges.appendChild(el('span', { class: 'catalog-badge badge-sale' }, `-${discount}%`));

        const favActive = isFavorite(product.id);
        const favButton = el('button', {
            class: 'catalog-card-fav' + (favActive ? ' active' : ''),
            attrs: {
                type: 'button',
                'data-fav': product.id,
                'aria-pressed': favActive ? 'true' : 'false',
                title: favActive ? 'Remove from favorites' : 'Add to favorites'
            }
        }, favActive ? '♥' : '♡');

        const media = el('div', { class: 'catalog-card-media' },
            el('img', {
                attrs: {
                    src: (Array.isArray(product.images) && product.images[0]) || productPlaceholder(720),
                    alt: product.title || 'Product photo',
                    loading: 'lazy'
                }
            }),
            badges,
            favButton
        );
        card.appendChild(media);

        const body = el('div', { class: 'catalog-card-body' });
        body.appendChild(el('span', { class: 'catalog-card-category tiny muted' }, productCategoryLabel(product)));
        body.appendChild(el('h3', { class: 'catalog-card-title' }, product.title || 'Product'));

        if (product.reviewSummary && product.reviewSummary.count > 0) {
            const rating = renderStarRating(product.reviewSummary.average, product.reviewSummary.count, { size: 'sm' });
            rating.classList.add('catalog-card-rating');
            body.appendChild(rating);
        }

        const priceWrap = el('div', { class: 'catalog-card-pricing' },
            el('span', { class: 'catalog-card-price', attrs: { 'data-price-cents': product.priceCents } }, money(product.priceCents))
        );
        if (product.compareAtPriceCents && product.compareAtPriceCents > product.priceCents) {
            priceWrap.appendChild(el('span', { class: 'catalog-card-price-compare' }, money(product.compareAtPriceCents)));
        }
        body.appendChild(priceWrap);

        const footer = el('div', { class: 'catalog-card-footer' },
            el('button', {
                class: 'catalog-card-add',
                attrs: { type: 'button', 'data-add': product.id }
            }, 'Add to Cart'),
            el('button', {
                class: 'catalog-card-view',
                attrs: { type: 'button', 'data-view-id': product.id }
            }, 'View Details')
        );
        body.appendChild(footer);

        card.appendChild(body);
        return card;
    }

    function renderItems() {
        grid.innerHTML = '';
        if (!productsShown.length) {
            grid.classList.add('is-empty');
            grid.appendChild(el('div', { class: 'catalog-empty-state' }, 'No products match your filters right now.'));
        } else {
            grid.classList.remove('is-empty');
            productsShown.forEach(p => grid.appendChild(buildCard(p)));
        }
        updateFavoriteIcons(page);
        const count = productsShown.length;
        resultCountEl.textContent = count === 1 ? '1 product found' : `${count} products found`;
    }

    function applyFilters() {
        const term = filtersState.searchTerm.toLowerCase();
        const activeCategories = filtersState.categories;
        const maxPriceCents = filtersState.maxPrice || maxPrice;
        const minRating = filtersState.minRating;
        const inStockOnly = filtersState.inStockOnly;

        let filtered = baseProducts.filter(product => {
            if (term) {
                const title = (product.title || '').toLowerCase();
                const desc = (product.description || '').toLowerCase();
                const tags = Array.isArray(product.tags) ? product.tags : [];
                if (!title.includes(term) && !desc.includes(term) && !tags.some(t => (t || '').toLowerCase().includes(term))) {
                    return false;
                }
            }
            if (activeCategories.size) {
                const tags = new Set((Array.isArray(product.tags) ? product.tags : []).map(t => (t || '').toLowerCase()));
                if (!Array.from(activeCategories).some(cat => tags.has(cat))) return false;
            }
            if (maxPriceCents && product.priceCents != null && product.priceCents > maxPriceCents) return false;
            if (minRating > 0) {
                const avg = product.reviewSummary && product.reviewSummary.count > 0 ? product.reviewSummary.average : 0;
                if (!avg || avg < minRating) return false;
            }
            if (inStockOnly && productStock(product) <= 0) return false;
            return true;
        });

        const sortKey = filtersState.sort;
        const collator = new Intl.Collator('en');
        filtered.sort((a, b) => {
            if (sortKey === 'price-asc') return (a.priceCents || 0) - (b.priceCents || 0);
            if (sortKey === 'price-desc') return (b.priceCents || 0) - (a.priceCents || 0);
            if (sortKey === 'newest') {
                const aDate = new Date(a.createdAt || 0).getTime();
                const bDate = new Date(b.createdAt || 0).getTime();
                return (Number.isFinite(bDate) ? bDate : 0) - (Number.isFinite(aDate) ? aDate : 0);
            }
            // Recommended: score by newness and rating
            const aScore = (productIsNew(a) ? 1000 : 0) + ((a.reviewSummary?.average || 0) * 10);
            const bScore = (productIsNew(b) ? 1000 : 0) + ((b.reviewSummary?.average || 0) * 10);
            if (bScore !== aScore) return bScore - aScore;
            return collator.compare(a.title || '', b.title || '');
        });

        productsShown = filtered;
        renderItems();
    }

    // Event delegation for grid
    grid.addEventListener('click', event => {
        const target = /** @type {HTMLElement} */ (event.target);
        const favBtn = target.closest('[data-fav]');
        if (favBtn) {
            event.preventDefault();
            toggleFavorite(favBtn.getAttribute('data-fav'));
            updateFavoriteIcons(page);
            return;
        }
        const addBtn = target.closest('[data-add]');
        if (addBtn) {
            addToCart(addBtn.getAttribute('data-add'), 1);
            return;
        }
        const viewBtn = target.closest('[data-view-id]');
        if (viewBtn) {
            navigate('product', { id: viewBtn.getAttribute('data-view-id') });
        }
    });

    // Search form
    const searchInput = /** @type {HTMLInputElement} */ (searchForm.querySelector('input[type="search"]'));
    searchForm.addEventListener('submit', event => {
        event.preventDefault();
        filtersState.searchTerm = searchInput.value || '';
        applyFilters();
    });
    searchInput.addEventListener('input', () => {
        filtersState.searchTerm = searchInput.value || '';
        if (!filtersState.searchTerm.trim()) applyFilters();
    });

    // Category checkboxes
    categoryCheckboxes.forEach(inputEl => {
        inputEl.addEventListener('change', () => {
            const value = (inputEl.value || '').toLowerCase();
            if (!value) return;
            if (inputEl.checked) filtersState.categories.add(value); else filtersState.categories.delete(value);
            applyFilters();
        });
    });

    // Price slider
    if (maxPrice) {
        priceSlider.addEventListener('input', () => {
            const val = parseInt(priceSlider.value, 10);
            if (Number.isFinite(val)) {
                filtersState.maxPrice = val;
                priceValueLabel.textContent = `Up to ${money(val)}`;
                applyFilters();
            }
        });
    } else {
        priceSlider.disabled = true;
        priceValueLabel.textContent = 'All prices';
    }

    // Rating buttons
    ratingButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const rating = parseInt(btn.getAttribute('data-rating') || '0', 10) || 0;
            filtersState.minRating = filtersState.minRating === rating ? 0 : rating;
            ratingButtons.forEach(b => b.classList.toggle('active', parseInt(b.getAttribute('data-rating') || '0', 10) === filtersState.minRating));
            applyFilters();
        });
    });

    // In-stock checkbox
    const inStockInput = /** @type {HTMLInputElement} */ (inStockToggle.querySelector('input'));
    inStockInput.addEventListener('change', () => {
        filtersState.inStockOnly = !!inStockInput.checked;
        applyFilters();
    });

    // Sort select
    const sortSelect = /** @type {HTMLSelectElement} */ (actionsGroup.querySelector('select'));
    sortSelect.addEventListener('change', () => {
        filtersState.sort = sortSelect.value;
        applyFilters();
    });

    // Clear all filters
    const clearAllBtn = /** @type {HTMLButtonElement} */ (filterHeader.querySelector('.filters-clear'));
    clearAllBtn.addEventListener('click', () => {
        filtersState.searchTerm = '';
        filtersState.categories.clear();
        filtersState.maxPrice = maxPrice || 0;
        filtersState.minRating = 0;
        filtersState.inStockOnly = false;
        filtersState.sort = 'recommended';
        searchInput.value = '';
        categoryCheckboxes.forEach(cb => { cb.checked = false; });
        if (!priceSlider.disabled) priceSlider.value = String(maxPrice || 0);
        priceValueLabel.textContent = maxPrice ? `Up to ${money(maxPrice)}` : 'All prices';
        ratingButtons.forEach(b => b.classList.remove('active'));
        inStockInput.checked = false;
        sortSelect.value = 'recommended';
        applyFilters();
    });

    // Apply pending search term
    if (state.pendingCatalogSearchTerm) {
        const term = state.pendingCatalogSearchTerm;
        state.pendingCatalogSearchTerm = '';
        searchInput.value = term;
        filtersState.searchTerm = term;
    }

    applyFilters();
}
