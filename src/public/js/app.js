/**
 * ERP Core Client Scripts
 * General presentation behaviors, centralized CSRF-aware fetch helper, and global logout handling
 */

/**
 * Centralized fetch helper for ERP client applications.
 * Automatically injects X-CSRF-Token on unsafe HTTP methods (POST, PUT, PATCH, DELETE, etc.)
 * for same-origin authenticated requests while preserving all existing headers.
 */
window.erpFetch = function(url, options) {
  options = options || {};
  var method = String((options && options.method) || 'GET').trim().toUpperCase();
  var isSafe = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

  var headers = options.headers ? new Headers(options.headers) : new Headers();

  if (!isSafe) {
    // Validate target URL is same-origin
    var targetUrl;
    try {
      targetUrl = new URL(url, window.location.origin);
    } catch (_e) {
      targetUrl = null;
    }

    if (!targetUrl || targetUrl.origin !== window.location.origin) {
      return Promise.reject(new Error('Cross-origin unsafe requests are not permitted via erpFetch.'));
    }

    // Retrieve CSRF token from dashboard layout head meta
    var metaTag = document.querySelector('meta[name="csrf-token"]');
    var csrfToken = metaTag ? metaTag.getAttribute('content') : null;

    if (!csrfToken || csrfToken.trim() === '') {
      return Promise.reject(new Error('رمز الحماية ضد التزوير مفقود. يرجى تحديث الصفحة أو إعادة تسجيل الدخول.'));
    }

    headers.set('X-CSRF-Token', csrfToken.trim());
  }

  var fetchOptions = Object.assign({}, options, { headers: headers });
  return fetch(url, fetchOptions);
};

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

      window.erpFetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
      })
        .then(function(res) {
          if (res.ok || res.status === 401) {
            window.location.href = '/login';
          } else {
            return res.json().then(function(data) {
              var errorMsg = (data && data.message) || 'فشل تسجيل الخروج، يرجى المحاولة لاحقاً';
              if (typeof Swal !== 'undefined') {
                Swal.fire({
                  icon: 'error',
                  title: 'خطأ',
                  text: errorMsg,
                  confirmButtonText: 'حسناً',
                  confirmButtonColor: '#714B67',
                });
              } else {
                alert(errorMsg);
              }
            }).catch(function() {
              if (typeof Swal !== 'undefined') {
                Swal.fire({
                  icon: 'error',
                  title: 'خطأ',
                  text: 'فشل تسجيل الخروج، يرجى المحاولة لاحقاً',
                  confirmButtonText: 'حسناً',
                  confirmButtonColor: '#714B67',
                });
              } else {
                alert('فشل تسجيل الخروج');
              }
            });
          }
        })
        .catch(function(_err) {
          if (typeof Swal !== 'undefined') {
            Swal.fire({
              icon: 'error',
              title: 'خطأ في الاتصال',
              text: 'تعذر الاتصال بالخادم لإتمام تسجيل الخروج',
              confirmButtonText: 'حسناً',
              confirmButtonColor: '#714B67',
            });
          } else {
            alert('تعذر الاتصال بالخادم لإتمام تسجيل الخروج');
          }
        });
    }
  });
});

