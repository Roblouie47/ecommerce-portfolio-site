import { state } from '../state/index.js';
import { apiFetch } from '../api/index.js';
import { el } from '../utils/dom.js';
import { notify, getModalRoot } from '../utils/helpers.js';
import { showModal } from '../components/modal.js';
import { navigate } from '../router/index.js';
import { applyCountrySelection } from '../components/country-select.js';

function normalizeCustomerAddress(raw) {
    if (raw == null) return '';
    if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (!trimmed) return '';
        if (trimmed.startsWith('{') && trimmed.includes('shoppingPreference')) {
            try {
                const parsed = JSON.parse(trimmed);
                if (parsed && typeof parsed === 'object') return '';
            } catch { /* keep trimmed text if parsing fails */ }
        }
        return trimmed;
    }
    if (typeof raw === 'object') {
        try {
            const keys = Object.keys(raw);
            if (keys.some(k => k === 'shoppingPreference' || k === 'marketingOptIn' || k === 'termsAcceptedAt' || k === 'dob')) {
                return '';
            }
        } catch { /* ignore */ }
        return '';
    }
    return String(raw).trim();
}

/**
 * Sets customer session data
 * @param {Object} payload - Session payload with token and user
 */
export function setCustomerSession(payload) {
    if (!payload || !payload.user) {
        clearCustomerSession(false);
        return;
    }
    const token = payload.token || state.customer?.sessionToken || '';
    if (!token) {
        clearCustomerSession(false);
        return;
    }
    const user = payload.user;
    const normalizedCountry = (user.country || '').toString().trim().toUpperCase();
    const safeAddress = normalizeCustomerAddress(user.address);
    state.customer = {
        id: user.id || '',
        name: user.name || '',
        email: user.email || '',
        avatarUrl: user.avatarUrl || '',
        country: normalizedCountry,
        address: safeAddress,
        sessionToken: token,
        orders: state.customer?.orders || []
    };
    try {
        localStorage.setItem('customerSessionToken', token);
        localStorage.setItem('customerProfile', JSON.stringify({
            id: state.customer.id,
            name: state.customer.name,
            email: state.customer.email,
            avatarUrl: state.customer.avatarUrl,
            country: state.customer.country,
            address: state.customer.address
        }));
        if (state.customer.email) localStorage.setItem('customerEmail', state.customer.email);
    } catch { /* ignore storage issues */ }
    if (state.customer.country) {
        applyCountrySelection(state.customer.country, { rerender: false });
    }
    mountCustomerHeaderControls();
    if (state.currentRoute === 'my-orders') {
        navigate('my-orders', {}, { replace: true });
    }
}

/**
 * Clears customer session
 * @param {boolean} [notifyUser=false] - Whether to show notification
 */
export function clearCustomerSession(notifyUser = false) {
    state.customer = {
        id: '',
        name: '',
        email: '',
        avatarUrl: '',
        country: '',
        address: '',
        sessionToken: '',
        orders: []
    };
    try {
        localStorage.removeItem('customerSessionToken');
        localStorage.removeItem('customerProfile');
    } catch { /* ignore */ }
    mountCustomerHeaderControls();
    if (notifyUser) notify('Signed out.', 'info', 2400);
    if (state.currentRoute === 'my-orders') {
        navigate('my-orders', {}, { replace: true });
    }
}

/**
 * Verifies the current customer session
 * @returns {Promise<boolean>}
 */
export async function verifyCustomerSession() {
    if (!state.customer?.sessionToken) {
        mountCustomerHeaderControls();
        return false;
    }
    try {
        const data = await apiFetch('/api/customer/session');
        if (data && data.user) {
            const token = data.token || state.customer.sessionToken;
            if (!token) {
                clearCustomerSession(false);
                return false;
            }
            setCustomerSession({ token, user: data.user });
            return true;
        }
    } catch (err) {
        console.warn('Customer session verification failed:', err.message);
        clearCustomerSession(false);
    }
    return false;
}

/**
 * Customer login request
 * @param {Object} credentials - Login credentials
 * @returns {Promise<Object>}
 */
export async function customerLoginRequest(credentials) {
    const payload = {
        email: (credentials.email || '').trim(),
        password: credentials.password || ''
    };
    const data = await apiFetch('/api/customer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (data?.token && data?.user) {
        setCustomerSession({ token: data.token, user: data.user });
    }
    if (!(data?.token && data?.user)) {
        throw new Error('Login failed.');
    }
    return data;
}

