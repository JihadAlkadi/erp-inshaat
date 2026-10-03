/**
 * Production Department Team Management Client Scripts
 * Handles Department Head assignment, Add Engineer, Edit Engineer Yards, and Remove Engineer via native fetch
 */

// Helper to extract error message
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
function showFormError(message, alertId) {
  var alertEl = document.getElementById(alertId || 'formAlert');
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
function clearFormError(alertId) {
  var alertEl = document.getElementById(alertId || 'formAlert');
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
  var textSpan = btn.querySelector('span:not(.spinner-border)') || btn.querySelector('#btnText');

  if (isLoading) {
    btn.disabled = true;
    if (spinner) spinner.classList.remove('d-none');
    if (icon) icon.classList.add('d-none');
    if (textSpan && loadingText) {
      if (!textSpan.dataset.originalText) textSpan.dataset.originalText = textSpan.textContent;
      textSpan.textContent = loadingText;
    }
  } else {
    btn.disabled = false;
    if (spinner) spinner.classList.add('d-none');
    if (icon) icon.classList.remove('d-none');
    if (textSpan && textSpan.dataset.originalText) {
      textSpan.textContent = textSpan.dataset.originalText;
    }
  }
}

// Handle Remove Engineer
function handleRemoveEngineer(departmentId, assignmentId, engineerName) {
  var title = 'إزالة المهندس من القسم';
  var text = 'هل أنت متأكد من رغبتك في إزالة المهندس "' + (engineerName || '') + '" من هذا القسم؟ سيتم إلغاء إسناد كافة الساحات المرتبطة به في هذا القسم.';

  if (typeof Swal !== 'undefined') {
    Swal.fire({
      title: title,
      text: text,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EE5253',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'نعم، إزالة المهندس',
      cancelButtonText: 'إلغاء',
    }).then(function(result) {
      if (result.isConfirmed) {
        performRemoveEngineer(departmentId, assignmentId);
      }
    });
  } else {
    if (confirm(text)) {
      performRemoveEngineer(departmentId, assignmentId);
    }
  }
}

function performRemoveEngineer(departmentId, assignmentId) {
  fetch('/api/production/departments/' + encodeURIComponent(departmentId) + '/team/engineers/' + encodeURIComponent(assignmentId), {
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
        sessionStorage.setItem('pendingToast', 'تمت إزالة المهندس من القسم بنجاح');
        window.location.reload();
      } else {
        var errorMsg = extractApiErrorMessage(resObj.data, 'حدث خطأ أثناء إزالة المهندس');
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            icon: 'error',
            title: 'تعذر التنفيذ',
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

// DOM Event Listeners
document.addEventListener('DOMContentLoaded', function() {
  // Delegated click handler for remove engineer button
  document.addEventListener('click', function(e) {
    var target = e.target;
    if (!(target instanceof Element)) return;

    var removeBtn = target.closest('[data-action="remove-engineer"]');
    if (removeBtn) {
      e.preventDefault();
      var deptId = removeBtn.dataset.departmentId;
      var assignmentId = removeBtn.dataset.assignmentId;
      var engName = removeBtn.dataset.engineerName;
      if (deptId && assignmentId) {
        handleRemoveEngineer(deptId, assignmentId, engName);
      }
      return;
    }
  });

  // 1. Change Head Form Modal
  var changeHeadForm = document.getElementById('changeHeadForm');
  if (changeHeadForm) {
    changeHeadForm.addEventListener('submit', function(e) {
      e.preventDefault();
      clearFormError('headModalAlert');

      var deptId = window.currentDepartmentId;
      var select = document.getElementById('headSelectUserId');
      var userId = select ? select.value : '';

      if (!userId) {
        showFormError('يرجى اختيار رئيس القسم.', 'headModalAlert');
        return;
      }

      var saveBtn = document.getElementById('saveHeadBtn');
      setButtonLoading(saveBtn, true, 'جاري الحفظ...');

      fetch('/api/production/departments/' + encodeURIComponent(deptId) + '/team/head', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ userId: userId }),
      })
        .then(function(res) {
          return res.json().then(function(data) {
            return { ok: res.ok, status: res.status, data: data };
          });
        })
        .then(function(resObj) {
          if (resObj.ok && resObj.data.success) {
            sessionStorage.setItem('pendingToast', 'تم تعيين رئيس قسم الإنتاج بنجاح');
            window.location.reload();
          } else {
            setButtonLoading(saveBtn, false);
            var msg = extractApiErrorMessage(resObj.data, 'فشل تعيين رئيس القسم');
            showFormError(msg, 'headModalAlert');
          }
        })
        .catch(function() {
          setButtonLoading(saveBtn, false);
          showFormError('تعذر الاتصال بالخادم، يرجى المحاولة لاحقاً.', 'headModalAlert');
        });
    });
  }

  // 2. Create Engineer Assignment Form
  var createEngForm = document.getElementById('createEngineerAssignmentForm');
  if (createEngForm) {
    createEngForm.addEventListener('submit', function(e) {
      e.preventDefault();
      clearFormError('formAlert');

      var deptId = createEngForm.getAttribute('data-department-id') || window.currentDepartmentId;
      var userInput = document.getElementById('userId');
      var userId = userInput ? userInput.value : '';

      var checkedYards = Array.from(createEngForm.querySelectorAll('input[name="yardIds"]:checked')).map(function(el) {
        return el.value;
      });

      if (!userId) {
        createEngForm.classList.add('was-validated');
        showFormError('يرجى اختيار المهندس.');
        return;
      }

      if (checkedYards.length === 0) {
        showFormError('يجب تحديد ساحة واحدة على الأقل للمهندس في هذا القسم.');
        return;
      }

      var submitBtn = document.getElementById('submitBtn');
      setButtonLoading(submitBtn, true, 'جاري الإسناد...');

      fetch('/api/production/departments/' + encodeURIComponent(deptId) + '/team/engineers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          userId: userId,
          yardIds: checkedYards,
        }),
      })
        .then(function(res) {
          return res.json().then(function(data) {
            return { ok: res.ok, status: res.status, data: data };
          });
        })
        .then(function(resObj) {
          if (resObj.ok && resObj.data.success) {
            sessionStorage.setItem('pendingToast', 'تم إسناد المهندس وتحديد ساحاته بنجاح');
            window.location.href = '/production/departments/' + encodeURIComponent(deptId) + '/team';
          } else {
            setButtonLoading(submitBtn, false);
            var msg = extractApiErrorMessage(resObj.data, 'فشل إسناد المهندس');
            showFormError(msg);
          }
        })
        .catch(function() {
          setButtonLoading(submitBtn, false);
          showFormError('تعذر الاتصال بالخادم، يرجى التحقق من الشبكة.');
        });
    });
  }

  // 3. Edit Engineer Yards Form
  var editEngForm = document.getElementById('editEngineerYardsForm');
  if (editEngForm) {
    editEngForm.addEventListener('submit', function(e) {
      e.preventDefault();
      clearFormError('formAlert');

      var deptId = editEngForm.getAttribute('data-department-id') || window.currentDepartmentId;
      var assignmentId = editEngForm.getAttribute('data-assignment-id');

      var checkedYards = Array.from(editEngForm.querySelectorAll('input[name="yardIds"]:checked')).map(function(el) {
        return el.value;
      });

      if (checkedYards.length === 0) {
        showFormError('يجب تحديد ساحة واحدة على الأقل للمهندس في هذا القسم.');
        return;
      }

      var submitBtn = document.getElementById('submitBtn');
      setButtonLoading(submitBtn, true, 'جاري الحفظ...');

      fetch('/api/production/departments/' + encodeURIComponent(deptId) + '/team/engineers/' + encodeURIComponent(assignmentId), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          yardIds: checkedYards,
        }),
      })
        .then(function(res) {
          return res.json().then(function(data) {
            return { ok: res.ok, status: res.status, data: data };
          });
        })
        .then(function(resObj) {
          if (resObj.ok && resObj.data.success) {
            sessionStorage.setItem('pendingToast', 'تم تحديث ساحات المهندس بنجاح');
            window.location.href = '/production/departments/' + encodeURIComponent(deptId) + '/team';
          } else {
            setButtonLoading(submitBtn, false);
            var msg = extractApiErrorMessage(resObj.data, 'فشل تحديث ساحات المهندس');
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
