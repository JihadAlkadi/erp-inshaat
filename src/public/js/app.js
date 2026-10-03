/**
 * ERP Core Client Scripts
 * General presentation behaviors (password toggle, HTMX indicator hooks, disabled link handling)
 */

document.addEventListener('DOMContentLoaded', () => {
  // Password Visibility Toggle
  const togglePasswordBtn = document.getElementById('togglePasswordBtn');
  const passwordInput = document.getElementById('passwordInput');

  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';
      
      const icon = togglePasswordBtn.querySelector('i');
      if (icon) {
        if (isPassword) {
          icon.classList.remove('fa-eye');
          icon.classList.add('fa-eye-slash');
        } else {
          icon.classList.remove('fa-eye-slash');
          icon.classList.add('fa-eye');
        }
      }
    });
  }

  // Prevent Navigation on Disabled Links
  document.querySelectorAll('a.disabled, a[aria-disabled="true"]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
    });
  });

  // HTMX Global Loading Bar Hooks (if HTMX is present)
  if (typeof htmx !== 'undefined') {
    const loadingBar = document.getElementById('global-loading');
    if (loadingBar) {
      document.body.addEventListener('htmx:configRequest', () => {
        loadingBar.classList.add('active');
      });
      document.body.addEventListener('htmx:afterOnLoad', () => {
        loadingBar.classList.remove('active');
      });
      document.body.addEventListener('htmx:sendError', () => {
        loadingBar.classList.remove('active');
      });
    }
  }
});
