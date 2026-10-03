/**
 * Production Department Management Client Scripts
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
function handleDepartmentStatusToggle(deptId, newStatus, deptName, activeYards) {
  if (!newStatus && Number(activeYards) > 0) {
    var errorMsg = 'لا يمكن تعطيل القسم "' + (deptName || '') + '" لأنه يحتوي على ' + activeYards + ' ساحة نشطة. يرجى تعطيل الساحات أولاً.';
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'warning',
        title: 'تنبيه',
        text: errorMsg,
        confirmButtonText: 'حسناً',
        confirmButtonColor: '#0984E3',
      });
    } else {
      alert(errorMsg);
    }
    return;
  }

  var actionTitle = newStatus ? 'تفعيل قسم الإنتاج' : 'تعطيل قسم الإنتاج';
  var actionText = newStatus
    ? 'هل أنت متأكد من تفعيل قسم الإنتاج "' + (deptName || '') + '"؟'
    : 'هل أنت متأكد من تعطيل قسم الإنتاج "' + (deptName || '') + '"؟ لن يتمكن المستخدمون من إنشاء أو تفعيل ساحات تحته.';
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
        performDepartmentStatusToggle(deptId, newStatus);
      }
    });
  } else {
    if (confirm(actionText)) {
      performDepartmentStatusToggle(deptId, newStatus);
    }
  }
}

function performDepartmentStatusToggle(deptId, newStatus) {
  fetch('/api/production/departments/' + encodeURIComponent(deptId), {
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
        sessionStorage.setItem('pendingToast', newStatus ? 'تم تفعيل قسم الإنتاج بنجاح' : 'تم تعطيل قسم الإنتاج بنجاح');
        window.location.reload();
      } else {
        var errorMsg = extractApiErrorMessage(resObj.data, 'حدث خطأ أثناء تحديث حالة قسم الإنتاج');
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
function handleDepartmentSoftDelete(deptId, deptName, yardCount) {
  if (Number(yardCount) > 0) {
    var warnMsg = 'لا يمكن أرشفة القسم "' + (deptName || '') + '" لأنه مرتبط بـ ' + yardCount + ' ساحة (نشطة أو معطلة). يجب أرشفة جميع الساحات المرتبطة أولاً.';
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        icon: 'error',
        title: 'تعذر الأرشفة',
        text: warnMsg,
        confirmButtonText: 'حسناً',
        confirmButtonColor: '#0984E3',
      });
    } else {
      alert(warnMsg);
    }
    return;
  }

  var title = 'أرشفة قسم الإنتاج';
  var text = 'هل أنت متأكد من رغبتك في أرشفة قسم الإنتاج "' + (deptName || '') + '"؟';

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: title,
      text: text,
      icon: 'error',
      showCancelButton: true,
      confirmButtonColor: '#EE5253',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'نعم، أرشفة القسم',
      cancelButtonText: 'إلغاء',
    }).then(function(result) {
      if (result.isConfirmed) {
        performDepartmentSoftDelete(deptId);
      }
    });
  } else {
    if (confirm(text)) {
      performDepartmentSoftDelete(deptId);
    }
  }
}

function performDepartmentSoftDelete(deptId) {
  fetch('/api/production/departments/' + encodeURIComponent(deptId), {
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
        sessionStorage.setItem('pendingToast', 'تم أرشفة قسم الإنتاج بنجاح');
        window.location.reload();
      } else {
        var errorMsg = extractApiErrorMessage(resObj.data, 'حدث خطأ أثناء أرشفة قسم الإنتاج');
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

    var toggleBtn = target.closest('[data-action="toggle-department-status"]');
    if (toggleBtn) {
      e.preventDefault();
      var deptId = toggleBtn.dataset.departmentId;
      var deptName = toggleBtn.dataset.departmentName;
      var newStatus = toggleBtn.dataset.newStatus === 'true';
      var activeYards = toggleBtn.dataset.activeYards || 0;
      if (deptId) {
        handleDepartmentStatusToggle(deptId, newStatus, deptName, activeYards);
      }
      return;
    }

    var deleteBtn = target.closest('[data-action="delete-department"]');
    if (deleteBtn) {
      e.preventDefault();
      var delDeptId = deleteBtn.dataset.departmentId;
      var delDeptName = deleteBtn.dataset.departmentName;
      var yardCount = deleteBtn.dataset.yardCount || 0;
      if (delDeptId) {
        handleDepartmentSoftDelete(delDeptId, delDeptName, yardCount);
      }
      return;
    }
  });

  // 1. Create Department Form
  var createDeptForm = document.getElementById('createDepartmentForm');
  if (createDeptForm) {
    createDeptForm.addEventListener('submit', function(e) {
      e.preventDefault();
      clearFormError();

      if (!createDeptForm.checkValidity()) {
        e.stopPropagation();
        createDeptForm.classList.add('was-validated');
        return;
      }

      var submitBtn = document.getElementById('submitBtn');
      var btnText = document.getElementById('btnText');
      if (btnText && !btnText.dataset.originalText) {
        btnText.dataset.originalText = btnText.textContent;
      }

      setButtonLoading(submitBtn, true, 'جاري الحفظ...');

      var nameInput = document.getElementById('name');
      var codeInput = document.getElementById('code');
      var descriptionInput = document.getElementById('description');
      var isActiveCheck = document.getElementById('isActive');

      var payload = {
        name: nameInput ? nameInput.value.trim() : '',
        code: codeInput ? codeInput.value.trim().toUpperCase() : '',
        description: descriptionInput && descriptionInput.value.trim() !== '' ? descriptionInput.value.trim() : undefined,
        isActive: isActiveCheck ? isActiveCheck.checked : true,
      };

      fetch('/api/production/departments', {
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
            sessionStorage.setItem('pendingToast', 'تم إنشاء قسم الإنتاج بنجاح');
            window.location.href = '/production/departments';
          } else {
            setButtonLoading(submitBtn, false);
            var msg = extractApiErrorMessage(resObj.data, 'فشل إنشاء قسم الإنتاج');
            showFormError(msg);
          }
        })
        .catch(function() {
          setButtonLoading(submitBtn, false);
          showFormError('تعذر الاتصال بالخادم، يرجى التحقق من الشبكة.');
        });
    });
  }

  // 2. Edit Department Form
  var editDeptForm = document.getElementById('editDepartmentForm');
  if (editDeptForm) {
    editDeptForm.addEventListener('submit', function(e) {
      e.preventDefault();
      clearFormError();

      if (!editDeptForm.checkValidity()) {
        e.stopPropagation();
        editDeptForm.classList.add('was-validated');
        return;
      }

      var deptId = editDeptForm.getAttribute('data-department-id');
      if (!deptId) {
        showFormError('معرف قسم الإنتاج غير صالح');
        return;
      }

      var submitBtn = document.getElementById('submitBtn');
      var btnText = document.getElementById('btnText');
      if (btnText && !btnText.dataset.originalText) {
        btnText.dataset.originalText = btnText.textContent;
      }

      setButtonLoading(submitBtn, true, 'جاري الحفظ...');

      var nameInput = document.getElementById('name');
      var descriptionInput = document.getElementById('description');
      var isActiveCheck = document.getElementById('isActive');

      var payload = {};
      if (nameInput) payload.name = nameInput.value.trim();
      if (descriptionInput) {
        var trimmedDesc = descriptionInput.value.trim();
        payload.description = trimmedDesc !== '' ? trimmedDesc : null;
      }
      if (isActiveCheck && !isActiveCheck.disabled) {
        payload.isActive = isActiveCheck.checked;
      }

      fetch('/api/production/departments/' + encodeURIComponent(deptId), {
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
            sessionStorage.setItem('pendingToast', 'تم حفظ تعديلات قسم الإنتاج بنجاح');
            window.location.href = '/production/departments';
          } else {
            setButtonLoading(submitBtn, false);
            var msg = extractApiErrorMessage(resObj.data, 'فشل تحديث بيانات قسم الإنتاج');
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
