import { el } from './dom.js';

/**
 * Generates a placeholder image URL
 * @param {number} size - Image size in pixels
 * @returns {string}
 */
export function productPlaceholder(size = 360) {
    return `https://placehold.co/${size}x${size}/e2e8f0/64748b?text=No+Image`;
}

/**
 * Copies text to clipboard with fallback for older browsers
 * @param {string} text - Text to copy
 * @returns {Promise<void>}
 */
export async function copyTextToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text);
    }
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
    } finally {
        document.body.removeChild(textarea);
    }
}

/**
 * DOM reference getters
 */
export function getRootEl() {
    return document.getElementById('app-root');
}

export function getModalRoot() {
    return document.getElementById('modal-root');
}

export function getSpinnerRoot() {
    return document.getElementById('spinner-root');
}

/**
 * Shows or hides the global loading spinner
 * @param {boolean} show - Whether to show the spinner
 */
export function showSpinner(show) {
    const spinnerRoot = getSpinnerRoot();
    if (!spinnerRoot) return;
    if (show) {
        spinnerRoot.innerHTML = '';
        spinnerRoot.appendChild(el('div', { class: 'spinner-overlay' },
            el('div', { class: 'spinner' })
        ));
        spinnerRoot.classList.remove('hidden');
    } else {
        spinnerRoot.classList.add('hidden');
        spinnerRoot.innerHTML = '';
    }
}

/**
 * Shows a toast notification
 * @param {string} message - Notification message
 * @param {string} [type='info'] - Type: 'success', 'error', 'warn', 'info'
 * @param {number} [duration=3000] - Duration in milliseconds
 */
export function notify(message, type = 'info', timeout = 3000, options = {}) {
    const safeMessage = typeof message === 'string' ? message : String(message ?? '');
    const normalizedType = ['success', 'error', 'warn', 'info'].includes(type) ? type : 'info';
    let root = document.getElementById('toast-root');
    if (!root || !document.body.contains(root)) {
        root = document.createElement('div');
        root.id = 'toast-root';
        document.body.appendChild(root);
    }
    root.classList.remove('hidden');
    root.style.position = 'fixed';
    root.style.bottom = '1rem';
    root.style.right = '1rem';
    root.style.display = 'flex';
    root.style.flexDirection = 'column-reverse';
    root.style.gap = '.5rem';
    root.style.zIndex = '999';

    const box = el('div', {
        class: `alert alert-${normalizedType}`,
        attrs: {
            role: normalizedType === 'error' || normalizedType === 'warn' ? 'alert' : 'status',
            'aria-live': normalizedType === 'error' || normalizedType === 'warn' ? 'assertive' : 'polite'
        }
    });
    const msgSpan = el('span', {}, safeMessage);
    box.appendChild(msgSpan);

    if (options.actionText && typeof options.onAction === 'function') {
        const actionBtn = el('button', { class: 'alert-action', attrs: { type: 'button' } }, options.actionText);
        actionBtn.addEventListener('click', (evt) => {
            evt.stopPropagation();
            try { options.onAction(); } catch { }
            fade();
        });
        box.appendChild(actionBtn);
    }

    box.style.cursor = 'pointer';
    root.appendChild(box);

    const max = 4;
    while (root.children.length > max) {
        const first = root.firstElementChild;
        if (first) first.classList.add('fade-out');
        setTimeout(() => first?.remove(), 300);
    }

    let remaining = Number.isFinite(timeout) ? timeout : 3000;
    let start = Date.now();
    let timer = setTimeout(fade, remaining);

    function fade() {
        if (box.classList.contains('fade-out')) return;
        box.classList.add('fade-out');
        setTimeout(() => box.remove(), 300);
    }

    box.addEventListener('mouseenter', () => {
        clearTimeout(timer);
        remaining -= (Date.now() - start);
    });
    box.addEventListener('mouseleave', () => {
        start = Date.now();
        timer = setTimeout(fade, Math.max(300, remaining));
    });
    box.addEventListener('click', fade);
}

