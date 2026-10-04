/**
 * Direct User Permission & Access Rules Administration Client Script
 * Handles:
 * 1. Direct Permission Enable/Disable State Toggling
 * 2. Access Rules Drawer for Direct User Permissions
 * 3. Add, Edit, and Soft-Disable Direct Access Rules
 * 4. Searchable Target Selectors for Specific Departments & Yards
 */

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
  var textSpan = btn.querySelector('#saveRuleBtnText') || btn.querySelector('#btnText') || btn.querySelector('span:not(.spinner-border)');

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
  var permContainer = document.getElementById('userPermissionsContainer');
  if (!permContainer) return;

  var userId = permContainer.getAttribute('data-user-id');
  var isSelf = permContainer.getAttribute('data-is-self') === 'true';
  var canManage = permContainer.getAttribute('data-can-manage') === 'true';

  // Direct Checkbox State Toggle Handler
  document.querySelectorAll('.direct-perm-toggle').forEach(function(toggle) {
    toggle.addEventListener('change', function() {
      if (isSelf) {
        toggle.checked = !toggle.checked;
        showPageAlert('لا يمكنك تعديل صلاحيات حسابك المباشرة بنفسك');
        return;
      }

      var permId = toggle.getAttribute('data-permission-id');
      var desiredEnabled = toggle.checked;

      toggle.disabled = true;
      clearPageAlert();

      fetch('/api/system/users/' + encodeURIComponent(userId) + '/permissions/' + encodeURIComponent(permId) + '/state', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ enabled: desiredEnabled }),
      })
        .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
        .then(function(resObj) {
          toggle.disabled = false;
          if (resObj.ok && resObj.data.success) {
            refreshSingleUserPermissionCard(permId);
          } else {
            toggle.checked = !desiredEnabled;
            showPageAlert(extractApiErrorMessage(resObj.data, 'فشل تعديل حالة الصلاحية المباشرة'));
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
  var drawerEl = document.getElementById('userAccessRulesOffcanvas');
  var drawerBs = drawerEl && typeof bootstrap !== 'undefined' ? new bootstrap.Offcanvas(drawerEl) : null;
  var currentDrawerPermId = null;
  var currentDrawerPermName = null;
  var currentDrawerCapabilities = [];
  var selectedTargetIds = new Set();
  var selectedTargetObjects = new Map();

  var searchDebounceTimer = null;

  // Open Drawer Button
  document.querySelectorAll('.open-user-rules-drawer-btn').forEach(function(btn) {
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

      loadDrawerUserRules(permId);

      if (drawerBs) drawerBs.show();
    });
  });

  function loadDrawerUserRules(permId) {
    var listEl = document.getElementById('drawerRulesList');
    listEl.innerHTML = '<div class="text-center py-4 text-muted small"><div class="spinner-border spinner-border-sm text-secondary mb-2" role="status"></div><div>جاري تحميل القواعد...</div></div>';

    fetch('/api/system/users/' + encodeURIComponent(userId) + '/permissions/' + encodeURIComponent(permId) + '/access-rules', {
      headers: { 'Accept': 'application/json' },
    })
      .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
      .then(function(resObj) {
        if (resObj.ok && resObj.data.success) {
          var data = resObj.data.data;
          currentDrawerCapabilities = data.capabilities || [];
          renderDrawerHeaderState(data.directEnabled, data.directRules || []);
          renderRoleRulesPreview(data.roleRules || []);
          renderDrawerRulesList(data.directRules || [], data.directEnabled);
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

    countsSummary.textContent = allowCount + ' قواعد منح مباشرة • ' + denyCount + ' قواعد حظر مباشرة';

    if (!enabled) {
      badgeArea.innerHTML = '<span class="badge bg-secondary-subtle text-secondary small py-1 px-2">مباشرة غير مفعلة</span>';
      if (showFormBtn) showFormBtn.disabled = true;
    } else if (allowCount === 0) {
      badgeArea.innerHTML = '<span class="badge bg-warning-subtle text-warning-emphasis small py-1 px-2 border border-warning-subtle"><i class="fa-solid fa-triangle-exclamation me-1"></i> مفعلة بلا منح مباشر</span>';
      if (showFormBtn) showFormBtn.disabled = isSelf || !canManage;
    } else {
      badgeArea.innerHTML = '<span class="badge bg-primary-subtle text-primary small py-1 px-2"><i class="fa-solid fa-user-check me-1"></i> مباشرة مفعّلة</span>';
      if (showFormBtn) showFormBtn.disabled = isSelf || !canManage;
    }
  }

  function renderRoleRulesPreview(roleRules) {
    var section = document.getElementById('drawerRoleRulesSection');
    var list = document.getElementById('drawerRoleRulesList');
    if (!section || !list) return;

    var activeRoleRules = roleRules.filter(function(r) { return r.isActive; });
    if (activeRoleRules.length === 0) {
      section.classList.add('d-none');
      return;
    }

    section.classList.remove('d-none');
    var html = '';
    activeRoleRules.forEach(function(r) {
      var isAllow = r.effect === 'ALLOW';
      var badge = isAllow
        ? '<span class="badge bg-success-subtle text-success small py-0 px-2">منح (ALLOW)</span>'
        : '<span class="badge bg-danger-subtle text-danger small py-0 px-2">حظر (DENY)</span>';

      html += '<div class="p-2 rounded border bg-light small d-flex justify-content-between align-items-center">' +
        '<div>' + badge + ' <span class="fw-bold text-dark ms-1">' + r.presetLabel + '</span></div>' +
        '<span class="badge bg-info-subtle text-info-emphasis py-0" style="font-size: 0.7rem;">الدور الأساسي</span>' +
        '</div>';
    });
    list.innerHTML = html;
  }

  function renderDrawerRulesList(rules, enabled) {
    var listEl = document.getElementById('drawerRulesList');
    var activeRules = rules.filter(function(r) { return r.isActive; });

    if (!enabled) {
      listEl.innerHTML = '<div class="alert alert-warning small p-3 mb-0"><i class="fa-solid fa-triangle-exclamation me-1"></i> الصلاحية المباشرة غير مفعلة لهذا المستخدم. يرجى تفعيل الصلاحية أولاً للتمكن من إضافة قواعد وصول مباشرة.</div>';
      return;
    }

    if (activeRules.length === 0) {
      listEl.innerHTML = '<div class="text-center py-4 bg-white border rounded text-muted small"><i class="fa-solid fa-folder-open fs-3 text-secondary mb-2 d-block"></i>لا توجد قواعد وصول مباشرة مسجلة لهذا المستخدم حالياً.</div>';
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
      if (!isSelf && canManage) {
        actionsHtml = '<div class="d-flex gap-1">' +
          '<button type="button" class="btn btn-sm btn-outline-secondary edit-user-rule-btn py-0 px-2" data-rule-id="' + rule.id + '" title="تعديل القاعدة"><i class="fa-solid fa-pen-to-square"></i></button>' +
          '<button type="button" class="btn btn-sm btn-outline-danger disable-user-rule-btn py-0 px-2" data-rule-id="' + rule.id + '" title="تعطيل القاعدة"><i class="fa-solid fa-trash-can"></i></button>' +
          '</div>';
      }

      html += '<div class="card border p-3 bg-white" id="user_rule_card_' + rule.id + '" style="border-radius: 8px;">' +
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
    listEl.querySelectorAll('.disable-user-rule-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var ruleId = btn.getAttribute('data-rule-id');
        disableUserRule(ruleId);
      });
    });

    listEl.querySelectorAll('.edit-user-rule-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var ruleId = btn.getAttribute('data-rule-id');
        var ruleObj = rules.find(function(r) { return r.id === ruleId; });
        if (ruleObj) openEditRuleForm(ruleObj);
      });
    });
  }

  function disableUserRule(ruleId) {
    if (!confirm('هل أنت متأكد من رغبتك في تعطيل قاعدة الوصول المباشرة هذه؟')) return;
    clearDrawerAlert();

    fetch('/api/system/users/' + encodeURIComponent(userId) + '/permissions/' + encodeURIComponent(currentDrawerPermId) + '/access-rules/' + encodeURIComponent(ruleId), {
      method: 'DELETE',
      headers: { 'Accept': 'application/json' },
    })
      .then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
      .then(function(resObj) {
        if (resObj.ok && resObj.data.success) {
          loadDrawerUserRules(currentDrawerPermId);
          refreshSingleUserPermissionCard(currentDrawerPermId);
        } else {
          showDrawerAlert(extractApiErrorMessage(resObj.data, 'فشل تعطيل قاعدة الوصول'));
        }
      })
      .catch(function() {
        showDrawerAlert('تعذر الاتصال بالخادم لتعطيل القاعدة');
      });
  }

  // -------------------------------------------------------------
  // Add / Edit Direct Rule Form
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
    var titleEl = document.getElementById('ruleFormTitle');
    if (titleEl) titleEl.textContent = 'إضافة قاعدة وصول مباشرة جديدة';
    var formRuleId = document.getElementById('formRuleId');
    if (formRuleId) formRuleId.value = '';
    var allowRadio = document.getElementById('effectAllow');
    if (allowRadio) allowRadio.checked = true;
    var descInput = document.getElementById('ruleDescriptionInput');
    if (descInput) descInput.value = '';

    selectedTargetIds.clear();
    selectedTargetObjects.clear();
    updateSelectedChipsDisplay();

    if (presetSelect && presetSelect.options.length > 0) {
      presetSelect.selectedIndex = 0;
      handlePresetChange(presetSelect.value);
    }

    if (ruleFormContainer) {
      ruleFormContainer.classList.remove('d-none');
      ruleFormContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function openEditRuleForm(rule) {
    clearDrawerAlert();
    var titleEl = document.getElementById('ruleFormTitle');
    if (titleEl) titleEl.textContent = 'تعديل قاعدة الوصول المباشرة';
    var formRuleId = document.getElementById('formRuleId');
    if (formRuleId) formRuleId.value = rule.id;

    if (rule.effect === 'DENY') {
      var denyRadio = document.getElementById('effectDeny');
      if (denyRadio) denyRadio.checked = true;
    } else {
      var allowRadio = document.getElementById('effectAllow');
      if (allowRadio) allowRadio.checked = true;
    }

    var descInput = document.getElementById('ruleDescriptionInput');
    if (descInput) descInput.value = rule.description || '';

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

    if (ruleFormContainer) {
      ruleFormContainer.classList.remove('d-none');
      ruleFormContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
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

    var url = '/api/system/users/lookups/departments?limit=100' + (searchTerm ? '&search=' + encodeURIComponent(searchTerm) : '');
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

    var url = '/api/system/users/lookups/yards?limit=100' + (searchTerm ? '&search=' + encodeURIComponent(searchTerm) : '');
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
        '<input class="form-check-input target-item-checkbox" type="checkbox" value="' + item.id + '" id="user_target_' + item.id + '" ' + (isChecked ? 'checked' : '') + ' data-name="' + item.name + '" data-code="' + (item.code || '') + '">' +
        '<label class="form-check-label small cursor-pointer text-dark" for="user_target_' + item.id + '">' +
          item.name + extraInfo + statusBadge +
        '</label>' +
        '</div>';
    });

    resultsEl.innerHTML = html;

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

    chipsContainer.querySelectorAll('.remove-chip-btn').forEach(function(icon) {
      icon.addEventListener('click', function(e) {
        e.stopPropagation();
        var id = icon.getAttribute('data-id');
        selectedTargetIds.delete(id);
        selectedTargetObjects.delete(id);
        updateSelectedChipsDisplay();

        var cb = document.getElementById('user_target_' + id);
        if (cb) cb.checked = false;
      });
    });
  }

  // Submit Direct Access Rule Form Handler
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
        ? '/api/system/users/' + encodeURIComponent(userId) + '/permissions/' + encodeURIComponent(currentDrawerPermId) + '/access-rules/' + encodeURIComponent(ruleId)
        : '/api/system/users/' + encodeURIComponent(userId) + '/permissions/' + encodeURIComponent(currentDrawerPermId) + '/access-rules';

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
            loadDrawerUserRules(currentDrawerPermId);
            refreshSingleUserPermissionCard(currentDrawerPermId);
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
  function refreshSingleUserPermissionCard(permId) {
    fetch('/api/system/users/' + encodeURIComponent(userId) + '/permissions', {
      headers: { 'Accept': 'application/json' },
    })
      .then(function(res) { return res.json(); })
      .then(function(resData) {
        if (resData.success && resData.data && resData.data.permissions) {
          var updatedPerm = resData.data.permissions.find(function(p) { return p.permissionId === permId; });
          if (updatedPerm) {
            var cardEl = document.getElementById('card_perm_' + permId);
            if (cardEl) {
              var toggle = cardEl.querySelector('.direct-perm-toggle');
              if (toggle) toggle.checked = updatedPerm.direct.enabled;

              var directSummary = cardEl.querySelector('.p-2.mb-2:nth-child(2) .text-muted');
              if (directSummary) directSummary.textContent = updatedPerm.direct.summary;

              var effectiveSummary = cardEl.querySelector('.p-2.rounded.mb-3 .text-secondary');
              if (effectiveSummary) effectiveSummary.textContent = updatedPerm.effective.summary;

              var rulesCountSpan = cardEl.querySelector('.border-top span.small');
              if (rulesCountSpan) rulesCountSpan.textContent = updatedPerm.direct.rules.length + ' قواعد مباشرة';
            }
          }
        }
      })
      .catch(function() {});
  }
});
