import { useMemo } from 'react';

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildHighlight(text, terms) {
	if (!text) return null;
	let highlighted = text;
	terms.forEach(term => {
		const pattern = new RegExp(`(${escapeRegExp(term)})`, 'ig');
		highlighted = highlighted.replace(pattern, '<mark class="product-highlight">$1</mark>');
	});
	return highlighted === text ? null : highlighted;
}

export function useProductSearch(products = [], query = '') {
	return useMemo(() => {
		const trimmed = (query || '').trim().toLowerCase();
		if (!trimmed) {
			return { results: products, highlights: new Map() };
		}
		const terms = Array.from(new Set(trimmed.split(/\s+/).filter(Boolean)));
		if (!terms.length) {
			return { results: products, highlights: new Map() };
		}

		const highlights = new Map();
		const scored = products
			.map(product => {
				const title = (product.title || '').toLowerCase();
				const description = (product.description || '').toLowerCase();
				const tags = Array.isArray(product.tags) ? product.tags.map(t => (t || '').toLowerCase()) : [];
				const haystacks = [title, description, ...tags];

				let matchCount = 0;
				let titleHits = 0;
				for (const term of terms) {
					const matched = haystacks.some(text => text.includes(term));
					if (matched) {
						matchCount += 1;
						if (title.includes(term)) titleHits += 1;
					} else {
						return null; // require every term to appear somewhere
					}
				}

				const highlight = buildHighlight(product.title || '', terms);
				if (highlight) {
					highlights.set(product.id, { title: highlight });
				}

				const score = matchCount * 10 + titleHits * 5;
				return { product, score };
			})
			.filter(Boolean)
			.sort((a, b) => b.score - a.score);

		return { results: scored.map(entry => entry.product), highlights };
	}, [products, query]);
}

export default useProductSearch;
