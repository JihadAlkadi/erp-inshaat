/**
 * Login Page Scripts & Bootstrap Validation
 * Precast Concrete Rooms ERP System
 */

(function() {
  'use strict';

  // Elements
  var phoneInput = document.getElementById('phoneInput');
  var phoneFeedback = document.getElementById('phoneFeedback');
  var passwordInput = document.getElementById('passwordInput');
  var passwordFeedback = document.getElementById('passwordFeedback');
  var togglePasswordBtn = document.getElementById('togglePassword');
  var errorAlert = document.getElementById('errorAlert');

  // Custom validation messages updater
  function updatePhoneValidationMessage() {
    if (!phoneInput || !phoneFeedback) return;
    if (phoneInput.validity.valueMissing) {
      phoneFeedback.textContent = 'يرجى إدخال رقم الهاتف';
    } else if (phoneInput.validity.patternMismatch || phoneInput.validity.tooShort || phoneInput.value.length < 10) {
      phoneFeedback.textContent = 'يجب أن يكون رقم الهاتف 10 أرقام ويبدأ بـ 09';
    }
  }

  function updatePasswordValidationMessage() {
    if (!passwordInput || !passwordFeedback) return;
    if (passwordInput.validity.valueMissing) {
      passwordFeedback.textContent = 'يرجى إدخال كلمة المرور';
    } else if (passwordInput.validity.tooShort || (passwordInput.value.length > 0 && passwordInput.value.length < 6)) {
      passwordFeedback.textContent = 'يجب أن تتكون كلمة المرور من 6 محارف على الأقل';
    }
  }

  // Dynamic feedback update on input
  if (phoneInput) {
    phoneInput.addEventListener('input', function() {
      // Filter out non-numeric characters
      this.value = this.value.replace(/[^0-9]/g, '');
      updatePhoneValidationMessage();
      if (errorAlert) {
        errorAlert.classList.add('d-none');
        errorAlert.textContent = '';
      }
    });
  }

  if (passwordInput) {
    passwordInput.addEventListener('input', function() {
      updatePasswordValidationMessage();
      if (errorAlert) {
        errorAlert.classList.add('d-none');
        errorAlert.textContent = '';
      }
    });
  }

  // Password Visibility Toggle (Left side button)
  if (togglePasswordBtn && passwordInput) {
    togglePasswordBtn.addEventListener('click', function(e) {
      e.preventDefault();
      var isPassword = passwordInput.type === 'password';
      passwordInput.type = isPassword ? 'text' : 'password';

      var icon = togglePasswordBtn.querySelector('i');
      if (icon) {
        if (isPassword) {
          icon.classList.remove('fa-eye-slash');
          icon.classList.add('fa-eye');
        } else {
          icon.classList.remove('fa-eye');
          icon.classList.add('fa-eye-slash');
        }
      }
    });
  }

  // Form submission handler
  var loginForm = document.getElementById('loginForm');
  if (loginForm) {
    var isSubmitting = false;

    loginForm.addEventListener('submit', function(event) {
      event.preventDefault();
      event.stopPropagation();

      updatePhoneValidationMessage();
      updatePasswordValidationMessage();

      if (!loginForm.checkValidity()) {
        loginForm.classList.add('was-validated');
        return;
      }

      if (isSubmitting) {
        return;
      }

      isSubmitting = true;
      var submitBtn = loginForm.querySelector('.btn-submit');
      var originalBtnHtml = submitBtn ? submitBtn.innerHTML : 'تسجيل الدخول';

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin me-2"></i> جاري تسجيل الدخول...';
      }

      if (errorAlert) {
        errorAlert.classList.add('d-none');
        errorAlert.textContent = '';
      }

      var phone = phoneInput ? phoneInput.value.trim() : '';
      var password = passwordInput ? passwordInput.value : '';

      fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: phone,
          password: password,
        }),
      })
        .then(function(res) {
          var retryAfterHeader = res.headers.get('Retry-After');
          return res.json().catch(function() { return {}; }).then(function(data) {
            return {
              ok: res.ok,
              status: res.status,
              retryAfter: retryAfterHeader,
              body: data,
            };
          });
        })
        .then(function(result) {
          if (result.ok && result.body && result.body.success) {
            window.location.href = '/';
          } else {
            var errorMsg = (result.body && result.body.message) || 'حدث خطأ أثناء تسجيل الدخول';

            if (result.status === 429) {
              if (result.retryAfter) {
                var seconds = parseInt(result.retryAfter, 10);
                if (!isNaN(seconds) && seconds > 0) {
                  var minutes = Math.ceil(seconds / 60);
                  if (minutes <= 1) {
                    errorMsg = 'تم تجاوز عدد محاولات تسجيل الدخول المسموح بها. حاول مرة أخرى بعد حوالي دقيقة واحدة.';
                  } else {
                    errorMsg = 'تم تجاوز عدد محاولات تسجيل الدخول المسموح بها. حاول مرة أخرى بعد حوالي ' + minutes + ' دقائق.';
                  }
                }
              }
            }

            if (errorAlert) {
              errorAlert.textContent = errorMsg;
              errorAlert.classList.remove('d-none');
            }
            if (submitBtn) {
              submitBtn.disabled = false;
              submitBtn.innerHTML = originalBtnHtml;
            }
            isSubmitting = false;
          }
        })
        .catch(function(_err) {
          if (errorAlert) {
            errorAlert.textContent = 'تعذر الاتصال بالخادم، يرجى المحاولة لاحقاً';
            errorAlert.classList.remove('d-none');
          }
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHtml;
          }
          isSubmitting = false;
        });

      loginForm.classList.add('was-validated');
    });
  }
})();
