/**
 * Direct User Permission Management Client Script
 * Handles saving direct global permissions for users via Native Fetch
 */

// Helper to extract and format Arabic error messages from API response
function extractApiErrorMessage(responseBody, fallback) {
  if (!responseBody) return fallback || 'حدث خطأ غير متوقع';

  var errorMessages = [];

  if (responseBody.errors && typeof responseBody.errors === 'object' && !Array.isArray(responseBody.errors)) {
    Object.keys(responseBody.errors).forEach(function(key) {
      var val = responseBody.errors[key];
      if (Array.isArray(val)) {
        val.forEach(function(msg) {
          if (typeof msg === 'string' && msg.trim() !== '') {
            errorMessages.push(msg.trim());
          }
        });
      } else if (typeof val === 'string' && val.trim() !== '') {
        errorMessages.push(val.trim());
      }
    });
  } else if (Array.isArray(responseBody.errors)) {
    responseBody.errors.forEach(function(msg) {
      if (typeof msg === 'string' && msg.trim() !== '') {
        errorMessages.push(msg.trim());
      }
    });
  }

  if (errorMessages.length === 0 && responseBody.message && typeof responseBody.message === 'string') {
    errorMessages.push(responseBody.message);
  }

  var uniqueMessages = [];
  errorMessages.forEach(function(msg) {
    if (uniqueMessages.indexOf(msg) === -1) {
      uniqueMessages.push(msg);
    }
  });

  if (uniqueMessages.length > 0) {
    return uniqueMessages.join('، ');
  }

  return fallback || 'حدث خطأ أثناء معالجة الطلب';
}

// Helper to show form error alert
function showFormError(message) {
  var alertEl = document.getElementById('formAlert');
  if (alertEl) {
    alertEl.textContent = message;
    alertEl.classList.remove('d-none');
    alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else if (typeof Swal !== 'undefined') {
    Swal.fire({
      icon: 'error',
      title: 'خطأ',
      text: message,
      confirmButtonText: 'حسناً',
      confirmButtonColor: '#714B67',
    });
  } else {
    alert(message);
  }
}

// Helper to clear form error alert
function clearFormError() {
  var alertEl = document.getElementById('formAlert');
  if (alertEl) {
    alertEl.textContent = '';
    alertEl.classList.add('d-none');
  }
}

// Helper to set button loading state
function setButtonLoading(btn, isLoading, loadingText) {
  if (!btn) return;
  var spinner = btn.querySelector('.spinner-border');
  var icon = btn.querySelector('i');
  var textSpan = btn.querySelector('#btnText');

  if (isLoading) {
    btn.disabled = true;
    if (spinner) spinner.classList.remove('d-none');
    if (icon) icon.classList.add('d-none');
    if (textSpan && loadingText) textSpan.textContent = loadingText;
  } else {
    btn.disabled = false;
    if (spinner) spinner.classList.add('d-none');
    if (icon) icon.classList.remove('d-none');
    if (textSpan && textSpan.dataset.originalText) {
      textSpan.textContent = textSpan.dataset.originalText;
    }
  }
}

document.addEventListener('DOMContentLoaded', function() {
  var permissionsForm = document.getElementById('userPermissionsForm');
  if (permissionsForm) {
    permissionsForm.addEventListener('submit', function(e) {
      e.preventDefault();
      clearFormError();

      var userId = permissionsForm.getAttribute('data-user-id');
      if (!userId) {
        showFormError('معرف المستخدم غير صالح');
        return;
      }

      var submitBtn = document.getElementById('savePermissionsBtn');
      var btnText = document.getElementById('btnText');
      if (btnText && !btnText.dataset.originalText) {
        btnText.dataset.originalText = btnText.textContent;
      }

      setButtonLoading(submitBtn, true, 'جاري حفظ الصلاحيات...');

      var checkedBoxes = permissionsForm.querySelectorAll('input[type="checkbox"][name="permissionIds"]:checked');
      var permissionIds = [];
      checkedBoxes.forEach(function(box) {
        if (box.value) {
          permissionIds.push(box.value);
        }
      });

      var payload = {
        permissionIds: permissionIds,
      };

      fetch('/api/system/users/' + encodeURIComponent(userId) + '/global-permissions', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(payload),
      })
        .then(function(res) {
          return res.json().then(function(data) {
            return { ok: res.ok, status: res.status, data: data };
          });
        })
        .then(function(resObj) {
          if (resObj.ok && resObj.data.success) {
            sessionStorage.setItem('pendingToast', 'تم حفظ الصلاحيات المباشرة للمستخدم بنجاح');
            window.location.href = '/system/users';
          } else {
            setButtonLoading(submitBtn, false);
            var msg = extractApiErrorMessage(resObj.data, 'فشل حفظ الصلاحيات المباشرة');
            showFormError(msg);
          }
        })
        .catch(function() {
          setButtonLoading(submitBtn, false);
          showFormError('تعذر الاتصال بالخادم، يرجى التحقق من الشبكة.');
        });
    });
  }
});
