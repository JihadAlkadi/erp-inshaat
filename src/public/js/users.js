/**
 * User Management Client Scripts
 * Handles Create, Update, Status Toggle, and Soft Delete via native fetch
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

// Internal Toggle User Active Status (PATCH)
function handleStatusToggle(userId, newStatus, userName) {
  var actionTitle = newStatus ? 'تفعيل الحساب' : 'تعطيل الحساب';
  var actionText = newStatus
    ? 'هل أنت متأكد من تفعيل حساب المستخدم "' + (userName || '') + '"؟'
    : 'هل أنت متأكد من تعطيل حساب المستخدم "' + (userName || '') + '"؟ سيتم إلغاء جميع جلسات دخوله النشطة.';
  var confirmBtnText = newStatus ? 'نعم، تفعيل' : 'نعم، تعطيل';
  var confirmBtnColor = newStatus ? '#10AC84' : '#FF9F43';

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: actionTitle,
      text: actionText,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: confirmBtnColor,
      cancelButtonColor: '#6B7280',
      confirmButtonText: confirmBtnText,
      cancelButtonText: 'إلغاء',
    }).then(function(result) {
      if (result.isConfirmed) {
        performStatusToggle(userId, newStatus);
      }
    });
  } else {
    if (confirm(actionText)) {
      performStatusToggle(userId, newStatus);
    }
  }
}

function performStatusToggle(userId, newStatus) {
  (window.erpFetch || fetch)('/api/system/users/' + encodeURIComponent(userId), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({ isActive: newStatus }),
  })
    .then(function(res) {
      return res.json().then(function(data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    })
    .then(function(resObj) {
      if (resObj.ok && resObj.data.success) {
        sessionStorage.setItem('pendingToast', newStatus ? 'تم تفعيل حساب المستخدم بنجاح' : 'تم تعطيل حساب المستخدم بنجاح');
        window.location.reload();
      } else {
        var errorMsg = extractApiErrorMessage(resObj.data, 'حدث خطأ أثناء تحديث حالة المستخدم');
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            icon: 'error',
            title: 'فشلت العملية',
            text: errorMsg,
            confirmButtonText: 'حسناً',
            confirmButtonColor: '#714B67',
          });
        } else {
          alert(errorMsg);
        }
      }
    })
    .catch(function(err) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'error',
          title: 'خطأ في الاتصال',
          text: 'تعذر الاتصال بالخادم، يرجى المحاولة مرة أخرى.',
          confirmButtonText: 'حسناً',
          confirmButtonColor: '#714B67',
        });
      } else {
        alert('تعذر الاتصال بالخادم');
      }
    });
}

// Internal Confirm and Soft Delete User (DELETE)
function handleSoftDelete(userId, userName) {
  var title = 'أرشفة المستخدم';
  var text = 'هل أنت متأكد من رغبتك في أرشفة / حذف حساب "' + (userName || '') + '"؟ لن يتمكن المستخدم من الدخول للنظام وسيتم إيقاف جلساته.';

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: title,
      text: text,
      icon: 'error',
      showCancelButton: true,
      confirmButtonColor: '#EE5253',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'نعم، أرشفة الحساب',
      cancelButtonText: 'إلغاء',
    }).then(function(result) {
      if (result.isConfirmed) {
        performSoftDelete(userId);
      }
    });
  } else {
    if (confirm(text)) {
      performSoftDelete(userId);
    }
  }
}

function performSoftDelete(userId) {
  (window.erpFetch || fetch)('/api/system/users/' + encodeURIComponent(userId), {
    method: 'DELETE',
    headers: {
      'Accept': 'application/json',
    },
  })
    .then(function(res) {
      return res.json().then(function(data) {
        return { ok: res.ok, status: res.status, data: data };
      });
    })
    .then(function(resObj) {
      if (resObj.ok && resObj.data.success) {
        sessionStorage.setItem('pendingToast', 'تم أرشفة المستخدم بنجاح');
        window.location.reload();
      } else {
        var errorMsg = extractApiErrorMessage(resObj.data, 'حدث خطأ أثناء أرشفة المستخدم');
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            icon: 'error',
            title: 'تعذر الحذف',
            text: errorMsg,
            confirmButtonText: 'حسناً',
            confirmButtonColor: '#714B67',
          });
        } else {
          alert(errorMsg);
        }
      }
    })
    .catch(function(err) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'error',
          title: 'خطأ في الاتصال',
          text: 'تعذر الاتصال بالخادم، يرجى المحاولة لاحقاً.',
          confirmButtonText: 'حسناً',
          confirmButtonColor: '#714B67',
        });
      } else {
        alert('تعذر الاتصال بالخادم');
      }
    });
}

// DOM Event Handlers
document.addEventListener('DOMContentLoaded', function() {
  // Delegated click handler for user table actions
  document.addEventListener('click', function(e) {
    var target = e.target;
    if (!(target instanceof Element)) return;

    var toggleBtn = target.closest('[data-action="toggle-user-status"]');
    if (toggleBtn) {
      e.preventDefault();
      var userId = toggleBtn.dataset.userId;
      var userName = toggleBtn.dataset.userName;
      var newStatus = toggleBtn.dataset.newStatus === 'true';
      if (userId) {
        handleStatusToggle(userId, newStatus, userName);
      }
      return;
    }

    var deleteBtn = target.closest('[data-action="delete-user"]');
    if (deleteBtn) {
      e.preventDefault();
      var delUserId = deleteBtn.dataset.userId;
      var delUserName = deleteBtn.dataset.userName;
      if (delUserId) {
        handleSoftDelete(delUserId, delUserName);
      }
      return;
    }
  });

  // 1. Create User Form Handling
  var createForm = document.getElementById('createUserForm');
  if (createForm) {
    createForm.addEventListener('submit', function(e) {
      e.preventDefault();
      clearFormError();

      if (!createForm.checkValidity()) {
        e.stopPropagation();
        createForm.classList.add('was-validated');
        return;
      }

      var submitBtn = document.getElementById('submitBtn');
      var btnText = document.getElementById('btnText');
      if (btnText && !btnText.dataset.originalText) {
        btnText.dataset.originalText = btnText.textContent;
      }

      setButtonLoading(submitBtn, true, 'جاري الحفظ...');

      var fullNameInput = document.getElementById('fullName');
      var phoneInput = document.getElementById('phone');
      var passwordInput = document.getElementById('password');
      var roleIdSelect = document.getElementById('roleId');
      var isActiveCheck = document.getElementById('isActive');

      var payload = {
        fullName: fullNameInput ? fullNameInput.value.trim() : '',
        phone: phoneInput ? phoneInput.value.trim() : '',
        password: passwordInput ? passwordInput.value : '',
        roleId: roleIdSelect ? roleIdSelect.value : '',
        isActive: isActiveCheck ? isActiveCheck.checked : true,
      };

      (window.erpFetch || fetch)('/api/system/users', {
        method: 'POST',
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
            sessionStorage.setItem('pendingToast', 'تم إنشاء المستخدم بنجاح');
            window.location.href = '/system/users';
          } else {
            setButtonLoading(submitBtn, false);
            var msg = extractApiErrorMessage(resObj.data, 'فشل إنشاء المستخدم');
            showFormError(msg);
          }
        })
        .catch(function(err) {
          setButtonLoading(submitBtn, false);
          showFormError('تعذر الاتصال بالخادم، يرجى التحقق من الشبكة.');
        });
    });
  }

  // 2. Edit User Form Handling
  var editForm = document.getElementById('editUserForm');
  if (editForm) {
    editForm.addEventListener('submit', function(e) {
      e.preventDefault();
      clearFormError();

      if (!editForm.checkValidity()) {
        e.stopPropagation();
        editForm.classList.add('was-validated');
        return;
      }

      var userId = editForm.getAttribute('data-user-id');
      if (!userId) {
        showFormError('معرف المستخدم غير صالح');
        return;
      }

      var submitBtn = document.getElementById('submitBtn');
      var btnText = document.getElementById('btnText');
      if (btnText && !btnText.dataset.originalText) {
        btnText.dataset.originalText = btnText.textContent;
      }

      setButtonLoading(submitBtn, true, 'جاري الحفظ...');

      var fullNameInput = document.getElementById('fullName');
      var phoneInput = document.getElementById('phone');
      var roleIdSelect = document.getElementById('roleId');
      var isActiveCheck = document.getElementById('isActive');

      var payload = {};
      if (fullNameInput) payload.fullName = fullNameInput.value.trim();
      if (phoneInput) payload.phone = phoneInput.value.trim();
      if (roleIdSelect && !roleIdSelect.disabled) payload.roleId = roleIdSelect.value;
      if (isActiveCheck && !isActiveCheck.disabled) payload.isActive = isActiveCheck.checked;

      (window.erpFetch || fetch)('/api/system/users/' + encodeURIComponent(userId), {
        method: 'PATCH',
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
            sessionStorage.setItem('pendingToast', 'تم حفظ تعديلات المستخدم بنجاح');
            window.location.href = '/system/users';
          } else {
            setButtonLoading(submitBtn, false);
            var msg = extractApiErrorMessage(resObj.data, 'فشل تحديث بيانات المستخدم');
            showFormError(msg);
          }
        })
        .catch(function(err) {
          setButtonLoading(submitBtn, false);
          showFormError('تعذر الاتصال بالخادم، يرجى التحقق من الشبكة.');
        });
    });
  }
});
