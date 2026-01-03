// Auth barrel export
export {
    normalizeAdminProfile,
    updateAdminNavVisibility,
    setAdminAuth,
    clearAdminAuth,
    verifyAdminToken,
    adminLoginRequest,
    mountAdminHeaderControls
} from './admin.js';

export {
    setCustomerSession,
    clearCustomerSession,
    verifyCustomerSession,
    customerLoginRequest,
    customerRegisterRequest,
    requestRegistrationCode,
    showCustomerAuthModal,
    mountCustomerHeaderControls
} from './customer.js';
