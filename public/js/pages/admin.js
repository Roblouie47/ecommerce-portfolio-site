// @ts-nocheck
import { el, setBodyRoute } from '../utils/dom.js';
import { state, getAdminOrders, ensureAnalyticsState, getRefundStatus, formatRefundStatus, describeRefundUsage, REFUND_STATUS_LABELS, getRefundThreadStore } from '../state/index.js';
import { productPlaceholder, getRootEl, getModalRoot, notify, fieldInput, fieldTextArea, renderStarRating, productStock, copyTextToClipboard } from '../utils/helpers.js';
import { money } from '../utils/currency.js';
import { navigate } from '../router/index.js';
import { 
    apiFetch, loadProducts, loadOrdersAdmin, loadDiscounts, loadLowStock, loadAdminReviews,
    loadMerchAnalytics, loadPromoAnalytics, loadRefundMessages, respondToRefund,
    closeRefundCase, reopenRefundCase, moderateReview, createProduct, updateProduct,
    deleteProduct, restoreProduct, destroyProduct, bulkDeleteProducts, bulkRestoreProducts,
    bulkDestroyProducts, payOrder, fulfillOrder, shipOrder, completeOrder, cancelOrder,
    sanitizeCart
} from '../api/index.js';
import { clearAdminAuth } from '../auth/admin.js';
import { showModal } from '../components/modal.js';

// Forward declarations for functions defined later or in other modules
let renderHome = null;
let renderCatalog = null;

// Lazy load home and catalog modules to avoid circular dependencies
async function getRenderHome() {
    if (!renderHome) {
        try {
            const homeModule = await import('./home.js');
            renderHome = homeModule.renderHome;
        } catch { renderHome = () => {}; }
    }
    return renderHome;
}

async function getRenderCatalog() {
    if (!renderCatalog) {
        try {
            const catalogModule = await import('./catalog.js');
            renderCatalog = catalogModule.renderCatalog;
        } catch { renderCatalog = () => {}; }
    }
    return renderCatalog;
}

// Helper to refresh shop views when products change
async function refreshShopViews() {
    if (!['home', 'catalog'].includes(state.currentRoute)) return;
    if (state.currentRoute === 'home') {
        const fn = await getRenderHome();
        if (fn) fn();
    } else if (state.currentRoute === 'catalog') {
        const fn = await getRenderCatalog();
        if (fn) fn();
    }
}

// ============================================
// Analytics Helpers
// ============================================

function clampClientRangeDays(value, fallback = 30) {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed) || parsed < 1) return fallback;
    if (parsed > 90) return 90;
    return parsed;
}

async function hydrateAnalytics({ force = false } = {}) {
    const analyticsState = ensureAnalyticsState();
    const days = analyticsState.rangeDays || 30;
    
    const promises = [];
    if (force || !analyticsState.merch) {
        promises.push(loadMerchAnalytics(days));
    }
    if (force || !analyticsState.promos) {
        promises.push(loadPromoAnalytics(days));
    }
    
    await Promise.all(promises);
    refreshAnalyticsPanel();
}

// ============================================
// Admin Login Modal
// ============================================

function showAdminLoginModal() {
    const modalRoot = getModalRoot();
    if (!modalRoot) return;
    
    showModal(close => {
        const wrap = el('div', { class: 'modal admin-login-modal' });
        wrap.appendChild(el('button', { class: 'modal-close' }, '×'));
        wrap.appendChild(el('h2', {}, 'Admin Login'));
        
        const form = el('form', { class: 'form-grid', attrs: { id: 'admin-login-form' } },
            fieldInput('Email', 'admin-email', 'email'),
            fieldInput('Password', 'admin-password', 'password'),
            el('div', { class: 'field', attrs: { style: 'grid-column:1/-1;' } },
                el('button', { class: 'btn btn-primary', attrs: { type: 'submit' } }, 'Sign In')
            ),
            el('div', { class: 'alert alert-error hidden', attrs: { id: 'admin-login-error' } })
        );
        
        wrap.appendChild(form);
        modalRoot.appendChild(wrap);
        
        wrap.querySelector('.modal-close').addEventListener('click', close);
        
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailInput = form.querySelector('#admin-email');
            const passwordInput = form.querySelector('#admin-password');
            const errorEl = form.querySelector('#admin-login-error');
            
            const email = emailInput.value.trim();
            const password = passwordInput.value;
            
            errorEl.classList.add('hidden');
            
            try {
                const { adminLoginRequest } = await import('../auth/admin.js');
                await adminLoginRequest(email, password);
                close();
                navigate('admin');
            } catch (err) {
                errorEl.textContent = err.message || 'Login failed';
                errorEl.classList.remove('hidden');
            }
        });
    });
}

// ============================================
// Product Modal
// ============================================

function showProductModal(product = null) {
    const modalRoot = getModalRoot();
    if (!modalRoot) return;
    
    showModal(close => {
        const wrap = el('div', { class: 'modal product-modal' });
        wrap.appendChild(el('button', { class: 'modal-close' }, '×'));
        wrap.appendChild(el('h2', {}, product ? `Edit: ${product.title}` : 'New Product'));
        
        let imageList = Array.isArray(product?.images) ? [...product.images].filter(Boolean) : [];
        
        const form = el('form', { class: 'form-grid', attrs: { id: 'product-form' } },
            fieldInput('Title', 'p-title'),
            fieldTextArea('Description', 'p-desc'),
            fieldInput('Price (cents)', 'p-price', 'number'),
            fieldInput('Base Inventory', 'p-inv', 'number'),
            fieldInput('Shipping Fee (cents)', 'p-ship', 'number'),
            fieldInput('Tags (comma-separated)', 'p-tags'),
            el('div', { class: 'field', attrs: { style: 'grid-column:1/-1;' } },
                el('label', {}, 'Images'),
                el('div', { class: 'image-chips', attrs: { id: 'image-chips' } }),
                el('div', { class: 'image-upload-row' },
    el('label', { attrs: { for: 'image-upload' }, class: 'upload-label' }, 'Upload Images'),
    el('input', { 
        attrs: { 
            type: 'file', 
            id: 'image-upload', 
            accept: 'image/*', 
            multiple: true 
        }, 
        class: 'hidden-input' 
    }),
    el('span', { class: 'upload-status muted', attrs: { id: 'upload-status' } }, 'No files selected')
            )
            ),
            el('div', { class: 'field', attrs: { style: 'grid-column:1/-1;' } },
                el('button', { class: 'btn btn-success', attrs: { type: 'submit' } }, product ? 'Save Changes' : 'Create Product'),
                ' ',
                el('button', { class: 'btn btn-outline', attrs: { type: 'button', id: 'cancel-product' } }, 'Cancel')
            ),
            el('div', { class: 'alert alert-error hidden', attrs: { id: 'product-error' } })
        );
        
        wrap.appendChild(form);
        modalRoot.appendChild(wrap);
        
        // Pre-fill if editing
        if (product) {
            const titleInput = form.querySelector('#p-title');
            const descInput = form.querySelector('#p-desc');
            const priceInput = form.querySelector('#p-price');
            const invInput = form.querySelector('#p-inv');
            const shipInput = form.querySelector('#p-ship');
            const tagsInput = form.querySelector('#p-tags');
            
            if (titleInput) titleInput.value = product.title || '';
            if (descInput) descInput.value = product.description || '';
            if (priceInput) priceInput.value = String(product.priceCents || 0);
            if (invInput) invInput.value = String(productStock(product));
            if (shipInput) shipInput.value = String(product.shippingFeeCents || 0);
            if (tagsInput) tagsInput.value = (product.tags || []).join(', ');
        }
        
        // Render image chips
        function renderImageChips() {
            const container = document.getElementById('image-chips');
            if (!container) return;
            container.innerHTML = '';
            
            imageList.forEach((url, idx) => {
                const chip = el('div', { class: 'image-chip' },
                    el('img', { attrs: { src: url, alt: `Image ${idx + 1}` } }),
                    el('button', { class: 'image-chip-remove', attrs: { type: 'button', 'data-idx': String(idx) } }, '×'),
                    idx === 0 ? el('span', { class: 'image-chip-primary tiny' }, 'Primary') : null
                );
                container.appendChild(chip);
            });
            
            if (!imageList.length) {
                container.appendChild(el('span', { class: 'tiny muted' }, 'No images uploaded'));
            }
            
            container.querySelectorAll('.image-chip-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    const idx = parseInt(btn.getAttribute('data-idx'), 10);
                    imageList.splice(idx, 1);
                    renderImageChips();
                });
            });
        }
        renderImageChips();
        
        // Image upload
        document.getElementById('image-upload')?.addEventListener('change', async (e) => {
            const fileInput = e.target;
            const files = Array.from(fileInput.files || []);
            const statusEl = document.getElementById('upload-status');
            
            for (const file of files) {
                if (!file.type.startsWith('image/')) continue;
                
                if (statusEl) statusEl.textContent = 'Uploading...';
                const formData = new FormData();
                formData.append('image', file);
                
                try {
                    const result = await apiFetch('/api/upload/image', { method: 'POST', body: formData });
                    if (result?.url) {
                        imageList.push(result.url);
                        renderImageChips();
                    }
                } catch (err) {
                    notify('Upload failed: ' + err.message, 'error');
                }
            }
            
            if (statusEl) statusEl.textContent = '';
            fileInput.value = '';
        });
        
        // Close handlers
        wrap.querySelector('.modal-close').addEventListener('click', close);
        document.getElementById('cancel-product')?.addEventListener('click', close);
        
        // Submit
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const errorEl = document.getElementById('product-error');
            if (errorEl) errorEl.classList.add('hidden');
            
            const titleInput = form.querySelector('#p-title');
            const descInput = form.querySelector('#p-desc');
            const priceInput = form.querySelector('#p-price');
            const invInput = form.querySelector('#p-inv');
            const shipInput = form.querySelector('#p-ship');
            const tagsInput = form.querySelector('#p-tags');
            
            const payload = {
                title: titleInput?.value?.trim() || '',
                description: descInput?.value?.trim() || '',
                priceCents: parseInt(priceInput?.value, 10) || 0,
                baseInventory: parseInt(invInput?.value, 10) || 0,
                shippingFeeCents: parseInt(shipInput?.value, 10) || 0,
                images: imageList,
                tags: (tagsInput?.value || '').split(',').map(t => t.trim()).filter(Boolean)
            };
            
            if (!payload.title) {
                if (errorEl) {
                    errorEl.textContent = 'Title is required';
                    errorEl.classList.remove('hidden');
                }
                return;
            }
            
            try {
                if (product) {
                    await updateProduct(product.id, payload);
                    notify('Product updated', 'success');
                } else {
                    await createProduct(payload);
                    notify('Product created', 'success');
                }
                close();
                await refreshAdminData();
            } catch (err) {
                if (errorEl) {
                    errorEl.textContent = err.message;
                    errorEl.classList.remove('hidden');
                }
            }
        });
    });
}

// ============================================
// Main Admin Render
// ============================================

