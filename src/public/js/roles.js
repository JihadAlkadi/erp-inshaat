/**
 * Role Management Client Scripts
 * Handles Create, Update, Status Toggle, Soft Delete, and Global Permission Assignment via native fetch
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

// Internal Toggle Role Active Status (PATCH)
function handleRoleStatusToggle(roleId, newStatus, roleName) {
  var actionTitle = newStatus ? 'تفعيل الدور' : 'تعطيل الدور';
  var actionText = newStatus
    ? 'هل أنت متأكد من تفعيل الدور "' + (roleName || '') + '"؟'
    : 'هل أنت متأكد من تعطيل الدور "' + (roleName || '') + '"؟ لن يتمكن المستخدمون الجدد من اختياره.';
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
        performRoleStatusToggle(roleId, newStatus);
      }
    });
  } else {
    if (confirm(actionText)) {
      performRoleStatusToggle(roleId, newStatus);
    }
  }
}

function performRoleStatusToggle(roleId, newStatus) {
  fetch('/api/system/roles/' + encodeURIComponent(roleId), {
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
        sessionStorage.setItem('pendingToast', newStatus ? 'تم تفعيل الدور بنجاح' : 'تم تعطيل الدور بنجاح');
        window.location.reload();
      } else {
        var errorMsg = extractApiErrorMessage(resObj.data, 'حدث خطأ أثناء تحديث حالة الدور');
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
          text: 'تعذر الاتصال بالخادم، يرجى المحاولة لاحقاً.',
          confirmButtonText: 'حسناً',
          confirmButtonColor: '#714B67',
        });
      } else {
        alert('تعذر الاتصال بالخادم');
      }
    });
}

// Internal Confirm and Soft Delete Role (DELETE)
function handleRoleSoftDelete(roleId, roleName) {
  var title = 'أرشفة الدور';
  var text = 'هل أنت متأكد من رغبتك في أرشفة / حذف الدور "' + (roleName || '') + '"؟';

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: title,
      text: text,
      icon: 'error',
      showCancelButton: true,
      confirmButtonColor: '#EE5253',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'نعم، أرشفة الدور',
      cancelButtonText: 'إلغاء',
    }).then(function(result) {
      if (result.isConfirmed) {
        performRoleSoftDelete(roleId);
      }
    });
  } else {
    if (confirm(text)) {
      performRoleSoftDelete(roleId);
    }
  }
}

function performRoleSoftDelete(roleId) {
  fetch('/api/system/roles/' + encodeURIComponent(roleId), {
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
        sessionStorage.setItem('pendingToast', 'تم أرشفة الدور بنجاح');
        window.location.reload();
      } else {
        var errorMsg = extractApiErrorMessage(resObj.data, 'حدث خطأ أثناء أرشفة الدور');
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
  // Delegated click handler for role table actions
  document.addEventListener('click', function(e) {
    var target = e.target;
    if (!(target instanceof Element)) return;

    var toggleBtn = target.closest('[data-action="toggle-role-status"]');
    if (toggleBtn) {
      e.preventDefault();
      var roleId = toggleBtn.dataset.roleId;
      var roleName = toggleBtn.dataset.roleName;
      var newStatus = toggleBtn.dataset.newStatus === 'true';
      if (roleId) {
        handleRoleStatusToggle(roleId, newStatus, roleName);
      }
      return;
    }

    var deleteBtn = target.closest('[data-action="delete-role"]');
    if (deleteBtn) {
      e.preventDefault();
      var delRoleId = deleteBtn.dataset.roleId;
      var delRoleName = deleteBtn.dataset.roleName;
      if (delRoleId) {
        handleRoleSoftDelete(delRoleId, delRoleName);
      }
      return;
    }
  });

  // 1. Create Role Form Handling
  var createRoleForm = document.getElementById('createRoleForm');
  if (createRoleForm) {
    createRoleForm.addEventListener('submit', function(e) {
      e.preventDefault();
      clearFormError();

      if (!createRoleForm.checkValidity()) {
        e.stopPropagation();
        createRoleForm.classList.add('was-validated');
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

      fetch('/api/system/roles', {
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
            sessionStorage.setItem('pendingToast', 'تم إنشاء الدور بنجاح');
            window.location.href = '/system/roles';
          } else {
            setButtonLoading(submitBtn, false);
            var msg = extractApiErrorMessage(resObj.data, 'فشل إنشاء الدور');
            showFormError(msg);
          }
        })
        .catch(function(err) {
          setButtonLoading(submitBtn, false);
          showFormError('تعذر الاتصال بالخادم، يرجى التحقق من الشبكة.');
        });
    });
  }

  // 2. Edit Role Form Handling
  var editRoleForm = document.getElementById('editRoleForm');
  if (editRoleForm) {
    editRoleForm.addEventListener('submit', function(e) {
      e.preventDefault();
      clearFormError();

      if (!editRoleForm.checkValidity()) {
        e.stopPropagation();
        editRoleForm.classList.add('was-validated');
        return;
      }

      var roleId = editRoleForm.getAttribute('data-role-id');
      if (!roleId) {
        showFormError('معرف الدور غير صالح');
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

      fetch('/api/system/roles/' + encodeURIComponent(roleId), {
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
            sessionStorage.setItem('pendingToast', 'تم حفظ تعديلات الدور بنجاح');
            window.location.href = '/system/roles';
          } else {
            setButtonLoading(submitBtn, false);
            var msg = extractApiErrorMessage(resObj.data, 'فشل تحديث بيانات الدور');
            showFormError(msg);
          }
        })
        .catch(function(err) {
          setButtonLoading(submitBtn, false);
          showFormError('تعذر الاتصال بالخادم، يرجى التحقق من الشبكة.');
        });
    });
  }

  // 3. Role Permissions Form Handling
  var permissionsForm = document.getElementById('rolePermissionsForm');
  if (permissionsForm) {
    permissionsForm.addEventListener('submit', function(e) {
      e.preventDefault();
      clearFormError();

      var roleId = permissionsForm.getAttribute('data-role-id');
      if (!roleId) {
        showFormError('معرف الدور غير صالح');
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
      var uuidV4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      var hasInvalidId = false;

      checkedBoxes.forEach(function(box) {
        var val = typeof box.value === 'string' ? box.value.trim() : '';
        if (val) {
          if (!uuidV4Regex.test(val)) {
            hasInvalidId = true;
          } else {
            permissionIds.push(val);
          }
        }
      });

      if (hasInvalidId) {
        setButtonLoading(submitBtn, false);
        showFormError('تعذر حفظ الصلاحيات بسبب معرف صلاحية غير صالح');
        return;
      }

      var payload = {
        permissionIds: permissionIds,
      };

      fetch('/api/system/roles/' + encodeURIComponent(roleId) + '/global-permissions', {
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
            sessionStorage.setItem('pendingToast', 'تم حفظ صلاحيات الدور بنجاح');
            window.location.reload();
          } else {
            setButtonLoading(submitBtn, false);
            var msg = extractApiErrorMessage(resObj.data, 'فشل حفظ الصلاحيات');
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
