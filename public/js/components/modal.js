import { el } from '../utils/dom.js';
import { getModalRoot } from '../utils/helpers.js';

/**
 * Shows a modal with custom content
 * @param {Function} renderFn - Function that receives close callback and renders content
 */
export function showModal(renderFn) {
    const modalRoot = getModalRoot();
    if (!modalRoot) return;
    
    // Clear any existing modal
    modalRoot.innerHTML = '';
    modalRoot.classList.remove('hidden');
    document.body.classList.add('modal-open');
    
    const close = () => {
        modalRoot.innerHTML = '';
        modalRoot.classList.add('hidden');
        document.body.classList.remove('modal-open');
    };
    
    // Create backdrop
    const backdrop = el('div', { class: 'modal-backdrop' });
    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) close();
    });
    
    modalRoot.appendChild(backdrop);
    
    // Render custom content
    renderFn(close);
    
    // ESC key to close
    const escHandler = (e) => {
        if (e.key === 'Escape') {
            close();
            document.removeEventListener('keydown', escHandler);
        }
    };
    document.addEventListener('keydown', escHandler);
}

/**
 * Shows a legal content modal (Terms, Privacy, etc.)
 * Supports stacking on top of existing modals
 * @param {string} kind - 'terms' or 'privacy'
 */
export function showLegalModal(kind = 'privacy') {
    const modalRoot = getModalRoot();
    if (!modalRoot) return;
    
    const contentMap = {
        privacy: {
            title: 'Privacy Policy',
            body: [
                'We collect the minimum data needed to run your shopping experience: your account details, shipping info, and order history.',
                'We do not sell your data. Third-party services (payments, analytics, email) are used only to fulfill your orders and improve the site.',
                'You can request deletion or export of your data by contacting support; we retain records only as required for transactions and compliance.'
            ]
        },
        terms: {
            title: 'Terms of Use',
            body: [
                'Use this site to browse, purchase, and manage orders for our apparel catalog. Do not misuse the service or attempt to disrupt it.',
                'Prices, availability, and promotions may change. Orders are subject to confirmation; refunds/returns follow the policy shown at checkout.',
                'Your account is your responsibility—keep credentials secure. By placing an order you agree to pay the displayed totals and applicable taxes/shipping.'
            ]
        }
    };

    const content = contentMap[kind] || contentMap.privacy;

    const toggleLegalBackdrop = (on) => {
        modalRoot.classList.toggle('modal-legal-strong', on);
    };

    const buildLegal = (closeFn, extraClass = '') => {
        const wrap = el('div', { class: `modal legal-modal ${extraClass}`.trim(), attrs: { role: 'dialog', 'aria-modal': 'true' } },
            el('div', { class: 'modal-header' },
                el('h2', {}, content.title),
                el('button', { class: 'modal-close', attrs: { type: 'button' } }, '×')
            ),
            el('div', { class: 'modal-body legal-body' },
                ...content.body.map(p => el('p', {}, p))
            ),
            el('div', { class: 'modal-actions' },
                el('button', { class: 'btn btn-primary', attrs: { type: 'button' } }, 'Close')
            )
        );
        wrap.querySelector('.modal-close')?.addEventListener('click', closeFn);
        wrap.querySelector('.modal-actions button')?.addEventListener('click', closeFn);
        wrap.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeFn();
            if (e.key !== 'Tab') return;
            const focusable = wrap.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
            if (!focusable.length) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                /** @type {HTMLElement} */ (last).focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                /** @type {HTMLElement} */ (first).focus();
            }
        });
        return wrap;
    };

    const isStacked = !modalRoot.classList.contains('hidden') && modalRoot.querySelector('.modal');

    if (!isStacked) {
        toggleLegalBackdrop(true);
        showModal((close) => {
            const wrap = buildLegal(() => {
                close();
                toggleLegalBackdrop(false);
            });
            modalRoot.appendChild(wrap);
        });
        return;
    }

    // Layer on top of the existing modal without dismissing it.
    toggleLegalBackdrop(true);
    const layer = el('div', { class: 'modal-stack-layer' });
    const closeStacked = () => {
        layer.remove();
        const fallbackFocus = /** @type {HTMLElement} */ (modalRoot.querySelector('.modal'));
        if (fallbackFocus) fallbackFocus.focus?.();
        if (!modalRoot.querySelector('.legal-modal')) {
            toggleLegalBackdrop(false);
        }
    };

    const wrap = buildLegal(closeStacked, 'legal-modal-stacked');
    layer.appendChild(wrap);
    modalRoot.appendChild(layer);
    const focusable = wrap.querySelectorAll('button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])');
    /** @type {HTMLElement} */ (focusable[0])?.focus();
}

/**
 * Shows a confirmation dialog
 * @param {Object} options - Dialog options
 * @returns {Promise<boolean>}
 */
export function showConfirmDialog(options = {}) {
    return new Promise(resolve => {
        const {
            title = 'Confirm',
            message = 'Are you sure?',
            confirmText = 'Confirm',
            cancelText = 'Cancel',
            confirmClass = 'btn-danger'
        } = options;
        
        showModal(close => {
            const modalRoot = getModalRoot();
            const wrap = el('div', { class: 'modal confirm-modal' });
            wrap.appendChild(el('button', { class: 'modal-close', attrs: { 'aria-label': 'Close' } }, '×'));
            wrap.appendChild(el('h2', {}, title));
            wrap.appendChild(el('p', {}, message));
            
            const actions = el('div', { class: 'confirm-actions' });
            const cancelBtn = el('button', { class: 'btn btn-outline' }, cancelText);
            const confirmBtn = el('button', { class: `btn ${confirmClass}` }, confirmText);
            
            actions.appendChild(cancelBtn);
            actions.appendChild(confirmBtn);
            wrap.appendChild(actions);
            
            modalRoot.appendChild(wrap);
            
            const closeAndResolve = (value) => {
                close();
                resolve(value);
            };
            
            wrap.querySelector('.modal-close').addEventListener('click', () => closeAndResolve(false));
            cancelBtn.addEventListener('click', () => closeAndResolve(false));
            confirmBtn.addEventListener('click', () => closeAndResolve(true));
        });
    });
}
