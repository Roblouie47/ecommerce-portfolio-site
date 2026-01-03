// Components barrel export
export { showModal, showLegalModal, showConfirmDialog } from './modal.js';
export {
    getCart,
    addToCart,
    removeFromCart,
    updateCartQuantity,
    setCartQuantity,
    clearCart,
    calculateCartTotals,
    getFavorites,
    isFavorite,
    toggleFavorite,
    addToFavorites,
    removeFromFavorites,
    updateFavoritesBadge,
    updateFavoriteIcons,
    createFavoriteButton
} from './cart-favorites.js';
export { renderProductReviews, createReviewForm } from './reviews.js';
export {
    mountCountrySelector,
    applyCountrySelection,
    AVAILABLE_COUNTRIES,
    getActiveCountryCode
} from './country-select.js';
