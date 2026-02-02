import { el, setBodyRoute } from '../utils/dom.js';
import { state, getRefundStatus, formatRefundStatus, describeRefundUsage, getRefundThreadStore } from '../state/index.js';
import { getRootEl, notify, formatDateTimeStamp } from '../utils/helpers.js';
import { money } from '../utils/currency.js';
import { navigate } from '../router/index.js';
import { loadCustomerOrders, loadProducts, apiFetch, sendCustomerRefundMessage, customerReopenRefundCase } from '../api/index.js';
import { showModal } from '../components/index.js';
import { showCustomerAuthModal } from '../auth/customer.js';

// My Orders Detail Cache
if (!state.myOrdersDetailCache) state.myOrdersDetailCache = new Map();

/**
 * Determines the order bucket for filtering
 * @param {Object} o - Order object
 * @returns {string}
 */
function orderBucket(o) {
    if (!o) return 'pending';
    if (o.cancelledAt) return 'cancelled';
    if (o.completedAt) return 'delivered';
    if (o.shippedAt) return 'shipped';
    if (o.paidAt) return 'processing';
    return 'pending';
}

/**
 * Derives orders from state
 * @returns {Array}
 */
function deriveMyOrders() {
    return state.customer?.orders || [];
}

/**
 * Renders the customer orders page
 */