export function renderAdmin() {
    const rootEl = getRootEl();
    if (!rootEl) return;
    
    if (!state.admin.user) {
        clearAdminAuth(false);
        navigate('admin-login', {}, { replace: true });
        return;
    }
    
    setBodyRoute('admin');
    state.currentRoute = 'admin';
    rootEl.innerHTML = '';
    const sectionDefs = [
        { key: 'products', label: 'Products' },
        { key: 'orders', label: 'Orders' },
        { key: 'analytics', label: 'Analytics' },
        { key: 'refunds', label: 'Refunds' },
        { key: 'reviews', label: 'Reviews Moderation' },
        { key: 'discounts', label: 'Discounts' },
        { key: 'low-stock', label: 'Low Stock' },
        { key: 'export', label: 'Export / Import' }
    ];
    if (!sectionDefs.some(def => def.key === state.admin.activePanel)) {
        state.admin.activePanel = 'products';
    }

    const panel = el('section', { class: 'panel' },
        el('div', { class: 'panel-header' },
            el('span', {}, 'Admin Panel'),
            el('div', { class: 'inline-fields admin-panel-head' },
                el('button', { class: 'btn btn-small btn-outline', attrs: { id: 'admin-panel-signout' } }, 'Sign Out'),
                el('button', { class: 'btn btn-small', attrs: { id: 'new-product' } }, 'New Product')
            )
        )
    );

    const filterBar = el('div', { class: 'admin-section-filter mt-sm', attrs: { role: 'tablist', 'aria-label': 'Admin sections' } });
    const sectionButtons = [];
    const sectionRefs = new Map();

    function syncAdminSectionFilter() {
        const fallback = sectionDefs[0]?.key || 'products';
        const activeKey = sectionDefs.some(def => def.key === state.admin.activePanel) ? state.admin.activePanel : fallback;
        state.admin.activePanel = activeKey;
        sectionButtons.forEach(btn => {
            const match = btn.getAttribute('data-section') === activeKey;
            btn.classList.toggle('active', match);
            btn.setAttribute('aria-pressed', match ? 'true' : 'false');
        });
        sectionRefs.forEach((node, key) => {
            if (!node) return;
            if (key === activeKey) node.classList.remove('hidden');
            else node.classList.add('hidden');
        });
        if (activeKey === 'analytics') {
            hydrateAnalytics().catch(err => console.warn('analytics hydrate failed', err));
        }
    }

    sectionDefs.forEach(({ key, label }) => {
        const btn = el('button', {
            class: 'admin-section-btn',
            attrs: { type: 'button', 'data-section': key }
        }, label);
        btn.addEventListener('click', () => {
            if (state.admin.activePanel !== key) {
                state.admin.activePanel = key;
                syncAdminSectionFilter();
            }
        });
        filterBar.appendChild(btn);
        sectionButtons.push(btn);
    });
    panel.appendChild(filterBar);
    rootEl.appendChild(panel);
    syncAdminSectionFilter();

    const newBtn = panel.querySelector('#new-product');
    if (newBtn) {
        newBtn.addEventListener('click', () => showProductModal());
    }
    const signOutBtn = panel.querySelector('#admin-panel-signout');
    if (signOutBtn) {
        signOutBtn.addEventListener('click', () => {
            clearAdminAuth(true);
        });
    }
    const analyticsPanel = el('div', { class: 'panel admin-analytics-panel mt-md', attrs: { 'data-admin-section': 'analytics' } },
        el('div', { class: 'panel-header admin-analytics-header' },
            el('span', {}, 'Analytics'),
            el('div', { class: 'inline-fields analytics-controls' },
                (function () {
                    const wrapLabel = el('label', { class: 'analytics-range-select-label tiny', attrs: { for: 'analytics-range-select' } }, 'Range');
                    const sel = el('select', { attrs: { id: 'analytics-range-select' } },
                        el('option', { attrs: { value: '7' } }, '7 days'),
                        el('option', { attrs: { value: '14' } }, '14 days'),
                        el('option', { attrs: { value: '30' } }, '30 days'),
                        el('option', { attrs: { value: '60' } }, '60 days'),
                        el('option', { attrs: { value: '90' } }, '90 days')
                    );
                    wrapLabel.appendChild(sel);
                    return wrapLabel;
                })(),
                el('button', { class: 'btn btn-small btn-outline', attrs: { type: 'button', id: 'analytics-refresh-btn' } }, 'Refresh')
            )
        ),
        el('div', { class: 'analytics-range-label tiny muted', attrs: { id: 'analytics-range-label' } }, 'Merchandising KPIs, inventory alerts, promo lift.'),
        el('div', { class: 'analytics-status tiny', attrs: { id: 'analytics-status' } }),
        el('div', { class: 'analytics-metrics-grid', attrs: { id: 'analytics-metrics-grid' } }),
        el('div', { class: 'analytics-two-col' },
            el('section', { class: 'analytics-card' },
                el('div', { class: 'analytics-card-head' },
                    el('span', { class: 'analytics-card-title' }, 'Top movers'),
                    el('span', { class: 'analytics-card-meta tiny muted', attrs: { id: 'analytics-top-products-meta' } })
                ),
                el('div', { class: 'analytics-card-body analytics-list', attrs: { id: 'analytics-top-products' } })
            ),
            el('section', { class: 'analytics-card' },
                el('div', { class: 'analytics-card-head' },
                    el('span', { class: 'analytics-card-title' }, 'Category mix'),
                    el('span', { class: 'analytics-card-meta tiny muted', attrs: { id: 'analytics-categories-meta' } })
                ),
                el('div', { class: 'analytics-card-body analytics-list', attrs: { id: 'analytics-category-list' } })
            )
        ),
        el('div', { class: 'analytics-two-col' },
            el('section', { class: 'analytics-card' },
                el('div', { class: 'analytics-card-head' },
                    el('span', { class: 'analytics-card-title' }, 'Low stock alerts'),
                    el('span', { class: 'analytics-card-meta tiny muted' }, '≤5 units')
                ),
                el('div', { class: 'analytics-card-body analytics-list', attrs: { id: 'analytics-low-stock' } })
            ),
            el('section', { class: 'analytics-card' },
                el('div', { class: 'analytics-card-head' },
                    el('span', { class: 'analytics-card-title' }, 'Promo top codes'),
                    el('span', { class: 'analytics-card-meta tiny muted', attrs: { id: 'promo-topcodes-meta' } })
                ),
                el('div', { class: 'analytics-card-body analytics-list', attrs: { id: 'promo-top-discounts' } })
            )
        ),
        el('section', { class: 'analytics-card analytics-heatmap-card' },
            el('div', { class: 'analytics-card-head' },
                el('span', { class: 'analytics-card-title' }, 'Promo heatmap'),
                el('span', { class: 'analytics-card-meta tiny muted' }, 'Conversions by hour/day')
            ),
            el('div', { class: 'analytics-heatmap-wrap' },
                el('div', { class: 'promo-heatmap-grid', attrs: { id: 'promo-heatmap-grid' } })
            ),
            el('div', { class: 'promo-timeline', attrs: { id: 'promo-timeline' } })
        )
    );
    rootEl.appendChild(analyticsPanel);
    sectionRefs.set('analytics', analyticsPanel);

    const analyticsRangeSelect = analyticsPanel.querySelector('#analytics-range-select');
    if (analyticsRangeSelect) {
        analyticsRangeSelect.value = String(ensureAnalyticsState().rangeDays || 30);
        analyticsRangeSelect.addEventListener('change', async () => {
            const analyticsState = ensureAnalyticsState();
            analyticsState.rangeDays = clampClientRangeDays(analyticsRangeSelect.value, analyticsState.rangeDays || 30);
            await hydrateAnalytics({ force: true });
        });
    }
    const analyticsRefreshBtn = analyticsPanel.querySelector('#analytics-refresh-btn');
    if (analyticsRefreshBtn) {
        analyticsRefreshBtn.addEventListener('click', async () => {
            analyticsRefreshBtn.disabled = true;
            try {
                await hydrateAnalytics({ force: true });
            } catch (err) {
                console.warn('analytics refresh failed', err);
            } finally {
                analyticsRefreshBtn.disabled = false;
            }
        });
    }

    refreshAnalyticsPanel();

    const prodWrap = el('div', { class: 'panel mt-md', attrs: { 'data-admin-section': 'products' } },
        el('div', { class: 'panel-header' },
            el('span', {}, 'Products'),
            el('div', { class: 'inline-fields', attrs: { style: 'gap:.5rem;align-items:center;' } },
                el('div', { attrs: { style: 'display:inline-flex;gap:.35rem;' } },
                    el('button', { class: 'btn btn-small btn-danger', attrs: { id: 'bulk-delete-btn', disabled: 'true' } }, 'Delete Selected'),
                    el('button', { class: 'btn-restore btn-small btn-warning', attrs: { id: 'bulk-restore-btn', style: 'display:none;', disabled: 'true' } }, 'Restore Selected'),
                    el('button', { class: 'btn btn-small btn-danger', attrs: { id: 'bulk-purge-btn', style: 'display:none;', disabled: 'true' } }, 'Delete Permanently')
                ),
                el('label', { class: 'flex gap-xs align-center admin-show-deleted-toggle', attrs: { for: 'toggle-show-deleted' } },
                    el('input', { attrs: { type: 'checkbox', id: 'toggle-show-deleted' } }),
                    el('span', {}, 'Show Deleted')
                )
            )
        ),
        el('div', { class: 'admin-table-wrapper' }, el('table', { class: 'admin-table', attrs: { id: 'admin-products-table' } }))
    );
    rootEl.appendChild(prodWrap);
    sectionRefs.set('products', prodWrap);
    // Wire show deleted toggle (soft-deleted products)
    const showDeletedCb = prodWrap.querySelector('#toggle-show-deleted');
    if (showDeletedCb) {
        showDeletedCb.checked = !!state.admin.showDeleted;
        if (!showDeletedCb._wired) {
            showDeletedCb._wired = true;
            showDeletedCb.addEventListener('change', async () => {
                state.admin.showDeleted = showDeletedCb.checked;
                localStorage.setItem('adminShowDeleted', state.admin.showDeleted ? '1' : '0');
                refreshAdminTables();
                try {
                    await refreshAdminData();
                } finally {
                    notify(showDeletedCb.checked ? 'Showing deleted products' : 'Hiding deleted products', 'info', 2500);
                }
            });
        }
    }

    const ordersWrap = el('div', { class: 'panel admin-orders-panel mt-md', attrs: { 'data-admin-section': 'orders' } },
        el('div', { class: 'panel-header admin-orders-header' },
            el('div', { class: 'flex flex-col gap-xxs' },
                el('span', { class: 'admin-orders-title' }, 'Orders overview')
            ),
            el('div', { class: 'inline-fields' },
                el('button', { class: 'btn btn-small btn-outline', attrs: { id: 'orders-refresh-btn' } }, 'Refresh')
            )
        ),
        el('div', { class: 'admin-orders-summary', attrs: { id: 'admin-orders-summary' } }),
        el('div', { class: 'admin-orders-board', attrs: { id: 'admin-orders-table' } })
    );
    rootEl.appendChild(ordersWrap);
    sectionRefs.set('orders', ordersWrap);

    if (state.admin.showClosedRefunds === undefined) state.admin.showClosedRefunds = false;
    if (state.admin.refundSearchQuery === undefined) state.admin.refundSearchQuery = '';
    if (state.admin.refundsSort === undefined) state.admin.refundsSort = 'newest';
    if (state.admin.closedRefundsSort === undefined) state.admin.closedRefundsSort = 'closed-newest';

    const refundsPanel = el('div', { class: 'panel admin-refunds-panel mt-md', attrs: { 'data-admin-section': 'refunds' } },
        el('div', { class: 'panel-header admin-refunds-header' },
            el('div', { class: 'flex flex-col gap-xxs' },
                el('span', { class: 'admin-refunds-title' }, 'Refund requests')
            ),
            el('div', { class: 'inline-fields admin-refunds-controls' },
                el('button', { class: 'btn btn-small btn-outline', attrs: { id: 'closed-cases-toggle', type: 'button' } },
                    el('span', { class: 'inline-icon' },
                        el('svg', { attrs: { width: '16', height: '16', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } },
                            el('polyline', { attrs: { points: '3 6 5 6 21 6' } }),
                            el('path', { attrs: { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' } }),
                            el('path', { attrs: { d: 'M10 11v6' } }),
                            el('path', { attrs: { d: 'M14 11v6' } }),
                            el('path', { attrs: { d: 'M9 6l1-2h4l1 2' } })
                        )
                    ),
                    el('span', {}, 'Closed cases')
                ),
                el('button', { class: 'btn btn-small btn-outline', attrs: { id: 'refunds-refresh-btn' } }, 'Refresh')
            )
        ),
        el('div', { class: 'admin-refunds-toolbar' },
            el('div', { class: 'inline-fields admin-refunds-filters' },
                el('input', {
                    class: 'admin-refunds-search',
                    attrs: {
                        type: 'search',
                        id: 'refunds-search-input',
                        placeholder: 'Search order ID',
                        value: state.admin.refundSearchQuery || ''
                    }
                }),
                el('select', {
                    class: 'admin-refunds-sort',
                    attrs: { id: 'refunds-sort-select' }
                },
                    el('option', { attrs: { value: 'newest', selected: state.admin.refundsSort === 'newest' ? 'true' : null } }, 'Newest first'),
                    el('option', { attrs: { value: 'oldest', selected: state.admin.refundsSort === 'oldest' ? 'true' : null } }, 'Oldest first')
                )
            )
        ),
        el('div', { class: 'admin-refunds-summary', attrs: { id: 'admin-refunds-summary' } }),
        el('div', { class: 'admin-refunds-list', attrs: { id: 'admin-refunds-list' } }),
        el('div', { class: 'admin-refunds-closed-block' },
            el('div', { class: 'admin-refunds-closed-head' },
                el('span', { class: 'admin-refunds-title tiny muted' }, 'Closed cases (trash bin)'),
                el('div', { class: 'admin-refunds-closed-tools' },
                    el('label', { class: 'admin-refunds-closed-sort' },
                        el('span', { class: 'tiny muted' }, 'Sort by date/time'),
                        el('select', {
                            class: 'admin-refunds-sort',
                            attrs: { id: 'closed-refunds-sort' }
                        },
                            el('option', { attrs: { value: 'closed-newest', selected: state.admin.closedRefundsSort === 'closed-newest' ? 'true' : null } }, 'Newest closed'),
                            el('option', { attrs: { value: 'closed-oldest', selected: state.admin.closedRefundsSort === 'closed-oldest' ? 'true' : null } }, 'Oldest closed')
                        )
                    ),
                    el('span', { class: 'tiny muted' }, 'Restore to move cases back into the active queue.')
                )
            ),
            el('div', { class: 'admin-refunds-list admin-refunds-list--closed', attrs: { id: 'admin-refunds-closed' } })
        )
    );
    rootEl.appendChild(refundsPanel);
    sectionRefs.set('refunds', refundsPanel);

    const reviewsPanel = el('div', { class: 'panel mt-md', attrs: { 'data-admin-section': 'reviews' } },
        el('div', { class: 'panel-header' },
            el('span', {}, 'Reviews Moderation'),
            el('div', { class: 'inline-fields' },
                el('select', { attrs: { id: 'admin-review-filter' } },
                    el('option', { attrs: { value: 'pending' } }, 'Pending'),
                    el('option', { attrs: { value: 'approved' } }, 'Approved'),
                    el('option', { attrs: { value: 'rejected' } }, 'Rejected')
                ),
                el('button', { class: 'btn btn-small btn-outline', attrs: { id: 'admin-reviews-refresh' } }, 'Refresh')
            )
        ),
        el('div', { class: 'admin-table-wrapper' }, el('table', { class: 'admin-table', attrs: { id: 'admin-reviews-table' } }))
    );
    rootEl.appendChild(reviewsPanel);
    sectionRefs.set('reviews', reviewsPanel);

    const reviewFilter = reviewsPanel.querySelector('#admin-review-filter');
    if (reviewFilter) {
        reviewFilter.value = state.admin.reviews.status || 'pending';
        if (!reviewFilter._wired) {
            reviewFilter._wired = true;
            reviewFilter.addEventListener('change', async () => {
                state.admin.reviews.status = reviewFilter.value;
                await loadAdminReviews(reviewFilter.value);
                refreshAdminReviewsTable();
            });
        }
    }
    const reviewRefreshBtn = reviewsPanel.querySelector('#admin-reviews-refresh');
    if (reviewRefreshBtn && !reviewRefreshBtn._wired) {
        reviewRefreshBtn._wired = true;
        reviewRefreshBtn.addEventListener('click', async () => {
            await loadAdminReviews(state.admin.reviews.status || 'pending');
            refreshAdminReviewsTable();
            notify('Review queue refreshed', 'info', 2000);
        });
    }

    const discountPanel = el('div', { class: 'panel mt-md', attrs: { 'data-admin-section': 'discounts' } },
        el('div', { class: 'panel-header' }, el('span', {}, 'Discounts'), el('div', { class: 'inline-fields' }, el('button', { class: 'btn btn-small btn-outline', attrs: { id: 'new-discount-btn' } }, 'New'))),
        el('div', { class: 'admin-table-wrapper' }, el('table', { class: 'admin-table', attrs: { id: 'admin-discounts-table' } }))
    );
    rootEl.appendChild(discountPanel);
    sectionRefs.set('discounts', discountPanel);

    const lowStockPanel = el('div', { class: 'panel mt-md', attrs: { 'data-admin-section': 'low-stock' } },
        el('div', { class: 'panel-header' }, el('span', {}, 'Low Stock'), el('div', { class: 'inline-fields' }, el('input', { attrs: { id: 'low-stock-threshold', type: 'number', value: '5', min: '1', style: 'width:4rem;' } }), el('button', { class: 'btn btn-small btn-outline', attrs: { id: 'low-stock-refresh' } }, 'Refresh'))),
        el('div', { class: 'admin-table-wrapper' }, el('table', { class: 'admin-table', attrs: { id: 'low-stock-table' } }))
    );
    rootEl.appendChild(lowStockPanel);
    sectionRefs.set('low-stock', lowStockPanel);
    const exportPanel = el('div', { class: 'panel mt-md', attrs: { 'data-admin-section': 'export' } },
        el('div', { class: 'panel-header' }, el('span', {}, 'Export / Import')),
        el('div', { class: 'flex flex-col gap-sm p-sm' },
            el('div', {}, el('a', { attrs: { href: '/api/export/products.csv', target: '_blank' } }, 'Download Products CSV'), ' | ', el('a', { attrs: { href: '/api/export/orders.csv', target: '_blank' } }, 'Download Orders CSV')),
            el('form', { attrs: { id: 'import-products-form', enctype: 'multipart/form-data' }, class: 'flex gap-sm align-center' },
                el('input', { attrs: { type: 'file', id: 'import-products-file', accept: '.csv' } }),
                el('button', { class: 'btn btn-small', attrs: { type: 'submit' } }, 'Import Products CSV')
            ),
            el('div', { class: 'muted small' }, 'Import CSV columns required: title,description,priceCents,baseInventory,images (| separated),tags (| separated)')
        )
    );
    rootEl.appendChild(exportPanel);
    sectionRefs.set('export', exportPanel);

    syncAdminSectionFilter();

    // Initial data load (products + orders) then tables
    (async () => { await refreshAdminData(); })();
}

// ============================================
// Refresh Admin Tables (Part 1 - Products)
// ============================================

function refreshAdminTables() {
    // Products table
    const pt = document.getElementById('admin-products-table');
    const buildProductActionsCell = (product, deletedView) => {
        const editBtn = el('button', { class: 'btn btn-compact btn-outline', attrs: { 'data-edit': product.id } }, 'Edit');
        const stackClass = deletedView ? 'admin-actions-stack admin-actions-stack--restore' : 'admin-actions-stack';
        const actions = [editBtn];
        if (deletedView) {
            actions.push(
                el('button', { class: 'btn btn-compact btn-success', attrs: { 'data-restore': product.id } }, 'Restore'),
                el('button', { class: 'btn btn-compact btn-danger', attrs: { 'data-destroy': product.id } }, 'Delete Permanently')
            );
        } else {
            actions.push(el('button', { class: 'btn btn-compact btn-danger', attrs: { 'data-del': product.id } }, 'Delete'));
        }
        return el('td', { class: 'admin-actions-cell' },
            el('div', { class: stackClass }, ...actions)
        );
    };
    if (pt) {
        pt.innerHTML = `
            <thead>
                <tr>
                    <th><input type="checkbox" id="select-all-products" /></th>
                    <th>Title</th>
                    <th>Price</th>
                    <th>Inv</th>
                    <th>Updated</th>
                    <th>Tags</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        const tbody = pt.querySelector('tbody');
        const showDeletedMode = !!state.admin.showDeleted;
        for (const p of state.products) {
            // When showDeletedMode is true, show only deleted products (history). Otherwise only active.
            if (showDeletedMode) { if (!p.deletedAt) continue; } else { if (p.deletedAt) continue; }
            const tr = el('tr', {},
                el('td', {}, el('input', { attrs: { type: 'checkbox', 'data-select-id': p.id } })),
                el('td', {}, p.title, (p.deletedAt ? [' ', el('span', { class: 'tag', attrs: { style: 'background:#722;' } }, 'deleted')] : [])),
                el('td', {}, money(p.priceCents)),
                el('td', {}, String(productStock(p))),
                el('td', {}, new Date(p.updatedAt).toLocaleString()),
                el('td', {}, (p.tags || []).join(', ')),
                buildProductActionsCell(p, showDeletedMode)
            );
            if (p.deletedAt) tr.style.opacity = showDeletedMode ? '' : '0.55';
            tbody.appendChild(tr);
        }
        const bulkBtn = document.getElementById('bulk-delete-btn');
        const restoreBtn = document.getElementById('bulk-restore-btn');
        const purgeBtn = document.getElementById('bulk-purge-btn');
        const getTableBody = () => pt.querySelector('tbody');
        const getRowCheckboxes = () => Array.from(getTableBody()?.querySelectorAll('input[data-select-id]') || []);
        function updateSelectionButtons() {
            const selected = getRowCheckboxes().filter(cb => cb.checked).length;
            const label = selected > 0 ? `Delete Selected (${selected})` : 'Delete Selected';
            if (bulkBtn) {
                bulkBtn.textContent = label;
                if (!state.admin.showDeleted && selected > 0) bulkBtn.removeAttribute('disabled'); else bulkBtn.setAttribute('disabled', 'true');
            }
            if (restoreBtn) {
                const restoreLabel = selected > 0 ? `Restore Selected (${selected})` : 'Restore Selected';
                restoreBtn.textContent = restoreLabel;
                if (state.admin.showDeleted && selected > 0) restoreBtn.removeAttribute('disabled'); else restoreBtn.setAttribute('disabled', 'true');
            }
            if (purgeBtn) {
                const purgeLabel = selected > 0 ? `Delete Permanently (${selected})` : 'Delete Permanently';
                purgeBtn.textContent = purgeLabel;
                if (state.admin.showDeleted && selected > 0) purgeBtn.removeAttribute('disabled'); else purgeBtn.setAttribute('disabled', 'true');
            }
        }
        // Toggle button visibility depending on view mode
        if (bulkBtn) bulkBtn.style.display = state.admin.showDeleted ? 'none' : '';
        if (restoreBtn) restoreBtn.style.display = state.admin.showDeleted ? '' : 'none';
        if (purgeBtn) purgeBtn.style.display = state.admin.showDeleted ? '' : 'none';
        if (!pt._wired) {
            pt._wired = true;
            pt.addEventListener('change', (e) => {
                if (e.target.id === 'select-all-products') {
                    const checked = e.target.checked;
                    getRowCheckboxes().forEach(cb => cb.checked = checked);
                    updateSelectionButtons();
                } else if (e.target.hasAttribute('data-select-id')) { updateSelectionButtons(); }
            });
            if (bulkBtn && !bulkBtn._bulkSoftWired) {
                bulkBtn._bulkSoftWired = true;
                bulkBtn.addEventListener('click', async () => {
                    const ids = getRowCheckboxes().filter(cb => cb.checked).map(cb => cb.getAttribute('data-select-id'));
                    if (!ids.length) return; if (!confirm(`Delete ${ids.length} product(s)?`)) return;
                    const now = new Date().toISOString();
                    const previous = ids.map(id => ({ id, prev: state.productsById.get(id)?.deletedAt || null }));
                    // Optimistic: mark deleted & re-render immediately
                    ids.forEach(id => { const p = state.productsById.get(id); if (p) p.deletedAt = now; });
                    // Store snapshots in deletedBuffer
                    ids.forEach(id => { const p = state.productsById.get(id); if (p) state.deletedBuffer.set(id, { ...p }); });
                    refreshAdminTables();
                    // Immediately refresh shop views so items disappear there too
                    await refreshShopViews();
                    sanitizeCart();
                    try {
                        await bulkDeleteProducts(ids);
                        notify('Deleted ' + ids.length + ' products', 'success', 6000);
                        refreshAdminData(); // background sync
                    } catch (err) {
                        // Revert optimistic change
                        previous.forEach(({ id, prev }) => { const p = state.productsById.get(id); if (p) p.deletedAt = prev; });
                        refreshAdminTables();
                        notify('Bulk delete failed: ' + err.message, 'error');
                    }
                });
            }
            if (restoreBtn && !restoreBtn._bulkRestoreWired) {
                restoreBtn._bulkRestoreWired = true;
                restoreBtn.addEventListener('click', async () => {
                    const ids = getRowCheckboxes().filter(cb => cb.checked).map(cb => cb.getAttribute('data-select-id'));
                    if (!ids.length) return;
                    const originalText = restoreBtn.textContent;
                    restoreBtn.textContent = 'Restoring…';
                    restoreBtn.setAttribute('disabled', 'true');
                    try {
                        await bulkRestoreProducts(ids);
                        ids.forEach(id => {
                            const prod = state.productsById.get(id) || state.deletedBuffer.get(id);
                            if (prod) {
                                prod.deletedAt = null;
                                state.deletedBuffer.delete(id);
                            }
                        });
                        getRowCheckboxes().forEach(cb => cb.checked = false);
                        refreshAdminTables();
                        await refreshShopViews();
                        notify('Restored ' + ids.length + ' product' + (ids.length === 1 ? '' : 's'), 'success', 4000);
                        await refreshAdminData();
                    } catch (err) {
                        notify('Bulk restore failed: ' + err.message, 'error');
                    } finally {
                        restoreBtn.textContent = originalText;
                        restoreBtn.removeAttribute('disabled');
                        updateSelectionButtons();
                    }
                });
            }
            if (purgeBtn && !purgeBtn._bulkPurgeWired) {
                purgeBtn._bulkPurgeWired = true;
                purgeBtn.addEventListener('click', async () => {
                    const ids = getRowCheckboxes().filter(cb => cb.checked).map(cb => cb.getAttribute('data-select-id'));
                    if (!ids.length) return;
                    if (!confirm(`Permanently delete ${ids.length} product(s)? This cannot be undone.`)) return;
                    const originalText = purgeBtn.textContent;
                    purgeBtn.textContent = 'Deleting…';
                    purgeBtn.setAttribute('disabled', 'true');
                    const productsArray = Array.isArray(state.products) ? state.products : null;
                    const snapshots = new Map();
                    ids.forEach(id => {
                        const product = state.productsById.get(id) || state.deletedBuffer.get(id);
                        const index = productsArray ? productsArray.findIndex(p => p.id === id) : -1;
                        if (product) snapshots.set(id, { product: { ...product }, index });
                        if (productsArray && index >= 0) {
                            productsArray.splice(index, 1);
                        }
                        state.productsById.delete(id);
                        state.deletedBuffer.delete(id);
                    });
                    refreshAdminTables();
                    const restoreSnapshot = (id) => {
                        const snap = snapshots.get(id);
                        if (!snap) return;
                        const { product, index } = snap;
                        if (productsArray) {
                            const insertIdx = index >= 0 && index <= productsArray.length ? index : productsArray.length;
                            productsArray.splice(insertIdx, 0, product);
                        } else if (Array.isArray(state.products)) {
                            state.products.push(product);
                        } else {
                            state.products = [product];
                        }
                        state.productsById.set(id, product);
                        if (product.deletedAt) state.deletedBuffer.set(id, { ...product });
                    };
                    const sequentialFallback = async (targetIds) => {
                        const success = [];
                        const failed = [];
                        const failureMessages = [];
                        let missingRouteOnly = true;
                        for (const id of targetIds) {
                            try {
                                await destroyProduct(id);
                                success.push(id);
                            } catch (err) {
                                const msg = err?.message || '';
                                const isMissingRoute = err?.status === 404 && !/not found/i.test(msg);
                                if (/not found/i.test(msg)) {
                                    success.push(id); // already gone server-side
                                } else {
                                    failed.push(id);
                                    failureMessages.push(msg || 'Unknown error');
                                    if (!isMissingRoute) missingRouteOnly = false;
                                }
                            }
                        }
                        if (failed.length === targetIds.length) {
                            const error = new Error(missingRouteOnly ? 'Server missing permanent delete endpoint. Restart backend to load latest routes.' : `Unable to permanently delete selected products (${failureMessages[0] || 'see console'})`);
                            error.code = missingRouteOnly ? 'missing-perma-endpoint' : undefined;
                            throw error;
                        }
                        return { ids: success, skipped: failed };
                    };
                    try {
                        let result;
                        let fallbackUsed = false;
                        try {
                            result = await bulkDestroyProducts(ids);
                        } catch (err) {
                            const isMissing = err?.status === 404 || /404/.test(err?.message || '');
                            if (isMissing) {
                                fallbackUsed = true;
                                result = await sequentialFallback(ids);
                            } else {
                                throw err;
                            }
                        }
                        const deletedIds = new Set(result?.ids || []);
                        const skipped = Array.isArray(result?.skipped) ? result.skipped.filter(Boolean) : [];
                        if (skipped.length) {
                            skipped.forEach(restoreSnapshot);
                            refreshAdminTables();
                            notify(`Permanently deleted ${deletedIds.size} product(s). ${skipped.length} could not be purged.`, 'warn', 6000);
                        } else {
                            const count = deletedIds.size;
                            notify('Permanently removed ' + count + ' product' + (count === 1 ? '' : 's'), 'success', 5000);
                        }
                        if (fallbackUsed) {
                            notify('Bulk purge endpoint unavailable on server. Used per-item deletes instead.', 'info', 8000);
                        }
                        await refreshAdminData();
                    } catch (err) {
                        ids.forEach(restoreSnapshot);
                        refreshAdminTables();
                        if (err?.code === 'missing-perma-endpoint') {
                            notify('Permanent delete endpoints are missing on the server.', 'error', 8000);
                        } else {
                            notify('Permanent delete failed: ' + err.message, 'error');
                        }
                    } finally {
                        purgeBtn.textContent = originalText;
                        purgeBtn.removeAttribute('disabled');
                        updateSelectionButtons();
                    }
                });
            }
            // Single product actions (edit, delete, restore, destroy)
            pt.addEventListener('click', async (e) => {
                const btnEdit = e.target.closest('[data-edit]');
                const btnDel = e.target.closest('[data-del]');
                const btnRestore = e.target.closest('[data-restore]');
                const btnDestroy = e.target.closest('[data-destroy]');
                if (btnEdit) { showProductModal(state.productsById.get(btnEdit.getAttribute('data-edit'))); }
                else if (btnDel) {
                    const id = btnDel.getAttribute('data-del');
                    if (confirm('Delete product?')) {
                        const prod = state.productsById.get(id);
                        const prevDeleted = prod ? prod.deletedAt : null;
                        if (prod) { prod.deletedAt = new Date().toISOString(); refreshAdminTables(); }
                        // Update shop immediately
                        await refreshShopViews();
                        sanitizeCart();
                        try {
                            await deleteProduct(id);
                            if (prod) state.deletedBuffer.set(id, { ...prod });
                            notify('Deleted product', 'success', 6000);
                            refreshAdminData();
                        } catch (err) {
                            // revert
                            if (prod) { prod.deletedAt = prevDeleted; refreshAdminTables(); }
                            notify(err.message, 'error');
                            state.deletedBuffer.delete(id);
                            await refreshShopViews();
                        }
                    }
                } else if (btnRestore) {
                    const id = btnRestore.getAttribute('data-restore');
                    const prod = state.productsById.get(id);
                    const prevDeleted = prod ? prod.deletedAt : null;
                    if (prod) prod.deletedAt = null; // optimistic restore
                    state.deletedBuffer.delete(id);
                    refreshAdminTables();
                    await refreshShopViews();
                    try {
                        await restoreProduct(id);
                        notify('Restored product', 'success');
                        refreshAdminData();
                    } catch (err) {
                        if (prod) prod.deletedAt = prevDeleted; // revert
                        refreshAdminTables();
                        notify('Restore failed: ' + err.message, 'error');
                        if (prod && prod.deletedAt) state.deletedBuffer.set(id, { ...prod });
                        await refreshShopViews();
                    }
                } else if (btnDestroy) {
                    const id = btnDestroy.getAttribute('data-destroy');
                    if (!id) return;
                    if (!confirm('Permanently delete this product? This cannot be undone.')) return;
                    const productsArray = Array.isArray(state.products) ? state.products : null;
                    const prod = state.productsById.get(id);
                    const index = productsArray ? productsArray.findIndex(p => p.id === id) : -1;
                    const snapshot = prod ? { ...prod } : null;
                    if (productsArray && index >= 0) {
                        productsArray.splice(index, 1);
                    }
                    if (state.productsById?.delete) state.productsById.delete(id);
                    state.deletedBuffer.delete(id);
                    refreshAdminTables();
                    try {
                        await destroyProduct(id);
                        notify('Product permanently removed', 'success', 3500);
                        await refreshAdminData();
                    } catch (err) {
                        if (snapshot) {
                            if (productsArray) {
                                const reinsertionIndex = index >= 0 ? index : productsArray.length;
                                productsArray.splice(reinsertionIndex, 0, snapshot);
                            } else if (!Array.isArray(state.products)) {
                                state.products = [snapshot];
                            }
                            if (state.productsById?.set) state.productsById.set(id, snapshot);
                            if (snapshot.deletedAt) state.deletedBuffer.set(id, { ...snapshot });
                        }
                        refreshAdminTables();
                        notify('Permanent delete failed: ' + err.message, 'error');
                    }
                }
            });
        } else { updateSelectionButtons(); }
    }
    // When viewing deleted products, also inject any pending buffered deletions that might not be in state.products (rare race)
    if (state.admin.showDeleted) {
        const pt2 = document.getElementById('admin-products-table');
        if (pt2) {
            const idsAlready = new Set(Array.from(pt2.querySelectorAll('tbody tr td:nth-child(2)')).map(td => td.textContent.trim()));
            state.deletedBuffer.forEach(bufProd => {
                // If product already listed or actually restored, skip
                if (!bufProd.deletedAt) return;
                if (Array.from(state.productsById.values()).some(p => p.id === bufProd.id && p.deletedAt)) return;
                if (idsAlready.has(bufProd.title)) return;
                const tbody = pt2.querySelector('tbody');
                if (!tbody) return;
                const buildProductActionsCell = (product, deletedView) => {
                    const editBtn = el('button', { class: 'btn btn-compact btn-outline', attrs: { 'data-edit': product.id } }, 'Edit');
                    const stackClass = deletedView ? 'admin-actions-stack admin-actions-stack--restore' : 'admin-actions-stack';
                    const actions = [editBtn];
                    if (deletedView) {
                        actions.push(
                            el('button', { class: 'btn btn-compact btn-success', attrs: { 'data-restore': product.id } }, 'Restore'),
                            el('button', { class: 'btn btn-compact btn-danger', attrs: { 'data-destroy': product.id } }, 'Delete Permanently')
                        );
                    } else {
                        actions.push(el('button', { class: 'btn btn-compact btn-danger', attrs: { 'data-del': product.id } }, 'Delete'));
                    }
                    return el('td', { class: 'admin-actions-cell' },
                        el('div', { class: stackClass }, ...actions)
                    );
                };
                const tr = el('tr', {},
                    el('td', {}, el('input', { attrs: { type: 'checkbox', 'data-select-id': bufProd.id } })),
                    el('td', {}, bufProd.title, [' ', el('span', { class: 'tag', attrs: { style: 'background:#722;' } }, 'deleted (pending)')]),
                    el('td', {}, money(bufProd.priceCents)),
                    el('td', {}, String(productStock(bufProd))),
                    el('td', {}, new Date(bufProd.updatedAt).toLocaleString()),
                    el('td', {}, (bufProd.tags || []).join(', ')),
                    buildProductActionsCell(bufProd, true)
                );
                tbody.appendChild(tr);
            });
        }
    }

    // ============================================
    // Orders Section
    // ============================================
    const ordersSummaryEl = document.getElementById('admin-orders-summary');
    const ot = document.getElementById('admin-orders-table');
    const orders = getAdminOrders();
    if (!state.admin.ordersFilter) state.admin.ordersFilter = 'all';
    const activeFilter = state.admin.ordersFilter;
    const productMap = state.productsById instanceof Map ? state.productsById : new Map();
    const lookupProductLocal = (id) => {
        if (id == null) return null;
        if (productMap.has(id)) return productMap.get(id);
        const str = String(id);
        if (productMap.has(str)) return productMap.get(str);
        const num = Number(id);
        if (!Number.isNaN(num) && productMap.has(num)) return productMap.get(num);
        return null;
    };
    const resolveItemImage = (item) => {
        if (!item) return productPlaceholder(360);
        const candidate = item.image || item.thumbnail || (Array.isArray(item.images) && item.images[0]) || item.imageUrl;
        if (candidate) return candidate;
        const product = lookupProductLocal(item.productId);
        const productImages = product?.images;
        if (Array.isArray(productImages) && productImages[0]) return productImages[0];
        if (typeof productImages === 'string') return productImages;
        return productPlaceholder(360);
    };

    if (ordersSummaryEl) {
        const stats = {};
        let revenueCents = 0;
        for (const order of orders) {
            const key = (order.status || 'created').toLowerCase();
            stats[key] = (stats[key] || 0) + 1;
            revenueCents += order.totalCents || 0;
        }
        const summaryData = [
            { label: 'Total orders', value: orders.length, key: 'all', interactive: true },
            { label: 'Awaiting payment', value: stats.created || 0, key: 'created', interactive: true },
            { label: 'Paid', value: stats.paid || 0, key: 'paid', interactive: true },
            { label: 'Fulfilled', value: stats.fulfilled || 0, key: 'fulfilled', interactive: true },
            { label: 'Shipped', value: stats.shipped || 0, key: 'shipped', interactive: true },
            { label: 'Delivered', value: stats.completed || 0, key: 'completed', interactive: true },
            { label: 'Cancelled', value: stats.cancelled || 0, key: 'cancelled', interactive: true },
            { label: 'Revenue', value: money(revenueCents), key: 'revenue', interactive: false }
        ];
        ordersSummaryEl.innerHTML = '';
        summaryData.forEach(stat => {
            const isActive = stat.key === activeFilter;
            const attrs = { type: 'button' };
            if (stat.interactive) {
                attrs['data-order-filter'] = stat.key;
                attrs['aria-pressed'] = isActive ? 'true' : 'false';
            } else {
                attrs.disabled = 'true';
            }
            ordersSummaryEl.appendChild(
                el('button', { class: 'admin-orders-summary-card' + (isActive && stat.interactive ? ' active' : ''), attrs },
                    el('span', { class: 'admin-orders-summary-label tiny muted' }, stat.label),
                    el('span', { class: 'admin-orders-summary-value' }, stat.value)
                )
            );
        });
        if (!ordersSummaryEl._wired) {
            ordersSummaryEl._wired = true;
            ordersSummaryEl.addEventListener('click', (e) => {
                const btn = e.target.closest('[data-order-filter]');
                if (!btn) return;
                const nextFilter = btn.getAttribute('data-order-filter') || 'all';
                if (state.admin.ordersFilter === nextFilter) return;
                state.admin.ordersFilter = nextFilter;
                refreshAdminTables();
            });
        }
    }

    if (ot) {
        const buildItemCard = (item) => {
            const product = lookupProductLocal(item?.productId);
            const title = item?.titleSnapshot || product?.title || 'Product';
            const qty = item?.quantity || 1;
            const unitPrice = item?.unitPriceCents != null ? item.unitPriceCents : (product?.priceCents || 0);
            const imgSrc = resolveItemImage(item);
            return el('div', { class: 'admin-order-item' },
                el('div', { class: 'admin-order-item-thumb' },
                    el('img', { attrs: { src: imgSrc, alt: title } })
                ),
                el('div', { class: 'admin-order-item-info' },
                    el('span', { class: 'admin-order-item-title' }, title),
                    el('span', { class: 'admin-order-item-meta tiny muted' }, `${qty}× ${money(unitPrice)}`)
                )
            );
        };

        const filteredOrders = activeFilter === 'all'
            ? orders
            : orders.filter(o => (o.status || 'created').toLowerCase() === activeFilter);
        ot.innerHTML = '';
        if (!filteredOrders.length) {
            const labelMap = {
                created: 'awaiting payment',
                paid: 'paid',
                fulfilled: 'fulfilled',
                shipped: 'shipped',
                completed: 'delivered',
                cancelled: 'cancelled'
            };
            const activeLabel = activeFilter === 'all' ? 'orders' : `${labelMap[activeFilter] || activeFilter} orders`;
            const emptyMsg = activeFilter === 'all'
                ? 'No orders yet. Your latest orders will appear here.'
                : `No ${activeLabel} right now.`;
            ot.appendChild(el('div', { class: 'admin-orders-empty muted' }, emptyMsg));
        } else {
            const frag = document.createDocumentFragment();
            filteredOrders.forEach(o => {
                const items = Array.isArray(o.items) ? o.items : [];
                const itemsGallery = el('div', { class: 'admin-order-items-grid' },
                    ...(items.length ? items.map(i => buildItemCard(i)) : [
                        el('div', { class: 'admin-order-item admin-order-item--empty muted tiny' }, 'Line items will appear once available.')
                    ])
                );
                const tsParts = [];
                if (o.paidAt) tsParts.push('Paid ' + new Date(o.paidAt).toLocaleString());
                if (o.fulfilledAt) tsParts.push('Fulfilled ' + new Date(o.fulfilledAt).toLocaleString());
                if (o.shippedAt) tsParts.push('Shipped ' + new Date(o.shippedAt).toLocaleString());
                if (o.completedAt) tsParts.push('Delivered ' + new Date(o.completedAt).toLocaleString());
                if (o.cancelledAt) tsParts.push('Cancelled ' + new Date(o.cancelledAt).toLocaleString());
                const codesLabel = [o.discountCode, o.shippingCode].filter(Boolean).join(' · ');

                const metaCard = (label, value) => el('div', { class: 'admin-order-meta-card' },
                    el('span', { class: 'tiny muted' }, label),
                    el('span', { class: 'admin-order-meta-value' }, value)
                );

                const metaGrid = el('div', { class: 'admin-order-meta-grid' },
                    metaCard('Total', money(o.totalCents)),
                    metaCard('Subtotal', money(o.subtotalCents)),
                    metaCard('Shipping', money(o.shippingCents || 0)),
                    metaCard('Discounts', (o.discountCents || o.shippingDiscountCents)
                        ? '-' + money((o.discountCents || 0) + (o.shippingDiscountCents || 0))
                        : '—'),
                    metaCard('Codes', codesLabel || '—'),
                    metaCard('Updated', tsParts[0] || new Date(o.createdAt).toLocaleString())
                );

                const orderIdString = o.id || '';
                const copyIcon = () => el('svg', {
                    class: 'admin-order-copy-icon',
                    attrs: {
                        viewBox: '0 0 24 24',
                        role: 'img',
                        'aria-label': 'Copy order ID'
                    }
                },
                    el('path', {
                        attrs: {
                            d: 'M9 8h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3v-8a3 3 0 0 1 3-3z',
                            fill: 'none',
                            stroke: 'currentColor',
                            'stroke-width': '1.8',
                            'stroke-linejoin': 'round'
                        }
                    }),
                    el('path', {
                        attrs: {
                            d: 'M6 15H5a3 3 0 0 1-3-3V4a3 3 0 0 1 3-3h9a3 3 0 0 1 3 3v1',
                            fill: 'none',
                            stroke: 'currentColor',
                            'stroke-width': '1.8',
                            'stroke-linecap': 'round',
                            'stroke-linejoin': 'round'
                        }
                    })
                );
                const card = el('article', { class: 'admin-order-card', attrs: { 'data-order-id': o.id } },
                    el('div', { class: 'admin-order-head' },
                        el('div', { class: 'admin-order-id-block' },
                            el('span', { class: 'tiny muted' }, 'Order'),
                            el('div', { class: 'admin-order-id-row' },
                                el('span', { class: 'admin-order-id' }, orderIdString || '—'),
                                orderIdString ? el('button', {
                                    class: 'admin-order-copy-btn',
                                    attrs: {
                                        type: 'button',
                                        'data-copy-order': orderIdString,
                                        'aria-label': 'Copy order ID'
                                    }
                                }, copyIcon()) : null
                            )
                        ),
                        el('div', { class: 'admin-order-head-actions' },
                            el('button', { class: 'btn btn-xs btn-outline', attrs: { 'data-order-timeline': o.id } }, 'Timeline')
                        )
                    ),
                    el('div', { class: 'admin-order-details' },
                        el('div', { class: 'admin-order-detail-column' },
                            el('span', { class: 'admin-order-section-title tiny muted' }, 'Customer'),
                            (function () {
                                const attrs = {
                                    type: 'button',
                                    'data-customer-inspect': (o.customerEmail || '').toLowerCase() || '',
                                    'data-customer-email': o.customerEmail || '',
                                    'data-customer-name': o.customerName || '',
                                    'data-customer-order': o.id || ''
                                };
                                if (!attrs['data-customer-inspect']) delete attrs['data-customer-inspect'];
                                const btn = el('button', { class: 'admin-order-customer-btn', attrs },
                                    el('span', { class: 'admin-order-customer-name' }, o.customerName || o.customerEmail || '—'),
                                    o.customerEmail ? el('span', { class: 'admin-order-customer-email tiny muted' }, o.customerEmail) : null
                                );
                                return btn;
                            })()
                        ),
                        el('div', { class: 'admin-order-detail-column' },
                            el('span', { class: 'admin-order-section-title tiny muted' }, 'Timeline'),
                            el('span', { class: 'admin-order-timestamps' }, tsParts.join(' · ') || new Date(o.createdAt).toLocaleString())
                        )
                    ),
                    el('div', { class: 'admin-order-section' },
                        el('span', { class: 'admin-order-section-title tiny muted' }, 'Items'),
                        itemsGallery
                    ),
                    metaGrid,
                    el('div', { class: 'admin-order-section admin-order-actions' },
                        el('span', { class: 'admin-order-section-title tiny muted' }, 'Actions'),
                        (function () {
                            const actionsWrap = el('div', { class: 'admin-order-actions-wrap' });
                            actionsWrap.appendChild(buildOrderActions(o, { includeTimeline: false }));
                            return actionsWrap;
                        })()
                    )
                );
                frag.appendChild(card);
            });
            ot.appendChild(frag);
        }

        if (!ot._wired) {
            ot._wired = true;
            ot.addEventListener('click', async (e) => {
                const copyBtn = e.target.closest('[data-copy-order]');
                if (copyBtn) {
                    const value = copyBtn.getAttribute('data-copy-order');
                    if (value) {
                        try {
                            await copyTextToClipboard(value);
                            notify('Order ID copied', 'success', 1600);
                        } catch (err) {
                            notify('Unable to copy ID', 'error', 2000);
                        }
                    }
                    return;
                }
                const customerBtn = e.target.closest('[data-customer-inspect], [data-customer-name][data-customer-order]');
                if (customerBtn) {
                    const info = {
                        email: customerBtn.getAttribute('data-customer-inspect') || customerBtn.getAttribute('data-customer-email') || '',
                        name: customerBtn.getAttribute('data-customer-name') || '',
                        orderId: customerBtn.getAttribute('data-customer-order') || ''
                    };
                    showCustomerProfile(info);
                    return;
                }
                const tBtn = e.target.closest('[data-order-timeline]'); if (tBtn) { showOrderTimeline(tBtn.getAttribute('data-order-timeline')); return; }
                const btn = e.target.closest('[data-order-action]'); if (!btn) return; const action = btn.getAttribute('data-order-action'); const id = btn.getAttribute('data-order-id');
                try {
                    if (action === 'pay') await payOrder(id);
                    else if (action === 'fulfill') await fulfillOrder(id);
                    else if (action === 'ship') await shipOrder(id);
                    else if (action === 'complete') {
                        const email = btn.getAttribute('data-order-email') || '';
                        await completeOrder(id, email);
                    } else if (action === 'cancel') {
                        const ordersLocal = getAdminOrders();
                        const order = ordersLocal.find(o => String(o.id) === String(id));
                        const reason = await promptOrderCancellation(order);
                        if (!reason) return;
                        await cancelOrder(id, reason);
                    }
                    notify('Order ' + action + ' ok', 'success');
                    await loadOrdersAdmin();
                    refreshAdminTables();
                } catch (err) { notify('Action failed: ' + err.message, 'error'); }
            });
            const refreshBtn = document.getElementById('orders-refresh-btn');
            if (refreshBtn && !refreshBtn._wired) {
                refreshBtn._wired = true;
                refreshBtn.addEventListener('click', async () => { await loadOrdersAdmin(); refreshAdminTables(); });
            }
        }
    }

    // ============================================
    // Refunds Section
    // ============================================
    const refundsSummaryEl = document.getElementById('admin-refunds-summary');
    const refundsListEl = document.getElementById('admin-refunds-list');
    const refundsClosedEl = document.getElementById('admin-refunds-closed');
    const closedSortSelect = document.getElementById('closed-refunds-sort');
    const closedBlock = refundsClosedEl?.closest('.admin-refunds-closed-block');
    const closedToggle = document.getElementById('closed-cases-toggle');
    const refundsSearchInput = document.getElementById('refunds-search-input');
    const refundsSortSelect = document.getElementById('refunds-sort-select');
    const syncRefundSearchPlaceholder = () => {
        if (!refundsSearchInput) return;
        refundsSearchInput.placeholder = state.admin.showClosedRefunds ? 'Search closed order ID' : 'Search order ID';
    };
    syncRefundSearchPlaceholder();
    if (refundsSummaryEl || refundsListEl || refundsClosedEl) {
        const refundOrders = orders.filter(order => order.returnRequestedAt);
        const closedRefundsRaw = refundOrders.filter(order => !!order.returnClosedAt);
        const searchQuery = (state.admin.refundSearchQuery || '').trim().toLowerCase();
        const showingClosed = !!state.admin.showClosedRefunds;
        const openSortOrder = state.admin.refundsSort === 'oldest' ? 'oldest' : 'newest';
        const closedSortOrder = state.admin.closedRefundsSort === 'closed-oldest' ? 'oldest' : 'newest';
        const openQuery = showingClosed ? '' : searchQuery;
        const closedQuery = showingClosed ? searchQuery : '';
        const matchesOrderId = (order, query) => {
            if (!query) return true;
            return String(order.id || '').toLowerCase().includes(query);
        };
        const resolveRefundTimestamp = (order) => {
            const requestedAt = order?.returnRequestedAt ? new Date(order.returnRequestedAt).getTime() : null;
            if (requestedAt) return requestedAt;
            const created = order?.createdAt ? new Date(order.createdAt).getTime() : null;
            return created || 0;
        };
        const resolveClosedTimestamp = (order) => {
            const closedAt = order?.returnClosedAt ? new Date(order.returnClosedAt).getTime() : null;
            return closedAt ?? resolveRefundTimestamp(order);
        };
        const sortRefunds = (list, direction, resolver) => {
            const sorted = list.slice();
            sorted.sort((a, b) => {
                const aTs = resolver(a);
                const bTs = resolver(b);
                return direction === 'oldest' ? aTs - bTs : bTs - aTs;
            });
            return sorted;
        };
        const openRefundsRaw = refundOrders.filter(order => !order.returnClosedAt && matchesOrderId(order, openQuery));
        const openRefunds = sortRefunds(openRefundsRaw, openSortOrder, resolveRefundTimestamp);
        const closedFiltered = closedQuery ? closedRefundsRaw.filter(order => matchesOrderId(order, closedQuery)) : closedRefundsRaw;
        const closedRefunds = sortRefunds(closedFiltered, closedSortOrder, resolveClosedTimestamp);
        if (refundsSummaryEl) {
            const counts = { pending: 0, in_review: 0, approved: 0, refunded: 0, declined: 0 };
            let closedCount = 0;
            let responseAccumulator = 0;
            let responseCount = 0;
            refundOrders.forEach(order => {
                const key = getRefundStatus(order.returnAdminStatus);
                counts[key] = (counts[key] || 0) + 1;
                if (order.returnClosedAt) closedCount += 1;
                if (order.returnAdminRespondedAt && order.returnRequestedAt) {
                    responseAccumulator += (new Date(order.returnAdminRespondedAt).getTime() - new Date(order.returnRequestedAt).getTime());
                    responseCount += 1;
                }
            });
            const openCount = refundOrders.filter(o => !o.returnClosedAt && ['pending', 'in_review'].includes(getRefundStatus(o.returnAdminStatus))).length;
            const resolvedCount = refundOrders.length - openCount;
            let avgLabel = null;
            if (responseCount) {
                const avgMs = responseAccumulator / responseCount;
                const avgHours = avgMs / (1000 * 60 * 60);
                if (avgHours >= 48) {
                    avgLabel = `${Math.max(1, Math.round(avgHours / 24))}d`;
                } else {
                    avgLabel = `${Math.max(1, Math.round(avgHours))}h`;
                }
            }
            const summaryCards = [
                { label: 'Open', value: openCount },
                { label: 'Resolved', value: resolvedCount },
                { label: 'Closed', value: closedCount },
                { label: 'Total', value: refundOrders.length },
                { label: 'Avg response', value: avgLabel || '—' }
            ];
            refundsSummaryEl.innerHTML = '';
            summaryCards.forEach(card => {
                refundsSummaryEl.appendChild(el('div', { class: 'admin-refunds-summary-card' },
                    el('span', { class: 'tiny muted' }, card.label),
                    el('span', { class: 'admin-refunds-summary-value' }, card.value)
                ));
            });
        }

        const buildRefundCard = (order) => {
            const items = Array.isArray(order.items) ? order.items : [];
            const heroItem = items[0];
            const heroImg = resolveItemImage(heroItem);
            const extraItems = Math.max(0, items.length - 1);
            const statusKey = getRefundStatus(order.returnAdminStatus);
            const isClosed = !!order.returnClosedAt;
            const closedLabel = isClosed && order.returnClosedAt ? new Date(order.returnClosedAt).toLocaleString() : '';
            const usageCopy = describeRefundUsage(order);
            const reasonText = order.returnReason || 'Customer did not provide an explanation.';
            return el('article', { class: 'admin-refund-card' + (isClosed ? ' admin-refund-card--closed' : ''), attrs: { 'data-refund-order': order.id || '', 'data-case-closed': isClosed ? 'true' : 'false' } },
                el('div', { class: 'admin-refund-card-head' },
                    el('div', { class: 'admin-refund-identity' },
                        el('div', { class: 'admin-refund-thumb' },
                            el('img', { attrs: { src: heroImg, alt: heroItem?.titleSnapshot || 'Product preview' } }),
                            extraItems > 0 ? el('span', { class: 'admin-refund-thumb-count tiny' }, `+${extraItems}`) : null
                        ),
                        el('div', { class: 'admin-refund-basics' },
                            el('span', { class: 'admin-refund-order-id' }, order.id || '—'),
                            el('span', { class: 'admin-refund-customer tiny muted' }, order.customerName || order.customerEmail || 'Unknown customer')
                        )
                    ),
                    el('div', { class: 'admin-refund-status-cluster' },
                        el('span', { class: 'admin-refund-status-chip status-' + statusKey }, formatRefundStatus(statusKey)),
                        isClosed ? el('span', { class: 'admin-refund-case-chip', attrs: { title: closedLabel ? `Closed on ${closedLabel}` : 'Case closed' } }, 'Case closed') : null
                    )
                ),
                el('div', { class: 'admin-refund-overview' },
                    el('div', { class: 'admin-refund-overview-block' },
                        el('span', { class: 'tiny muted' }, 'Requested'),
                        el('span', { class: 'admin-refund-overview-value' }, order.returnRequestedAt ? new Date(order.returnRequestedAt).toLocaleString() : '—')
                    ),
                    el('div', { class: 'admin-refund-overview-block' },
                        el('span', { class: 'tiny muted' }, 'Usage window'),
                        el('span', { class: 'admin-refund-overview-value' }, usageCopy)
                    )
                ),
                el('div', { class: 'admin-refund-reason' },
                    el('span', { class: 'tiny muted' }, 'Customer explanation'),
                    el('p', {}, reasonText)
                ),
                order.returnAdminNotes ? el('div', { class: 'admin-refund-notes tiny muted' }, 'Internal notes: ', order.returnAdminNotes) : null,
                order.returnUsageNotes ? el('div', { class: 'admin-refund-notes tiny muted' }, 'Usage notes: ', order.returnUsageNotes) : null,
                el('div', { class: 'admin-refund-actions' },
                    el('button', { class: 'btn btn-xs btn-outline', attrs: { type: 'button', 'data-refund-toggle': order.id || '', 'aria-expanded': 'false' } }, 'Open conversation'),
                    !isClosed ? el('button', { class: 'btn btn-xs btn-danger', attrs: { type: 'button', 'data-refund-close': order.id || '' } }, 'Close case')
                        : el('button', { class: 'btn btn-xs btn-outline', attrs: { type: 'button', 'data-refund-reopen': order.id || '' } }, 'Restore case'),
                    isClosed ? el('span', { class: 'tiny muted admin-refund-closed-note', attrs: { 'data-refund-closed-label': order.id || '' } }, closedLabel ? `Closed ${closedLabel}` : 'Closed') : null
                ),
                el('div', { class: 'admin-refund-detail hidden', attrs: { 'data-refund-detail': order.id || '' } },
                    el('div', { class: 'admin-refund-timeline' },
                        el('div', { class: 'admin-refund-timeline-row' },
                            el('span', { class: 'tiny muted' }, 'Delivered'),
                            el('span', {}, order.completedAt ? new Date(order.completedAt).toLocaleString() : '—')
                        ),
                        el('div', { class: 'admin-refund-timeline-row' },
                            el('span', { class: 'tiny muted' }, 'Refund requested'),
                            el('span', {}, order.returnRequestedAt ? new Date(order.returnRequestedAt).toLocaleString() : '—')
                        ),
                        el('div', { class: 'admin-refund-timeline-row' },
                            el('span', { class: 'tiny muted' }, 'Last admin reply'),
                            el('span', {}, order.returnAdminRespondedAt ? new Date(order.returnAdminRespondedAt).toLocaleString() : '—')
                        )
                    ),
                    el('div', { class: 'admin-refund-thread' },
                        el('div', { class: 'admin-refund-thread-messages', attrs: { 'data-refund-messages': order.id || '' } },
                            el('p', { class: 'tiny muted' }, 'Conversation loads when opened.')
                        ),
                        el('form', { class: 'admin-refund-reply', attrs: { 'data-refund-form': order.id || '' } },
                            isClosed ? el('p', { class: 'tiny alert admin-refund-closed-banner' }, closedLabel ? `Case closed ${closedLabel}. Reopen to reply.` : 'Case closed. Reopen to send new updates.') : null,
                            el('label', {},
                                el('span', { class: 'tiny muted' }, 'Status'),
                                el('select', { attrs: { name: 'refund-status', disabled: isClosed ? 'true' : null } },
                                    Object.entries(REFUND_STATUS_LABELS).map(([value, label]) => el('option', { attrs: { value, selected: value === statusKey ? 'true' : null } }, label))
                                )
                            ),
                            el('label', {},
                                el('span', { class: 'tiny muted' }, 'Usage notes (internal)'),
                                el('input', { attrs: { type: 'text', name: 'refund-usage', value: order.returnUsageNotes || '', placeholder: 'Ex: Signs of wear on collar', disabled: isClosed ? 'true' : null } })
                            ),
                            el('label', {},
                                el('span', { class: 'tiny muted' }, 'Internal notes'),
                                el('textarea', { attrs: { name: 'refund-notes', rows: '2', placeholder: 'Visible defects, next steps…', disabled: isClosed ? 'true' : null } }, order.returnAdminNotes || '')
                            ),
                            el('label', {},
                                el('span', { class: 'tiny muted' }, 'Reply to customer'),
                                el('textarea', { attrs: { name: 'refund-message', rows: '3', placeholder: 'Share updates or next steps (optional)', disabled: isClosed ? 'true' : null } })
                            ),
                            el('div', { class: 'admin-refund-reply-actions' },
                                el('button', { class: 'btn btn-xs', attrs: { type: 'submit', disabled: isClosed ? 'true' : null } }, 'Update & send')
                            )
                        )
                    )
                )
            );
        };

        const renderRefundList = (listEl, list, emptyText) => {
            if (!listEl) return;
            listEl.innerHTML = '';
            if (!list.length) {
                listEl.appendChild(el('div', { class: 'admin-refunds-empty muted' }, emptyText));
                return;
            }
            list.forEach(order => listEl.appendChild(buildRefundCard(order)));
        };

        renderRefundList(refundsListEl, openRefunds, openQuery ? 'No matches for that order ID.' : 'No active refund requests.');
        renderRefundList(refundsClosedEl, closedRefunds, closedQuery ? 'No matches for that order ID.' : 'No closed cases yet.');

        restoreOpenRefundDetails();

        if (closedBlock) {
            closedBlock.classList.toggle('is-hidden', !state.admin.showClosedRefunds);
        }
        if (refundsListEl) {
            refundsListEl.classList.toggle('is-hidden', !!state.admin.showClosedRefunds);
        }
        if (closedToggle && !closedToggle._wired) {
            closedToggle._wired = true;
            const setLabel = () => {
                closedToggle.classList.toggle('btn-outline', !state.admin.showClosedRefunds);
                closedToggle.classList.toggle('btn-primary', !!state.admin.showClosedRefunds);
                closedToggle.setAttribute('aria-pressed', state.admin.showClosedRefunds ? 'true' : 'false');
                const labelSpan = closedToggle.querySelector('span:last-child');
                if (labelSpan) labelSpan.textContent = state.admin.showClosedRefunds ? 'Closed cases (only)' : 'Closed cases';
            };
            setLabel();
            closedToggle.addEventListener('click', () => {
                state.admin.showClosedRefunds = !state.admin.showClosedRefunds;
                if (closedBlock) closedBlock.classList.toggle('is-hidden', !state.admin.showClosedRefunds);
                if (refundsListEl) refundsListEl.classList.toggle('is-hidden', !!state.admin.showClosedRefunds);
                syncRefundSearchPlaceholder();
                setLabel();
                refreshAdminTables();
            });
        }
        if (closedSortSelect && !closedSortSelect._wired) {
            closedSortSelect._wired = true;
            closedSortSelect.value = state.admin.closedRefundsSort || 'closed-newest';
            closedSortSelect.addEventListener('change', (e) => {
                state.admin.closedRefundsSort = e.target.value === 'closed-oldest' ? 'closed-oldest' : 'closed-newest';
                refreshAdminTables();
            });
        }
        if (refundsSearchInput && !refundsSearchInput._wired) {
            refundsSearchInput._wired = true;
            refundsSearchInput.value = state.admin.refundSearchQuery || '';
            refundsSearchInput.addEventListener('input', (e) => {
                state.admin.refundSearchQuery = e.target.value || '';
                refreshAdminTables();
            });
        }
        if (refundsSortSelect && !refundsSortSelect._wired) {
            refundsSortSelect._wired = true;
            refundsSortSelect.value = state.admin.refundsSort || 'newest';
            refundsSortSelect.addEventListener('change', (e) => {
                state.admin.refundsSort = e.target.value === 'oldest' ? 'oldest' : 'newest';
                refreshAdminTables();
            });
        }

        const wireRefundList = (listEl) => {
            if (!listEl || listEl._wired) return;
            listEl._wired = true;
            listEl.addEventListener('click', async (event) => {
                const toggleBtn = event.target.closest('[data-refund-toggle]');
                if (toggleBtn) {
                    const orderId = toggleBtn.getAttribute('data-refund-toggle');
                    const detail = listEl.querySelector(`[data-refund-detail="${CSS.escape(orderId)}"]`);
                    if (!detail) return;
                    const nowHidden = detail.classList.toggle('hidden');
                    toggleBtn.setAttribute('aria-expanded', nowHidden ? 'false' : 'true');
                    if (state.admin.openRefundDetails) {
                        if (nowHidden) state.admin.openRefundDetails.delete(orderId);
                        else state.admin.openRefundDetails.add(orderId);
                    }
                    if (!nowHidden) {
                        const container = detail.querySelector(`[data-refund-messages="${CSS.escape(orderId)}"]`);
                        if (container) container.innerHTML = '<p class="tiny muted">Loading conversation…</p>';
                        try {
                            const hasCache = state.admin.refundThreads?.has(orderId);
                            await loadRefundMessages(orderId, { force: !hasCache });
                            renderRefundMessagesThread(orderId);
                        } catch (err) {
                            const msg = err?.message?.includes('HTTP 404')
                                ? 'Refund conversation endpoint not available on the server yet.'
                                : err?.message || 'Unknown error';
                            if (container) container.innerHTML = '<p class="tiny alert">Unable to load thread: ' + msg + '</p>';
                        }
                    }
                    return;
                }
                const closeBtn = event.target.closest('[data-refund-close]');
                if (closeBtn) {
                    const orderId = closeBtn.getAttribute('data-refund-close');
                    if (!orderId) return;
                    if (!confirm('Close this refund case?')) return;
                    const form = listEl.querySelector(`[data-refund-form="${CSS.escape(orderId)}"]`);
                    const payload = form ? {
                        status: form.querySelector('select[name="refund-status"]')?.value,
                        notes: form.querySelector('textarea[name="refund-notes"]')?.value,
                        usageNotes: form.querySelector('input[name="refund-usage"]')?.value,
                        message: form.querySelector('textarea[name="refund-message"]')?.value
                    } : {};
                    closeBtn.disabled = true;
                    try {
                        const result = await closeRefundCase(orderId, payload);
                        const order = orders.find(o => String(o.id) === String(orderId));
                        if (order) {
                            order.returnAdminStatus = result.status || order.returnAdminStatus;
                            order.returnClosedAt = result.closedAt || new Date().toISOString();
                        }
                        try {
                            await loadRefundMessages(orderId, { force: true });
                            renderRefundMessagesThread(orderId);
                        } catch (threadErr) {
                            console.warn('refund thread refresh failed', threadErr);
                        }
                        refreshAdminTables();
                        notify('Refund case closed', 'success', 2400);
                    } catch (err) {
                        notify('Unable to close case: ' + (err?.message || 'Unknown error'), 'error');
                    } finally {
                        closeBtn.disabled = false;
                    }
                    return;
                }
                const reopenBtn = event.target.closest('[data-refund-reopen]');
                if (reopenBtn) {
                    const orderId = reopenBtn.getAttribute('data-refund-reopen');
                    if (!orderId) return;
                    reopenBtn.disabled = true;
                    try {
                        const result = await reopenRefundCase(orderId, {});
                        const order = orders.find(o => String(o.id) === String(orderId));
                        if (order) {
                            order.returnClosedAt = null;
                        }
                        refreshAdminTables();
                        notify('Refund case reopened', 'success', 2200);
                    } catch (err) {
                        notify('Unable to reopen case: ' + (err?.message || 'Unknown error'), 'error');
                    } finally {
                        reopenBtn.disabled = false;
                    }
                    return;
                }
            });
            listEl.addEventListener('submit', async (event) => {
                const form = event.target.closest('[data-refund-form]');
                if (!form) return;
                event.preventDefault();
                if (form.closest('[data-case-closed="true"]')) {
                    notify('Case is closed. Reopen it before sending updates.', 'warn');
                    return;
                }
                const orderId = form.getAttribute('data-refund-form');
                if (!orderId) return;
                const status = form.querySelector('select[name="refund-status"]').value;
                const usageNotes = form.querySelector('input[name="refund-usage"]').value;
                const notes = form.querySelector('textarea[name="refund-notes"]').value;
                const message = form.querySelector('textarea[name="refund-message"]').value;
                const submitBtn = form.querySelector('button[type="submit"]');
                submitBtn.disabled = true;
                try {
                    const result = await respondToRefund(orderId, { status, usageNotes, notes, message });
                    form.querySelector('textarea[name="refund-notes"]').value = result.notes || '';
                    if (message.trim()) form.querySelector('textarea[name="refund-message"]').value = '';
                    const order = orders.find(o => String(o.id) === String(orderId));
                    if (order) {
                        order.returnAdminStatus = result.status;
                        order.returnAdminNotes = result.notes;
                        order.returnAdminRespondedAt = result.respondedAt;
                        order.returnUsageNotes = result.usageNotes || order.returnUsageNotes;
                        if (Object.prototype.hasOwnProperty.call(result, 'closedAt')) {
                            order.returnClosedAt = result.closedAt;
                        }
                    }
                    if (state.admin.openRefundDetails) {
                        state.admin.openRefundDetails.add(orderId);
                    }
                    const threadStore = getRefundThreadStore('admin');
                    if (result.message && threadStore) {
                        const cache = threadStore.get(orderId) || {};
                        const updatedMessages = Array.isArray(cache.messages) ? [...cache.messages, result.message] : [result.message];
                        threadStore.set(orderId, { ...cache, messages: updatedMessages });
                    } else if (threadStore) {
                        try {
                            await loadRefundMessages(orderId, { force: true });
                        } catch (threadErr) {
                            console.warn('refund thread refresh failed', threadErr);
                        }
                    }
                    renderRefundMessagesThread(orderId);
                    refreshAdminTables();
                    requestAnimationFrame(() => forceOpenRefundDetail(orderId));
                    notify('Refund updated', 'success', 2000);
                } catch (err) {
                    notify('Unable to update refund: ' + (err?.message || 'Unknown error'), 'error');
                } finally {
                    submitBtn.disabled = false;
                }
            });
        };

        wireRefundList(refundsListEl);
        wireRefundList(refundsClosedEl);

        const refundsRefreshBtn = document.getElementById('refunds-refresh-btn');
        if (refundsRefreshBtn && !refundsRefreshBtn._wired) {
            refundsRefreshBtn._wired = true;
            refundsRefreshBtn.addEventListener('click', async () => {
                await loadOrdersAdmin();
                refreshAdminTables();
            });
        }
    }
    refreshAdminReviewsTable();
    refreshDiscountTable();
    refreshLowStockTable();
}

// ============================================
// Render Refund Messages Thread
// ============================================

function renderRefundMessagesThread(orderId) {
    const container = document.querySelector(`[data-refund-messages="${CSS.escape(orderId)}"]`);
    if (!container) return;
    const store = getRefundThreadStore('admin');
    const cache = store?.get(orderId);
    const messages = cache?.messages || [];
    container.innerHTML = '';
    if (cache?.error) {
        container.appendChild(el('p', { class: 'tiny alert' }, `Conversation unavailable (${cache.error}).`));
        return;
    }
    if (!messages.length) {
        container.appendChild(el('p', { class: 'tiny muted' }, 'No replies yet.'));
        return;
    }
    messages.forEach(entry => {
        const role = entry.authorRole || 'admin';
        container.appendChild(el('div', { class: 'refund-message refund-message--' + role },
            el('div', { class: 'refund-message-head' },
                el('span', { class: 'refund-message-author' }, entry.authorName || (role === 'admin' ? 'Store team' : 'Customer')),
                entry.createdAt ? el('span', { class: 'refund-message-date tiny muted' }, new Date(entry.createdAt).toLocaleString()) : null
            ),
            el('p', { class: 'refund-message-body' }, entry.body || '')
        ));
    });
}

function restoreOpenRefundDetails(rootEl = document) {
    if (!rootEl || !state.admin.openRefundDetails || !state.admin.openRefundDetails.size) return;
    const openSet = state.admin.openRefundDetails;
    const seen = new Set();
    openSet.forEach(orderId => {
        if (!orderId || seen.has(orderId)) return;
        seen.add(orderId);
        const detail = rootEl.querySelector(`[data-refund-detail="${CSS.escape(orderId)}"]`);
        if (!detail) {
            return;
        }
        detail.classList.remove('hidden');
        const toggleBtn = rootEl.querySelector(`[data-refund-toggle="${CSS.escape(orderId)}"]`);
        if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
        const container = detail.querySelector(`[data-refund-messages="${CSS.escape(orderId)}"]`);
        if (!container) return;
        const hasCache = state.admin.refundThreads?.has(orderId);
        if (hasCache) {
            renderRefundMessagesThread(orderId);
            return;
        }
        container.innerHTML = '<p class="tiny muted">Loading conversation…</p>';
        loadRefundMessages(orderId).then(() => {
            renderRefundMessagesThread(orderId);
        }).catch(err => {
            console.warn('refund detail restore failed', err);
            container.innerHTML = '<p class="tiny alert">Unable to load thread.</p>';
        });
    });
}

function forceOpenRefundDetail(orderId) {
    if (!orderId) return;
    if (!(state.admin.openRefundDetails instanceof Set)) state.admin.openRefundDetails = new Set();
    state.admin.openRefundDetails.add(orderId);
    const detail = document.querySelector(`[data-refund-detail="${CSS.escape(orderId)}"]`);
    if (!detail) return;
    detail.classList.remove('hidden');
    const toggleBtn = document.querySelector(`[data-refund-toggle="${CSS.escape(orderId)}"]`);
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    const container = detail.querySelector(`[data-refund-messages="${CSS.escape(orderId)}"]`);
    if (!container) return;
    const hasCache = state.admin.refundThreads?.has(orderId);
    if (hasCache) {
        renderRefundMessagesThread(orderId);
        return;
    }
    container.innerHTML = '<p class="tiny muted">Loading conversation…</p>';
    loadRefundMessages(orderId).then(() => {
        renderRefundMessagesThread(orderId);
    }).catch(err => {
        console.warn('forceOpenRefundDetail failed', err);
        container.innerHTML = '<p class="tiny alert">Unable to load thread.</p>';
    });
}

// ============================================
// Reviews Table
// ============================================

function refreshAdminReviewsTable() {
    const table = document.getElementById('admin-reviews-table');
    if (!table) return;
    table.innerHTML = `
        <thead>
            <tr>
                <th>Product</th>
                <th>Rating</th>
                <th>Review</th>
                <th>Buyer</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');
    const items = Array.isArray(state.admin.reviews?.items) ? state.admin.reviews.items : [];
    if (!items.length) {
        tbody.appendChild(el('tr', {},
            el('td', { attrs: { colspan: '7' } }, el('div', { class: 'muted small' }, 'No reviews for this filter'))
        ));
        return;
    }
    const statusColors = { pending: '#92400e', approved: '#065f46', rejected: '#991b1b' };
    items.forEach(review => {
        const product = state.productsById.get(review.productId);
        const productTitle = review.productTitle || product?.title || 'Unknown';
        const productCell = el('td', {}, productTitle);
        const ratingCell = el('td', {}, renderStarRating(review.rating, null, { size: 'xs' }));
        const reviewCell = el('td', {},
            review.title ? el('div', { class: 'small' }, el('strong', {}, review.title)) : null,
            el('div', { class: 'tiny muted' }, review.body || '—')
        );
        const buyerCell = el('td', {},
            el('div', {}, review.authorName || 'Anonymous'),
            el('div', { class: 'tiny muted' }, review.authorEmail || '—')
        );
        const statusCell = el('td', {},
            el('span', { class: 'tag', attrs: { style: `background:${statusColors[review.status] || '#334155'};` } }, review.status)
        );
        const timeCell = el('td', {}, review.createdAt ? new Date(review.createdAt).toLocaleString() : '—');
        const actionsCell = el('td', {});
        if (review.status !== 'approved') {
            actionsCell.appendChild(el('button', { class: 'btn btn-xs btn-success', attrs: { 'data-review-approve': review.id } }, 'Approve'));
        }
        if (review.status !== 'rejected') {
            if (actionsCell.children.length) actionsCell.appendChild(document.createTextNode(' '));
            actionsCell.appendChild(el('button', { class: 'btn btn-xs btn-danger', attrs: { 'data-review-reject': review.id } }, 'Reject'));
        }
        tbody.appendChild(el('tr', {}, productCell, ratingCell, reviewCell, buyerCell, statusCell, timeCell, actionsCell));
    });
    if (!table._wired) {
        table._wired = true;
        table.addEventListener('click', async (e) => {
            const approveBtn = e.target.closest('[data-review-approve]');
            const rejectBtn = e.target.closest('[data-review-reject]');
            if (!approveBtn && !rejectBtn) return;
            const target = approveBtn || rejectBtn;
            const id = approveBtn ? approveBtn.getAttribute('data-review-approve') : rejectBtn.getAttribute('data-review-reject');
            if (!id) return;
            target.setAttribute('disabled', 'true');
            try {
                if (approveBtn) {
                    await moderateReview(id, 'approve');
                    notify('Review approved', 'success', 2500);
                } else {
                    if (!confirm('Reject this review?')) { target.removeAttribute('disabled'); return; }
                    await moderateReview(id, 'reject');
                    notify('Review rejected', 'warn', 2500);
                }
                await loadAdminReviews(state.admin.reviews.status || 'pending');
                refreshAdminReviewsTable();
            } catch (err) {
                notify(err.message, 'error', 4000);
            } finally {
                target.removeAttribute('disabled');
            }
        });
    }
}

// ============================================
// Discounts Table
// ============================================

function refreshDiscountTable() {
    const dt = document.getElementById('admin-discounts-table');
    if (!dt) return;
    dt.innerHTML = '<thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Min Subtotal</th><th>Expires</th><th>Usage</th><th>Status</th><th>Actions</th></tr></thead><tbody></tbody>';
    const tbody = dt.querySelector('tbody');
    const discounts = Array.isArray(state.admin.discounts) ? state.admin.discounts : [];
    if (!discounts.length) {
        tbody.appendChild(el('tr', {}, el('td', { attrs: { colspan: '8' } }, el('div', { class: 'muted small' }, 'No discounts configured'))));
    }
    discounts.forEach(d => {
        const expired = d.expiresAt && new Date(d.expiresAt).getTime() <= Date.now();
        const actions = el('td', {});
        actions.appendChild(el('button', { class: 'btn btn-xs btn-outline', attrs: { 'data-edit-discount': d.code } }, 'Edit'));
        actions.appendChild(document.createTextNode(' '));
        if (d.disabledAt) {
            actions.appendChild(el('button', { class: 'btn btn-xs btn-success', attrs: { 'data-enable-discount': d.code } }, 'Enable'));
        } else {
            actions.appendChild(el('button', { class: 'btn btn-xs btn-danger', attrs: { 'data-disable-discount': d.code } }, 'Disable'));
        }
        const tr = el('tr', {},
            el('td', {}, d.code),
            el('td', {}, d.type),
            el('td', {}, d.type === 'percent' ? d.value + '%' : money(d.value)),
            el('td', {}, money(d.minSubtotalCents || 0)),
            el('td', {}, d.expiresAt ? new Date(d.expiresAt).toLocaleDateString() : '—'),
            el('td', {}, String(d.usageCount || 0)),
            el('td', {}, d.disabledAt ? 'Disabled' : (expired ? 'Expired' : 'Active')),
            actions
        );
        tbody.appendChild(tr);
    });
    if (!dt._wired) {
        dt._wired = true;
        dt.addEventListener('click', async e => {
            const disBtn = e.target.closest('[data-disable-discount]');
            const enBtn = e.target.closest('[data-enable-discount]');
            const editBtn = e.target.closest('[data-edit-discount]');
            if (disBtn) {
                const code = disBtn.getAttribute('data-disable-discount');
                try { await apiFetch('/api/discounts/' + code + '/disable', { method: 'POST' }); notify('Disabled ' + code, 'success'); await loadDiscounts(); refreshDiscountTable(); } catch (err) { notify(err.message, 'error'); }
            } else if (enBtn) {
                const code = enBtn.getAttribute('data-enable-discount');
                try { await apiFetch('/api/discounts/' + code + '/enable', { method: 'POST' }); notify('Enabled ' + code, 'success'); await loadDiscounts(); refreshDiscountTable(); } catch (err) { notify(err.message, 'error'); }
            } else if (editBtn) {
                const code = editBtn.getAttribute('data-edit-discount');
                const d = discounts.find(x => x.code === code);
                if (d) showDiscountModal(d);
            }
        });
        document.getElementById('new-discount-btn')?.addEventListener('click', () => showDiscountModal());
        document.getElementById('low-stock-refresh')?.addEventListener('click', async () => {
            await loadLowStock(parseInt(document.getElementById('low-stock-threshold')?.value, 10) || 5);
            refreshLowStockTable();
        });
        document.getElementById('import-products-form')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const fileInput = document.getElementById('import-products-file');
            if (!fileInput.files.length) { notify('Select CSV file', 'warn'); return; }
            const fd = new FormData();
            fd.append('file', fileInput.files[0]);
            try {
                const res = await fetch('/api/import/products', {
                    method: 'POST',
                    body: fd
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Import failed');
                notify(`Imported ${data.imported} products`, 'success', 6000);
                await refreshAdminData();
            } catch (err) { notify(err.message, 'error', 5000); }
        });
    }
}

// ============================================
// Low Stock Table
// ============================================

function refreshLowStockTable() {
    const lt = document.getElementById('low-stock-table');
    if (!lt) return;
    lt.innerHTML = '<thead><tr><th>Title</th><th>Inventory</th><th>Price</th></tr></thead><tbody></tbody>';
    const tbody = lt.querySelector('tbody');
    const items = Array.isArray(state.admin.lowStock) ? state.admin.lowStock : [];
    if (!items.length) {
        tbody.appendChild(el('tr', { class: 'muted' }, el('td', { attrs: { colspan: '3', style: 'text-align:center;padding:1.2rem;' } }, 'All products are above the threshold.')));
        return;
    }
    items.forEach(p => tbody.appendChild(el('tr', {}, el('td', {}, p.title), el('td', {}, String(p.totalInventory)), el('td', {}, money(p.priceCents)))));
}

// ============================================
// Analytics Panel
// ============================================

function refreshAnalyticsPanel() {
    const analyticsState = ensureAnalyticsState();
    const statusEl = document.getElementById('analytics-status');
    const statusParts = [];
    if (analyticsState.loading?.merch || analyticsState.loading?.promos) statusParts.push('Loading insights…');
    if (analyticsState.errors?.merch) statusParts.push('Merch: ' + analyticsState.errors.merch);
    if (analyticsState.errors?.promos) statusParts.push('Promos: ' + analyticsState.errors.promos);
    if (statusEl) {
        statusEl.textContent = statusParts.join(' · ');
        statusEl.classList.toggle('hidden', statusParts.length === 0);
    }

    const rangeLabelEl = document.getElementById('analytics-range-label');
    if (rangeLabelEl && analyticsState.merch?.range) {
        const { range } = analyticsState.merch;
        const start = range.start ? new Date(range.start).toLocaleDateString() : '';
        const end = range.end ? new Date(range.end).toLocaleDateString() : '';
        rangeLabelEl.textContent = `Last ${range.days || analyticsState.rangeDays || 30} days · ${start} – ${end}`;
    }

    const metricsGrid = document.getElementById('analytics-metrics-grid');
    if (metricsGrid) {
        metricsGrid.innerHTML = '';
        if (analyticsState.loading?.merch) {
            metricsGrid.appendChild(el('p', { class: 'tiny muted' }, 'Loading merchandising KPIs…'));
        } else if (!analyticsState.merch) {
            metricsGrid.appendChild(el('p', { class: 'tiny muted' }, 'No data yet. Click Refresh to pull analytics.'));
        } else {
            const { totals, velocity } = analyticsState.merch;
            const fmtDelta = (val) => val == null ? '' : `${val >= 0 ? '+' : ''}${val.toFixed(1)}%`;
            const metrics = [
                { label: 'Revenue', value: money(totals?.revenueCents || 0), delta: velocity?.revenueChangePct },
                { label: 'Orders', value: String(totals?.totalOrders || 0), delta: velocity?.ordersChangePct },
                { label: 'Avg order', value: money(totals?.avgOrderValueCents || 0) },
                { label: 'Units sold', value: String(totals?.unitsSold || 0) }
            ];
            metrics.forEach(metric => {
                const card = el('div', { class: 'analytics-metric-card' },
                    el('span', { class: 'analytics-metric-label tiny muted' }, metric.label),
                    el('strong', { class: 'analytics-metric-value' }, metric.value)
                );
                if (metric.delta != null) {
                    const deltaClass = metric.delta >= 0 ? 'pos' : 'neg';
                    card.appendChild(el('span', { class: 'analytics-metric-delta ' + deltaClass }, fmtDelta(metric.delta)));
                }
                metricsGrid.appendChild(card);
            });
        }
    }

    // Top products
    const topProductsEl = document.getElementById('analytics-top-products');
    if (topProductsEl) {
        topProductsEl.innerHTML = '';
        const topProducts = analyticsState.merch?.topProducts || [];
        if (!topProducts.length) {
            topProductsEl.appendChild(el('p', { class: 'tiny muted' }, 'No product movement in this range.'));
        } else {
            topProducts.forEach(product => {
                topProductsEl.appendChild(el('div', { class: 'analytics-list-row' },
                    el('div', { class: 'analytics-list-main' },
                        el('span', { class: 'analytics-list-title' }, product.title),
                        el('span', { class: 'analytics-list-sub tiny muted' }, `${product.unitsSold} units · ${money(product.revenueCents)}`)
                    ),
                    el('span', { class: 'analytics-pill ' + (product.stockHealth || 'neutral') }, `${product.inventoryRemaining ?? '—'} left`)
                ));
            });
        }
    }

    // Category breakdown
    const categoryListEl = document.getElementById('analytics-category-list');
    if (categoryListEl) {
        categoryListEl.innerHTML = '';
        const categories = analyticsState.merch?.categoryBreakdown || [];
        if (!categories.length) {
            categoryListEl.appendChild(el('p', { class: 'tiny muted' }, 'No categorized sales in this range.'));
        } else {
            categories.forEach(entry => {
                categoryListEl.appendChild(el('div', { class: 'analytics-list-row' },
                    el('div', { class: 'analytics-list-main' },
                        el('span', { class: 'analytics-list-title' }, entry.label || 'Category'),
                        el('span', { class: 'analytics-list-sub tiny muted' }, `${entry.unitsSold || 0} units`)
                    ),
                    el('span', { class: 'analytics-pill neutral' }, `${(entry.sharePct || 0).toFixed(1)}%`)
                ));
            });
        }
    }

    // Low stock alerts
    const lowStockEl = document.getElementById('analytics-low-stock');
    if (lowStockEl) {
        lowStockEl.innerHTML = '';
        const lowStockItems = analyticsState.merch?.lowStock?.products || [];
        if (!lowStockItems.length) {
            lowStockEl.appendChild(el('p', { class: 'tiny muted' }, 'All tracked products look healthy.'));
        } else {
            lowStockItems.forEach(item => {
                const severityClass = ({ low: 'risk', critical: 'critical', out: 'critical', watch: 'watch' })[item.severity] || 'neutral';
                lowStockEl.appendChild(el('div', { class: 'analytics-list-row' },
                    el('div', { class: 'analytics-list-main' },
                        el('span', { class: 'analytics-list-title' }, item.title),
                        el('span', { class: 'analytics-list-sub tiny muted' }, money(item.priceCents))
                    ),
                    el('span', { class: 'analytics-pill ' + severityClass }, `${item.totalInventory} left`)
                ));
            });
        }
    }

    // Promo top codes
    const promoTopEl = document.getElementById('promo-top-discounts');
    if (promoTopEl) {
        promoTopEl.innerHTML = '';
        const topCodes = analyticsState.promos?.topDiscounts?.slice(0, 6) || [];
        if (!topCodes.length) {
            promoTopEl.appendChild(el('p', { class: 'tiny muted' }, 'No discount usage recorded.'));
        } else {
            topCodes.forEach(entry => {
                promoTopEl.appendChild(el('div', { class: 'analytics-list-row' },
                    el('div', { class: 'analytics-list-main' },
                        el('span', { class: 'analytics-list-title' }, entry.code || '—'),
                        el('span', { class: 'analytics-list-sub tiny muted' }, `${entry.orders} orders · ${money(entry.revenueCents)}`)
                    ),
                    el('span', { class: 'analytics-pill neutral' }, `${(entry.sharePct || 0).toFixed(1)}%`)
                ));
            });
        }
    }
}

// ============================================
// Discount Modal
// ============================================

function showDiscountModal(existing = null) {
    const modalRoot = getModalRoot();
    if (!modalRoot) return;
    showModal(close => {
        const wrap = el('div', { class: 'modal' });
        wrap.appendChild(el('button', { class: 'modal-close' }, '×'));
        wrap.appendChild(el('h2', {}, existing ? 'Edit Discount' : 'New Discount'));
        const form = el('form', { class: 'form-grid', attrs: { id: 'discount-form', autocomplete: 'off' } },
            (function () {
                const field = fieldInput('Code', 'd-code');
                if (existing) field.querySelector('input')?.setAttribute('disabled', 'true');
                return field;
            })(),
            (function () {
                const field = el('div', { class: 'field' });
                field.appendChild(el('label', { attrs: { for: 'd-type' } }, 'Type'));
                const sel = el('select', { attrs: { id: 'd-type' } },
                    el('option', { attrs: { value: 'percent' } }, 'percent (percentage off)'),
                    el('option', { attrs: { value: 'fixed' } }, 'fixed (cents off)'),
                    el('option', { attrs: { value: 'ship' } }, 'ship (shipping % off)')
                );
                field.appendChild(sel);
                return field;
            })(),
            fieldInput('Value', 'd-value', 'number'),
            fieldInput('Min Subtotal (cents)', 'd-min', 'number'),
            fieldInput('Expires (YYYY-MM-DD)', 'd-exp'),
            el('div', { class: 'field small muted', attrs: { style: 'grid-column:1/-1;' } }, 'Percent: 1-100. Fixed: value in cents.'),
            el('div', { class: 'field', attrs: { style: 'grid-column:1/-1;' } },
                el('button', { class: 'btn btn-success', attrs: { type: 'submit' } }, existing ? 'Save Changes' : 'Create'),
                ' ',
                el('button', { class: 'btn btn-outline', attrs: { type: 'button', id: 'cancel-discount' } }, 'Cancel')
            ),
            el('div', { class: 'alert alert-error hidden', attrs: { id: 'discount-error' } })
        );
        wrap.appendChild(form);
        modalRoot.appendChild(wrap);
        wrap.querySelector('.modal-close').addEventListener('click', close);
        form.querySelector('#cancel-discount')?.addEventListener('click', close);
        if (existing) {
            const codeInput = form.querySelector('#d-code input') || form.querySelector('#d-code');
            if (codeInput) codeInput.value = existing.code;
            form.querySelector('#d-type').value = existing.type;
            form.querySelector('#d-value').value = existing.value;
            form.querySelector('#d-min').value = existing.minSubtotalCents || 0;
            if (existing.expiresAt) form.querySelector('#d-exp').value = existing.expiresAt.split('T')[0];
        }
        // Normalize discount code
        const codeField = form.querySelector('#d-code input') || form.querySelector('#d-code');
        if (codeField?.addEventListener) {
            codeField.addEventListener('input', () => {
                codeField.value = codeField.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
            });
        }
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const errorBox = form.querySelector('#discount-error');
            const code = existing ? existing.code : (form.querySelector('#d-code input')?.value || form.querySelector('#d-code')?.value || '').trim().toUpperCase();
            const type = form.querySelector('#d-type').value.trim().toLowerCase();
            const value = parseInt(form.querySelector('#d-value').value, 10);
            const minSubtotalCents = parseInt(form.querySelector('#d-min').value, 10) || 0;
            const expiresRaw = form.querySelector('#d-exp').value.trim();
            let expiresAt = null;
            const showErr = (msg) => { errorBox.textContent = msg; errorBox.classList.remove('hidden'); };
            errorBox.classList.add('hidden');
            if (!code) return showErr('Code required');
            if (!['percent', 'fixed', 'ship'].includes(type)) return showErr('Type must be percent, fixed, or ship');
            if (!Number.isInteger(value) || value <= 0) return showErr('Value must be positive integer');
            if (type !== 'fixed' && (value < 1 || value > 100)) return showErr('Value must be 1-100 for percent/ship');
            if (expiresRaw) {
                const parsed = Date.parse(expiresRaw);
                if (Number.isNaN(parsed)) return showErr('Expires date invalid');
                expiresAt = new Date(parsed).toISOString();
            }
            const payload = { code, type, value, minSubtotalCents, expiresAt };
            try {
                if (existing) {
                    await apiFetch('/api/discounts/' + encodeURIComponent(code), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    notify('Discount updated', 'success');
                } else {
                    await apiFetch('/api/discounts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
                    notify('Discount created', 'success');
                }
                close();
                await loadDiscounts();
                refreshDiscountTable();
            } catch (err) { showErr(err.message); }
        });
    });
}

// ============================================
// Order Timeline Modal
// ============================================

function showOrderTimeline(orderId) {
    const orders = getAdminOrders();
    const order = orders.find(o => String(o.id) === String(orderId));
    const summaryBits = order ? [
        { label: 'Status', value: (order.status || 'Unknown').replace(/_/g, ' ') },
        { label: 'Customer', value: order.customerName || order.customerEmail || '—' },
        { label: 'Total', value: money(order.totalCents || 0) }
    ] : [];
    const timelineStages = order ? [
        { label: 'Created', at: order.createdAt },
        { label: 'Paid', at: order.paidAt },
        { label: 'Fulfilled', at: order.fulfilledAt },
        { label: 'Shipped', at: order.shippedAt },
        { label: 'Delivered', at: order.completedAt },
        { label: 'Cancelled', at: order.cancelledAt }
    ].filter(stage => stage.at) : [];
    const modalRoot = getModalRoot();
    if (!modalRoot) return;
    showModal(async close => {
        const wrap = el('div', { class: 'modal order-timeline-modal' });
        wrap.appendChild(el('button', { class: 'modal-close' }, '×'));
        wrap.appendChild(el('h2', {}, 'Order Timeline'));
        wrap.appendChild(el('p', { class: 'tiny muted' }, order ? `Order ${order.id}` : 'Order details not found.'));
        if (summaryBits.length) {
            const summaryGrid = el('div', { class: 'order-timeline-summary' },
                ...summaryBits.map(bit => el('div', { class: 'order-timeline-summary-item' },
                    el('span', { class: 'order-timeline-summary-label' }, bit.label),
                    el('span', { class: 'order-timeline-summary-value' }, bit.value)
                ))
            );
            wrap.appendChild(summaryGrid);
        }
        if (timelineStages.length) {
            wrap.appendChild(el('div', { class: 'order-timeline-stages' },
                el('span', { class: 'tiny muted order-timeline-stages-label' }, 'Key milestones'),
                ...timelineStages.map(stage => el('div', { class: 'order-timeline-stage tiny' },
                    el('span', { class: 'order-timeline-stage-label' }, stage.label),
                    el('span', { class: 'order-timeline-stage-date' }, new Date(stage.at).toLocaleString())
                ))
            ));
        }
        const eventsList = el('ol', { class: 'order-timeline-events' },
            el('li', { class: 'order-timeline-loading tiny muted' }, 'Loading event history...')
        );
        wrap.appendChild(el('div', { class: 'order-timeline-events-wrap' },
            el('span', { class: 'tiny muted order-timeline-events-label' }, 'Event history'),
            eventsList
        ));
        modalRoot.appendChild(wrap);
        wrap.querySelector('.modal-close').addEventListener('click', close);
        try {
            const data = await apiFetch('/api/orders/' + orderId + '/events');
            const events = Array.isArray(data?.events) ? data.events.slice().sort((a, b) => new Date(a.at || 0).getTime() - new Date(b.at || 0).getTime()) : [];
            eventsList.innerHTML = '';
            if (!events.length) {
                eventsList.appendChild(el('li', { class: 'order-timeline-empty tiny muted' }, 'No events yet.'));
            } else {
                events.forEach(ev => {
                    const status = typeof ev.status === 'string' ? ev.status.replace(/_/g, ' ') : 'Event';
                    const timestamp = ev.at ? new Date(ev.at).toLocaleString() : '—';
                    eventsList.appendChild(el('li', { class: 'order-timeline-event' },
                        el('div', { class: 'order-timeline-event-head' },
                            el('span', { class: 'order-timeline-event-status' }, status),
                            el('span', { class: 'order-timeline-event-date tiny muted' }, timestamp)
                        ),
                        ev.note ? el('p', { class: 'order-timeline-event-note tiny' }, ev.note) : null
                    ));
                });
            }
        } catch (err) {
            eventsList.innerHTML = '';
            eventsList.appendChild(el('li', { class: 'order-timeline-error tiny' }, 'Unable to load events: ' + err.message));
        }
    });
}

// ============================================
// Customer Profile Modal
// ============================================

function showCustomerProfile(info = {}) {
    const orders = getAdminOrders();
    const emailKey = (info.email || '').trim().toLowerCase();
    const nameKey = (info.name || '').trim().toLowerCase();
    const matches = orders.filter(order => {
        const orderEmail = (order.customerEmail || '').trim().toLowerCase();
        if (emailKey && orderEmail) return orderEmail === emailKey;
        if (!emailKey && nameKey) {
            const orderName = (order.customerName || '').trim().toLowerCase();
            if (orderName) return orderName === nameKey;
        }
        return false;
    });
    let matchedOrders = matches;
    if (!matchedOrders.length && info.orderId) {
        const fallbackOrder = orders.find(o => String(o.id) === String(info.orderId));
        if (fallbackOrder) matchedOrders = [fallbackOrder];
    }
    const profileOrder = matchedOrders[0];
    const customerName = profileOrder?.customerName || info.name || 'Customer';
    const customerEmail = profileOrder?.customerEmail || info.email || '';
    const totals = matchedOrders.reduce((acc, order) => {
        acc.spend += order.totalCents || 0;
        acc.count += 1;
        return acc;
    }, { spend: 0, count: 0 });
    const recentOrders = matchedOrders.slice().sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 5);
    const modalRoot = getModalRoot();
    if (!modalRoot) return;
    showModal(close => {
        const wrap = el('div', { class: 'modal customer-profile-modal' });
        wrap.appendChild(el('button', { class: 'modal-close' }, '×'));
        wrap.appendChild(el('h2', {}, 'Customer Profile'));
        wrap.appendChild(el('p', { class: 'tiny muted' }, customerEmail ? `${customerName} · ${customerEmail}` : customerName));
        const body = el('div', { class: 'customer-profile-body' });
        if (!matchedOrders.length) {
            body.appendChild(el('p', { class: 'alert alert-info' }, 'No additional orders found for this customer.'));
        } else {
            body.appendChild(el('div', { class: 'customer-profile-summary' },
                el('div', { class: 'customer-profile-tile' },
                    el('span', { class: 'customer-profile-label tiny muted' }, 'Total orders'),
                    el('span', { class: 'customer-profile-value' }, String(totals.count))
                ),
                el('div', { class: 'customer-profile-tile' },
                    el('span', { class: 'customer-profile-label tiny muted' }, 'Total spent'),
                    el('span', { class: 'customer-profile-value' }, money(totals.spend))
                )
            ));
            if (recentOrders.length) {
                const ordersList = el('div', { class: 'customer-profile-orders' });
                recentOrders.forEach(order => {
                    ordersList.appendChild(el('div', { class: 'customer-profile-order-card' },
                        el('span', { class: 'customer-profile-order-id' }, order.id || '—'),
                        el('span', { class: 'customer-profile-order-total' }, money(order.totalCents || 0)),
                        el('span', { class: 'customer-profile-order-status tiny muted' }, order.status || 'unknown'),
                        el('span', { class: 'customer-profile-order-date tiny muted' }, order.createdAt ? new Date(order.createdAt).toLocaleString() : '—')
                    ));
                });
                body.appendChild(el('div', { class: 'customer-profile-section' },
                    el('span', { class: 'customer-profile-section-title tiny muted' }, 'Recent orders'),
                    ordersList
                ));
            }
        }
        wrap.appendChild(body);
        modalRoot.appendChild(wrap);
        wrap.querySelector('.modal-close').addEventListener('click', close);
    });
}

// ============================================
// Prompt Order Cancellation
// ============================================

function promptOrderCancellation(order) {
    return new Promise(resolve => {
        const modalRoot = getModalRoot();
        if (!modalRoot) { resolve(null); return; }
        showModal(close => {
            const wrap = el('div', { class: 'modal cancel-order-modal' });
            const orderLabel = order ? `Order ${order.id}` : 'This order';
            wrap.appendChild(el('button', { class: 'modal-close' }, '×'));
            wrap.appendChild(el('h2', {}, 'Cancel order?'));
            wrap.appendChild(el('p', { class: 'small muted' }, `You are about to cancel ${orderLabel}. This will notify the customer.`));
            if (order) {
                wrap.appendChild(el('ul', { class: 'cancel-order-meta muted tiny' },
                    order.customerName ? el('li', {}, 'Customer: ', order.customerName) : null,
                    Number.isFinite(order.totalCents) ? el('li', {}, 'Total: ', money(order.totalCents)) : null
                ));
            }
            const reasonWrap = el('div', { class: 'cancel-order-reason hidden' },
                el('label', { class: 'tiny muted' }, 'Reason for cancellation'),
                el('textarea', { class: 'cancel-order-reason-input', attrs: { rows: '3', placeholder: 'Payment timeout, stock issue, etc.' } })
            );
            wrap.appendChild(reasonWrap);
            const actions = el('div', { class: 'cancel-order-actions' });
            const keepBtn = el('button', { class: 'btn btn-xs' }, 'No, keep order');
            const confirmBtn = el('button', { class: 'btn btn-xs btn-danger' }, 'Yes, cancel order');
            actions.appendChild(keepBtn);
            actions.appendChild(confirmBtn);
            wrap.appendChild(actions);
            modalRoot.appendChild(wrap);
            const textarea = reasonWrap.querySelector('textarea');
            const closeAndResolve = (val) => { close(); resolve(val); };
            keepBtn.addEventListener('click', () => closeAndResolve(null));
            wrap.querySelector('.modal-close').addEventListener('click', () => closeAndResolve(null));
            let reasonVisible = false;
            confirmBtn.addEventListener('click', () => {
                if (!reasonVisible) {
                    reasonVisible = true;
                    reasonWrap.classList.remove('hidden');
                    confirmBtn.textContent = 'Submit cancellation';
                    textarea.focus();
                    return;
                }
                const reason = textarea.value.trim();
                if (!reason) {
                    textarea.classList.add('field-error');
                    textarea.focus();
                    return;
                }
                closeAndResolve(reason);
            });
        });
    });
}

// ============================================
// Build Order Actions
// ============================================

function buildOrderActions(o, opts = {}) {
    const frag = document.createDocumentFragment();
    const includeTimeline = opts.includeTimeline !== false;
    function act(label, action, disabled = false, extraAttrs = {}) {
        const attrs = Object.assign({ 'data-order-action': action, 'data-order-id': o.id }, extraAttrs);
        if (disabled) attrs.disabled = 'true';
        const b = el('button', { class: 'btn btn-xs' + (disabled ? ' btn-disabled' : ' btn-outline'), attrs }, label);
        frag.appendChild(b);
    }
    if (includeTimeline) {
        frag.appendChild(el('button', { class: 'btn btn-xs btn-outline', attrs: { 'data-order-timeline': o.id } }, 'Timeline'));
    }
    if (o.cancelledAt) { act('Cancelled', 'noop', true); return frag; }
    if (!o.paidAt) act('Pay', 'pay');
    if (o.paidAt && !o.fulfilledAt) act('Fulfill', 'fulfill');
    if (o.fulfilledAt && !o.shippedAt) act('Ship', 'ship');
    if (!o.shippedAt && !o.cancelledAt) act('Cancel', 'cancel');
    if (o.shippedAt) {
        act('Shipped', 'noop', true);
        if (o.completedAt) {
            act('Delivered', 'noop', true);
        } else {
            act('Delivered', 'complete', false, { 'data-order-email': o.customerEmail || '' });
        }
    }
    return frag;
}

// ============================================
// Refresh Admin Data
// ============================================

async function refreshAdminData() {
    if (!state.admin.user) return;
    try {
        await loadProducts(state.admin.showDeleted, { forceFresh: true });
        // Prune deletedBuffer
        for (const [id, snap] of state.deletedBuffer.entries()) {
            const live = state.productsById.get(id);
            if (!live || !live.deletedAt) state.deletedBuffer.delete(id);
        }
        await Promise.all([
            loadOrdersAdmin(),
            loadDiscounts(),
            loadLowStock(parseInt(document.getElementById('low-stock-threshold')?.value, 10) || 5),
            loadAdminReviews(state.admin.reviews?.status || 'pending')
        ]);
        if (state.currentRoute === 'admin') {
            refreshAdminTables();
        }
    } catch (err) {
        console.error('Failed to refresh admin data:', err);
        notify('Failed to load admin data: ' + err.message, 'error');
    }
}

// ============================================
// Exports
// ============================================

export {
    refreshAdminTables,
    refreshAdminData,
    showAdminLoginModal,
    showProductModal,
    showDiscountModal,
    showOrderTimeline,
    showCustomerProfile,
    promptOrderCancellation,
    buildOrderActions,
    renderRefundMessagesThread,
    refreshAdminReviewsTable,
    refreshDiscountTable,
    refreshLowStockTable,
    refreshAnalyticsPanel,
    hydrateAnalytics,
    clampClientRangeDays
};
