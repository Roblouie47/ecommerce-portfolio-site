// public/js/disable-verification.js
// This script hides the verification code field in the registration form at runtime.
// It should be loaded after app.js.


/*
(function() {
    function removeVerificationField() {
        const regForm = document.querySelector('.signup-form');
        if (!regForm) return;
        const codeField = regForm.querySelector('.field.verification-field');
        if (codeField && codeField.parentNode) {
            codeField.parentNode.removeChild(codeField);
        }
        const codeInput = regForm.querySelector('#reg-code');
        if (codeInput && codeInput.parentNode) {
            codeInput.parentNode.removeChild(codeInput);
        }
        const statusEls = regForm.querySelectorAll('.error, .help-text');
        statusEls.forEach(el => {
            if (/code|verification/i.test(el.textContent)) {
                el.textContent = '';
            }
        });
    }

    // MutationObserver for dynamic modal rendering
    const observer = new MutationObserver(removeVerificationField);
    observer.observe(document.body, { childList: true, subtree: true });

    // Poll every 300ms for robustness
    setInterval(removeVerificationField, 300);
})();
*/