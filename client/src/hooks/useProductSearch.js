import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * useProductSearch
 * Lazily loads Fuse.js only when a non-empty query appears or input is focused (if onFocus callback used externally).
 * Performs fuzzy search over provided products.
 * Returns: { results, isSearching, highlights }
 * highlights: Map(productId => { title: ReactFragment }) enabling highlighted rendering.
 */
export function useProductSearch(products, query) {
  const [FuseLib, setFuseLib] = useState(null);
  const [isLoadingFuse, setIsLoadingFuse] = useState(false);
  const fuseRef = useRef(null);

  // Trigger lazy load when query first becomes non-empty
  useEffect(() => {
    if (!query || FuseLib || isLoadingFuse) return;
    setIsLoadingFuse(true);
    import('fuse.js').then(mod => {
      setFuseLib(() => mod.default || mod);
    }).finally(() => setIsLoadingFuse(false));
  }, [query, FuseLib, isLoadingFuse]);

  // Build Fuse instance when library & products available
  useEffect(() => {
    if (!FuseLib) return;
    fuseRef.current = new FuseLib(products, {
      keys: [ 'title', 'subtitle' ],
      includeMatches: true,
      threshold: 0.38,
      ignoreLocation: true,
      minMatchCharLength: 2,
    });
  }, [FuseLib, products]);

  const active = query && query.trim().length > 0 && fuseRef.current;

  const { results, highlights } = useMemo(() => {
    if (!active) return { results: products, highlights: new Map() };
    const fuseResults = fuseRef.current.search(query.trim());
    const mapped = fuseResults.map(r => r.item);
    const hl = new Map();
    for (const r of fuseResults) {
      const { item, matches } = r;
      const match = matches?.find(m => m.key === 'title');
      if (match && Array.isArray(match.indices)) {
        const title = item.title;
        let lastIndex = 0; const parts = [];
        match.indices.forEach(([start, end], idx) => {
          if (start > lastIndex) parts.push(title.slice(lastIndex, start));
          parts.push(<mark key={idx} className="bg-accent/30 rounded-sm px-0.5">{title.slice(start, end + 1)}</mark>);
          lastIndex = end + 1;
        });
        if (lastIndex < title.length) parts.push(title.slice(lastIndex));
        hl.set(item.id, { title: parts });
      }
    }
    return { results: mapped, highlights: hl };
  }, [active, products, query]);

  return { results, isSearching: !!query && isLoadingFuse, highlights, isFuseReady: !!FuseLib };
}
