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
    });
  }

  if (passwordInput) {
    passwordInput.addEventListener('input', function() {
      updatePasswordValidationMessage();
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

  // Fetch all the forms we want to apply custom Bootstrap validation styles to
  var bsValidationForms = document.querySelectorAll('.needs-validation');

  // Loop over them and prevent submission
  Array.prototype.slice.call(bsValidationForms).forEach(function(form) {
    form.addEventListener(
      'submit',
      function(event) {
        updatePhoneValidationMessage();
        updatePasswordValidationMessage();

        if (!form.checkValidity()) {
          event.preventDefault();
          event.stopPropagation();
        } else {
          event.preventDefault();
          
          var submitBtn = form.querySelector('.btn-submit');
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin me-2"></i> جاري التحقق...';
          }

          setTimeout(function() {
            window.location.href = '/';
          }, 400);
        }

        form.classList.add('was-validated');
      },
      false
    );
  });
})();
