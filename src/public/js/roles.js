/**
 * Role Management & Access Rules Administration Client Script
 * Strictly hardened against DOM XSS and malformed/unknown scope payloads.
 */

// Helper to extract error message from API response
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

function showPageAlert(message, type) {
  var alertEl = document.getElementById('pageAlert') || document.getElementById('formAlert');
  if (alertEl) {
    alertEl.textContent = message;
    alertEl.className = 'alert alert-' + (type || 'danger') + ' mb-4';
    alertEl.classList.remove('d-none');
    alertEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    alert(message);
  }
}

function clearPageAlert() {
  var alertEl = document.getElementById('pageAlert') || document.getElementById('formAlert');
  if (alertEl) {
    alertEl.textContent = '';
    alertEl.classList.add('d-none');
  }
}

function showDrawerAlert(message, type) {
  var alertEl = document.getElementById('drawerAlert');
  if (alertEl) {
    alertEl.textContent = message;
    alertEl.className = 'alert alert-' + (type || 'danger') + ' mb-3';
    alertEl.classList.remove('d-none');
  }
}

function clearDrawerAlert() {
  var alertEl = document.getElementById('drawerAlert');
  if (alertEl) {
    alertEl.textContent = '';
    alertEl.classList.add('d-none');
  }
}

function setBtnLoading(btn, isLoading, loadingText) {
  if (!btn) return;
  var spinner = btn.querySelector('.spinner-border');
  var icon = btn.querySelector('i');
  var textSpan = btn.querySelector('#btnText') || btn.querySelector('#saveRuleBtnText') || btn.querySelector('span:not(.spinner-border)');

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

document.addEventListener('DOMContentLoaded', function() {
  // Pending Toast Notification
  var pendingToast = sessionStorage.getItem('pendingToast');
  if (pendingToast) {
    sessionStorage.removeItem('pendingToast');
    if (typeof Swal !== 'undefined') {
      Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: pendingToast,
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
      });
    }
  }

  // -------------------------------------------------------------
  // Role CRUD Forms (Create / Edit)
  // -------------------------------------------------------------
  var createRoleForm = document.getElementById('createRoleForm');
  if (createRoleForm) {
    createRoleForm.addEventListener('submit', function(e) {
      e.preventDefault();
      clearPageAlert();

      var submitBtn = document.getElementById('createRoleSubmitBtn');
      setBtnLoading(submitBtn, true, 'جاري الإنشاء...');

      var payload = {
        name: (document.getElementById('roleNameInput') || {}).value?.trim(),
        code: (document.getElementById('roleCodeInput') || {}).value?.trim(),
        description: (document.getElementById('roleDescInput') || {}).value?.trim() || null,
        isActive: (document.getElementById('roleIsActiveInput') || {}).checked ?? true,
      };

      window.erpFetch('/api/system/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
        .then(function(resObj) {
          if (resObj.ok && resObj.data.success) {
            sessionStorage.setItem('pendingToast', 'تم إنشاء الدور بنجاح');
            window.location.href = '/system/roles';
          } else {
            setBtnLoading(submitBtn, false);
            showPageAlert(extractApiErrorMessage(resObj.data, 'فشل إنشاء الدور'));
          }
        })
        .catch(function() {
          setBtnLoading(submitBtn, false);
          showPageAlert('تعذر الاتصال بالخادم، يرجى التحقق من الشبكة.');
        });
    });
  }

  var editRoleForm = document.getElementById('editRoleForm');
  if (editRoleForm) {
    editRoleForm.addEventListener('submit', function(e) {
      e.preventDefault();
      clearPageAlert();

      var roleId = editRoleForm.getAttribute('data-role-id');
      var submitBtn = document.getElementById('editRoleSubmitBtn');
      setBtnLoading(submitBtn, true, 'جاري الحفظ...');

      var payload = {
        name: (document.getElementById('roleNameInput') || {}).value?.trim(),
        description: (document.getElementById('roleDescInput') || {}).value?.trim() || null,
        isActive: (document.getElementById('roleIsActiveInput') || {}).checked ?? true,
      };

      window.erpFetch('/api/system/roles/' + encodeURIComponent(roleId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
        .then(function(resObj) {
          if (resObj.ok && resObj.data.success) {
            sessionStorage.setItem('pendingToast', 'تم تحديث بيانات الدور بنجاح');
            window.location.href = '/system/roles';
          } else {
            setBtnLoading(submitBtn, false);
            showPageAlert(extractApiErrorMessage(resObj.data, 'فشل تحديث بيانات الدور'));
          }
        })
        .catch(function() {
          setBtnLoading(submitBtn, false);
          showPageAlert('تعذر الاتصال بالخادم، يرجى التحقق من الشبكة.');
        });
    });
  }

  // Delete Role Action
  document.querySelectorAll('.delete-role-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      var roleId = btn.getAttribute('data-role-id');
      var roleName = btn.getAttribute('data-role-name') || 'هذا الدور';

      var performDelete = function() {
        window.erpFetch('/api/system/roles/' + encodeURIComponent(roleId), {
          method: 'DELETE',
          headers: { 'Accept': 'application/json' },
        })
          .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
          .then(function(resObj) {
            if (resObj.ok && resObj.data.success) {
              sessionStorage.setItem('pendingToast', 'تمت أرشفة الدور بنجاح');
              window.location.reload();
            } else {
              showPageAlert(extractApiErrorMessage(resObj.data, 'فشل حذف الدور'));
            }
          })
          .catch(function() {
            showPageAlert('تعذر الاتصال بالخادم');
          });
      };

      if (typeof Swal !== 'undefined') {
        Swal.fire({
          title: 'تأكيد الحذف',
          text: 'هل أنت متأكد من رغبتك في أرشفة الدور "' + roleName + '"؟',
          icon: 'warning',
          showCancelButton: true,
          confirmButtonText: 'نعم، أرشف الدور',
          cancelButtonText: 'إلغاء',
          confirmButtonColor: '#d33',
        }).then(function(result) {
          if (result.isConfirmed) performDelete();
        });
      } else if (confirm('هل أنت متأكد من حذف الدور ' + roleName + '؟')) {
        performDelete();
      }
    });
  });

  // -------------------------------------------------------------
  // Role Permissions Administration Page
  // -------------------------------------------------------------
  var permContainer = document.getElementById('rolePermissionsContainer');
  if (!permContainer) return;

  var roleId = permContainer.getAttribute('data-role-id');
  var isAdmin = permContainer.getAttribute('data-is-admin') === 'true';
  var canManage = permContainer.getAttribute('data-can-manage') === 'true';

  // Checkbox State Toggle Handler
  document.querySelectorAll('.perm-state-toggle').forEach(function(toggle) {
    toggle.addEventListener('change', function() {
      var permId = toggle.getAttribute('data-permission-id');
      var desiredEnabled = toggle.checked;

      toggle.disabled = true;
      clearPageAlert();

      window.erpFetch('/api/system/roles/' + encodeURIComponent(roleId) + '/permissions/' + encodeURIComponent(permId) + '/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ enabled: desiredEnabled }),
      })
        .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
        .then(function(resObj) {
          toggle.disabled = false;
          if (resObj.ok && resObj.data.success) {
            refreshSingleRolePermissionCard(permId);
          } else {
            toggle.checked = !desiredEnabled;
            showPageAlert(extractApiErrorMessage(resObj.data, 'فشل تعديل حالة الصلاحية'));
          }
        })
        .catch(function() {
          toggle.disabled = false;
          toggle.checked = !desiredEnabled;
          showPageAlert('تعذر الاتصال بالخادم لتحديث الصلاحية');
        });
    });
  });

  // -------------------------------------------------------------
  // Access Rules Offcanvas Drawer Handling
  // -------------------------------------------------------------
  var drawerEl = document.getElementById('accessRulesOffcanvas');
  var drawerBs = drawerEl && typeof bootstrap !== 'undefined' ? new bootstrap.Offcanvas(drawerEl) : null;
  var currentDrawerPermId = null;
  var currentDrawerPermName = null;
  var currentDrawerCapabilities = [];
  var selectedTargetIds = new Set();
  var selectedTargetObjects = new Map(); // id -> { id, name, code }

  var searchDebounceTimer = null;

  // Open Drawer Button
  document.querySelectorAll('.open-rules-drawer-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var permId = btn.getAttribute('data-permission-id');
      var permName = btn.getAttribute('data-permission-name');
      var permDesc = btn.getAttribute('data-permission-desc');

      currentDrawerPermId = permId;
      currentDrawerPermName = permName;

      document.getElementById('drawerPermissionCode').textContent = permName;
      document.getElementById('drawerPermissionDesc').textContent = permDesc;
      clearDrawerAlert();
      hideRuleForm();

      loadDrawerPermissionRules(permId);

      if (drawerBs) drawerBs.show();
    });
  });

  function loadDrawerPermissionRules(permId) {
    var listEl = document.getElementById('drawerRulesList');
    listEl.innerHTML = '';
    var loadingDiv = document.createElement('div');
    loadingDiv.className = 'text-center py-4 text-muted small';
    loadingDiv.innerHTML = '<div class="spinner-border spinner-border-sm text-secondary mb-2" role="status"></div>';
    var loadingText = document.createElement('div');
    loadingText.textContent = 'جاري تحميل القواعد...';
    loadingDiv.appendChild(loadingText);
    listEl.appendChild(loadingDiv);

    fetch('/api/system/roles/' + encodeURIComponent(roleId) + '/permissions/' + encodeURIComponent(permId) + '/access-rules', {
      headers: { 'Accept': 'application/json' },
    })
      .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
      .then(function(resObj) {
        if (resObj.ok && resObj.data.success) {
          var data = resObj.data.data;
          currentDrawerCapabilities = data.capabilities || [];
          renderDrawerHeaderState(data.enabled, data.rules || []);
          renderDrawerRulesList(data.rules || [], data.enabled);
          populatePresetDropdown(currentDrawerCapabilities);
        } else {
          listEl.innerHTML = '';
          var errAlert = document.createElement('div');
          errAlert.className = 'alert alert-danger small p-2';
          errAlert.textContent = 'تعذر جلب قواعد الوصول: ' + extractApiErrorMessage(resObj.data);
          listEl.appendChild(errAlert);
        }
      })
      .catch(function() {
        listEl.innerHTML = '';
        var errAlert = document.createElement('div');
        errAlert.className = 'alert alert-danger small p-2';
        errAlert.textContent = 'تعذر الاتصال بالخادم لجلب القواعد';
        listEl.appendChild(errAlert);
      });
  }

  function renderDrawerHeaderState(enabled, rules) {
    var badgeArea = document.getElementById('drawerStatusBadge');
    var countsSummary = document.getElementById('drawerRuleCountsSummary');
    var showFormBtn = document.getElementById('showAddRuleFormBtn');

    var allowCount = rules.filter(function(r) { return r.isActive && r.effect === 'ALLOW' && r.isValid; }).length;
    var denyCount = rules.filter(function(r) { return r.isActive && r.effect === 'DENY'; }).length;

    countsSummary.textContent = allowCount + ' قواعد منح • ' + denyCount + ' قواعد حظر/استثناء';

    badgeArea.innerHTML = '';
    var badgeSpan = document.createElement('span');
    badgeSpan.className = 'badge small py-1 px-2';

    if (!enabled) {
      badgeSpan.className += ' bg-secondary-subtle text-secondary';
      badgeSpan.textContent = 'غير مفعلة';
      if (showFormBtn) showFormBtn.disabled = true;
    } else if (allowCount === 0) {
      badgeSpan.className += ' bg-warning-subtle text-warning-emphasis border border-warning-subtle';
      badgeSpan.innerHTML = '<i class="fa-solid fa-triangle-exclamation me-1"></i>';
      badgeSpan.appendChild(document.createTextNode('مفعلة بلا منح'));
      if (showFormBtn) showFormBtn.disabled = isAdmin || !canManage || currentDrawerCapabilities.length === 0;
    } else {
      badgeSpan.className += ' bg-success-subtle text-success';
      badgeSpan.innerHTML = '<i class="fa-solid fa-check me-1"></i>';
      badgeSpan.appendChild(document.createTextNode('مفعّلة ولديها منح'));
      if (showFormBtn) showFormBtn.disabled = isAdmin || !canManage || currentDrawerCapabilities.length === 0;
    }
    badgeArea.appendChild(badgeSpan);
  }

  function renderDrawerRulesList(rules, enabled) {
    var listEl = document.getElementById('drawerRulesList');
    listEl.innerHTML = '';
    var activeRules = rules.filter(function(r) { return r.isActive; });

    if (!enabled) {
      var warnAlert = document.createElement('div');
      warnAlert.className = 'alert alert-warning small p-3 mb-0';
      warnAlert.innerHTML = '<i class="fa-solid fa-triangle-exclamation me-1"></i>';
      warnAlert.appendChild(document.createTextNode('الصلاحية غير مفعلة لهذا الدور. يرجى تفعيل الصلاحية أولاً للتمكن من إضافة قواعد وصول فعالة.'));
      listEl.appendChild(warnAlert);
      return;
    }

    if (activeRules.length === 0) {
      var emptyDiv = document.createElement('div');
      emptyDiv.className = 'text-center py-4 bg-white border rounded text-muted small';
      emptyDiv.innerHTML = '<i class="fa-solid fa-folder-open fs-3 text-secondary mb-2 d-block"></i>';
      emptyDiv.appendChild(document.createTextNode('لا توجد قواعد وصول فعالة لهذه الصلاحية حالياً.'));
      var subText = document.createElement('div');
      subText.className = 'mt-1 text-danger-emphasis';
      subText.textContent = 'لن يمتلك الدور أي وصول فعلي حتى تتم إضافة قاعدة منح (ALLOW).';
      emptyDiv.appendChild(subText);
      listEl.appendChild(emptyDiv);
      return;
    }

    activeRules.forEach(function(rule) {
      var cardDiv = document.createElement('div');
      cardDiv.className = 'card border p-3 bg-white';
      cardDiv.id = 'rule_card_' + rule.id;
      cardDiv.style.borderRadius = '8px';

      // Top row: effect badge + preset label + actions
      var topRow = document.createElement('div');
      topRow.className = 'd-flex justify-content-between align-items-start';

      var leftSide = document.createElement('div');
      leftSide.className = 'd-flex flex-wrap align-items-center gap-2';

      var isAllow = rule.effect === 'ALLOW';
      var effectBadge = document.createElement('span');
      effectBadge.className = 'badge text-white small px-2 py-1 ' + (isAllow ? 'bg-success' : 'bg-danger');
      effectBadge.innerHTML = isAllow
        ? '<i class="fa-solid fa-circle-check me-1"></i>'
        : '<i class="fa-solid fa-ban me-1"></i>';
      effectBadge.appendChild(document.createTextNode(isAllow ? 'منح (ALLOW)' : 'حظر (DENY)'));
      leftSide.appendChild(effectBadge);

      if (rule.isValid === false) {
        var invalidBadge = document.createElement('span');
        invalidBadge.className = 'badge bg-danger-subtle text-danger border border-danger-subtle small px-2 py-1';
        invalidBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation me-1"></i>';
        invalidBadge.appendChild(document.createTextNode('قاعدة غير صالحة'));
        leftSide.appendChild(invalidBadge);
      }

      var presetLabelSpan = document.createElement('span');
      presetLabelSpan.className = 'fw-bold text-dark small';
      presetLabelSpan.textContent = rule.presetLabel;
      leftSide.appendChild(presetLabelSpan);

      topRow.appendChild(leftSide);

      // Actions
      if (!isAdmin && canManage) {
        var actionsDiv = document.createElement('div');
        actionsDiv.className = 'd-flex gap-1';

        if (rule.isValid !== false) {
          var editBtn = document.createElement('button');
          editBtn.type = 'button';
          editBtn.className = 'btn btn-sm btn-outline-secondary edit-rule-btn py-0 px-2';
          editBtn.dataset.ruleId = rule.id;
          editBtn.title = 'تعديل القاعدة';
          editBtn.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
          editBtn.addEventListener('click', function() {
            openEditRuleForm(rule);
          });
          actionsDiv.appendChild(editBtn);
        }

        var disableBtn = document.createElement('button');
        disableBtn.type = 'button';
        disableBtn.className = 'btn btn-sm btn-outline-danger disable-rule-btn py-0 px-2';
        disableBtn.dataset.ruleId = rule.id;
        disableBtn.title = 'تعطيل القاعدة';
        disableBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        disableBtn.addEventListener('click', function() {
          disableRoleRule(rule.id);
        });
        actionsDiv.appendChild(disableBtn);

        topRow.appendChild(actionsDiv);
      }

      cardDiv.appendChild(topRow);

      // Invalid rule warning box
      if (rule.isValid === false) {
        var alertDiv = document.createElement('div');
        alertDiv.className = 'alert alert-danger small p-2 mt-2 mb-1';
        if (rule.effect === 'DENY') {
          alertDiv.textContent = 'قاعدة حظر غير صالحة — محرك الصلاحيات يتعامل معها بالرفض التام (Fail Closed).';
        } else {
          alertDiv.textContent = 'قاعدة منح غير صالحة — لا تمنح أي وصول فعلي.';
        }
        cardDiv.appendChild(alertDiv);
      }

      // Description
      if (rule.description && rule.description.trim() !== '') {
        var descDiv = document.createElement('div');
        descDiv.className = 'small text-muted mt-1 fst-italic';
        descDiv.textContent = rule.description;
        cardDiv.appendChild(descDiv);
      }

      // Targets Chips
      if (rule.targets && rule.targets.length > 0) {
        var targetsDiv = document.createElement('div');
        targetsDiv.className = 'd-flex flex-wrap gap-1 mt-2 pt-2 border-top';

        rule.targets.forEach(function(t) {
          var targetBadge = document.createElement('span');
          targetBadge.className = 'badge small py-1 px-2 ' +
            (t.isAvailable ? 'bg-light text-dark border' : 'bg-danger-subtle text-danger border border-danger-subtle');
          targetBadge.style.fontWeight = '500';

          var nameLabel = t.name +
            (t.code ? ' (' + t.code + ')' : '') +
            (t.departmentName ? ' • ' + t.departmentName : '');
          targetBadge.textContent = nameLabel;
          targetsDiv.appendChild(targetBadge);
        });

        cardDiv.appendChild(targetsDiv);
      }

      listEl.appendChild(cardDiv);
    });
  }

  function disableRoleRule(ruleId) {
    if (!confirm('هل أنت متأكد من رغبتك في تعطيل قاعدة الوصول هذه؟')) return;
    clearDrawerAlert();

    window.erpFetch('/api/system/roles/' + encodeURIComponent(roleId) + '/permissions/' + encodeURIComponent(currentDrawerPermId) + '/access-rules/' + encodeURIComponent(ruleId), {
      method: 'DELETE',
      headers: { 'Accept': 'application/json' },
    })
      .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
      .then(function(resObj) {
        if (resObj.ok && resObj.data.success) {
          loadDrawerPermissionRules(currentDrawerPermId);
          refreshSingleRolePermissionCard(currentDrawerPermId);
        } else {
          showDrawerAlert(extractApiErrorMessage(resObj.data, 'فشل تعطيل قاعدة الوصول'));
        }
      })
      .catch(function() {
        showDrawerAlert('تعذر الاتصال بالخادم لتعطيل القاعدة');
      });
  }

  // -------------------------------------------------------------
  // Add / Edit Rule Form
  // -------------------------------------------------------------
  var showAddRuleBtn = document.getElementById('showAddRuleFormBtn');
  var ruleFormContainer = document.getElementById('ruleFormContainer');
  var cancelRuleBtn = document.getElementById('cancelRuleFormBtn');
  var cancelRuleBtn2 = document.getElementById('cancelRuleFormBtn2');
  var accessRuleForm = document.getElementById('accessRuleForm');
  var presetSelect = document.getElementById('rulePresetSelect');

  if (showAddRuleBtn) {
    showAddRuleBtn.addEventListener('click', function() {
      openAddRuleForm();
    });
  }

  if (cancelRuleBtn) cancelRuleBtn.addEventListener('click', hideRuleForm);
  if (cancelRuleBtn2) cancelRuleBtn2.addEventListener('click', hideRuleForm);

  function openAddRuleForm() {
    clearDrawerAlert();
    document.getElementById('ruleFormTitle').textContent = 'إضافة قاعدة وصول جديدة';
    document.getElementById('formRuleId').value = '';
    document.getElementById('effectAllow').checked = true;
    document.getElementById('ruleDescriptionInput').value = '';
    selectedTargetIds.clear();
    selectedTargetObjects.clear();
    updateSelectedChipsDisplay();

    if (presetSelect && presetSelect.options.length > 0) {
      presetSelect.selectedIndex = 0;
      handlePresetChange(presetSelect.value);
    }

    ruleFormContainer.classList.remove('d-none');
    ruleFormContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function openEditRuleForm(rule) {
    clearDrawerAlert();
    document.getElementById('ruleFormTitle').textContent = 'تعديل قاعدة الوصول';
    document.getElementById('formRuleId').value = rule.id;
    if (rule.effect === 'DENY') {
      document.getElementById('effectDeny').checked = true;
    } else {
      document.getElementById('effectAllow').checked = true;
    }
    document.getElementById('ruleDescriptionInput').value = rule.description || '';

    selectedTargetIds.clear();
    selectedTargetObjects.clear();
    if (rule.targets && rule.targets.length > 0) {
      rule.targets.forEach(function(t) {
        selectedTargetIds.add(t.id);
        selectedTargetObjects.set(t.id, t);
      });
    }
    updateSelectedChipsDisplay();

    if (presetSelect && rule.preset) {
      presetSelect.value = rule.preset;
      handlePresetChange(rule.preset);
    }

    ruleFormContainer.classList.remove('d-none');
    ruleFormContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideRuleForm() {
    if (ruleFormContainer) ruleFormContainer.classList.add('d-none');
    clearDrawerAlert();
  }

  function populatePresetDropdown(capabilities) {
    if (!presetSelect) return;
    presetSelect.innerHTML = '';

    var helpText = document.getElementById('presetHelpText');
    var showFormBtn = document.getElementById('showAddRuleFormBtn');

    if (capabilities.length === 0) {
      var opt = document.createElement('option');
      opt.value = '';
      opt.disabled = true;
      opt.selected = true;
      opt.textContent = 'لا توجد نطاقات وصول مدعومة لهذه الصلاحية';
      presetSelect.appendChild(opt);

      if (helpText) helpText.textContent = 'هذه الصلاحية الإنتاجية لا تحتوي تعريف نطاق وصول مسجل في النظام.';
      if (showFormBtn) showFormBtn.disabled = true;
      return;
    }

    capabilities.forEach(function(cap) {
      var opt = document.createElement('option');
      opt.value = cap.preset;
      opt.textContent = cap.label;
      opt.dataset.desc = cap.description;
      opt.dataset.targetType = cap.targetType || '';
      opt.dataset.requiresTargets = cap.requiresTargetIds ? 'true' : 'false';
      presetSelect.appendChild(opt);
    });
  }

  if (presetSelect) {
    presetSelect.addEventListener('change', function() {
      handlePresetChange(presetSelect.value);
    });
  }

  function handlePresetChange(presetValue) {
    var selectedOpt = presetSelect.options[presetSelect.selectedIndex];
    var requiresTargets = selectedOpt ? selectedOpt.dataset.requiresTargets === 'true' : false;
    var targetType = selectedOpt ? selectedOpt.dataset.targetType : '';
    var desc = selectedOpt ? selectedOpt.dataset.desc : '';

    var helpText = document.getElementById('presetHelpText');
    if (helpText) helpText.textContent = desc || '';

    var targetContainer = document.getElementById('targetSelectorContainer');
    var targetLabel = document.getElementById('targetSelectorLabel');

    if (requiresTargets) {
      targetContainer.classList.remove('d-none');
      if (targetType === 'DEPARTMENT') {
        targetLabel.textContent = 'تحديد أقسام الإنتاج المستهدفة';
        loadDepartmentOptions();
      } else if (targetType === 'YARD') {
        targetLabel.textContent = 'تحديد ساحات الإنتاج المستهدفة';
        loadYardOptions();
      }
    } else {
      targetContainer.classList.add('d-none');
    }
  }

  // Target Lookup Fetchers
  function loadDepartmentOptions(searchTerm) {
    var resultsEl = document.getElementById('targetSearchResults');
    resultsEl.innerHTML = '';
    var loadingDiv = document.createElement('div');
    loadingDiv.className = 'text-center py-2 text-muted small';
    loadingDiv.innerHTML = '<div class="spinner-border spinner-border-sm text-secondary me-1"></div>';
    loadingDiv.appendChild(document.createTextNode('جاري البحث عن الأقسام...'));
    resultsEl.appendChild(loadingDiv);

    var url = '/api/system/roles/lookups/departments?limit=100' + (searchTerm ? '&search=' + encodeURIComponent(searchTerm) : '');
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function(res) { return res.json(); })
      .then(function(resData) {
        if (resData.success) {
          renderTargetCheckboxes(resData.data || [], 'DEPARTMENT');
        } else {
          resultsEl.innerHTML = '';
          var errDiv = document.createElement('div');
          errDiv.className = 'text-danger small p-1';
          errDiv.textContent = 'فشل جلب الأقسام';
          resultsEl.appendChild(errDiv);
        }
      })
      .catch(function() {
        resultsEl.innerHTML = '';
        var errDiv = document.createElement('div');
        errDiv.className = 'text-danger small p-1';
        errDiv.textContent = 'تعذر الاتصال بالخادم';
        resultsEl.appendChild(errDiv);
      });
  }

  function loadYardOptions(searchTerm) {
    var resultsEl = document.getElementById('targetSearchResults');
    resultsEl.innerHTML = '';
    var loadingDiv = document.createElement('div');
    loadingDiv.className = 'text-center py-2 text-muted small';
    loadingDiv.innerHTML = '<div class="spinner-border spinner-border-sm text-secondary me-1"></div>';
    loadingDiv.appendChild(document.createTextNode('جاري البحث عن الساحات...'));
    resultsEl.appendChild(loadingDiv);

    var url = '/api/system/roles/lookups/yards?limit=100' + (searchTerm ? '&search=' + encodeURIComponent(searchTerm) : '');
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function(res) { return res.json(); })
      .then(function(resData) {
        if (resData.success) {
          renderTargetCheckboxes(resData.data || [], 'YARD');
        } else {
          resultsEl.innerHTML = '';
          var errDiv = document.createElement('div');
          errDiv.className = 'text-danger small p-1';
          errDiv.textContent = 'فشل جلب الساحات';
          resultsEl.appendChild(errDiv);
        }
      })
      .catch(function() {
        resultsEl.innerHTML = '';
        var errDiv = document.createElement('div');
        errDiv.className = 'text-danger small p-1';
        errDiv.textContent = 'تعذر الاتصال بالخادم';
        resultsEl.appendChild(errDiv);
      });
  }

  function renderTargetCheckboxes(items, type) {
    var resultsEl = document.getElementById('targetSearchResults');
    resultsEl.innerHTML = '';

    if (items.length === 0) {
      var noResDiv = document.createElement('div');
      noResDiv.className = 'text-center py-2 text-muted small';
      noResDiv.textContent = 'لا توجد نتائج مطابقة';
      resultsEl.appendChild(noResDiv);
      return;
    }

    items.forEach(function(item) {
      var isChecked = selectedTargetIds.has(item.id);

      var checkDiv = document.createElement('div');
      checkDiv.className = 'form-check py-1 border-bottom border-light';

      var input = document.createElement('input');
      input.type = 'checkbox';
      input.className = 'form-check-input target-item-checkbox';
      input.value = item.id;
      input.id = 'target_' + item.id;
      input.checked = isChecked;
      input.dataset.name = item.name;
      input.dataset.code = item.code || '';

      var label = document.createElement('label');
      label.className = 'form-check-label small cursor-pointer text-dark';
      label.htmlFor = 'target_' + item.id;

      var extraInfo = item.departmentName
        ? ' • ' + item.departmentName
        : (item.code ? ' • ' + item.code : '');
      label.textContent = item.name + extraInfo;

      if (!item.isActive) {
        var inactiveBadge = document.createElement('span');
        inactiveBadge.className = 'badge bg-danger-subtle text-danger small py-0 ms-1';
        inactiveBadge.textContent = 'معطل';
        label.appendChild(inactiveBadge);
      }

      checkDiv.appendChild(input);
      checkDiv.appendChild(label);
      resultsEl.appendChild(checkDiv);

      input.addEventListener('change', function() {
        var id = input.value;
        var name = input.dataset.name || '';
        var code = input.dataset.code || '';

        if (input.checked) {
          selectedTargetIds.add(id);
          selectedTargetObjects.set(id, { id: id, name: name, code: code });
        } else {
          selectedTargetIds.delete(id);
          selectedTargetObjects.delete(id);
        }
        updateSelectedChipsDisplay();
      });
    });
  }

  // Search Input Handler
  var targetSearchInput = document.getElementById('targetSearchInput');
  if (targetSearchInput) {
    targetSearchInput.addEventListener('input', function() {
      var term = targetSearchInput.value.trim();
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(function() {
        var selectedOpt = presetSelect.options[presetSelect.selectedIndex];
        var targetType = selectedOpt ? selectedOpt.dataset.targetType : '';
        if (targetType === 'DEPARTMENT') loadDepartmentOptions(term);
        else if (targetType === 'YARD') loadYardOptions(term);
      }, 300);
    });
  }

  function updateSelectedChipsDisplay() {
    var chipsContainer = document.getElementById('selectedTargetChips');
    if (!chipsContainer) return;
    chipsContainer.innerHTML = '';

    if (selectedTargetIds.size === 0) {
      var emptySpan = document.createElement('span');
      emptySpan.className = 'text-muted small align-self-center empty-chips-text';
      emptySpan.textContent = 'لم يتم تحديد أي أهداف بعد';
      chipsContainer.appendChild(emptySpan);
      return;
    }

    selectedTargetObjects.forEach(function(obj, id) {
      var chipSpan = document.createElement('span');
      chipSpan.className = 'badge bg-primary-subtle text-primary border border-primary-subtle d-inline-flex align-items-center gap-1 py-1 px-2 small';

      var textNode = document.createTextNode(obj.name);
      chipSpan.appendChild(textNode);

      var removeIcon = document.createElement('i');
      removeIcon.className = 'fa-solid fa-xmark cursor-pointer remove-chip-btn ms-1';
      removeIcon.dataset.id = id;

      removeIcon.addEventListener('click', function(e) {
        e.stopPropagation();
        selectedTargetIds.delete(id);
        selectedTargetObjects.delete(id);
        updateSelectedChipsDisplay();

        var cb = document.getElementById('target_' + id);
        if (cb) cb.checked = false;
      });

      chipSpan.appendChild(removeIcon);
      chipsContainer.appendChild(chipSpan);
    });
  }

  // Submit Access Rule Form Handler
  if (accessRuleForm) {
    accessRuleForm.addEventListener('submit', function(e) {
      e.preventDefault();
      clearDrawerAlert();

      var ruleId = document.getElementById('formRuleId').value;
      var isEdit = Boolean(ruleId && ruleId.trim().length > 0);
      var effect = document.querySelector('input[name="ruleEffect"]:checked')?.value || 'ALLOW';
      var preset = presetSelect.value;
      var description = document.getElementById('ruleDescriptionInput').value.trim() || undefined;

      if (!preset || preset.trim().length === 0) {
        showDrawerAlert('يرجى اختيار نطاق وصول صالح');
        return;
      }

      var selectedOpt = presetSelect.options[presetSelect.selectedIndex];
      var requiresTargets = selectedOpt ? selectedOpt.dataset.requiresTargets === 'true' : false;

      var targetIds = undefined;
      if (requiresTargets) {
        targetIds = Array.from(selectedTargetIds);
        if (targetIds.length === 0) {
          showDrawerAlert('يجب تحديد هدف واحد على الأقل لهذا النطاق المحدد');
          return;
        }
      }

      var payload = {
        effect: effect,
        preset: preset,
        targetIds: targetIds,
        description: description,
      };

      var submitBtn = document.getElementById('saveRuleSubmitBtn');
      setBtnLoading(submitBtn, true, 'جاري الحفظ...');

      var url = isEdit
        ? '/api/system/roles/' + encodeURIComponent(roleId) + '/permissions/' + encodeURIComponent(currentDrawerPermId) + '/access-rules/' + encodeURIComponent(ruleId)
        : '/api/system/roles/' + encodeURIComponent(roleId) + '/permissions/' + encodeURIComponent(currentDrawerPermId) + '/access-rules';

      var method = isEdit ? 'PUT' : 'POST';

      window.erpFetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
        .then(function(resObj) {
          setBtnLoading(submitBtn, false);
          if (resObj.ok && resObj.data.success) {
            hideRuleForm();
            loadDrawerPermissionRules(currentDrawerPermId);
            refreshSingleRolePermissionCard(currentDrawerPermId);
          } else {
            showDrawerAlert(extractApiErrorMessage(resObj.data, 'فشل حفظ قاعدة الوصول'));
          }
        })
        .catch(function() {
          setBtnLoading(submitBtn, false);
          showDrawerAlert('تعذر الاتصال بالخادم لحفظ قاعدة الوصول');
        });
    });
  }

  // Refresh single permission card on main page
  function refreshSingleRolePermissionCard(permId) {
    fetch('/api/system/roles/' + encodeURIComponent(roleId) + '/permissions', {
      headers: { 'Accept': 'application/json' },
    })
      .then(function(res) { return res.json(); })
      .then(function(resData) {
        if (resData.success && resData.data && resData.data.permissions) {
          var updatedPerm = resData.data.permissions.find(function(p) { return p.permissionId === permId; });
          if (updatedPerm) {
            var cardEl = document.getElementById('card_perm_' + permId);
            if (cardEl) {
              var toggle = cardEl.querySelector('.perm-state-toggle');
              if (toggle) toggle.checked = updatedPerm.enabled;

              var statusArea = cardEl.querySelector('.status-badge-area');
              if (statusArea) {
                statusArea.innerHTML = '';
                var primaryBadge = document.createElement('span');
                primaryBadge.className = 'badge small py-1 px-2';

                if (!updatedPerm.enabled) {
                  primaryBadge.className += ' bg-secondary-subtle text-secondary';
                  primaryBadge.innerHTML = '<i class="fa-solid fa-circle-minus me-1"></i>';
                  primaryBadge.appendChild(document.createTextNode('غير مفعلة'));
                } else if (updatedPerm.hasDenyAll) {
                  primaryBadge.className += ' bg-danger-subtle text-danger';
                  primaryBadge.innerHTML = '<i class="fa-solid fa-ban me-1"></i>';
                  primaryBadge.appendChild(document.createTextNode('محظورة بقاعدة DENY ALL'));
                } else if (updatedPerm.allowRuleCount === 0) {
                  primaryBadge.className += ' bg-warning-subtle text-warning-emphasis border border-warning-subtle';
                  primaryBadge.title = 'الصلاحية مفعلة لكن لا توجد قاعدة منح فعالة';
                  primaryBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation me-1"></i>';
                  primaryBadge.appendChild(document.createTextNode('مفعلة بلا قاعدة منح'));
                } else if (updatedPerm.hasAllowAll) {
                  primaryBadge.className += ' bg-success-subtle text-success';
                  primaryBadge.innerHTML = '<i class="fa-solid fa-check-double me-1"></i>';
                  primaryBadge.appendChild(document.createTextNode('وصول شامل (ALLOW ALL)'));
                } else {
                  primaryBadge.className += ' bg-primary-subtle text-primary';
                  primaryBadge.innerHTML = '<i class="fa-solid fa-shield-halved me-1"></i>';
                  primaryBadge.appendChild(document.createTextNode('وصول مقيد بقواعد'));
                }
                statusArea.appendChild(primaryBadge);

                if (updatedPerm.allowRuleCount > 0) {
                  var allowPill = document.createElement('span');
                  allowPill.className = 'badge bg-success text-white small py-1 px-2 rounded-pill ms-1';
                  allowPill.textContent = updatedPerm.allowRuleCount + ' منح';
                  statusArea.appendChild(allowPill);
                }
                if (updatedPerm.denyRuleCount > 0) {
                  var denyPill = document.createElement('span');
                  denyPill.className = 'badge bg-danger text-white small py-1 px-2 rounded-pill ms-1';
                  denyPill.textContent = updatedPerm.denyRuleCount + ' استثناء/حظر';
                  statusArea.appendChild(denyPill);
                }
              }

              var summaryEl = cardEl.querySelector('.summary-text span');
              if (summaryEl) summaryEl.textContent = updatedPerm.summary;

              var rulesCountSpan = cardEl.querySelector('.border-top span.small');
              if (rulesCountSpan) rulesCountSpan.textContent = updatedPerm.rules.length + ' قواعد مسجلة';
            }
          }
        }
      })
      .catch(function() {});
  }
});
