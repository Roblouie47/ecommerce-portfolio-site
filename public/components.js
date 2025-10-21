// Component / utility extraction (initial minimal cut)
// Exposes window.el and a few helpers so app.js can shrink over time.
(function () {
    'use strict';
    if (window.el) return; // don't override if already present
    window.el = function el(tag, opts = {}, ...children) {
        const node = document.createElement(tag);
        if (opts.class) node.className = opts.class;
        if (opts.attrs) for (const [k, v] of Object.entries(opts.attrs)) if (v != null) node.setAttribute(k, v);
        for (const c of children.flat()) {
            if (c == null) continue;
            if (typeof c === 'string' || typeof c === 'number' || typeof c === 'boolean') node.appendChild(document.createTextNode(String(c)));
            else if (c instanceof Node) node.appendChild(c); else node.appendChild(document.createTextNode(String(c)));
        }
        return node;
    };
    // Simple i18n registry
    const messages = window.__i18n || (window.__i18n = {});
    window.registerMessages = function (lang, dict) { messages[lang] = Object.assign(messages[lang] || {}, dict); };
    window.t = function (key) { const lang = 'en'; return (messages[lang] && messages[lang][key]) || key; };
})();
