/**
 * Role Management & Access Rules Administration Client Script
 * Handles:
 * 1. Role CRUD & Active status toggling
 * 2. Permission Enable/Disable State Toggling (Checkbox semantics)
 * 3. Access Rules Drawer, Listing, Add, Edit, and Soft-Disable
 * 4. Searchable Target Selectors for Specific Departments & Yards
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

      fetch('/api/system/roles', {
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

      fetch('/api/system/roles/' + encodeURIComponent(roleId), {
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
        fetch('/api/system/roles/' + encodeURIComponent(roleId), {
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

      fetch('/api/system/roles/' + encodeURIComponent(roleId) + '/permissions/' + encodeURIComponent(permId) + '/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ enabled: desiredEnabled }),
      })
        .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
        .then(function(resObj) {
          toggle.disabled = false;
          if (resObj.ok && resObj.data.success) {
            // Update Card UI status badges and summaries
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

  // Target Lookup Cache
  var departmentsCache = null;
  var yardsCache = null;
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
    listEl.innerHTML = '<div class="text-center py-4 text-muted small"><div class="spinner-border spinner-border-sm text-secondary mb-2" role="status"></div><div>جاري تحميل القواعد...</div></div>';

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
          listEl.innerHTML = '<div class="alert alert-danger small p-2">تعذر جلب قواعد الوصول: ' + extractApiErrorMessage(resObj.data) + '</div>';
        }
      })
      .catch(function() {
        listEl.innerHTML = '<div class="alert alert-danger small p-2">تعذر الاتصال بالخادم لجلب القواعد</div>';
      });
  }

  function renderDrawerHeaderState(enabled, rules) {
    var badgeArea = document.getElementById('drawerStatusBadge');
    var countsSummary = document.getElementById('drawerRuleCountsSummary');
    var showFormBtn = document.getElementById('showAddRuleFormBtn');

    var allowCount = rules.filter(function(r) { return r.isActive && r.effect === 'ALLOW'; }).length;
    var denyCount = rules.filter(function(r) { return r.isActive && r.effect === 'DENY'; }).length;

    countsSummary.textContent = allowCount + ' قواعد منح • ' + denyCount + ' قواعد حظر/استثناء';

    if (!enabled) {
      badgeArea.innerHTML = '<span class="badge bg-secondary-subtle text-secondary small py-1 px-2">غير مفعلة</span>';
      if (showFormBtn) showFormBtn.disabled = true;
    } else if (allowCount === 0) {
      badgeArea.innerHTML = '<span class="badge bg-warning-subtle text-warning-emphasis small py-1 px-2 border border-warning-subtle"><i class="fa-solid fa-triangle-exclamation me-1"></i> مفعلة بلا منح</span>';
      if (showFormBtn) showFormBtn.disabled = isAdmin || !canManage;
    } else {
      badgeArea.innerHTML = '<span class="badge bg-success-subtle text-success small py-1 px-2"><i class="fa-solid fa-check me-1"></i> مفعّلة ولديها منح</span>';
      if (showFormBtn) showFormBtn.disabled = isAdmin || !canManage;
    }
  }

  function renderDrawerRulesList(rules, enabled) {
    var listEl = document.getElementById('drawerRulesList');
    var activeRules = rules.filter(function(r) { return r.isActive; });

    if (!enabled) {
      listEl.innerHTML = '<div class="alert alert-warning small p-3 mb-0"><i class="fa-solid fa-triangle-exclamation me-1"></i> الصلاحية غير مفعلة لهذا الدور. يرجى تفعيل الصلاحية أولاً للتمكن من إضافة قواعد وصول فعالة.</div>';
      return;
    }

    if (activeRules.length === 0) {
      listEl.innerHTML = '<div class="text-center py-4 bg-white border rounded text-muted small"><i class="fa-solid fa-folder-open fs-3 text-secondary mb-2 d-block"></i>لا توجد قواعد وصول فعالة لهذه الصلاحية حالياً.<div class="mt-1 text-danger-emphasis">لن يمتلك الدور أي وصول فعلي حتى تتم إضافة قاعدة منح (ALLOW).</div></div>';
      return;
    }

    var html = '';
    activeRules.forEach(function(rule) {
      var isAllow = rule.effect === 'ALLOW';
      var effectBadge = isAllow
        ? '<span class="badge bg-success text-white small px-2 py-1"><i class="fa-solid fa-circle-check me-1"></i>منح (ALLOW)</span>'
        : '<span class="badge bg-danger text-white small px-2 py-1"><i class="fa-solid fa-ban me-1"></i>حظر (DENY)</span>';

      var targetsHtml = '';
      if (rule.targets && rule.targets.length > 0) {
        targetsHtml = '<div class="d-flex flex-wrap gap-1 mt-2 pt-2 border-top">';
        rule.targets.forEach(function(t) {
          var targetClass = t.isAvailable ? 'bg-light text-dark border' : 'bg-danger-subtle text-danger border border-danger-subtle';
          var nameLabel = t.name + (t.code ? ' (' + t.code + ')' : '') + (t.departmentName ? ' • ' + t.departmentName : '');
          targetsHtml += '<span class="badge ' + targetClass + ' small py-1 px-2" style="font-weight: 500;">' + nameLabel + '</span>';
        });
        targetsHtml += '</div>';
      }

      var descHtml = rule.description ? '<div class="small text-muted mt-1 fst-italic">' + rule.description + '</div>' : '';

      var actionsHtml = '';
      if (!isAdmin && canManage) {
        actionsHtml = '<div class="d-flex gap-1">' +
          '<button type="button" class="btn btn-sm btn-outline-secondary edit-rule-btn py-0 px-2" data-rule-id="' + rule.id + '" title="تعديل القاعدة"><i class="fa-solid fa-pen-to-square"></i></button>' +
          '<button type="button" class="btn btn-sm btn-outline-danger disable-rule-btn py-0 px-2" data-rule-id="' + rule.id + '" title="تعطيل القاعدة"><i class="fa-solid fa-trash-can"></i></button>' +
          '</div>';
      }

      html += '<div class="card border p-3 bg-white" id="rule_card_' + rule.id + '" style="border-radius: 8px;">' +
        '<div class="d-flex justify-content-between align-items-start">' +
          '<div class="d-flex align-items-center gap-2">' +
            effectBadge +
            '<span class="fw-bold text-dark small">' + rule.presetLabel + '</span>' +
          '</div>' +
          actionsHtml +
        '</div>' +
        descHtml +
        targetsHtml +
        '</div>';
    });

    listEl.innerHTML = html;

    // Attach Edit & Disable Listeners
    listEl.querySelectorAll('.disable-rule-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var ruleId = btn.getAttribute('data-rule-id');
        disableRoleRule(ruleId);
      });
    });

    listEl.querySelectorAll('.edit-rule-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var ruleId = btn.getAttribute('data-rule-id');
        var ruleObj = rules.find(function(r) { return r.id === ruleId; });
        if (ruleObj) openEditRuleForm(ruleObj);
      });
    });
  }

  function disableRoleRule(ruleId) {
    if (!confirm('هل أنت متأكد من رغبتك في تعطيل قاعدة الوصول هذه؟')) return;
    clearDrawerAlert();

    fetch('/api/system/roles/' + encodeURIComponent(roleId) + '/permissions/' + encodeURIComponent(currentDrawerPermId) + '/access-rules/' + encodeURIComponent(ruleId), {
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

    if (presetSelect) {
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
    capabilities.forEach(function(cap) {
      var opt = document.createElement('option');
      opt.value = cap.preset;
      opt.textContent = cap.label;
      opt.setAttribute('data-desc', cap.description);
      opt.setAttribute('data-target-type', cap.targetType || '');
      opt.setAttribute('data-requires-targets', cap.requiresTargetIds ? 'true' : 'false');
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
    var requiresTargets = selectedOpt ? selectedOpt.getAttribute('data-requires-targets') === 'true' : false;
    var targetType = selectedOpt ? selectedOpt.getAttribute('data-target-type') : '';
    var desc = selectedOpt ? selectedOpt.getAttribute('data-desc') : '';

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
    resultsEl.innerHTML = '<div class="text-center py-2 text-muted small"><div class="spinner-border spinner-border-sm text-secondary me-1"></div>جاري البحث عن الأقسام...</div>';

    var url = '/api/system/roles/lookups/departments?limit=100' + (searchTerm ? '&search=' + encodeURIComponent(searchTerm) : '');
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function(res) { return res.json(); })
      .then(function(resData) {
        if (resData.success) {
          renderTargetCheckboxes(resData.data || [], 'DEPARTMENT');
        } else {
          resultsEl.innerHTML = '<div class="text-danger small p-1">فشل جلب الأقسام</div>';
        }
      })
      .catch(function() {
        resultsEl.innerHTML = '<div class="text-danger small p-1">تعذر الاتصال بالخادم</div>';
      });
  }

  function loadYardOptions(searchTerm) {
    var resultsEl = document.getElementById('targetSearchResults');
    resultsEl.innerHTML = '<div class="text-center py-2 text-muted small"><div class="spinner-border spinner-border-sm text-secondary me-1"></div>جاري البحث عن الساحات...</div>';

    var url = '/api/system/roles/lookups/yards?limit=100' + (searchTerm ? '&search=' + encodeURIComponent(searchTerm) : '');
    fetch(url, { headers: { 'Accept': 'application/json' } })
      .then(function(res) { return res.json(); })
      .then(function(resData) {
        if (resData.success) {
          renderTargetCheckboxes(resData.data || [], 'YARD');
        } else {
          resultsEl.innerHTML = '<div class="text-danger small p-1">فشل جلب الساحات</div>';
        }
      })
      .catch(function() {
        resultsEl.innerHTML = '<div class="text-danger small p-1">تعذر الاتصال بالخادم</div>';
      });
  }

  function renderTargetCheckboxes(items, type) {
    var resultsEl = document.getElementById('targetSearchResults');
    if (items.length === 0) {
      resultsEl.innerHTML = '<div class="text-center py-2 text-muted small">لا توجد نتائج مطابقة</div>';
      return;
    }

    var html = '';
    items.forEach(function(item) {
      var isChecked = selectedTargetIds.has(item.id);
      var extraInfo = item.departmentName ? ' • ' + item.departmentName : (item.code ? ' • ' + item.code : '');
      var statusBadge = !item.isActive ? ' <span class="badge bg-danger-subtle text-danger small py-0">معطل</span>' : '';

      html += '<div class="form-check py-1 border-bottom border-light">' +
        '<input class="form-check-input target-item-checkbox" type="checkbox" value="' + item.id + '" id="target_' + item.id + '" ' + (isChecked ? 'checked' : '') + ' data-name="' + item.name + '" data-code="' + (item.code || '') + '">' +
        '<label class="form-check-label small cursor-pointer text-dark" for="target_' + item.id + '">' +
          item.name + extraInfo + statusBadge +
        '</label>' +
        '</div>';
    });

    resultsEl.innerHTML = html;

    // Attach change handlers
    resultsEl.querySelectorAll('.target-item-checkbox').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var id = cb.value;
        var name = cb.getAttribute('data-name');
        var code = cb.getAttribute('data-code');

        if (cb.checked) {
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
        var targetType = selectedOpt ? selectedOpt.getAttribute('data-target-type') : '';
        if (targetType === 'DEPARTMENT') loadDepartmentOptions(term);
        else if (targetType === 'YARD') loadYardOptions(term);
      }, 300);
    });
  }

  function updateSelectedChipsDisplay() {
    var chipsContainer = document.getElementById('selectedTargetChips');
    if (!chipsContainer) return;

    if (selectedTargetIds.size === 0) {
      chipsContainer.innerHTML = '<span class="text-muted small align-self-center empty-chips-text">لم يتم تحديد أي أهداف بعد</span>';
      return;
    }

    var html = '';
    selectedTargetObjects.forEach(function(obj, id) {
      html += '<span class="badge bg-primary-subtle text-primary border border-primary-subtle d-inline-flex align-items-center gap-1 py-1 px-2 small">' +
        obj.name +
        '<i class="fa-solid fa-xmark cursor-pointer remove-chip-btn ms-1" data-id="' + id + '"></i>' +
        '</span>';
    });

    chipsContainer.innerHTML = html;

    // Attach chip remove listeners
    chipsContainer.querySelectorAll('.remove-chip-btn').forEach(function(icon) {
      icon.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = icon.getAttribute('data-id');
        selectedTargetIds.delete(id);
        selectedTargetObjects.delete(id);
        updateSelectedChipsDisplay();

        var cb = document.getElementById('target_' + id);
        if (cb) cb.checked = false;
      });
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

      var selectedOpt = presetSelect.options[presetSelect.selectedIndex];
      var requiresTargets = selectedOpt ? selectedOpt.getAttribute('data-requires-targets') === 'true' : false;

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

      fetch(url, {
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
                var badgesHtml = '';
                if (!updatedPerm.enabled) {
                  badgesHtml += '<span class="badge bg-secondary-subtle text-secondary small py-1 px-2"><i class="fa-solid fa-circle-minus me-1"></i> غير مفعلة</span>';
                } else if (updatedPerm.hasDenyAll) {
                  badgesHtml += '<span class="badge bg-danger-subtle text-danger small py-1 px-2"><i class="fa-solid fa-ban me-1"></i> محظورة بقاعدة DENY ALL</span>';
                } else if (updatedPerm.allowRuleCount === 0) {
                  badgesHtml += '<span class="badge bg-warning-subtle text-warning-emphasis small py-1 px-2 border border-warning-subtle" title="الصلاحية مفعلة لكن لا توجد قاعدة منح فعالة"><i class="fa-solid fa-triangle-exclamation me-1"></i> مفعلة بلا قاعدة منح</span>';
                } else if (updatedPerm.hasAllowAll) {
                  badgesHtml += '<span class="badge bg-success-subtle text-success small py-1 px-2"><i class="fa-solid fa-check-double me-1"></i> وصول شامل (ALLOW ALL)</span>';
                } else {
                  badgesHtml += '<span class="badge bg-primary-subtle text-primary small py-1 px-2"><i class="fa-solid fa-shield-halved me-1"></i> وصول مقيد بقواعد</span>';
                }

                if (updatedPerm.allowRuleCount > 0) {
                  badgesHtml += '<span class="badge bg-success text-white small py-1 px-2 rounded-pill">' + updatedPerm.allowRuleCount + ' منح</span>';
                }
                if (updatedPerm.denyRuleCount > 0) {
                  badgesHtml += '<span class="badge bg-danger text-white small py-1 px-2 rounded-pill">' + updatedPerm.denyRuleCount + ' استثناء/حظر</span>';
                }
                statusArea.innerHTML = badgesHtml;
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