export function renderMyOrders() {
    const rootEl = getRootEl();
    if (!rootEl) return;

    setBodyRoute('my-orders');
    state.currentRoute = 'my-orders';
    rootEl.innerHTML = '';

    const sessionUser = state.customer;
    const signedIn = !!(sessionUser && sessionUser.sessionToken && sessionUser.email);
    let activeTab = 'all';
    let searchQuery = '';

    const shell = el('div', { class: 'my-orders-shell container' });
    const header = el('header', { class: 'mo-header' },
        el('h1', { class: 'mo-heading' }, 'My Orders'),
        el('p', { class: 'mo-description' }, 'View and manage your order history')
    );
    shell.appendChild(header);

    if (!signedIn) {
        state.customer.orders = [];
        state.myOrdersDetailCache.clear();
        state.customerRefundThreads = new Map();
        const prompt = el('div', { class: 'mo-empty-state' },
            el('h3', {}, 'Sign in to view orders'),
            el('p', {}, 'Sign in with your account to see your order history.'),
            el('button', { class: 'mo-button mo-button--primary', attrs: { type: 'button', id: 'mo-signin-trigger' } }, 'Sign in')
        );
        prompt.querySelector('#mo-signin-trigger').addEventListener('click', () => showCustomerAuthModal('login'));
        shell.appendChild(prompt);
        rootEl.appendChild(shell);
        return;
    }

    const searchInput = el('input', {
        class: 'mo-search-input',
        attrs: {
            type: 'search',
            placeholder: 'Search orders by order number or product name...',
            value: searchQuery
        }
    });
    const searchIcon = el('span', { class: 'mo-search-icon', attrs: { 'aria-hidden': 'true' } },
        el('svg', { attrs: { viewBox: '0 0 20 20', fill: 'none', xmlns: 'http://www.w3.org/2000/svg' } },
            el('path', {
                attrs: {
                    d: 'M13.5 12.5L17.5 16.5',
                    stroke: 'currentColor',
                    'stroke-width': '1.6',
                    'stroke-linecap': 'round'
                }
            }),
            el('circle', {
                attrs: {
                    cx: '9',
                    cy: '9',
                    r: '5.5',
                    stroke: 'currentColor',
                    'stroke-width': '1.6'
                }
            })
        )
    );
    const searchBar = el('div', { class: 'mo-search' }, searchIcon, searchInput);

    const tabsConfig = [
        ['all', 'All'],
        ['pending', 'Pending'],
        ['processing', 'Processing'],
        ['shipped', 'Shipped'],
        ['delivered', 'Delivered'],
        ['cancelled', 'Cancelled']
    ];
    const tabButtons = [];
    const tabBar = el('div', { class: 'mo-tabbar', attrs: { role: 'tablist', 'aria-label': 'Filter orders' } },
        ...tabsConfig.map(([key, label]) => {
            const btn = el('button', {
                class: 'mo-tab',
                attrs: { type: 'button', 'data-tab': key, role: 'tab', 'aria-selected': 'false' }
            },
                el('span', { class: 'mo-tab-label' }, label),
                el('span', { class: 'mo-tab-count', attrs: { 'data-tab-count': key } }, '0')
            );
            tabButtons.push(btn);
            return btn;
        })
    );

    const refundShortcutCount = el('span', { class: 'mo-tabbar-cta-count' }, '0');
    const refundShortcutBtn = el('button', {
        class: 'mo-button mo-button--ghost mo-button--compact mo-tabbar-cta',
        attrs: { type: 'button', 'data-refund-shortcut': '1' }
    },
        el('span', { class: 'mo-tabbar-cta-label' }, 'Refund status'),
        refundShortcutCount
    );
    refundShortcutBtn.hidden = true;
    refundShortcutCount.hidden = true;

    const tabSection = el('div', { class: 'mo-tabbar-row' }, tabBar, refundShortcutBtn);
    const content = el('div', { class: 'mo-orders', attrs: { id: 'my-orders-content' } });

    shell.appendChild(searchBar);
    shell.appendChild(tabSection);
    shell.appendChild(content);

    refundShortcutBtn.addEventListener('click', () => showRefundSummaryModal());
    rootEl.appendChild(shell);

    async function ensureProductsLoaded() {
        if (!state.products || !state.products.length) {
            await loadProducts();
        }
    }

    function formatDate(value) {
        if (!value) return '—';
        const dt = new Date(value);
        if (Number.isNaN(dt.getTime())) return '—';
        return dt.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function mergedOrder(order) {
        if (!order) return null;
        const detail = state.myOrdersDetailCache?.get(order.id);
        const merged = { ...order };
        if (detail?.order) Object.assign(merged, detail.order);
        merged.items = Array.isArray(detail?.items) ? detail.items.slice() : Array.isArray(order.items) ? order.items.slice() : [];
        merged.events = Array.isArray(detail?.events) ? detail.events.slice() : [];
        return merged;
    }

    function buildStatusMeta(order) {
        const bucket = orderBucket(order);
        const statusMap = {
            pending: { label: 'Pending', className: 'mo-status-chip--pending' },
            processing: { label: 'Processing', className: 'mo-status-chip--processing' },
            shipped: { label: 'Shipped', className: 'mo-status-chip--shipped' },
            delivered: { label: 'Delivered', className: 'mo-status-chip--delivered' },
            cancelled: { label: 'Cancelled', className: 'mo-status-chip--cancelled' }
        };
        return statusMap[bucket] || statusMap.pending;
    }

    function filterByQuery(order) {
        if (!searchQuery) return true;
        const parts = [order.id || '', order.customerName || '', order.customerEmail || ''];
        if (Array.isArray(order.items)) {
            order.items.forEach(item => {
                if (item.titleSnapshot) parts.push(item.titleSnapshot);
                if (item.quantity) parts.push(String(item.quantity));
            });
        }
        const haystack = parts.join(' ').toLowerCase();
        return haystack.includes(searchQuery.toLowerCase());
    }

    function enrichItem(item) {
        if (!item) return null;
        const productMap = state.productsById instanceof Map ? state.productsById : new Map();
        const product = item.productId ? productMap.get(item.productId) : null;
        const rawImages = product?.images;
        const images = Array.isArray(rawImages) ? rawImages : rawImages ? [rawImages] : [];
        const image = images.length ? images[0] : null;
        return {
            title: item.titleSnapshot || product?.title || 'Item',
            quantity: item.quantity || 0,
            unitPriceCents: item.unitPriceCents || 0,
            image,
            productId: item.productId || null,
            variantId: item.variantId || null,
            reviewSubmitted: Boolean(item.reviewSubmitted),
            reviewStatus: item.reviewStatus || null
        };
    }

    function orderHasReviewableItems(order) {
        if (!order || !Array.isArray(order.items)) return false;
        return order.items.some(item => item && item.productId && !item.reviewSubmitted);
    }

    function shouldShowRefundSection(order) {
        return !!(order && order.returnRequestedAt);
    }

    function buildRefundDetailSection(order) {
        if (!shouldShowRefundSection(order)) return null;
        const orderId = order.id || '';
        const statusKey = getRefundStatus(order.returnAdminStatus);
        const statusLabel = formatRefundStatus(statusKey);
        const requestedCopy = order.returnRequestedAt ? formatDateTimeStamp(order.returnRequestedAt) : '—';
        const lastUpdateCopy = order.returnAdminRespondedAt ? formatDateTimeStamp(order.returnAdminRespondedAt) : 'Awaiting response';
        const reasonText = (order.returnReason || '').trim() || 'You did not include extra notes with this request.';
        const usageCopy = typeof describeRefundUsage === 'function' ? describeRefundUsage(order) : '';
        const messageFieldId = `refund-message-${orderId || Math.random().toString(36).slice(2)}`;
        const isClosed = !!order.returnClosedAt;
        return el('div', { class: 'mo-detail-section mo-refund-section', attrs: { 'data-refund-section': orderId } },
            el('div', { class: 'mo-refund-header' },
                el('div', { class: 'mo-refund-title-stack' },
                    el('h4', { class: 'mo-detail-title' }, 'Refund updates'),
                    el('p', { class: 'mo-refund-subtitle' }, 'See the latest status and chat with our team.')
                ),
                el('span', { class: `admin-refund-status-chip status-${statusKey}` }, statusLabel)
            ),
            el('div', { class: 'mo-refund-meta' },
                el('div', { class: 'mo-refund-meta-card' },
                    el('span', { class: 'tiny muted' }, 'Requested on'),
                    el('span', {}, requestedCopy)
                ),
                el('div', { class: 'mo-refund-meta-card' },
                    el('span', { class: 'tiny muted' }, 'Last update'),
                    el('span', {}, lastUpdateCopy)
                )
            ),
            el('div', { class: 'mo-refund-reason-wrap' },
                el('span', { class: 'tiny muted' }, 'Issue shared'),
                el('p', { class: 'mo-refund-reason' }, reasonText)
            ),
            usageCopy ? el('p', { class: 'mo-refund-usage tiny muted' }, usageCopy) : null,
            el('div', { class: 'admin-refund-thread mo-refund-thread' },
                el('div', { class: 'admin-refund-thread-messages mo-refund-thread-messages', attrs: { 'data-customer-refund-messages': orderId } },
                    el('p', { class: 'tiny muted' }, 'Conversation loads when you expand this order.')
                ),
                el('form', { class: 'admin-refund-reply mo-refund-reply', attrs: { 'data-customer-refund-form': orderId, 'data-case-closed': isClosed ? 'true' : 'false' } },
                    isClosed ? el('p', { class: 'tiny alert mo-refund-closed-banner' }, 'This case is closed. Request a reopen to send a new message.') : null,
                    el('label', { class: 'tiny muted', attrs: { for: messageFieldId } }, 'Message the store team'),
                    el('textarea', {
                        class: 'mo-refund-textarea',
                        attrs: {
                            id: messageFieldId,
                            placeholder: isClosed ? 'Closed — ask us to reopen to reply' : 'Share new details or ask a question…',
                            rows: '3',
                            maxlength: '2000',
                            ...(isClosed ? {} : { required: 'true' }),
                            ...(isClosed ? { disabled: 'true' } : {})
                        }
                    }),
                    el('div', { class: 'mo-refund-reply-actions' },
                        isClosed
                            ? el('button', { class: 'mo-button mo-button--ghost mo-button--compact', attrs: { type: 'button', 'data-refund-reopen-request': orderId } }, 'Request reopen')
                            : el('button', { class: 'mo-button mo-button--primary mo-button--compact', attrs: { type: 'submit' } }, 'Send')
                    )
                )
            )
        );
    }

    function getRefundOrders() {
        return deriveMyOrders()
            .map(order => mergedOrder(order) || order)
            .filter(order => !!(order && order.returnRequestedAt));
    }

    function buildRefundOverviewCard(order) {
        if (!order) return el('div');
        const statusKey = getRefundStatus(order.returnAdminStatus);
        const statusLabel = formatRefundStatus(statusKey);
        const requestedCopy = order.returnRequestedAt ? formatDateTimeStamp(order.returnRequestedAt) : 'Awaiting submission';
        const lastUpdateCopy = order.returnAdminRespondedAt ? formatDateTimeStamp(order.returnAdminRespondedAt) : 'Awaiting response';
        const usageCopy = typeof describeRefundUsage === 'function' ? describeRefundUsage(order) : '';
        const items = (order.items || []).map(enrichItem).filter(Boolean);
        const previewItems = items.slice(0, 2);
        const extraCount = Math.max(0, items.length - previewItems.length);
        return el('article', { class: 'refund-overview-card', attrs: { 'data-refund-order': order.id } },
            el('div', { class: 'refund-overview-head' },
                el('div', { class: 'refund-overview-id' },
                    el('span', { class: 'tiny muted' }, 'Order'),
                    el('strong', {}, `#${String(order.id).slice(0, 10)}`)
                ),
                el('span', { class: `admin-refund-status-chip status-${statusKey}` }, statusLabel)
            ),
            el('div', { class: 'refund-overview-meta' },
                el('div', { class: 'refund-overview-meta-entry' },
                    el('span', { class: 'tiny muted' }, 'Requested on'),
                    el('span', {}, requestedCopy)
                ),
                el('div', { class: 'refund-overview-meta-entry' },
                    el('span', { class: 'tiny muted' }, 'Last update'),
                    el('span', {}, lastUpdateCopy)
                )
            ),
            el('div', { class: 'refund-overview-reason-wrap' },
                el('span', { class: 'tiny muted' }, 'Issue shared'),
                el('p', { class: 'refund-overview-reason' }, (order.returnReason || '').trim() || 'No reason provided.')
            ),
            usageCopy ? el('p', { class: 'refund-overview-usage tiny muted' }, usageCopy) : null,
            el('div', { class: 'refund-overview-products' },
                previewItems.length
                    ? previewItems.map(item => el('div', { class: 'refund-overview-product' },
                        item.image ? el('img', { attrs: { src: item.image, alt: item.title || 'Product' } }) : el('span', { class: 'mo-thumb-placeholder refund-overview-thumb' }, item.title?.charAt(0) || '•'),
                        el('div', { class: 'refund-overview-product-info' },
                            el('span', { class: 'refund-overview-product-title' }, item.title || 'Item'),
                            el('span', { class: 'refund-overview-product-qty tiny muted' }, `Quantity: ${item.quantity || 1}`)
                        )
                    ))
                    : [el('p', { class: 'tiny muted' }, 'We will load items as soon as they are available.')]
            ),
            extraCount ? el('span', { class: 'refund-overview-more tiny muted' }, `+${extraCount} more item${extraCount === 1 ? '' : 's'}`) : null,
            el('div', { class: 'refund-overview-actions' },
                el('button', {
                    class: 'mo-button mo-button--primary mo-button--compact',
                    attrs: { type: 'button', 'data-refund-overview-open': order.id }
                }, 'Open conversation')
            )
        );
    }

    function buildOrderCard(order) {
        if (!order) return el('div');
        const status = buildStatusMeta(order);
        const card = el('article', { class: 'mo-order-card', attrs: { 'data-order-id': order.id } });
        card.setAttribute('data-has-refund', shouldShowRefundSection(order) ? '1' : '0');
        const head = el('div', { class: 'mo-order-head' },
            el('div', { class: 'mo-order-reference' },
                el('span', { class: 'mo-order-number' }, `Order #${(order.id || '').toString().slice(0, 12)}`),
                el('div', { class: 'mo-order-meta' },
                    el('span', {}, `Placed on ${formatDate(order.createdAt)}`),
                    el('span', {}, `Estimated delivery: ${formatDate(order.estimatedDeliveryAt)}`)
                )
            ),
            el('div', { class: 'mo-order-status-group' },
                el('span', { class: `mo-status-chip ${status.className}` }, status.label),
                order.returnRequestedAt ? el('span', { class: 'mo-status-chip mo-status-chip--returns', attrs: { 'data-refund-status-chip': order.id } }, formatRefundStatus(order.returnAdminStatus)) : null
            )
        );

        const items = (order.items || [])
            .map(enrichItem)
            .filter(Boolean);

        const itemsList = el('div', { class: 'mo-order-items' },
            items.length
                ? items.map(item => el('div', { class: 'mo-item' },
                    el('div', { class: 'mo-item-thumb' },
                        item.image ? el('img', { attrs: { src: item.image, alt: item.title } }) : el('span', { class: 'mo-thumb-placeholder' }, item.title.charAt(0) || '•')
                    ),
                    el('div', { class: 'mo-item-info' },
                        el('span', { class: 'mo-item-title' }, item.title),
                        el('span', { class: 'mo-item-qty' }, `Quantity: ${item.quantity || 1}`),
                        el('span', { class: 'mo-item-price' }, money((item.unitPriceCents || 0) * (item.quantity || 1), { showBase: false }))
                    )
                ))
                : [
                    el('div', { class: 'mo-item mo-item--empty' },
                        el('div', { class: 'mo-item-info' },
                            el('span', { class: 'mo-item-title' }, 'Order items will appear here once available.')
                        )
                    )
                ]
        );

        const summary = el('div', { class: 'mo-order-summary' },
            el('span', { class: 'mo-order-total-label' }, 'Total'),
            el('span', { class: 'mo-order-total' }, money(order.totalCents || 0))
        );

        const canReview = order.completedAt && orderHasReviewableItems(order);
        const actions = el('div', { class: 'mo-order-actions' },
            !order.paidAt && !order.cancelledAt ? el('button', { class: 'mo-button mo-button--primary mo-button--compact', attrs: { 'data-pay': order.id } }, 'Pay now') : null,
            order.shippedAt && !order.completedAt ? el('button', { class: 'mo-button mo-button--subtle mo-button--compact', attrs: { 'data-track': order.id } }, 'Track order') : null,
            order.shippedAt && !order.returnRequestedAt && !order.cancelledAt ? el('button', { class: 'mo-button mo-button--ghost mo-button--compact', attrs: { 'data-return': order.id } }, 'Return / Refund') : null,
            el('button', { class: 'mo-button mo-button--ghost mo-button--compact', attrs: { 'data-toggle-detail': order.id, 'aria-expanded': 'false' } }, 'View details'),
            // Add review button when eligible
            canReview
                ? el('button', {
                    class: 'mo-button mo-button--ghost mo-button--compact mo-review-btn',
                    attrs: {
                        type: 'button',
                        'data-order-id': order.id
                    }
                }, 'Write Review')
                : null
        );
        const detailSections = [];
        const refundSection = buildRefundDetailSection(order);
        if (refundSection) detailSections.push(refundSection);
        if (order.events && order.events.length) {
            detailSections.push(
                el('div', { class: 'mo-detail-section' },
                    el('h4', { class: 'mo-detail-title' }, 'Status updates'),
                    el('ul', { class: 'mo-event-list' },
                        ...order.events.map(ev => el('li', { class: 'mo-event' },
                            el('span', { class: 'mo-event-status' }, ev.status.replace(/_/g, ' ')),
                            el('time', { class: 'mo-event-time', attrs: { datetime: ev.at } }, formatDate(ev.at))
                        ))
                    )
                )
            );
        }
        detailSections.push(
            el('div', { class: 'mo-detail-section' },
                el('h4', { class: 'mo-detail-title' }, 'Payment breakdown'),
                el('ul', { class: 'mo-breakdown' },
                    el('li', {}, el('span', {}, 'Subtotal'), el('span', {}, money(order.subtotalCents || 0))),
                    el('li', {}, el('span', {}, 'Shipping'), el('span', {}, money(order.shippingCents || 0))),
                    el('li', {}, el('span', {}, 'Discounts'), el('span', {}, order.discountCents ? '-' + money(order.discountCents, { showBase: false }) : money(0))),
                    el('li', { class: 'mo-breakdown-total' }, el('span', {}, 'Total paid'), el('span', {}, money(order.totalCents || 0)))
                )
            )
        );

        const detail = el('div', { class: 'mo-order-detail hidden' }, ...detailSections);

        card.appendChild(head);
        card.appendChild(itemsList);
        card.appendChild(summary);
        card.appendChild(actions);
        card.appendChild(detail);
        return card;
    }

    function renderEmptyState(message) {
        content.innerHTML = '';
        content.appendChild(
            el('div', { class: 'mo-empty-state' },
                el('h3', {}, 'No orders to show'),
                el('p', {}, message || 'Recent purchases will appear here once they are ready.')
            )
        );
    }

    function updateTabCounts() {
        const orders = deriveMyOrders();
        const counts = { all: 0, pending: 0, processing: 0, shipped: 0, delivered: 0, cancelled: 0 };
        for (const base of orders) {
            const merged = mergedOrder(base) || base;
            const bucket = orderBucket(merged);
            if (counts[bucket] != null) counts[bucket] += 1;
            counts.all += 1;
        }
        tabBar.querySelectorAll('[data-tab-count]').forEach(node => {
            const key = node.getAttribute('data-tab-count');
            node.textContent = counts[key] != null ? String(counts[key]) : '0';
        });
    }

    function setRefundShortcutState(orderList = []) {
        const refundCount = Array.isArray(orderList)
            ? orderList.reduce((sum, order) => sum + (order?.returnRequestedAt ? 1 : 0), 0)
            : 0;
        refundShortcutCount.textContent = String(refundCount);
        refundShortcutCount.hidden = refundCount === 0;
        refundShortcutBtn.hidden = refundCount === 0;
        /** @type {HTMLButtonElement} */ (refundShortcutBtn).disabled = refundCount === 0;
    }

    // Handler to open review modal (must be in scope for renderOrders)
    function handleReviewButtonClick(e) {
        const trigger = e.target.closest('.mo-review-btn');
        if (!trigger) return;
        const orderId = trigger.getAttribute('data-order-id');
        const context = getOrderReviewContext(orderId);
        if (!context) {
            notify('We could not locate that order.', 'error');
            return;
        }
        if (!context.items.length) {
            notify('All items in this order already have reviews.', 'info');
            return;
        }
        if (context.items.length === 1) {
            openReviewModal(context, context.items[0]);
        } else {
            createProductSelectionModal(context);
        }
    }

    function getOrderReviewContext(orderId) {
        if (!orderId) return null;
        const baseOrder = deriveMyOrders().find(order => String(order?.id) === String(orderId));
        if (!baseOrder) return null;
        const order = mergedOrder(baseOrder) || baseOrder;
        const seen = new Set();
        const items = (order.items || [])
            .map(enrichItem)
            .filter(item => {
                if (!item || !item.productId) return false;
                if (item.reviewSubmitted) return false;
                const key = `${item.productId}:${item.variantId || ''}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });
        return {
            order,
            items,
            customerName: order.customerName || state.customer?.name || state.customer?.fullName || '',
            customerEmail: order.customerEmail || state.customer?.email || ''
        };
    }

    function markOrderItemReviewed(orderId, productId, status = 'pending') {
        if (!orderId || !productId) return;
        const normalizedOrderId = String(orderId);
        const normalizedProductId = String(productId);

        const applyToItems = (items = []) => {
            items.forEach(item => {
                if (!item) return;
                if (String(item.productId) !== normalizedProductId) return;
                item.reviewSubmitted = true;
                if (status) item.reviewStatus = status;
                else if (!item.reviewStatus) item.reviewStatus = 'pending';
            });
        };

        if (Array.isArray(state.customer?.orders)) {
            state.customer.orders.forEach(order => {
                if (!order || String(order.id) !== normalizedOrderId) return;
                if (Array.isArray(order.items)) applyToItems(order.items);
            });
        }

        if (state.myOrdersDetailCache instanceof Map) {
            for (const key of [normalizedOrderId, orderId]) {
                if (!state.myOrdersDetailCache.has(key)) continue;
                const detail = state.myOrdersDetailCache.get(key);
                if (detail && Array.isArray(detail.items)) applyToItems(detail.items);
            }
        }
    }

    function createProductSelectionModal(context) {
        const { items } = context;
        const modalRoot = document.getElementById('modal-root');
        showModal(close => {
            const wrap = el('div', { class: 'modal review-select-modal' });
            wrap.appendChild(el('button', { class: 'modal-close', attrs: { type: 'button' } }, '×'));
            wrap.appendChild(el('h2', {}, 'Select a product to review'));
            wrap.appendChild(el('p', { class: 'tiny muted' }, 'Choose an item from this order to continue.'));
            const list = el('div', { class: 'review-product-list' },
                ...items.map(item => {
                    const label = item.title || 'Product';
                    const button = el('button', {
                        class: 'mo-button mo-button--ghost mo-button--compact',
                        attrs: { type: 'button' }
                    }, label);
                    button.addEventListener('click', () => {
                        close();
                        openReviewModal(context, item);
                    });
                    return button;
                })
            );
            wrap.appendChild(list);
            modalRoot.appendChild(wrap);
            wrap.querySelector('.modal-close')?.addEventListener('click', close);
        });
    }

    async function openReviewModal(context, item) {
        if (!item) return;
        const { order, customerName, customerEmail } = context;
        const product = resolveProductForItem(item);
        if (!product?.id) {
            notify('We could not find that product for review.', 'error');
            return;
        }

        try {
            const { createReviewForm } = await import('../components/reviews.js');
            const modalRoot = document.getElementById('modal-root');
            showModal(close => {
                const wrap = el('div', { class: 'modal review-modal' });
                const closeBtn = el('button', { class: 'modal-close', attrs: { type: 'button' } }, '×');
                wrap.appendChild(closeBtn);
                const titleCopy = product.title || item.title || 'Review product';

                const header = el('div', { class: 'review-modal-header' },
                    el('span', { class: 'review-modal-eyebrow' }, 'Verified purchase'),
                    el('h2', { class: 'review-modal-title' }, `Review: ${titleCopy}`)
                );

                const thumb = item.image
                    ? el('img', { class: 'review-modal-thumb-img', attrs: { src: item.image, alt: titleCopy } })
                    : el('span', { class: 'review-modal-thumb-fallback' }, (titleCopy || '•').trim().charAt(0).toUpperCase() || '•');
                const hero = el('div', { class: 'review-modal-hero' },
                    el('div', { class: 'review-modal-thumb' }, thumb),
                    el('div', { class: 'review-modal-product' },
                        el('p', { class: 'review-modal-order tiny muted' }, `Order #${String(order.id).slice(0, 12)}`),
                        el('p', { class: 'review-modal-copy' }, 'Share how this item performed so fellow shoppers can buy with confidence.')
                    )
                );

                wrap.appendChild(header);
                wrap.appendChild(hero);
                const form = createReviewForm(product, {
                    orderId: order.id,
                    defaultName: customerName || '',
                    defaultEmail: customerEmail || '',
                    lockEmail: Boolean(customerEmail),
                    heading: 'Share your experience',
                    intro: 'We verify reviews with your order details to keep feedback authentic.',
                    onSubmit: async (reviewData) => {
                        const payload = {
                            orderId: reviewData.orderId || order.id,
                            rating: reviewData.rating,
                            title: reviewData.title,
                            body: reviewData.body,
                            email: reviewData.authorEmail,
                            name: reviewData.authorName
                        };
                        const response = await apiFetch(`/api/products/${product.id}/reviews`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload)
                        });
                        const responseStatus = response?.status || 'pending';
                        return {
                            message: response?.message || 'Review submitted for moderation.',
                            tone: 'success',
                            reset: false,
                            afterSuccess: () => {
                                close();
                                markOrderItemReviewed(order.id, product.id, responseStatus);
                                renderOrders();
                                notify('Thanks for sharing your feedback!', 'success');
                            }
                        };
                    }
                });
                wrap.appendChild(form);
                modalRoot.appendChild(wrap);
                closeBtn.addEventListener('click', close);
            });
        } catch (err) {
            console.error('Failed to open review modal', err);
            notify('Unable to open the review form right now.', 'error');
        }
    }

    function resolveProductForItem(item) {
        if (!item) return null;
        const map = state.productsById instanceof Map ? state.productsById : null;
        const byMap = item.productId && map ? (map.get(item.productId) || map.get(String(item.productId))) : null;
        if (byMap) return byMap;
        if (Array.isArray(state.products)) {
            const fromList = state.products.find(p => String(p.id) === String(item.productId));
            if (fromList) return fromList;
        }
        return item.productId ? { id: item.productId, title: item.title || '' } : null;
    }

    function renderOrders() {
        const orders = deriveMyOrders();
        const enriched = orders.map(o => mergedOrder(o)).filter(Boolean);
        setRefundShortcutState(enriched);
        updateTabCounts();
        const filtered = enriched.filter(order => {
            if (activeTab !== 'all' && orderBucket(order) !== activeTab) return false;
            return filterByQuery(order);
        });
        if (!orders.length) {
            renderEmptyState('This account does not have any orders yet.');
            return;
        }
        if (!filtered.length) {
            renderEmptyState('Try a different status tab or clear the search field.');
            return;
        }
        content.innerHTML = '';
        filtered.forEach(order => {
            const card = buildOrderCard(order);
            // Attach review button handler(s)
            card.querySelectorAll('.mo-review-btn').forEach(btn => {
                btn.addEventListener('click', handleReviewButtonClick);
            });
            content.appendChild(card);
        });
    }

    function showRefundSummaryModal() {
        const refundOrders = getRefundOrders();
        const modalRoot = document.getElementById('modal-root');
        showModal(close => {
            const wrap = el('div', { class: 'modal refund-summary-modal' });
            wrap.appendChild(el('button', { class: 'modal-close', attrs: { type: 'button' } }, '×'));
            wrap.appendChild(el('h2', { class: 'refund-summary-title' }, 'Refund requests'));
            wrap.appendChild(el('p', { class: 'refund-summary-subtitle muted' }, 'Track every return or refund conversation in one place.'));
            if (!refundOrders.length) {
                wrap.appendChild(
                    el('div', { class: 'refund-overview-empty' },
                        el('p', {}, 'No refund requests yet.'),
                        el('span', { class: 'tiny muted' }, 'Return an item from the Orders list to see it appear here.')
                    )
                );
            } else {
                const list = el('div', { class: 'refund-overview-list' }, ...refundOrders.map(buildRefundOverviewCard));
                wrap.appendChild(list);
            }
            modalRoot.appendChild(wrap);
            const closeBtn = wrap.querySelector('.modal-close');
            if (closeBtn) closeBtn.addEventListener('click', close);
            wrap.querySelectorAll('[data-refund-overview-open]').forEach(btn => {
                btn.addEventListener('click', () => {
                    const targetId = btn.getAttribute('data-refund-overview-open');
                    close();
                    showRefundConversationModal(targetId);
                });
            });
        });
    }

    function showRefundConversationModal(orderId) {
        if (!orderId) return;
        const base = deriveMyOrders().find(order => String(order?.id) === String(orderId));
        const order = mergedOrder(base) || base;
        if (!order) {
            notify('We could not find that refund request.', 'warn');
            return;
        }
        const statusKey = getRefundStatus(order.returnAdminStatus);
        const statusLabel = formatRefundStatus(statusKey);
        const requestedCopy = order.returnRequestedAt ? formatDateTimeStamp(order.returnRequestedAt) : 'Awaiting submission';
        const lastUpdateCopy = order.returnAdminRespondedAt ? formatDateTimeStamp(order.returnAdminRespondedAt) : 'Awaiting response';
        const isClosed = !!order.returnClosedAt;
        const messageFieldId = `refund-modal-message-${order.id}`;
        const items = (order.items || []).map(enrichItem).filter(Boolean);
        const modalRoot = document.getElementById('modal-root');
        showModal(close => {
            const wrap = el('div', { class: 'modal refund-convo-modal', attrs: { 'data-refund-convo': order.id } });
            wrap.appendChild(el('button', { class: 'modal-close', attrs: { type: 'button' } }, '×'));
            wrap.appendChild(el('div', { class: 'refund-convo-header' },
                el('div', { class: 'refund-convo-heading' },
                    el('span', { class: 'tiny muted' }, 'Order'),
                    el('h3', {}, `#${String(order.id).slice(0, 12)}`)
                ),
                el('div', { class: 'refund-convo-status' },
                    el('span', { class: `admin-refund-status-chip status-${statusKey}` }, statusLabel),
                    el('div', { class: 'refund-convo-meta' },
                        el('span', {}, `Requested ${requestedCopy}`),
                        el('span', { class: 'tiny muted' }, `Last update ${lastUpdateCopy}`)
                    )
                )
            ));
            wrap.appendChild(el('div', { class: 'refund-convo-products' },
                items.length
                    ? items.map(item => el('div', { class: 'refund-convo-product' },
                        item.image ? el('img', { attrs: { src: item.image, alt: item.title || 'Product' } }) : el('span', { class: 'mo-thumb-placeholder refund-overview-thumb' }, item.title?.charAt(0) || '•'),
                        el('div', { class: 'refund-convo-product-info' },
                            el('span', { class: 'refund-convo-product-title' }, item.title || 'Item'),
                            el('span', { class: 'tiny muted' }, `Quantity: ${item.quantity || 1}`)
                        )
                    ))
                    : el('p', { class: 'tiny muted' }, 'Products will appear here once loaded.')
            ));
            wrap.appendChild(el('div', { class: 'refund-convo-reason' },
                el('span', { class: 'tiny muted' }, 'Issue shared'),
                el('p', {}, (order.returnReason || '').trim() || 'No reason provided.')
            ));
            const thread = el('div', { class: 'admin-refund-thread mo-refund-thread refund-convo-thread' },
                el('div', {
                    class: 'admin-refund-thread-messages mo-refund-thread-messages',
                    attrs: { 'data-customer-refund-messages': order.id }
                },
                    el('p', { class: 'tiny muted' }, 'Conversation loads shortly...')
                ),
                el('form', {
                    class: 'admin-refund-reply mo-refund-reply',
                    attrs: { 'data-customer-refund-form': order.id, 'data-case-closed': isClosed ? 'true' : 'false' }
                },
                    isClosed ? el('p', { class: 'tiny alert mo-refund-closed-banner' }, 'Case is closed. Request a reopen to message the team.') : null,
                    el('label', { class: 'tiny muted', attrs: { for: messageFieldId } }, 'Message the store team'),
                    el('textarea', {
                        class: 'mo-refund-textarea',
                        attrs: {
                            id: messageFieldId,
                            rows: '3',
                            maxlength: '2000',
                            placeholder: isClosed ? 'Closed — request reopen to send a message' : 'Ask for an update or share new info…',
                            ...(isClosed ? {} : { required: 'true' }),
                            ...(isClosed ? { disabled: 'true' } : {})
                        }
                    }),
                    el('div', { class: 'mo-refund-reply-actions' },
                        isClosed
                            ? el('button', { class: 'mo-button mo-button--ghost mo-button--compact', attrs: { type: 'button', 'data-refund-reopen-request': order.id } }, 'Request reopen')
                            : el('button', { class: 'mo-button mo-button--primary mo-button--compact', attrs: { type: 'submit' } }, 'Send message')
                    )
                )
            );
            wrap.appendChild(thread);
            modalRoot.appendChild(wrap);
            const closeBtn = wrap.querySelector('.modal-close');
            if (closeBtn) closeBtn.addEventListener('click', close);
            ensureCustomerRefundThread(order.id, wrap);
            const form = wrap.querySelector('[data-customer-refund-form]');
            if (form) {
                form.addEventListener('submit', evt => {
                    evt.preventDefault();
                    submitCustomerRefundForm(form, wrap);
                });
            }
            const requestBtn = wrap.querySelector('[data-refund-reopen-request]');
            if (requestBtn) {
                requestBtn.addEventListener('click', async () => {
                    /** @type {HTMLButtonElement} */ (requestBtn).disabled = true;
                    try {
                        await requestRefundReopen(order.id);
                        notify('Reopen request sent to the store team.', 'success', 2400);
                    } catch (err) {
                        notify(err.message || 'Unable to request a reopen', 'error');
                    } finally {
                        /** @type {HTMLButtonElement} */ (requestBtn).disabled = false;
                    }
                });
            }
        });
    }

    async function ensureCustomerRefundThread(orderId, card, { force = false } = {}) {
        if (!orderId) return;
        const store = getRefundThreadStore('customer');
        const targetCard = card || content.querySelector(`.mo-order-card[data-order-id="${CSS.escape(orderId)}"]`);
        if (!targetCard) return;
        const container = targetCard.querySelector(`[data-customer-refund-messages="${CSS.escape(orderId)}"]`);
        if (!container) return;
        const cache = store.get(orderId);
        if (!cache || force || cache.error) {
            container.innerHTML = '<p class="tiny muted">Loading conversation…</p>';
            try {
                const data = await apiFetch(`/api/orders/${orderId}/refund-messages`);
                store.set(orderId, { messages: data.messages || [] });
            } catch (err) {
                container.innerHTML = `<p class="tiny alert">Unable to load conversation: ${err.message}</p>`;
                console.warn('[refund-thread] customer load failed for', orderId, err);
                return;
            }
        }
        // Render messages inline
        const threadData = store.get(orderId);
        const messages = threadData?.messages || [];
        container.innerHTML = '';
        if (!messages.length) {
            container.appendChild(el('p', { class: 'tiny muted' }, 'No messages yet. Start the conversation!'));
        } else {
            messages.forEach(msg => {
                const isAdmin = msg.authorRole === 'admin';
                const msgBody = msg.body || msg.message || msg.text || '';
                
                // Create header
                const header = el('div', { class: 'refund-msg-header' },
                    el('span', { class: 'refund-msg-sender' }, isAdmin ? 'Store Team' : 'You'),
                    el('time', { class: 'refund-msg-time tiny muted' }, formatDateTimeStamp(msg.createdAt))
                );
                
                // Create body
                const body = el('p', { class: 'refund-msg-body' });
                body.textContent = msgBody;
                
                // Create message container
                const msgEl = el('div', { class: `refund-msg ${isAdmin ? 'refund-msg--admin' : 'refund-msg--customer'}` });
                msgEl.appendChild(header);
                msgEl.appendChild(body);
                
                container.appendChild(msgEl);
            });
        }
        container.scrollTop = container.scrollHeight;
    }

    async function requestRefundReopen(orderId) {
        if (!orderId) return;
        await customerReopenRefundCase(orderId);
    }

    async function submitCustomerRefundForm(form, rootNode) {
        const orderId = form.getAttribute('data-customer-refund-form');
        if (!orderId) return;
        if (form.getAttribute('data-case-closed') === 'true') {
            notify('Case is closed. Request a reopen to message the team.', 'warn');
            return;
        }
        const textarea = form.querySelector('textarea');
        const value = textarea ? textarea.value.trim() : '';
        if (!value) {
            if (textarea) textarea.focus();
            return;
        }
        const submitBtn = form.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;
        try {
            await sendCustomerRefundMessage(orderId, value);
            if (textarea) textarea.value = '';
            notify('Message sent', 'success', 2200);
            await ensureCustomerRefundThread(orderId, rootNode || form.closest('.mo-order-card'), { force: true });
        } catch (err) {
            notify(err.message || 'Unable to send message', 'error');
        } finally {
            if (submitBtn) submitBtn.disabled = false;
        }
    }

    // Wire up tab buttons
    tabButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-tab');
            activeTab = key;
            tabButtons.forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            renderOrders();
        });
    });

    // Set initial active tab
    tabButtons[0]?.classList.add('active');
    tabButtons[0]?.setAttribute('aria-selected', 'true');

    // Search handler
    searchInput.addEventListener('input', (e) => {
        searchQuery = /** @type {HTMLInputElement} */ (e.target).value.trim();
        renderOrders();
    });

    // Content click delegation
    content.addEventListener('click', async (e) => {
        const target = /** @type {HTMLElement} */ (e.target);
        const toggleBtn = target.closest('[data-toggle-detail]');
        if (toggleBtn) {
            const orderId = toggleBtn.getAttribute('data-toggle-detail');
            const card = toggleBtn.closest('.mo-order-card');
            const detail = card?.querySelector('.mo-order-detail');
            if (detail) {
                const isExpanded = !detail.classList.contains('hidden');
                detail.classList.toggle('hidden');
                card?.classList.toggle('expanded', !isExpanded);
                toggleBtn.setAttribute('aria-expanded', String(!isExpanded));
                toggleBtn.textContent = isExpanded ? 'View details' : 'Hide details';
                if (!isExpanded && card?.getAttribute('data-has-refund') === '1') {
                    await ensureCustomerRefundThread(orderId, card);
                }
            }
            return;
        }

        const trackBtn = target.closest('[data-track]');
        if (trackBtn) {
            const orderId = trackBtn.getAttribute('data-track');
            notify('Tracking feature coming soon!', 'info');
            return;
        }

        const returnBtn = target.closest('[data-return]');
        if (returnBtn) {
            const orderId = returnBtn.getAttribute('data-return');
            showReturnRequestModal(orderId);
            return;
        }

        const payBtn = target.closest('[data-pay]');
        if (payBtn) {
            const orderId = payBtn.getAttribute('data-pay');
            notify('Payment feature coming soon!', 'info');
            return;
        }
    });

    // Refund form delegation
    content.addEventListener('submit', (e) => {
        const form = /** @type {HTMLElement} */ (e.target).closest('[data-customer-refund-form]');
        if (form) {
            e.preventDefault();
            submitCustomerRefundForm(form, form.closest('.mo-order-card'));
        }
    });

    content.addEventListener('click', (e) => {
        const reopenBtn = /** @type {HTMLElement} */ (e.target).closest('[data-refund-reopen-request]');
        if (reopenBtn) {
            const orderId = reopenBtn.getAttribute('data-refund-reopen-request');
            /** @type {HTMLButtonElement} */ (reopenBtn).disabled = true;
            requestRefundReopen(orderId)
                .then(() => notify('Reopen request sent to the store team.', 'success', 2400))
                .catch(err => notify(err.message || 'Unable to request a reopen', 'error'))
                .finally(() => { /** @type {HTMLButtonElement} */ (reopenBtn).disabled = false; });
        }
    });

    // Return request modal
    function showReturnRequestModal(orderId) {
        const order = deriveMyOrders().find(o => o.id === orderId);
        if (!order) return;

        const modalRoot = document.getElementById('modal-root');
        showModal(close => {
            const wrap = el('div', { class: 'modal return-request-modal' });
            wrap.appendChild(el('button', { class: 'modal-close', attrs: { type: 'button' } }, '×'));
            wrap.appendChild(el('h2', {}, 'Request Return / Refund'));
            wrap.appendChild(el('p', { class: 'muted' }, `Order #${order.id?.slice(0, 8) || 'N/A'}`));

            const RETURN_REASON_CHOICES = [
                { value: 'defective', label: 'Product is defective or damaged' },
                { value: 'not_as_described', label: 'Product not as described' },
                { value: 'wrong_item', label: 'Received wrong item' },
                { value: 'changed_mind', label: 'Changed my mind' },
                { value: 'size_fit', label: 'Size/fit issue' },
                { value: 'other', label: 'Other reason' }
            ];

            const form = el('form', { class: 'return-form', attrs: { id: 'return-form' } },
                el('div', { class: 'field' },
                    el('label', { attrs: { for: 'return-reason' } }, 'Reason for Return'),
                    el('select', { attrs: { id: 'return-reason', required: 'true' } },
                        el('option', { attrs: { value: '' } }, 'Select a reason...'),
                        ...RETURN_REASON_CHOICES.map(r =>
                            el('option', { attrs: { value: r.value } }, r.label)
                        )
                    )
                ),
                el('div', { class: 'field' },
                    el('label', { attrs: { for: 'return-details' } }, 'Additional Details (optional)'),
                    el('textarea', { attrs: { id: 'return-details', rows: '4', placeholder: 'Provide any additional details...' } })
                ),
                el('div', { class: 'return-actions' },
                    el('button', { class: 'mo-button mo-button--ghost', attrs: { type: 'button', id: 'cancel-return' } }, 'Cancel'),
                    el('button', { class: 'mo-button mo-button--primary', attrs: { type: 'submit' } }, 'Submit Request')
                ),
                el('div', { class: 'alert alert-error hidden', attrs: { id: 'return-error' } })
            );

            wrap.appendChild(form);
            modalRoot.appendChild(wrap);

            wrap.querySelector('.modal-close').addEventListener('click', close);
            form.querySelector('#cancel-return')?.addEventListener('click', close);

            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                const errorEl = form.querySelector('#return-error');
                errorEl.classList.add('hidden');

                const reasonSelect = /** @type {HTMLSelectElement} */ (form.querySelector('#return-reason'));
                const detailsTextarea = /** @type {HTMLTextAreaElement} */ (form.querySelector('#return-details'));
                const reason = reasonSelect.value;
                const details = detailsTextarea.value.trim();

                if (!reason) {
                    errorEl.textContent = 'Please select a reason';
                    errorEl.classList.remove('hidden');
                    return;
                }

                try {
                    const submitBtn = /** @type {HTMLButtonElement} */ (form.querySelector('button[type="submit"]'));
                    submitBtn.disabled = true;
                    submitBtn.textContent = 'Submitting...';

                    await apiFetch(`/api/orders/${order.id}/return-request`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            reason: `${reason}${details ? ': ' + details : ''}`,
                            email: state.customer?.email
                        })
                    });

                    notify('Return request submitted', 'success');
                    close();
                    loadOrdersForSession();
                } catch (err) {
                    errorEl.textContent = err.message || 'Failed to submit request';
                    errorEl.classList.remove('hidden');
                    const submitBtn = /** @type {HTMLButtonElement} */ (form.querySelector('button[type="submit"]'));
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Submit Request';
                }
            });
        });
    }

    // Load orders
    async function loadOrdersForSession() {
        content.innerHTML = '';
        content.appendChild(el('div', { class: 'mo-loading' }, 'Loading orders...'));

        try {
            await loadCustomerOrders();
            await ensureProductsLoaded();
            renderOrders();
        } catch (err) {
            content.innerHTML = '';
            content.appendChild(
                el('div', { class: 'mo-empty-state' },
                    el('h3', {}, 'Unable to load orders'),
                    el('p', {}, err.message || 'Something went wrong. Please try again.'),
                    el('button', { class: 'mo-button mo-button--primary', attrs: { type: 'button', id: 'retry-orders' } }, 'Retry')
                )
            );
            content.querySelector('#retry-orders')?.addEventListener('click', loadOrdersForSession);
        }
    }

    loadOrdersForSession();
}