/**
 * Renders star rating display
 * @param {number} rating - Rating value (0-5)
 * @param {number|null} [count] - Optional review count
 * @param {Object} [options] - Display options
 * @returns {HTMLElement}
 */
export function renderStarRating(rating, count = null, options = {}) {
    const { size = 'sm', interactive = false } = options;
    const wrap = el('span', { class: `star-rating star-rating-${size}` });
    const fullStars = Math.floor(rating);
    const hasHalf = rating - fullStars >= 0.5;
    
    for (let i = 1; i <= 5; i++) {
        let starClass = 'star star-empty';
        if (i <= fullStars) starClass = 'star star-full';
        else if (i === fullStars + 1 && hasHalf) starClass = 'star star-half';
        
        const star = el('span', { class: starClass }, '★');
        if (interactive) {
            star.setAttribute('data-rating', String(i));
            star.style.cursor = 'pointer';
        }
        wrap.appendChild(star);
    }
    
    if (count !== null) {
        wrap.appendChild(el('span', { class: 'rating-count muted' }, ` (${count})`));
    }
    
    return wrap;
}

/**
 * Creates a form input field element
 * @param {string} label - Field label
 * @param {string} id - Input ID
 * @param {string} [type='text'] - Input type
 * @returns {HTMLElement}
 */
export function fieldInput(label, id, type = 'text') {
    return el('div', { class: 'field' },
        el('label', { attrs: { for: id } }, label),
        el('input', { attrs: { id, type, autocomplete: 'off' } })
    );
}

/**
 * Creates a form textarea field element
 * @param {string} label - Field label
 * @param {string} id - Textarea ID
 * @returns {HTMLElement}
 */
export function fieldTextArea(label, id) {
    return el('div', { class: 'field' },
        el('label', { attrs: { for: id } }, label),
        el('textarea', { attrs: { id, rows: '3' } })
    );
}

/**
 * Resolves the best image URL for a product/item
 * @param {Object} item - Item with image properties
 * @param {Map} productsById - Products lookup map
 * @returns {string}
 */
export function resolveItemImage(item, productsById) {
    if (!item) return productPlaceholder(360);
    
    const candidate = item.image || item.thumbnail || 
        (Array.isArray(item.images) && item.images[0]) || 
        item.imageUrl;
    if (candidate) return candidate;
    
    if (productsById && item.productId) {
        const product = productsById.get(item.productId) || 
            productsById.get(String(item.productId));
        if (product) {
            const productImages = product.images;
            if (Array.isArray(productImages) && productImages[0]) return productImages[0];
            if (typeof productImages === 'string') return productImages;
            if (typeof product.image === 'string') return product.image;
        }
    }
    
    return productPlaceholder(360);
}

/**
 * Looks up a product by ID with flexible type matching
 * @param {string|number} id - Product ID
 * @param {Map} productsById - Products lookup map
 * @returns {Object|null}
 */
export function lookupProduct(id, productsById) {
    if (id == null || !productsById) return null;
    if (productsById.has(id)) return productsById.get(id);
    const str = String(id);
    if (productsById.has(str)) return productsById.get(str);
    const num = Number(id);
    if (!Number.isNaN(num) && productsById.has(num)) return productsById.get(num);
    return null;
}

/**
 * Gets the total stock for a product
 * @param {Object} product - Product object
 * @returns {number}
 */
export function productStock(product) {
    if (!product) return 0;
    if (typeof product.totalInventory === 'number') return product.totalInventory;
    if (typeof product.baseInventory === 'number') return product.baseInventory;
    if (typeof product.inventory === 'number') return product.inventory;
    return 0;
}

/**
 * Formats a date/time value to a human-readable string
 * @param {string|Date} value - Date value
 * @returns {string}
 */
export function formatDateTimeStamp(value) {
    if (!value) return 'Pending update';
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
