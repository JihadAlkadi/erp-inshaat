/**
 * ERP Core Client Scripts
 * General presentation behaviors (password toggle, disabled link handling, global logout)
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

  // Global Logout Handler
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    const logoutTrigger = target?.closest('#logoutBtn, [data-action="logout"]');

    if (logoutTrigger) {
      e.preventDefault();

      fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })
        .finally(() => {
          window.location.href = '/login';
        });
    }
  });
});
