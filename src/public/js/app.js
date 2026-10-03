/**
 * ERP Core Client Scripts
 * General presentation behaviors (password toggle, disabled link handling, global logout)
 */

document.addEventListener('DOMContentLoaded', function() {
  // Password Visibility Toggle
  var togglePasswordBtn = document.getElementById('togglePasswordBtn');
  var passwordInput = document.getElementById('passwordInput');

  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', function(e) {
      e.preventDefault();
      var isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';

      var icon = togglePasswordBtn.querySelector('i');
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
  document.querySelectorAll('a.disabled, a[aria-disabled="true"]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
    });
  });

  // Global Logout Handler
  document.addEventListener('click', function(e) {
    var target = e.target;
    if (!(target instanceof Element)) {
      return;
    }

    var logoutTrigger = target.closest('#logoutBtn, [data-action="logout"]');
    if (logoutTrigger) {
      e.preventDefault();

      fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }).finally(function() {
        window.location.href = '/login';
      });
    }
  });
});
