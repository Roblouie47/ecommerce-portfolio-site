import useSWR from 'swr';
const fetcher = (url) => fetch(url).then(r => { if (!r.ok) throw new Error('Fetch failed'); return r.json(); });
export function useProducts(params = {}) {
    const q = new URLSearchParams({ pageSize: '12', ...params }).toString();
    const { data, error, isLoading, isValidating } = useSWR(`/api/products?${q}`, fetcher, { revalidateOnFocus: false });
    const products = data?.products || [];
    // Show skeletons only when we have no products yet and loading/validating.
    const isSkeleton = (isLoading || isValidating) && products.length === 0;
    return { products, total: data?.total || 0, error, isLoading, isSkeleton };
}
