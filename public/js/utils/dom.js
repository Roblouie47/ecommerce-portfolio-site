/**
 * DOM Helper - Creates DOM elements with declarative syntax
 * @param {string} tag - HTML tag name
 * @param {Object} opts - Options: class, attrs, style, html
 * @param {...(Node|string|null)} children - Child nodes or text
 * @returns {HTMLElement}
 */
export function el(tag, opts = {}, ...children) {
    const elem = document.createElement(tag);
    opts = opts || {}; // Handle null opts gracefully
    if (opts.class) elem.className = opts.class;
    if (opts.attrs) {
        for (const [k, v] of Object.entries(opts.attrs)) {
            if (v != null && v !== false) elem.setAttribute(k, v);
        }
    }
    if (opts.style) elem.style.cssText = opts.style;
    if (opts.html) elem.innerHTML = opts.html;
    for (const child of children) {
        if (child == null) continue;
        if (typeof child === 'string' || typeof child === 'number') {
            elem.appendChild(document.createTextNode(String(child)));
        } else if (Array.isArray(child)) {
            for (const subChild of child) {
                if (subChild != null) {
                    if (typeof subChild === 'string' || typeof subChild === 'number') {
                        elem.appendChild(document.createTextNode(String(subChild)));
                    } else {
                        elem.appendChild(subChild);
                    }
                }
            }
        } else {
            elem.appendChild(child);
        }
    }
    return elem;
}

/**
 * Sets a route attribute on document.body and manages body classes
 * @param {string} route - The route name
 */
export function setBodyRoute(route) {
    document.body.setAttribute('data-route', route || '');
}