/**
 * Customer registration request
 * @param {Object} details - Registration details
 * @returns {Promise<Object>}
 */
export async function customerRegisterRequest(details) {
    let formattedAddress = '';
    if (details.address && typeof details.address === 'object') {
        try { formattedAddress = JSON.stringify(details.address); }
        catch { formattedAddress = ''; }
    } else {
        formattedAddress = (details.address || '').trim();
    }
    const payload = {
        name: (details.name || '').trim(),
        email: (details.email || '').trim(),
        password: details.password || '',
        country: (details.country || '').trim().toUpperCase(),
        address: formattedAddress,
        verificationCode: typeof details.verificationCode === 'string' ? details.verificationCode.trim() : '',
        verificationId: typeof details.verificationId === 'string' ? details.verificationId.trim() : ''
    };
    const data = await apiFetch('/api/customer/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!data || !data.user || !data.token) throw new Error('Registration failed.');
    setCustomerSession({ token: data.token, user: data.user });
    return data;
}

/**
 * Request registration verification code
 * @param {string} email - Email address
 * @returns {Promise<Object>}
 */
export async function requestRegistrationCode(email) {
    const payload = { email: (email || '').trim() };
    return apiFetch('/api/customer/register/send-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
}

/**
 * Show legal modal (privacy policy or terms)
 * @param {string} type - 'privacy' or 'terms'
 */
function showLegalModal(type) {
    const modalRoot = getModalRoot();
    showModal((close) => {
        const title = type === 'terms' ? 'Terms of Use' : 'Privacy Policy';
        const content = type === 'terms'
            ? 'By using this service, you agree to our terms and conditions. This is a demo site for portfolio purposes.'
            : 'We respect your privacy. Your data is stored securely and used only for order fulfillment. This is a demo site for portfolio purposes.';
        const wrap = el('div', { class: 'modal legal-modal' },
            el('button', { class: 'modal-close', attrs: { type: 'button' } }, '×'),
            el('h2', {}, title),
            el('div', { class: 'legal-content' }, el('p', {}, content)),
            el('button', { class: 'btn btn-primary', attrs: { type: 'button' } }, 'Close')
        );
        modalRoot.appendChild(wrap);
        wrap.querySelector('.modal-close').addEventListener('click', close);
        wrap.querySelector('.btn-primary').addEventListener('click', close);
    });
}

/**
 * Customer logout request
 * @returns {Promise<Object>}
 */
async function customerLogoutRequest() {
    return apiFetch('/api/customer/logout', { method: 'POST' });
}

/**
 * Customer logout flow
 */
export async function customerLogoutFlow() {
    if (!state.customer || !state.customer.sessionToken) {
        clearCustomerSession(true);
        return;
    }
    try {
        await customerLogoutRequest();
    } catch (err) {
        console.warn('Customer logout failed:', err.message);
    }
    clearCustomerSession(true);
}

/**
 * Shows the customer authentication modal (login/register)
 * @param {string} [initialMode='login'] - Initial mode ('login' or 'register')
 */
export function showCustomerAuthModal(initialMode = 'login') {
    let mode = initialMode === 'register' ? 'register' : 'login';
    let submitting = false;
    const modalRoot = getModalRoot();

    showModal((close) => {
        const wrap = el('div', { class: 'modal auth-dialog', attrs: { role: 'dialog', 'aria-modal': 'true' } });
        const closeBtn = el('button', { class: 'modal-close', attrs: { type: 'button' } }, '×');
        wrap.appendChild(closeBtn);
        const heading = el('h2', { class: 'auth-heading' }, mode === 'login' ? 'Welcome Back' : 'Create Account');
        const tabBar = el('div', { class: 'auth-tabs' },
            el('button', { class: 'auth-tab' + (mode === 'login' ? ' active' : ''), attrs: { type: 'button', 'data-mode': 'login' } }, 'Sign In'),
            el('button', { class: 'auth-tab' + (mode === 'register' ? ' active' : ''), attrs: { type: 'button', 'data-mode': 'register' } }, 'Sign Up')
        );
        const formSlot = el('div', { class: 'auth-form-slot' });
        const status = el('div', { class: 'auth-status tiny muted', attrs: { role: 'status' } });
        wrap.append(heading, tabBar, formSlot, status);
        modalRoot.appendChild(wrap);
        closeBtn.addEventListener('click', close);

        tabBar.addEventListener('click', (evt) => {
            const btn = /** @type {HTMLElement} */ (evt.target).closest('[data-mode]');
            if (!btn) return;
            mode = btn.getAttribute('data-mode') === 'register' ? 'register' : 'login';
            heading.textContent = mode === 'login' ? 'Welcome Back' : 'Create Account';
            tabBar.querySelectorAll('.auth-tab').forEach(tab => tab.classList.toggle('active', tab.getAttribute('data-mode') === mode));
            renderForm();
        });

        function renderForm() {
            formSlot.innerHTML = '';
            status.textContent = '';
            status.classList.remove('error');
            submitting = false;
            if (mode === 'login') {
                formSlot.appendChild(buildLoginForm());
            } else {
                formSlot.appendChild(buildRegisterForm());
            }
        }

        function buildLoginForm() {
            const emailField = el('div', { class: 'field' },
                el('label', { attrs: { for: 'auth-email' } }, 'Email'),
                el('input', { attrs: { id: 'auth-email', type: 'email', autocomplete: 'email', required: 'true', placeholder: 'you@example.com' } })
            );
            const passField = el('div', { class: 'field' },
                el('label', { attrs: { for: 'auth-password' } }, 'Password'),
                el('input', { attrs: { id: 'auth-password', type: 'password', autocomplete: 'current-password', required: 'true', placeholder: '••••••••' } })
            );
            const emailInput = /** @type {HTMLInputElement} */ (emailField.querySelector('input'));
            const passInput = /** @type {HTMLInputElement} */ (passField.querySelector('input'));
            if (state.customer?.email) emailInput.value = state.customer.email;
            const form = el('form', { class: 'auth-form', attrs: { autocomplete: 'on' } },
                emailField,
                passField,
                el('button', { class: 'auth-submit', attrs: { type: 'submit' } }, 'Sign In')
            );
            form.addEventListener('submit', async (evt) => {
                evt.preventDefault();
                if (submitting) return;
                const email = emailInput.value.trim();
                const password = passInput.value;
                if (!email || !password) {
                    status.textContent = 'Enter your email and password.';
                    status.classList.add('error');
                    return;
                }
                submitting = true;
                status.classList.remove('error');
                status.textContent = 'Signing you in…';
                try {
                    const res = await customerLoginRequest({ email, password });
                    const userInfo = res.user || {};
                    notify('Welcome back, ' + (userInfo.name || userInfo.email || 'shopper') + '!', 'success', 2600);
                    close();
                } catch (err) {
                    status.textContent = err.message || 'Sign-in failed.';
                    status.classList.add('error');
                } finally {
                    submitting = false;
                }
            });
            return el('div', { class: 'auth-login-stack' }, form);
        }

        function buildRegisterForm() {
            const codeInput = /** @type {HTMLInputElement} */ (el('input', { attrs: { id: 'reg-code', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', required: 'true', placeholder: 'Enter verification code' } }));
            const resendBtn = /** @type {HTMLButtonElement} */ (el('button', { class: 'resend-btn', attrs: { type: 'button', 'aria-label': 'Send verification code' } }, '✉'));
            resendBtn.disabled = true;
            const resendLabel = el('span', { class: 'resend-label help-text' }, 'Enter your email to receive a code.');
            const codeField = el('div', { class: 'field verification-field' },
                el('label', { attrs: { for: 'reg-code' } }, 'Code*'),
                el('div', { class: 'input-inline' },
                    codeInput,
                    resendBtn
                ),
                resendLabel
            );
            const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            let resendTimer = null;
            let resendRemaining = 0;
            let sendingCode = false;
            let verificationId = '';
            let codeEmail = '';
            let codeSent = false;

            function clearResendTimer() {
                if (resendTimer) {
                    clearInterval(resendTimer);
                    resendTimer = null;
                }
            }

            function updateResendLabel() {
                const emailValue = emailInput ? (emailInput.value || '').trim() : '';
                const validEmail = EMAIL_PATTERN.test(emailValue);
                const waiting = resendRemaining > 0;
                const disabled = sendingCode || waiting || !validEmail;
                resendBtn.disabled = disabled;
                if (sendingCode) {
                    resendLabel.textContent = 'Sending verification code…';
                } else if (!emailValue) {
                    resendLabel.textContent = 'Enter your email to receive a code.';
                } else if (!validEmail) {
                    resendLabel.textContent = 'Enter a valid email address.';
                } else if (waiting) {
                    resendLabel.textContent = `Resend code in ${resendRemaining}s`;
                } else if (!codeSent) {
                    resendLabel.textContent = 'Send a verification code to continue.';
                } else {
                    resendLabel.textContent = 'Need a new code? You can request another now.';
                }
                resendBtn.textContent = codeSent ? '↻' : '✉';
                resendBtn.setAttribute('aria-label', codeSent ? 'Resend verification code' : 'Send verification code');
            }

            function startResendCountdown(seconds) {
                clearResendTimer();
                resendRemaining = Math.max(0, Number(seconds) || 0);
                updateResendLabel();
                if (resendRemaining <= 0) return;
                resendTimer = setInterval(() => {
                    resendRemaining -= 1;
                    if (resendRemaining <= 0) {
                        clearResendTimer();
                    }
                    updateResendLabel();
                }, 1000);
            }

            function resetVerificationState() {
                verificationId = '';
                codeEmail = '';
                codeSent = false;
                codeInput.value = '';
                resendRemaining = 0;
                clearResendTimer();
                updateResendLabel();
            }

            resendBtn.addEventListener('click', async () => {
                if (sendingCode) return;
                const emailValue = emailInput ? (emailInput.value || '').trim() : '';
                if (!EMAIL_PATTERN.test(emailValue)) {
                    status.textContent = 'Enter a valid email before requesting a code.';
                    status.classList.add('error');
                    updateResendLabel();
                    return;
                }
                const requestedEmail = emailValue.trim();
                const requestedEmailLower = requestedEmail.toLowerCase();
                sendingCode = true;
                status.classList.remove('error');
                status.textContent = 'Sending verification code…';
                updateResendLabel();
                try {
                    const res = await requestRegistrationCode(requestedEmail);
                    const currentNormalized = emailInput ? (emailInput.value || '').trim().toLowerCase() : '';
                    if (currentNormalized && currentNormalized !== requestedEmailLower) {
                        resetVerificationState();
                        status.textContent = 'Email updated. Request a new verification code.';
                        status.classList.add('error');
                        return;
                    }
                    verificationId = (res?.verificationId || '').trim();
                    codeEmail = requestedEmailLower;
                    codeSent = true;
                    status.textContent = `Verification code sent to ${requestedEmail}.`;
                    const cooldown = typeof res?.retryAfter === 'number' ? res.retryAfter : 45;
                    startResendCountdown(cooldown);
                } catch (err) {
                    status.textContent = err.message || 'Unable to send verification code.';
                    status.classList.add('error');
                    resendRemaining = 0;
                    clearResendTimer();
                } finally {
                    sendingCode = false;
                    updateResendLabel();
                }
            });

            const firstInput = /** @type {HTMLInputElement} */ (el('input', { attrs: { id: 'reg-first', type: 'text', autocomplete: 'given-name', required: 'true', placeholder: 'First name' } }));
            const lastInput = /** @type {HTMLInputElement} */ (el('input', { attrs: { id: 'reg-last', type: 'text', autocomplete: 'family-name', required: 'true', placeholder: 'Surname' } }));
            const firstField = el('div', { class: 'field' },
                el('label', { attrs: { for: 'reg-first' } }, 'First Name*'),
                firstInput
            );
            const lastField = el('div', { class: 'field' },
                el('label', { attrs: { for: 'reg-last' } }, 'Surname*'),
                lastInput
            );
            const nameRow = el('div', { class: 'field-row double' }, firstField, lastField);

            const emailInput = /** @type {HTMLInputElement} */ (el('input', { attrs: { id: 'reg-email', type: 'email', autocomplete: 'email', required: 'true', placeholder: 'you@example.com' } }));
            const emailField = el('div', { class: 'field' },
                el('label', { attrs: { for: 'reg-email' } }, 'Email*'),
                emailInput
            );
            emailInput.addEventListener('input', () => {
                const normalized = (emailInput.value || '').trim().toLowerCase();
                if (codeEmail && normalized !== codeEmail) {
                    resetVerificationState();
                    status.textContent = 'Email changed. Request a new verification code.';
                    status.classList.add('error');
                } else {
                    updateResendLabel();
                }
            });
            updateResendLabel();

            const passwordInput = /** @type {HTMLInputElement} */ (el('input', { attrs: { id: 'reg-pass', type: 'password', autocomplete: 'new-password', required: 'true', minlength: '8', placeholder: 'Minimum 8 characters' } }));
            const passwordHints = el('ul', { class: 'password-hints' },
                el('li', { attrs: { 'data-rule': 'length' } }, 'Minimum of 8 characters'),
                el('li', { attrs: { 'data-rule': 'uppercase' } }, 'At least one uppercase letter'),
                el('li', { attrs: { 'data-rule': 'lowercase' } }, 'At least one lowercase letter'),
                el('li', { attrs: { 'data-rule': 'number' } }, 'At least one number')
            );
            const passField = el('div', { class: 'field password-field' },
                el('label', { attrs: { for: 'reg-pass' } }, 'Password*'),
                el('div', { class: 'input-inline' },
                    passwordInput,
                    
                ),
                passwordHints
            );

            const confirmInput = /** @type {HTMLInputElement} */ (el('input', { attrs: { id: 'reg-confirm', type: 'password', autocomplete: 'new-password', required: 'true', minlength: '8', placeholder: 'Re-enter password' } }));
            const confirmField = el('div', { class: 'field' },
                el('label', { attrs: { for: 'reg-confirm' } }, 'Confirm Password*'),
                confirmInput
            );

            const preferenceSelect = /** @type {HTMLSelectElement} */ (el('select', { attrs: { id: 'reg-preference', required: 'true' } },
                el('option', { attrs: { value: '' } }, 'Select a preference'),
                el('option', { attrs: { value: 'womens' } }, 'Women'),
                el('option', { attrs: { value: 'mens' } }, 'Men'),
                el('option', { attrs: { value: 'kids' } }, 'Kids'),
                el('option', { attrs: { value: 'all' } }, 'Shop everything')
            ));
            const preferenceField = el('div', { class: 'field' },
                el('label', { attrs: { for: 'reg-preference' } }, 'Shopping Preference*'),
                preferenceSelect
            );

            const countrySelect = /** @type {HTMLSelectElement} */ (el('select', { attrs: { id: 'reg-country', required: 'true' } },
                el('option', { attrs: { value: 'PH' } }, 'Philippines'),
                el('option', { attrs: { value: 'US' } }, 'United States'),
                el('option', { attrs: { value: 'CA' } }, 'Canada'),
                el('option', { attrs: { value: 'AU' } }, 'Australia'),
                el('option', { attrs: { value: 'JP' } }, 'Japan'),
                el('option', { attrs: { value: 'DE' } }, 'Germany'),
                el('option', { attrs: { value: 'FR' } }, 'France'),
                el('option', { attrs: { value: 'ES' } }, 'Spain'),
                el('option', { attrs: { value: 'IT' } }, 'Italy'),
                el('option', { attrs: { value: 'NL' } }, 'Netherlands'),
                el('option', { attrs: { value: 'OTHER' } }, 'Other / International')
            ));
            if (state.customer?.country) countrySelect.value = state.customer.country;
            const countryField = el('div', { class: 'field' },
                el('label', { attrs: { for: 'reg-country' } }, 'Country / Region*'),
                countrySelect
            );

            const dayInput = /** @type {HTMLInputElement} */ (el('input', { attrs: { id: 'reg-day', type: 'text', inputmode: 'numeric', maxlength: '2', placeholder: 'Day', required: 'true' } }));
            const monthInput = /** @type {HTMLInputElement} */ (el('input', { attrs: { id: 'reg-month', type: 'text', inputmode: 'numeric', maxlength: '2', placeholder: 'Month', required: 'true' } }));
            const yearInput = /** @type {HTMLInputElement} */ (el('input', { attrs: { id: 'reg-year', type: 'text', inputmode: 'numeric', maxlength: '4', placeholder: 'Year', required: 'true' } }));
            /** @param {HTMLInputElement} inputEl @param {number} maxLen */
            const clampNumeric = (inputEl, maxLen) => {
                inputEl.addEventListener('input', () => {
                    const digits = (inputEl.value || '').replace(/\D+/g, '').slice(0, maxLen);
                    inputEl.value = digits;
                });
            };
            clampNumeric(dayInput, 2);
            clampNumeric(monthInput, 2);
            clampNumeric(yearInput, 4);
            const dobLabel = el('label', { attrs: { for: 'reg-day' } }, 'Date of Birth*');
            const dobRow = el('div', { class: 'field-row triple' },
                el('div', { class: 'field mini-field' }, dayInput),
                el('div', { class: 'field mini-field' }, monthInput),
                el('div', { class: 'field mini-field' }, yearInput)
            );
            const dobField = el('div', { class: 'field dob-field' },
                dobLabel,
                dobRow,
                el('p', { class: 'field-note' }, 'Get a birthday reward as a member.')
            );

            const marketingInput = /** @type {HTMLInputElement} */ (el('input', { attrs: { id: 'reg-marketing', type: 'checkbox' } }));
            const marketingField = el('label', { class: 'checkbox-field', attrs: { for: 'reg-marketing' } },
                marketingInput,
                el('span', null, 'Sign up for emails to get product updates, offers, and member benefits.')
            );

            const termsInput = /** @type {HTMLInputElement} */ (el('input', { attrs: { id: 'reg-terms', type: 'checkbox', required: 'true' } }));
            const termsHighlight = el('span', null,
                'I agree to the ',
                el('a', { attrs: { href: '#', 'data-legal': 'privacy' } }, 'Privacy Policy'),
                ' and ',
                el('a', { attrs: { href: '#', 'data-legal': 'terms' } }, 'Terms of Use'),
                '.'
            );
            const termsField = el('label', { class: 'checkbox-field', attrs: { for: 'reg-terms' } },
                termsInput,
                termsHighlight
            );

            termsHighlight.querySelectorAll('a[data-legal]').forEach(link => {
                link.addEventListener('click', (evt) => {
                    evt.preventDefault();
                    const type = link.getAttribute('data-legal');
                    showLegalModal(type === 'terms' ? 'terms' : 'privacy');
                });
            });

            const submitBtn = el('button', { class: 'auth-submit', attrs: { type: 'submit' } }, 'Create Account');
            const form = el('form', { class: 'auth-form signup-form', attrs: { autocomplete: 'on' } },
                codeField,
                nameRow,
                emailField,
                passField,
                confirmField,
                preferenceField,
                countryField,
                dobField,
                marketingField,
                termsField,
                submitBtn
            );

            function updatePasswordHints(value) {
                const rules = {
                    length: value.length >= 8,
                    uppercase: /[A-Z]/.test(value),
                    lowercase: /[a-z]/.test(value),
                    number: /\d/.test(value)
                };
                passwordHints.querySelectorAll('li').forEach(li => {
                    const rule = li.getAttribute('data-rule');
                    if (rule && rules[rule]) li.classList.add('met'); else li.classList.remove('met');
                });
            }
            passwordInput.addEventListener('input', (evt) => updatePasswordHints(/** @type {HTMLInputElement} */ (evt.target).value || ''));
            updatePasswordHints('');

            form.addEventListener('submit', async (evt) => {
                evt.preventDefault();
                if (submitting) return;
                const code = codeInput.value.trim();
                const firstName = firstInput.value.trim();
                const surname = lastInput.value.trim();
                const email = emailInput.value.trim();
                const pass = passwordInput.value;
                const confirm = confirmInput.value;
                const preference = preferenceSelect.value;
                const country = (countrySelect.value || 'PH').toUpperCase();
                const day = dayInput.value.trim();
                const month = monthInput.value.trim();
                const year = yearInput.value.trim();
                const marketingOptIn = marketingInput.checked;
                const termsChecked = termsInput.checked;

                updatePasswordHints(pass);

                if (codeEmail && codeEmail !== email.toLowerCase()) {
                    status.textContent = 'Request a new verification code for the updated email.';
                    status.classList.add('error');
                    return;
                }
                if (!verificationId) {
                    status.textContent = 'Request a verification code for your email before creating an account.';
                    status.classList.add('error');
                    return;
                }
                if (!code || code.length < 4) {
                    status.textContent = 'Enter the verification code we sent you.';
                    status.classList.add('error');
                    return;
                }
                if (!firstName || !surname || !email) {
                    status.textContent = 'Please fill in all required fields.';
                    status.classList.add('error');
                    return;
                }
                const strongPassword = pass.length >= 8 && /[A-Z]/.test(pass) && /[a-z]/.test(pass) && /\d/.test(pass);
                if (!strongPassword) {
                    status.textContent = 'Password must meet all requirements.';
                    status.classList.add('error');
                    return;
                }
                if (pass !== confirm) {
                    status.textContent = 'Passwords do not match.';
                    status.classList.add('error');
                    return;
                }
                if (!preference) {
                    status.textContent = 'Select your shopping preference.';
                    status.classList.add('error');
                    return;
                }
                if (!day || !month || !year) {
                    status.textContent = 'Enter your complete date of birth.';
                    status.classList.add('error');
                    return;
                }
                if (!termsChecked) {
                    status.textContent = 'You must agree to the terms to continue.';
                    status.classList.add('error');
                    return;
                }

                submitting = true;
                status.classList.remove('error');
                status.textContent = 'Creating your account…';
                const name = `${firstName} ${surname}`.trim();
                const addressMeta = {
                    shoppingPreference: preference,
                    dob: { day, month, year },
                    marketingOptIn,
                    termsAcceptedAt: new Date().toISOString()
                };
                try {
                    const res = await customerRegisterRequest({ name, email, password: pass, country, address: addressMeta, verificationCode: code, verificationId });
                    notify('Account ready. Welcome, ' + (res.user?.name || firstName) + '!', 'success', 2800);
                    if (resendTimer) {
                        clearInterval(resendTimer);
                        resendTimer = null;
                    }
                    close();
                } catch (err) {
                    status.textContent = err.message || 'Registration failed.';
                    status.classList.add('error');
                } finally {
                    submitting = false;
                }
            });
            return form;
        }

        renderForm();
    });
}

/**
 * Mounts customer header controls
 */
export function mountCustomerHeaderControls() {
    const header = document.querySelector('.site-header');
    if (!header) return;
    const actions = header.querySelector('.header-actions') || header;
    let container = document.getElementById('customer-auth-controls');
    const cartAnchor = actions.querySelector('.cart-fab');
    if (!container) {
        container = el('div', { class: 'customer-auth-controls', attrs: { id: 'customer-auth-controls' } });
        if (cartAnchor) actions.insertBefore(container, cartAnchor);
        else actions.appendChild(container);
    }
    container.innerHTML = '';
    const hideForAdmin = !!(state.admin?.token && state.admin?.user);
    if ((state.customer && state.customer.sessionToken) || hideForAdmin) {
        if (hideForAdmin) {
            container.classList.add('hidden');
            return;
        }
        container.classList.remove('hidden');
        const name = (state.customer.name || state.customer.email || 'Customer').trim();
        const signOutBtn = el('button', { class: 'header-auth-btn outline', attrs: { type: 'button' } }, 'Sign Out');
        signOutBtn.addEventListener('click', (evt) => { evt.preventDefault(); customerLogoutFlow(); });
        container.appendChild(signOutBtn);
        container.appendChild(el('span', { class: 'customer-name-label' }, name));
        const avatar = el('div', { class: 'customer-avatar', attrs: { 'aria-hidden': 'true' } });
        if (state.customer.avatarUrl) {
            avatar.appendChild(el('img', { attrs: { src: state.customer.avatarUrl, alt: '', referrerpolicy: 'no-referrer' } }));
        }
        container.appendChild(avatar);
    } else {
        container.classList.remove('hidden');
        const signInBtn = el('button', { class: 'header-auth-btn', attrs: { type: 'button' } }, 'Sign In');
        signInBtn.addEventListener('click', (evt) => { evt.preventDefault(); showCustomerAuthModal('login'); });
        const signUpBtn = el('button', { class: 'header-auth-btn outline', attrs: { type: 'button' } }, 'Sign Up');
        signUpBtn.addEventListener('click', (evt) => { evt.preventDefault(); showCustomerAuthModal('register'); });
        container.appendChild(signInBtn);
        container.appendChild(signUpBtn);
    }
}