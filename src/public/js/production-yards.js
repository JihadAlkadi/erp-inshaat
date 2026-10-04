/**
 * Production Yard Management Client Scripts
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
      confirmButtonColor: '#0984E3',
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

// Handle Toggle Status
function handleYardStatusToggle(yardId, newStatus, yardName) {
  var actionTitle = newStatus ? 'تفعيل ساحة الإنتاج' : 'تعطيل ساحة الإنتاج';
  var actionText = newStatus
    ? 'هل أنت متأكد من تفعيل ساحة الإنتاج "' + (yardName || '') + '"؟'
    : 'هل أنت متأكد من تعطيل ساحة الإنتاج "' + (yardName || '') + '"؟';
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
        performYardStatusToggle(yardId, newStatus);
      }
    });
  } else {
    if (confirm(actionText)) {
      performYardStatusToggle(yardId, newStatus);
    }
  }
}

function performYardStatusToggle(yardId, newStatus) {
  window.erpFetch('/api/production/yards/' + encodeURIComponent(yardId), {
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
        sessionStorage.setItem('pendingToast', newStatus ? 'تم تفعيل ساحة الإنتاج بنجاح' : 'تم تعطيل ساحة الإنتاج بنجاح');
        window.location.reload();
      } else {
        var errorMsg = extractApiErrorMessage(resObj.data, 'حدث خطأ أثناء تحديث حالة ساحة الإنتاج');
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            icon: 'error',
            title: 'فشلت العملية',
            text: errorMsg,
            confirmButtonText: 'حسناً',
            confirmButtonColor: '#0984E3',
          });
        } else {
          alert(errorMsg);
        }
      }
    })
    .catch(function() {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'error',
          title: 'خطأ في الاتصال',
          text: 'تعذر الاتصال بالخادم، يرجى المحاولة لاحقاً.',
          confirmButtonText: 'حسناً',
          confirmButtonColor: '#0984E3',
        });
      } else {
        alert('تعذر الاتصال بالخادم');
      }
    });
}

// Handle Soft Delete
function handleYardSoftDelete(yardId, yardName) {
  var title = 'أرشفة ساحة الإنتاج';
  var text = 'هل أنت متأكد من رغبتك في أرشفة ساحة الإنتاج "' + (yardName || '') + '"؟';

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: title,
      text: text,
      icon: 'error',
      showCancelButton: true,
      confirmButtonColor: '#EE5253',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'نعم، أرشفة الساحة',
      cancelButtonText: 'إلغاء',
    }).then(function(result) {
      if (result.isConfirmed) {
        performYardSoftDelete(yardId);
      }
    });
  } else {
    if (confirm(text)) {
      performYardSoftDelete(yardId);
    }
  }
}

function performYardSoftDelete(yardId) {
  window.erpFetch('/api/production/yards/' + encodeURIComponent(yardId), {
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
        sessionStorage.setItem('pendingToast', 'تم أرشفة ساحة الإنتاج بنجاح');
        window.location.reload();
      } else {
        var errorMsg = extractApiErrorMessage(resObj.data, 'حدث خطأ أثناء أرشفة ساحة الإنتاج');
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            icon: 'error',
            title: 'تعذر الحذف',
            text: errorMsg,
            confirmButtonText: 'حسناً',
            confirmButtonColor: '#0984E3',
          });
        } else {
          alert(errorMsg);
        }
      }
    })
    .catch(function() {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'error',
          title: 'خطأ في الاتصال',
          text: 'تعذر الاتصال بالخادم، يرجى المحاولة لاحقاً.',
          confirmButtonText: 'حسناً',
          confirmButtonColor: '#0984E3',
        });
      } else {
        alert('تعذر الاتصال بالخادم');
      }
    });
}

// DOM Event Handlers
document.addEventListener('DOMContentLoaded', function() {
  // Delegated click handler
  document.addEventListener('click', function(e) {
    var target = e.target;
    if (!(target instanceof Element)) return;

    var toggleBtn = target.closest('[data-action="toggle-yard-status"]');
    if (toggleBtn) {
      e.preventDefault();
      var yardId = toggleBtn.dataset.yardId;
      var yardName = toggleBtn.dataset.yardName;
      var newStatus = toggleBtn.dataset.newStatus === 'true';
      if (yardId) {
        handleYardStatusToggle(yardId, newStatus, yardName);
      }
      return;
    }

    var deleteBtn = target.closest('[data-action="delete-yard"]');
    if (deleteBtn) {
      e.preventDefault();
      var delYardId = deleteBtn.dataset.yardId;
      var delYardName = deleteBtn.dataset.yardName;
      if (delYardId) {
        handleYardSoftDelete(delYardId, delYardName);
      }
      return;
    }
  });

  // 1. Create Yard Form
  var createYardForm = document.getElementById('createYardForm');
  if (createYardForm) {
    createYardForm.addEventListener('submit', function(e) {
      e.preventDefault();
      clearFormError();

      if (!createYardForm.checkValidity()) {
        e.stopPropagation();
        createYardForm.classList.add('was-validated');
        return;
      }

      var submitBtn = document.getElementById('submitBtn');
      var btnText = document.getElementById('btnText');
      if (btnText && !btnText.dataset.originalText) {
        btnText.dataset.originalText = btnText.textContent;
      }

      setButtonLoading(submitBtn, true, 'جاري الحفظ...');

      var deptSelect = document.getElementById('departmentId');
      var nameInput = document.getElementById('name');
      var codeInput = document.getElementById('code');
      var capacityInput = document.getElementById('capacity');
      var descriptionInput = document.getElementById('description');
      var isActiveCheck = document.getElementById('isActive');

      var payload = {
        departmentId: deptSelect ? deptSelect.value.trim() : '',
        name: nameInput ? nameInput.value.trim() : '',
        code: codeInput ? codeInput.value.trim().toUpperCase() : '',
        capacity: capacityInput ? parseInt(capacityInput.value, 10) : 1,
        description: descriptionInput && descriptionInput.value.trim() !== '' ? descriptionInput.value.trim() : undefined,
        isActive: isActiveCheck ? isActiveCheck.checked : true,
      };

      window.erpFetch('/api/production/yards', {
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
            sessionStorage.setItem('pendingToast', 'تم إنشاء ساحة الإنتاج بنجاح');
            window.location.href = '/production/yards';
          } else {
            setButtonLoading(submitBtn, false);
            var msg = extractApiErrorMessage(resObj.data, 'فشل إنشاء ساحة الإنتاج');
            showFormError(msg);
          }
        })
        .catch(function() {
          setButtonLoading(submitBtn, false);
          showFormError('تعذر الاتصال بالخادم، يرجى التحقق من الشبكة.');
        });
    });
  }

  // 2. Edit Yard Form
  var editYardForm = document.getElementById('editYardForm');
  if (editYardForm) {
    editYardForm.addEventListener('submit', function(e) {
      e.preventDefault();
      clearFormError();

      if (!editYardForm.checkValidity()) {
        e.stopPropagation();
        editYardForm.classList.add('was-validated');
        return;
      }

      var yardId = editYardForm.getAttribute('data-yard-id');
      if (!yardId) {
        showFormError('معرف ساحة الإنتاج غير صالح');
        return;
      }

      var submitBtn = document.getElementById('submitBtn');
      var btnText = document.getElementById('btnText');
      if (btnText && !btnText.dataset.originalText) {
        btnText.dataset.originalText = btnText.textContent;
      }

      setButtonLoading(submitBtn, true, 'جاري الحفظ...');

      var deptSelect = document.getElementById('departmentId');
      var nameInput = document.getElementById('name');
      var capacityInput = document.getElementById('capacity');
      var descriptionInput = document.getElementById('description');
      var isActiveCheck = document.getElementById('isActive');

      var payload = {};
      if (deptSelect && deptSelect.value) payload.departmentId = deptSelect.value.trim();
      if (nameInput) payload.name = nameInput.value.trim();
      if (capacityInput && capacityInput.value !== '') payload.capacity = parseInt(capacityInput.value, 10);
      if (descriptionInput) {
        var trimmedDesc = descriptionInput.value.trim();
        payload.description = trimmedDesc !== '' ? trimmedDesc : null;
      }
      if (isActiveCheck && !isActiveCheck.disabled) {
        payload.isActive = isActiveCheck.checked;
      }

      window.erpFetch('/api/production/yards/' + encodeURIComponent(yardId), {
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
            sessionStorage.setItem('pendingToast', 'تم حفظ تعديلات ساحة الإنتاج بنجاح');
            window.location.href = '/production/yards';
          } else {
            setButtonLoading(submitBtn, false);
            var msg = extractApiErrorMessage(resObj.data, 'فشل تحديث بيانات ساحة الإنتاج');
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
