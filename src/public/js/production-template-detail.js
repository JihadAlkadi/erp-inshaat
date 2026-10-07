/**
 * Production Template Builder Workspace Script
 * 
 * Features:
 * - Single-page Template Builder workspace
 * - In-place basic info editing (Modal + PUT API without reload)
 * - Dynamic specifications CRUD & dense reordering (Up/Down + Reorder API)
 * - Stages workflow with consecutive department grouping (presentation only)
 * - Dense stages reordering (Drag & Drop + Up/Down buttons)
 * - Unified Stage Drawer (Offcanvas) with 3 integrated tabs:
 *     1. Stage Information & Department Mutation
 *     2. Planned Materials with debounced catalog search, pagination, and on-demand units
 *     3. Reference Documents with upload, soft-delete, authenticated download, and reordering
 * - Real-time count badges synchronization on Stage Cards and Drawer tabs
 * - Native DOM APIs for XSS safety (no innerHTML with user strings)
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Safely parse configuration from script[type="application/json"]
  let config = {};
  const configScript = document.getElementById('productionTemplateConfigData');
  if (configScript) {
    try {
      config = JSON.parse(configScript.textContent || '{}');
    } catch (err) {
      console.error('Failed to parse production template configuration:', err);
    }
  }

  const templateId = config.templateId;
  let currentTemplate = {
    name: config.templateName || '',
    code: config.templateCode || '',
    referenceNumber: config.templateReferenceNumber || null,
    description: config.templateDescription || null,
    isActive: Boolean(config.templateIsActive),
  };

  const canUpdate = Boolean(config.canUpdateTemplate);
  const canDelete = Boolean(config.canDeleteTemplate);

  const departmentsMap = new Map();
  (config.departments || []).forEach((d) => departmentsMap.set(d.id, d));

  let currentStages = Array.isArray(config.initialStages) ? [...config.initialStages] : [];
  currentStages.sort((a, b) => a.sortOrder - b.sortOrder);

  let currentSpecifications = Array.isArray(config.initialSpecifications) ? [...config.initialSpecifications] : [];
  currentSpecifications.sort((a, b) => a.sortOrder - b.sortOrder);

  let activeDrawerStage = null;
  let draggedStageId = null;

  // Catalog picker state
  let catalogSearchQuery = '';
  let catalogCurrentPage = 1;
  let catalogTotalPages = 1;
  let catalogSearchDebounceTimer = null;
  let selectedCatalogProduct = null;
  const productUnitsCache = new Map();

  // Helper: Toast notification
  function showToast(message, icon = 'success') {
    if (typeof Swal !== 'undefined') {
      const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
      });
      Toast.fire({ icon, title: message });
    }
  }

  // Check pending toast from previous action (e.g. create redirect)
  const pendingToast = sessionStorage.getItem('pendingToast');
  if (pendingToast) {
    showToast(pendingToast);
    sessionStorage.removeItem('pendingToast');
  }

  // ========================================================
  // 2. TEMPLATE BASIC INFO MANAGEMENT
  // ========================================================

  const editBasicInfoModalEl = document.getElementById('editBasicInfoModal');
  const editBasicInfoModal = editBasicInfoModalEl ? new bootstrap.Modal(editBasicInfoModalEl) : null;
  const editBasicInfoForm = document.getElementById('editBasicInfoForm');
  const btnOpenEditBasicInfo = document.getElementById('btnOpenEditBasicInfo');
  const btnQuickEditBasicInfo = document.getElementById('btnQuickEditBasicInfo');
  const btnToggleTemplateStatus = document.getElementById('btnToggleTemplateStatus');
  const btnArchiveTemplate = document.getElementById('btnArchiveTemplate');

  function openEditBasicInfo() {
    if (!editBasicInfoForm) return;
    document.getElementById('modalEditName').value = currentTemplate.name;
    document.getElementById('modalEditReference').value = currentTemplate.referenceNumber || '';
    document.getElementById('modalEditDescription').value = currentTemplate.description || '';
    document.getElementById('modalEditIsActive').checked = currentTemplate.isActive;
    editBasicInfoForm.classList.remove('was-validated');
    if (editBasicInfoModal) editBasicInfoModal.show();
  }

  if (btnOpenEditBasicInfo) btnOpenEditBasicInfo.addEventListener('click', openEditBasicInfo);
  if (btnQuickEditBasicInfo) btnQuickEditBasicInfo.addEventListener('click', openEditBasicInfo);

  if (editBasicInfoForm) {
    editBasicInfoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!editBasicInfoForm.checkValidity()) {
        editBasicInfoForm.classList.add('was-validated');
        return;
      }

      const name = document.getElementById('modalEditName').value.trim();
      const referenceNumber = document.getElementById('modalEditReference').value.trim() || null;
      const description = document.getElementById('modalEditDescription').value.trim() || null;
      const isActive = document.getElementById('modalEditIsActive').checked;

      try {
        const res = await window.erpFetch(`/api/production/templates/${templateId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, referenceNumber, description, isActive }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          currentTemplate.name = name;
          currentTemplate.referenceNumber = referenceNumber;
          currentTemplate.description = description;
          currentTemplate.isActive = isActive;
          updateTemplateHeaderAndCards();
          if (editBasicInfoModal) editBasicInfoModal.hide();
          showToast('تم تحديث البيانات الأساسية للقالب بنجاح');
        } else {
          Swal.fire('خطأ', data.message || 'تعذر تحديث بيانات القالب', 'error');
        }
      } catch {
        Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
      }
    });
  }

  function updateTemplateHeaderAndCards() {
    const elHeaderName = document.getElementById('headerTemplateName');
    if (elHeaderName) elHeaderName.textContent = currentTemplate.name;

    const elCardName = document.getElementById('cardTemplateName');
    if (elCardName) elCardName.textContent = currentTemplate.name;

    const elHeaderRef = document.getElementById('headerTemplateReference');
    if (elHeaderRef) elHeaderRef.textContent = currentTemplate.referenceNumber || 'غير محدد';

    const elCardRef = document.getElementById('cardTemplateReference');
    if (elCardRef) elCardRef.textContent = currentTemplate.referenceNumber || 'غير محدد';

    const elHeaderDesc = document.getElementById('headerTemplateDescription');
    if (elHeaderDesc) elHeaderDesc.textContent = currentTemplate.description || 'لا يوجد وصف مضاف للقالب.';

    const elCardDesc = document.getElementById('cardTemplateDescription');
    if (elCardDesc) elCardDesc.textContent = currentTemplate.description || 'لا يوجد وصف مضاف لهذا القالب.';

    const badge = document.getElementById('headerStatusBadge');
    const text = document.getElementById('headerStatusText');
    const btnToggleText = document.getElementById('btnToggleStatusText');

    if (badge && text) {
      if (currentTemplate.isActive) {
        badge.className = 'badge bg-success-subtle text-success px-3 py-1 rounded-pill';
        badge.querySelector('i').className = 'fa-solid fa-circle-check me-1';
        text.textContent = 'نشط';
      } else {
        badge.className = 'badge bg-danger-subtle text-danger px-3 py-1 rounded-pill';
        badge.querySelector('i').className = 'fa-solid fa-circle-xmark me-1';
        text.textContent = 'معطل';
      }
    }

    if (btnToggleTemplateStatus && btnToggleText) {
      if (currentTemplate.isActive) {
        btnToggleTemplateStatus.className = 'btn btn-outline-warning d-inline-flex align-items-center gap-2';
        btnToggleTemplateStatus.querySelector('i').className = 'fa-solid fa-ban';
        btnToggleText.textContent = 'تعطيل القالب';
      } else {
        btnToggleTemplateStatus.className = 'btn btn-outline-success d-inline-flex align-items-center gap-2';
        btnToggleTemplateStatus.querySelector('i').className = 'fa-solid fa-check';
        btnToggleText.textContent = 'تفعيل القالب';
      }
    }
  }

  // Toggle Status
  if (btnToggleTemplateStatus) {
    btnToggleTemplateStatus.addEventListener('click', async () => {
      const nextActive = !currentTemplate.isActive;
      const actionTitle = nextActive ? 'تفعيل القالب' : 'تعطيل القالب';
      const actionText = nextActive
        ? 'هل أنت متأكد من تفعيل هذا القالب ليكون متاحاً في أوامر الإنتاج؟'
        : 'هل أنت متأكد من تعطيل هذا القالب؟';

      const result = await Swal.fire({
        title: actionTitle,
        text: actionText,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'نعم، تابع',
        cancelButtonText: 'إلغاء',
      });

      if (result.isConfirmed) {
        try {
          const res = await window.erpFetch(`/api/production/templates/${templateId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: nextActive }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            currentTemplate.isActive = nextActive;
            updateTemplateHeaderAndCards();
            showToast(nextActive ? 'تم تفعيل القالب بنجاح' : 'تم تعطيل القالب بنجاح');
          } else {
            Swal.fire('خطأ', data.message || 'تعذر تعديل حالة القالب', 'error');
          }
        } catch {
          Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
        }
      }
    });
  }

  // Archive Template
  if (btnArchiveTemplate) {
    btnArchiveTemplate.addEventListener('click', async () => {
      const result = await Swal.fire({
        title: 'أرشفة القالب بالكامل',
        text: 'هل أنت متأكد من أرشفة هذا القالب ومراحله ومواصفاته؟ لن يمكن استخدامه في أوامر إنتاج جديدة.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        confirmButtonText: 'نعم، أرشفة القالب',
        cancelButtonText: 'إلغاء',
      });

      if (result.isConfirmed) {
        try {
          const res = await window.erpFetch(`/api/production/templates/${templateId}`, {
            method: 'DELETE',
          });
          const data = await res.json();
          if (res.ok && data.success) {
            sessionStorage.setItem('pendingToast', 'تمت أرشفة القالب بنجاح');
            window.location.href = '/production/templates';
          } else {
            Swal.fire('خطأ', data.message || 'تعذر أرشفة القالب', 'error');
          }
        } catch {
          Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
        }
      }
    });
  }

  // ========================================================
  // 3. SPECIFICATIONS MANAGEMENT & REORDERING
  // ========================================================

  const specsContainer = document.getElementById('specificationsContainer');
  const btnOpenAddSpecModal = document.getElementById('btnOpenAddSpecModal');
  const addSpecModalEl = document.getElementById('addSpecModal');
  const addSpecModal = addSpecModalEl ? new bootstrap.Modal(addSpecModalEl) : null;
  const addSpecForm = document.getElementById('addSpecForm');

  const editSpecModalEl = document.getElementById('editSpecModal');
  const editSpecModal = editSpecModalEl ? new bootstrap.Modal(editSpecModalEl) : null;
  const editSpecForm = document.getElementById('editSpecForm');

  if (btnOpenAddSpecModal) {
    btnOpenAddSpecModal.addEventListener('click', () => {
      if (addSpecForm) {
        addSpecForm.reset();
        addSpecForm.classList.remove('was-validated');
      }
      if (addSpecModal) addSpecModal.show();
    });
  }

  if (addSpecForm) {
    addSpecForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!addSpecForm.checkValidity()) {
        addSpecForm.classList.add('was-validated');
        return;
      }

      const name = document.getElementById('newSpecName').value.trim();
      const value = document.getElementById('newSpecValue').value.trim();
      const unit = document.getElementById('newSpecUnit').value.trim() || undefined;

      try {
        const res = await window.erpFetch(`/api/production/templates/${templateId}/specifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, value, unit }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          currentSpecifications.push(data.data);
          currentSpecifications.sort((a, b) => a.sortOrder - b.sortOrder);
          renderSpecifications();
          if (addSpecModal) addSpecModal.hide();
          showToast('تمت إضافة الخاصية بنجاح');
        } else {
          Swal.fire('خطأ', data.message || 'تعذر إضافة الخاصية', 'error');
        }
      } catch {
        Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
      }
    });
  }

  if (editSpecForm) {
    editSpecForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!editSpecForm.checkValidity()) {
        editSpecForm.classList.add('was-validated');
        return;
      }

      const specId = document.getElementById('editSpecId').value;
      const name = document.getElementById('editSpecName').value.trim();
      const value = document.getElementById('editSpecValue').value.trim();
      const unit = document.getElementById('editSpecUnit').value.trim() || null;

      try {
        const res = await window.erpFetch(`/api/production/templates/${templateId}/specifications/${specId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, value, unit }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const idx = currentSpecifications.findIndex((s) => s.id === specId);
          if (idx !== -1) {
            currentSpecifications[idx] = data.data;
            renderSpecifications();
          }
          if (editSpecModal) editSpecModal.hide();
          showToast('تم تعديل الخاصية بنجاح');
        } else {
          Swal.fire('خطأ', data.message || 'تعذر تعديل الخاصية', 'error');
        }
      } catch {
        Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
      }
    });
  }

  function renderSpecifications() {
    if (!specsContainer) return;
    specsContainer.replaceChildren();

    const specCountEl = document.getElementById('headerSpecCount');
    if (specCountEl) specCountEl.textContent = currentSpecifications.length;
    const navSpecBadge = document.getElementById('navSpecCountBadge');
    if (navSpecBadge) navSpecBadge.textContent = currentSpecifications.length;

    if (currentSpecifications.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'text-center py-4 text-muted border border-dashed rounded-3 bg-light bg-opacity-50';
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-ruler-combined fs-2 mb-2 text-secondary opacity-50';
      const p1 = document.createElement('p');
      p1.className = 'mb-1 fw-bold';
      p1.textContent = 'لم تتم إضافة مواصفات لهذا القالب بعد.';
      const p2 = document.createElement('p');
      p2.className = 'small text-muted mb-2';
      p2.textContent = 'انقر على زر "إضافة خاصية" لإدخال أبعاد ومواصفات المنتج.';
      emptyDiv.append(icon, p1, p2);

      if (canUpdate) {
        const btnAdd = document.createElement('button');
        btnAdd.type = 'button';
        btnAdd.className = 'btn btn-sm btn-outline-primary';
        btnAdd.textContent = 'إضافة أول مواصفة';
        btnAdd.addEventListener('click', () => {
          if (addSpecModal) addSpecModal.show();
        });
        emptyDiv.appendChild(btnAdd);
      }
      specsContainer.appendChild(emptyDiv);
      return;
    }

    currentSpecifications.forEach((spec, index) => {
      const card = document.createElement('div');
      card.className = 'card border p-2 spec-item';
      card.style.borderRadius = '8px';
      card.dataset.specId = spec.id;

      const innerFlex = document.createElement('div');
      innerFlex.className = 'd-flex justify-content-between align-items-center';

      const infoDiv = document.createElement('div');
      const nameStrong = document.createElement('strong');
      nameStrong.className = 'text-dark spec-display-name';
      nameStrong.textContent = spec.name;

      const valDiv = document.createElement('div');
      valDiv.className = 'text-muted small';
      const valBadge = document.createElement('span');
      valBadge.className = 'badge bg-light text-dark border spec-display-value';
      valBadge.textContent = spec.value;
      valDiv.appendChild(valBadge);

      if (spec.unit) {
        const unitSpan = document.createElement('span');
        unitSpan.className = 'ms-1 spec-display-unit';
        unitSpan.textContent = spec.unit;
        valDiv.appendChild(unitSpan);
      }
      infoDiv.append(nameStrong, valDiv);
      innerFlex.appendChild(infoDiv);

      if (canUpdate) {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'd-flex align-items-center gap-1';

        // Up Button
        const btnUp = document.createElement('button');
        btnUp.type = 'button';
        btnUp.className = 'btn btn-sm btn-light p-1 btn-move-spec-up';
        btnUp.title = 'تحريك لأعلى';
        btnUp.disabled = index === 0;
        const iconUp = document.createElement('i');
        iconUp.className = 'fa-solid fa-arrow-up text-secondary';
        btnUp.appendChild(iconUp);
        btnUp.addEventListener('click', () => moveSpec(index, -1));

        // Down Button
        const btnDown = document.createElement('button');
        btnDown.type = 'button';
        btnDown.className = 'btn btn-sm btn-light p-1 btn-move-spec-down';
        btnDown.title = 'تحريك لأسفل';
        btnDown.disabled = index === currentSpecifications.length - 1;
        const iconDown = document.createElement('i');
        iconDown.className = 'fa-solid fa-arrow-down text-secondary';
        btnDown.appendChild(iconDown);
        btnDown.addEventListener('click', () => moveSpec(index, 1));

        // Edit Button
        const btnEdit = document.createElement('button');
        btnEdit.type = 'button';
        btnEdit.className = 'btn btn-sm btn-light p-1 btn-edit-spec';
        btnEdit.title = 'تعديل';
        const iconEdit = document.createElement('i');
        iconEdit.className = 'fa-solid fa-pen text-primary';
        btnEdit.appendChild(iconEdit);
        btnEdit.addEventListener('click', () => {
          document.getElementById('editSpecId').value = spec.id;
          document.getElementById('editSpecName').value = spec.name;
          document.getElementById('editSpecValue').value = spec.value;
          document.getElementById('editSpecUnit').value = spec.unit || '';
          if (editSpecModal) editSpecModal.show();
        });

        // Delete Button
        const btnDelete = document.createElement('button');
        btnDelete.type = 'button';
        btnDelete.className = 'btn btn-sm btn-light p-1 btn-delete-spec';
        btnDelete.title = 'حذف';
        const iconDelete = document.createElement('i');
        iconDelete.className = 'fa-solid fa-trash-can text-danger';
        btnDelete.appendChild(iconDelete);
        btnDelete.addEventListener('click', async () => {
          const resConfirm = await Swal.fire({
            title: 'حذف الخاصية',
            text: `هل أنت متأكد من حذف خاصية "${spec.name}"؟`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc3545',
            confirmButtonText: 'نعم، حذف',
            cancelButtonText: 'إلغاء',
          });
          if (resConfirm.isConfirmed) {
            try {
              const res = await window.erpFetch(`/api/production/templates/${templateId}/specifications/${spec.id}`, {
                method: 'DELETE',
              });
              const data = await res.json();
              if (res.ok && data.success) {
                currentSpecifications = currentSpecifications.filter((s) => s.id !== spec.id);
                currentSpecifications.forEach((s, idx) => {
                  s.sortOrder = idx + 1;
                });
                renderSpecifications();
                showToast('تم حذف الخاصية بنجاح');
              } else {
                Swal.fire('خطأ', data.message || 'تعذر حذف الخاصية', 'error');
              }
            } catch {
              Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
            }
          }
        });

        actionsDiv.append(btnUp, btnDown, btnEdit, btnDelete);
        innerFlex.appendChild(actionsDiv);
      }

      card.appendChild(innerFlex);
      specsContainer.appendChild(card);
    });
  }

  async function moveSpec(index, offset) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= currentSpecifications.length) return;

    const previousOrder = [...currentSpecifications];
    const item = currentSpecifications.splice(index, 1)[0];
    currentSpecifications.splice(targetIndex, 0, item);

    currentSpecifications.forEach((s, idx) => {
      s.sortOrder = idx + 1;
    });
    renderSpecifications();

    const specIds = currentSpecifications.map((s) => s.id);
    try {
      const res = await window.erpFetch(`/api/production/templates/${templateId}/specifications/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specIds }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        currentSpecifications = previousOrder;
        renderSpecifications();
        Swal.fire('خطأ', data.message || 'تعذر إعادة ترتيب المواصفات', 'error');
      }
    } catch {
      currentSpecifications = previousOrder;
      renderSpecifications();
      Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
    }
  }

  // ========================================================
  // 4. WORKFLOW & STAGES (Consecutive Grouping & Rendering)
  // ========================================================

  const workflowContainer = document.getElementById('workflowGroupsContainer');
  const emptyStagesNotice = document.getElementById('emptyStagesNotice');
  const headerStageCount = document.getElementById('headerStageCount');
  const btnOpenAddStageModal = document.getElementById('btnOpenAddStageModal');

  const addStageModalEl = document.getElementById('addStageModal');
  const addStageModal = addStageModalEl ? new bootstrap.Modal(addStageModalEl) : null;
  const addStageForm = document.getElementById('addStageForm');

  if (btnOpenAddStageModal) {
    btnOpenAddStageModal.addEventListener('click', () => {
      if (addStageForm) {
        addStageForm.reset();
        addStageForm.classList.remove('was-validated');
      }
      if (addStageModal) addStageModal.show();
    });
  }

  if (addStageForm) {
    addStageForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!addStageForm.checkValidity()) {
        addStageForm.classList.add('was-validated');
        return;
      }

      const name = document.getElementById('newStageName').value.trim();
      const departmentId = document.getElementById('newStageDepartmentId').value;
      const durationVal = document.getElementById('newStageDuration').value.trim();
      const costVal = document.getElementById('newStageCost').value.trim();
      const description = document.getElementById('newStageDescription').value.trim() || undefined;

      const payload = {
        name,
        departmentId,
        estimatedDurationMinutes: durationVal ? parseInt(durationVal, 10) : undefined,
        estimatedCost: costVal ? costVal : undefined,
        description,
      };

      try {
        const res = await window.erpFetch(`/api/production/templates/${templateId}/stages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          const newStage = data.data;
          const dept = departmentsMap.get(newStage.departmentId);
          newStage.departmentName = dept ? dept.name : 'قسم غير محدد';
          newStage.departmentCode = dept ? dept.code : 'N/A';
          newStage.plannedMaterialsCount = 0;
          newStage.attachmentsCount = 0;

          currentStages.push(newStage);
          currentStages.sort((a, b) => a.sortOrder - b.sortOrder);
          renderWorkflow();
          if (addStageModal) addStageModal.hide();
          showToast('تمت إضافة المرحلة بنجاح');
        } else {
          Swal.fire('خطأ', data.message || 'تعذر إضافة المرحلة', 'error');
        }
      } catch {
        Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
      }
    });
  }

  function deriveConsecutiveGroups(stages) {
    if (!stages || stages.length === 0) return [];
    const groups = [];
    let currentGroup = null;

    stages.forEach((stage) => {
      const dept = departmentsMap.get(stage.departmentId) || {
        id: stage.departmentId,
        name: stage.departmentName || 'قسم غير محدد',
        code: stage.departmentCode || 'N/A',
      };

      if (!currentGroup || currentGroup.departmentId !== stage.departmentId) {
        currentGroup = {
          departmentId: stage.departmentId,
          departmentName: dept.name,
          departmentCode: dept.code,
          stages: [stage],
        };
        groups.push(currentGroup);
      } else {
        currentGroup.stages.push(stage);
      }
    });

    return groups;
  }

  function renderWorkflow() {
    if (!workflowContainer) return;
    workflowContainer.replaceChildren();

    if (headerStageCount) headerStageCount.textContent = currentStages.length;
    const navStageBadge = document.getElementById('navStageCountBadge');
    if (navStageBadge) navStageBadge.textContent = currentStages.length;
    if (emptyStagesNotice) {
      if (currentStages.length === 0) {
        emptyStagesNotice.classList.remove('d-none');
      } else {
        emptyStagesNotice.classList.add('d-none');
      }
    }

    const groups = deriveConsecutiveGroups(currentStages);

    groups.forEach((group, groupIndex) => {
      const groupCard = document.createElement('div');
      groupCard.className = 'department-workflow-group';

      // Header
      const groupHeader = document.createElement('div');
      groupHeader.className = 'department-workflow-header';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'department-workflow-title';
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-industry text-primary';
      const nameText = document.createTextNode(` ${group.departmentName} `);
      const codeBadge = document.createElement('span');
      codeBadge.className = 'badge bg-white text-secondary border font-monospace small';
      codeBadge.textContent = group.departmentCode;
      titleDiv.append(icon, nameText, codeBadge);

      const countBadge = document.createElement('span');
      countBadge.className = 'badge bg-light text-dark border small';
      countBadge.textContent = `${group.stages.length} مراحل`;

      groupHeader.append(titleDiv, countBadge);
      groupCard.appendChild(groupHeader);

      // Body (Stages container)
      const groupBody = document.createElement('div');
      groupBody.className = 'department-workflow-body';

      group.stages.forEach((stage) => {
        const stageCard = createStageCardElement(stage);
        groupBody.appendChild(stageCard);
      });

      groupCard.appendChild(groupBody);
      workflowContainer.appendChild(groupCard);
    });
  }

  function createStageCardElement(stage) {
    const card = document.createElement('div');
    card.className = 'stage-card';
    card.dataset.stageId = stage.id;
    card.dataset.sortOrder = stage.sortOrder;

    // Drag events
    if (canUpdate) {
      card.draggable = true;
      card.addEventListener('dragstart', (e) => {
        draggedStageId = stage.id;
        card.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', stage.id);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        document.querySelectorAll('.stage-card').forEach((el) => el.classList.remove('drag-over'));
      });

      card.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        card.classList.add('drag-over');
      });

      card.addEventListener('dragleave', () => {
        card.classList.remove('drag-over');
      });

      card.addEventListener('drop', async (e) => {
        e.preventDefault();
        card.classList.remove('drag-over');
        if (!draggedStageId || draggedStageId === stage.id) return;
        await handleStageDrop(draggedStageId, stage.id);
      });
    }

    // Drag Handle
    if (canUpdate) {
      const dragHandle = document.createElement('span');
      dragHandle.className = 'stage-drag-handle';
      dragHandle.title = 'اسحب لإعادة الترتيب';
      const handleIcon = document.createElement('i');
      handleIcon.className = 'fa-solid fa-grip-vertical';
      dragHandle.appendChild(handleIcon);
      card.appendChild(dragHandle);
    }

    // Order Badge
    const orderBadge = document.createElement('span');
    orderBadge.className = 'stage-order-badge';
    orderBadge.textContent = stage.sortOrder;
    card.appendChild(orderBadge);

    // Stage Info
    const stageInfo = document.createElement('div');
    stageInfo.className = 'stage-info';

    const stageName = document.createElement('div');
    stageName.className = 'stage-name text-dark';
    stageName.textContent = stage.name;
    stageInfo.appendChild(stageName);

    // Meta Details & Badges
    const stageMeta = document.createElement('div');
    stageMeta.className = 'stage-meta';

    if (stage.estimatedDurationMinutes) {
      const durItem = document.createElement('span');
      durItem.className = 'stage-meta-item';
      const durIcon = document.createElement('i');
      durIcon.className = 'fa-solid fa-clock text-secondary';
      durItem.append(durIcon, ` ${stage.estimatedDurationMinutes} دقيقة`);
      stageMeta.appendChild(durItem);
    }

    if (stage.estimatedCost) {
      const costItem = document.createElement('span');
      costItem.className = 'stage-meta-item';
      const costIcon = document.createElement('i');
      costIcon.className = 'fa-solid fa-coins text-secondary';
      costItem.append(costIcon, ` ${parseFloat(stage.estimatedCost).toLocaleString()} ر.س`);
      stageMeta.appendChild(costItem);
    }

    // Materials Badge Button
    const matBtn = document.createElement('button');
    matBtn.type = 'button';
    matBtn.className = 'btn btn-sm btn-outline-primary py-0 px-2 rounded-pill small';
    matBtn.style.fontSize = '0.78rem';
    const matIcon = document.createElement('i');
    matIcon.className = 'fa-solid fa-boxes-stacked me-1';
    const matCountSpan = document.createElement('span');
    matCountSpan.className = 'stage-mat-count-badge';
    matCountSpan.textContent = stage.plannedMaterialsCount || 0;
    matBtn.append(matIcon, matCountSpan, ' مواد');
    matBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openStageDrawer(stage, 'tab-stage-materials');
    });
    stageMeta.appendChild(matBtn);

    // Attachments Badge Button
    const attBtn = document.createElement('button');
    attBtn.type = 'button';
    attBtn.className = 'btn btn-sm btn-outline-info py-0 px-2 rounded-pill small';
    attBtn.style.fontSize = '0.78rem';
    const attIcon = document.createElement('i');
    attIcon.className = 'fa-solid fa-paperclip me-1';
    const attCountSpan = document.createElement('span');
    attCountSpan.className = 'stage-att-count-badge';
    attCountSpan.textContent = stage.attachmentsCount || 0;
    attBtn.append(attIcon, attCountSpan, ' وثائق');
    attBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openStageDrawer(stage, 'tab-stage-attachments');
    });
    stageMeta.appendChild(attBtn);

    stageInfo.appendChild(stageMeta);
    card.appendChild(stageInfo);

    // Actions
    const stageActions = document.createElement('div');
    stageActions.className = 'stage-actions';

    // Open in Drawer Button
    const btnOpenDrawer = document.createElement('button');
    btnOpenDrawer.type = 'button';
    btnOpenDrawer.className = 'btn btn-sm btn-primary d-inline-flex align-items-center gap-1';
    btnOpenDrawer.style.borderRadius = '6px';
    const iconDrawer = document.createElement('i');
    iconDrawer.className = 'fa-solid fa-arrow-left-long';
    btnOpenDrawer.append(iconDrawer, ' فتح');
    btnOpenDrawer.addEventListener('click', () => openStageDrawer(stage, 'tab-stage-info'));
    stageActions.appendChild(btnOpenDrawer);

    if (canUpdate) {
      // Move Up
      const globalIdx = currentStages.findIndex((s) => s.id === stage.id);
      const btnUp = document.createElement('button');
      btnUp.type = 'button';
      btnUp.className = 'btn btn-sm btn-light p-1';
      btnUp.title = 'تحريك لأعلى';
      btnUp.disabled = globalIdx === 0;
      const iconUp = document.createElement('i');
      iconUp.className = 'fa-solid fa-arrow-up text-secondary';
      btnUp.appendChild(iconUp);
      btnUp.addEventListener('click', () => moveStage(globalIdx, -1));
      stageActions.appendChild(btnUp);

      // Move Down
      const btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.className = 'btn btn-sm btn-light p-1';
      btnDown.title = 'تحريك لأسفل';
      btnDown.disabled = globalIdx === currentStages.length - 1;
      const iconDown = document.createElement('i');
      iconDown.className = 'fa-solid fa-arrow-down text-secondary';
      btnDown.appendChild(iconDown);
      btnDown.addEventListener('click', () => moveStage(globalIdx, 1));
      stageActions.appendChild(btnDown);

      // Archive / Delete Stage
      const btnDelete = document.createElement('button');
      btnDelete.type = 'button';
      btnDelete.className = 'btn btn-sm btn-light p-1';
      btnDelete.title = 'أرشفة المرحلة';
      const iconDelete = document.createElement('i');
      iconDelete.className = 'fa-solid fa-trash-can text-danger';
      btnDelete.appendChild(iconDelete);
      btnDelete.addEventListener('click', () => archiveStage(stage));
      stageActions.appendChild(btnDelete);
    }

    card.appendChild(stageActions);
    return card;
  }

  async function handleStageDrop(sourceId, targetId) {
    const sourceIndex = currentStages.findIndex((s) => s.id === sourceId);
    const targetIndex = currentStages.findIndex((s) => s.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) return;

    const previousOrder = [...currentStages];
    const movedItem = currentStages.splice(sourceIndex, 1)[0];
    currentStages.splice(targetIndex, 0, movedItem);

    currentStages.forEach((s, idx) => {
      s.sortOrder = idx + 1;
    });
    renderWorkflow();

    const stageIds = currentStages.map((s) => s.id);
    try {
      const res = await window.erpFetch(`/api/production/templates/${templateId}/stages/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageIds }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        currentStages = previousOrder;
        renderWorkflow();
        Swal.fire('خطأ', data.message || 'تعذر إعادة ترتيب المراحل', 'error');
      }
    } catch {
      currentStages = previousOrder;
      renderWorkflow();
      Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
    }
  }

  async function moveStage(index, offset) {
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= currentStages.length) return;

    const previousOrder = [...currentStages];
    const movedItem = currentStages.splice(index, 1)[0];
    currentStages.splice(targetIndex, 0, movedItem);

    currentStages.forEach((s, idx) => {
      s.sortOrder = idx + 1;
    });
    renderWorkflow();

    const stageIds = currentStages.map((s) => s.id);
    try {
      const res = await window.erpFetch(`/api/production/templates/${templateId}/stages/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageIds }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        currentStages = previousOrder;
        renderWorkflow();
        Swal.fire('خطأ', data.message || 'تعذر إعادة ترتيب المراحل', 'error');
      }
    } catch {
      currentStages = previousOrder;
      renderWorkflow();
      Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
    }
  }

  async function archiveStage(stage) {
    const resConfirm = await Swal.fire({
      title: 'أرشفة المرحلة',
      text: `هل أنت متأكد من أرشفة مرحلة "${stage.name}"؟`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc3545',
      confirmButtonText: 'نعم، أرشفة',
      cancelButtonText: 'إلغاء',
    });

    if (resConfirm.isConfirmed) {
      try {
        const res = await window.erpFetch(`/api/production/templates/${templateId}/stages/${stage.id}`, {
          method: 'DELETE',
        });
        const data = await res.json();
        if (res.ok && data.success) {
          currentStages = currentStages.filter((s) => s.id !== stage.id);
          currentStages.forEach((s, idx) => {
            s.sortOrder = idx + 1;
          });
          renderWorkflow();
          if (activeDrawerStage && activeDrawerStage.id === stage.id && stageDrawer) {
            stageDrawer.hide();
          }
          showToast('تمت أرشفة المرحلة بنجاح');
        } else {
          Swal.fire('خطأ', data.message || 'تعذر أرشفة المرحلة', 'error');
        }
      } catch {
        Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
      }
    }
  }

  // ========================================================
  // 5. UNIFIED STAGE WORKSPACE MODAL
  // ========================================================

  const stageModalEl = document.getElementById('stageModal') || document.getElementById('stageDrawer');
  const stageModal = stageModalEl ? new bootstrap.Modal(stageModalEl) : null;
  const stageDrawer = stageModal; // backward compatible alias for all operations

  const stageDrawerTitle = document.getElementById('stageDrawerTitle');
  const stageDrawerOrderBadge = document.getElementById('stageDrawerOrderBadge');
  const stageDrawerDeptBadge = document.getElementById('stageDrawerDeptBadge');
  const drawerTabMaterialsBadge = document.getElementById('drawerTabMaterialsBadge');
  const drawerTabAttachmentsBadge = document.getElementById('drawerTabAttachmentsBadge');

  // Form Elements inside Drawer Tab 1
  const drawerStageInfoForm = document.getElementById('drawerStageInfoForm');
  const drawerStageName = document.getElementById('drawerStageName');
  const drawerStageDepartmentId = document.getElementById('drawerStageDepartmentId');
  const drawerStageDuration = document.getElementById('drawerStageDuration');
  const drawerStageCost = document.getElementById('drawerStageCost');
  const drawerStageDescription = document.getElementById('drawerStageDescription');
  const btnDrawerArchiveStage = document.getElementById('btnDrawerArchiveStage');

  function openStageDrawer(stage, activeTabId = 'tab-stage-info') {
    activeDrawerStage = stage;

    // Header info
    if (stageDrawerTitle) stageDrawerTitle.textContent = stage.name;
    if (stageDrawerOrderBadge) stageDrawerOrderBadge.textContent = `#${stage.sortOrder}`;
    const dept = departmentsMap.get(stage.departmentId);
    if (stageDrawerDeptBadge) stageDrawerDeptBadge.textContent = dept ? dept.name : stage.departmentName || 'القسم';

    // Tab badges
    if (drawerTabMaterialsBadge) drawerTabMaterialsBadge.textContent = stage.plannedMaterialsCount || 0;
    if (drawerTabAttachmentsBadge) drawerTabAttachmentsBadge.textContent = stage.attachmentsCount || 0;

    // Fill Tab 1 Form
    if (drawerStageName) drawerStageName.value = stage.name;
    if (drawerStageDepartmentId) drawerStageDepartmentId.value = stage.departmentId;
    if (drawerStageDuration) drawerStageDuration.value = stage.estimatedDurationMinutes ?? '';
    if (drawerStageCost) drawerStageCost.value = stage.estimatedCost ?? '';
    if (drawerStageDescription) drawerStageDescription.value = stage.description || '';

    // Activate Requested Tab
    const tabTriggerEl = document.getElementById(activeTabId);
    if (tabTriggerEl) {
      const tab = new bootstrap.Tab(tabTriggerEl);
      tab.show();
    }

    // Load materials and attachments for this stage
    loadDrawerStageMaterials(stage.id);
    loadDrawerStageAttachments(stage.id);

    if (stageDrawer) stageDrawer.show();
  }

  // Save Tab 1: Stage Info
  if (drawerStageInfoForm) {
    drawerStageInfoForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!activeDrawerStage) return;

      if (!drawerStageInfoForm.checkValidity()) {
        drawerStageInfoForm.classList.add('was-validated');
        return;
      }

      const name = drawerStageName.value.trim();
      const departmentId = drawerStageDepartmentId.value;
      const durationVal = drawerStageDuration.value.trim();
      const costVal = drawerStageCost.value.trim();
      const description = drawerStageDescription.value.trim() || undefined;

      const payload = {
        name,
        departmentId,
        estimatedDurationMinutes: durationVal ? parseInt(durationVal, 10) : undefined,
        estimatedCost: costVal ? costVal : undefined,
        description,
      };

      try {
        const res = await window.erpFetch(`/api/production/templates/${templateId}/stages/${activeDrawerStage.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          activeDrawerStage.name = name;
          activeDrawerStage.departmentId = departmentId;
          const dept = departmentsMap.get(departmentId);
          activeDrawerStage.departmentName = dept ? dept.name : 'قسم غير محدد';
          activeDrawerStage.departmentCode = dept ? dept.code : 'N/A';
          activeDrawerStage.estimatedDurationMinutes = durationVal ? parseInt(durationVal, 10) : null;
          activeDrawerStage.estimatedCost = costVal ? costVal : null;
          activeDrawerStage.description = description || null;

          if (stageDrawerTitle) stageDrawerTitle.textContent = name;
          if (stageDrawerDeptBadge) stageDrawerDeptBadge.textContent = activeDrawerStage.departmentName;

          renderWorkflow();
          showToast('تم حفظ تعديلات المرحلة بنجاح');
        } else {
          Swal.fire('خطأ', data.message || 'تعذر تعديل المرحلة', 'error');
        }
      } catch {
        Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
      }
    });
  }

  if (btnDrawerArchiveStage) {
    btnDrawerArchiveStage.addEventListener('click', () => {
      if (activeDrawerStage) archiveStage(activeDrawerStage);
    });
  }

  // ========================================================
  // 6. DRAWER TAB 2: PLANNED MATERIALS & SEARCH PICKER
  // ========================================================

  const drawerMaterialsTableBody = document.getElementById('drawerStageMaterialsTableBody');
  const catalogSearchInput = document.getElementById('catalogProductSearchInput');
  const catalogResultsBox = document.getElementById('catalogSearchResultsBox');
  const catalogResultsList = document.getElementById('catalogSearchResultsList');
  const catalogLoadMoreContainer = document.getElementById('catalogLoadMoreContainer');
  const btnCatalogLoadMore = document.getElementById('btnCatalogLoadMore');

  const selectedProductContainer = document.getElementById('selectedProductContainer');
  const selectedProductCode = document.getElementById('selectedProductCode');
  const selectedProductName = document.getElementById('selectedProductName');
  const btnDeselectProduct = document.getElementById('btnDeselectProduct');

  const drawerMaterialUnitSelect = document.getElementById('drawerMaterialUnitSelect');
  const drawerMaterialQuantityInput = document.getElementById('drawerMaterialQuantityInput');
  const btnSubmitDrawerMaterial = document.getElementById('btnSubmitDrawerMaterial');
  const drawerAddMaterialForm = document.getElementById('drawerAddMaterialForm');

  async function loadDrawerStageMaterials(stageId) {
    if (!drawerMaterialsTableBody) return;
    drawerMaterialsTableBody.replaceChildren();

    try {
      const res = await window.erpFetch(`/api/production/templates/${templateId}/stages/${stageId}/materials`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          if (activeDrawerStage) {
            activeDrawerStage.plannedMaterials = data.data;
            activeDrawerStage.plannedMaterialsCount = data.data.length;
            if (drawerTabMaterialsBadge) drawerTabMaterialsBadge.textContent = data.data.length;
            updateStageCardCounts(activeDrawerStage.id);
          }
          renderDrawerMaterialsTable(data.data);
        }
      }
    } catch (err) {
      console.warn('Failed to load stage materials:', err);
    }
  }

  function renderDrawerMaterialsTable(materials) {
    if (!drawerMaterialsTableBody) return;
    drawerMaterialsTableBody.replaceChildren();

    if (!materials || materials.length === 0) {
      const row = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = canUpdate ? 5 : 4;
      td.className = 'text-center py-4 text-muted small';
      td.textContent = 'لا توجد مواد مخططة محددة لهذه المرحلة بعد.';
      row.appendChild(td);
      drawerMaterialsTableBody.appendChild(row);
      return;
    }

    materials.forEach((mat) => {
      const tr = document.createElement('tr');

      // Product Name
      const tdName = document.createElement('td');
      tdName.className = 'fw-bold text-dark';
      tdName.textContent = mat.product ? mat.product.name : 'مادة';
      tr.appendChild(tdName);

      // Product Code
      const tdCode = document.createElement('td');
      const spanCode = document.createElement('span');
      spanCode.className = 'badge bg-light text-dark border font-monospace';
      spanCode.textContent = mat.product ? mat.product.code : '—';
      tdCode.appendChild(spanCode);
      tr.appendChild(tdCode);

      // Unit
      const tdUnit = document.createElement('td');
      tdUnit.textContent = mat.productUnit ? mat.productUnit.name : '—';
      tr.appendChild(tdUnit);

      // Quantity
      const tdQty = document.createElement('td');
      tdQty.className = 'text-center fw-bold text-primary';
      tdQty.textContent = parseFloat(mat.plannedQuantity).toLocaleString();
      tr.appendChild(tdQty);

      // Delete action
      if (canUpdate) {
        const tdActions = document.createElement('td');
        tdActions.className = 'text-center';
        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'btn btn-sm btn-light p-1 text-danger';
        btnDel.title = 'حذف المادة';
        const iconDel = document.createElement('i');
        iconDel.className = 'fa-solid fa-trash-can';
        btnDel.appendChild(iconDel);
        btnDel.addEventListener('click', async () => {
          const resConfirm = await Swal.fire({
            title: 'حذف المادة المخططة',
            text: `هل تريد إزالة مادة "${mat.product ? mat.product.name : ''}" من هذه المرحلة؟`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc3545',
            confirmButtonText: 'نعم، حذف',
            cancelButtonText: 'إلغاء',
          });
          if (resConfirm.isConfirmed) {
            try {
              const res = await window.erpFetch(
                `/api/production/templates/${templateId}/stages/${activeDrawerStage.id}/materials/${mat.id}`,
                { method: 'DELETE' }
              );
              const data = await res.json();
              if (res.ok && data.success) {
                if (activeDrawerStage && Array.isArray(activeDrawerStage.plannedMaterials)) {
                  activeDrawerStage.plannedMaterials = activeDrawerStage.plannedMaterials.filter((m) => m.id !== mat.id);
                  activeDrawerStage.plannedMaterialsCount = activeDrawerStage.plannedMaterials.length;
                  if (drawerTabMaterialsBadge) drawerTabMaterialsBadge.textContent = activeDrawerStage.plannedMaterialsCount;
                  updateStageCardCounts(activeDrawerStage.id);
                  renderDrawerMaterialsTable(activeDrawerStage.plannedMaterials);
                }
                showToast('تم حذف المادة المخططة بنجاح');
              } else {
                Swal.fire('خطأ', data.message || 'تعذر حذف المادة', 'error');
              }
            } catch {
              Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
            }
          }
        });
        tdActions.appendChild(btnDel);
        tr.appendChild(tdActions);
      }

      drawerMaterialsTableBody.appendChild(tr);
    });
  }

  // Catalog Search Debounce & Pagination
  if (catalogSearchInput) {
    catalogSearchInput.addEventListener('input', () => {
      clearTimeout(catalogSearchDebounceTimer);
      catalogSearchDebounceTimer = setTimeout(() => {
        catalogSearchQuery = catalogSearchInput.value.trim();
        catalogCurrentPage = 1;
        fetchCatalogProducts(true);
      }, 300);
    });

    catalogSearchInput.addEventListener('focus', () => {
      if (catalogResultsList && catalogResultsList.children.length > 0) {
        catalogResultsBox.classList.remove('d-none');
      } else {
        fetchCatalogProducts(true);
      }
    });
  }

  if (btnCatalogLoadMore) {
    btnCatalogLoadMore.addEventListener('click', () => {
      if (catalogCurrentPage < catalogTotalPages) {
        catalogCurrentPage++;
        fetchCatalogProducts(false);
      }
    });
  }

  async function fetchCatalogProducts(reset) {
    if (!catalogResultsBox || !catalogResultsList) return;

    if (reset) {
      catalogResultsList.replaceChildren();
      const loading = document.createElement('div');
      loading.className = 'p-3 text-center text-muted small';
      loading.textContent = 'جاري البحث في الكتالوج...';
      catalogResultsList.appendChild(loading);
      catalogResultsBox.classList.remove('d-none');
    }

    try {
      const q = encodeURIComponent(catalogSearchQuery);
      const res = await window.erpFetch(`/api/inventory/products/reference-options?search=${q}&page=${catalogCurrentPage}&limit=20`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) {
          catalogTotalPages = data.data.totalPages || 1;
          const items = data.data.items || [];

          if (reset) catalogResultsList.replaceChildren();

          if (items.length === 0 && reset) {
            const emptyEl = document.createElement('div');
            emptyEl.className = 'p-3 text-center text-muted small';
            emptyEl.textContent = 'لا توجد منتجات مطابقة لنتيجة البحث.';
            catalogResultsList.appendChild(emptyEl);
          } else {
            items.forEach((prod) => {
              const itemDiv = document.createElement('div');
              itemDiv.className = 'catalog-search-item';

              const infoSpan = document.createElement('div');
              const nameSpan = document.createElement('strong');
              nameSpan.className = 'text-dark small d-block';
              nameSpan.textContent = prod.name;
              const codeSpan = document.createElement('span');
              codeSpan.className = 'badge bg-light text-secondary font-monospace border small';
              codeSpan.textContent = prod.code;
              infoSpan.append(nameSpan, codeSpan);

              const btnPick = document.createElement('button');
              btnPick.type = 'button';
              btnPick.className = 'btn btn-xs btn-outline-primary py-0 px-2 small';
              btnPick.textContent = 'اختيار';

              itemDiv.append(infoSpan, btnPick);
              itemDiv.addEventListener('click', () => selectCatalogProduct(prod));
              catalogResultsList.appendChild(itemDiv);
            });
          }

          if (catalogLoadMoreContainer) {
            if (catalogCurrentPage < catalogTotalPages) {
              catalogLoadMoreContainer.classList.remove('d-none');
            } else {
              catalogLoadMoreContainer.classList.add('d-none');
            }
          }
          catalogResultsBox.classList.remove('d-none');
        }
      }
    } catch {
      if (reset) {
        catalogResultsList.replaceChildren();
        const errDiv = document.createElement('div');
        errDiv.className = 'p-3 text-center text-danger small';
        errDiv.textContent = 'حدث خطأ أثناء تحميل الكتالوج.';
        catalogResultsList.appendChild(errDiv);
      }
    }
  }

  async function selectCatalogProduct(product) {
    selectedCatalogProduct = product;
    if (catalogResultsBox) catalogResultsBox.classList.add('d-none');
    if (catalogSearchInput) catalogSearchInput.value = '';

    if (selectedProductContainer) {
      selectedProductContainer.classList.remove('d-none');
      if (selectedProductCode) selectedProductCode.textContent = product.code;
      if (selectedProductName) selectedProductName.textContent = product.name;
    }

    document.getElementById('selectedProductId').value = product.id;

    // Load units on demand
    if (drawerMaterialUnitSelect) {
      drawerMaterialUnitSelect.replaceChildren();
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = 'جاري تحميل الوحدات...';
      drawerMaterialUnitSelect.appendChild(defaultOpt);
      drawerMaterialUnitSelect.disabled = true;

      let units = productUnitsCache.get(product.id);
      if (!units) {
        try {
          const res = await window.erpFetch(`/api/inventory/products/${product.id}/units/reference-options`);
          if (res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.data)) {
              units = data.data;
              productUnitsCache.set(product.id, units);
            }
          }
        } catch {
          units = [];
        }
      }

      drawerMaterialUnitSelect.replaceChildren();
      const optSelect = document.createElement('option');
      optSelect.value = '';
      optSelect.textContent = '-- اختر وحدة القياس --';
      drawerMaterialUnitSelect.appendChild(optSelect);

      if (units && units.length > 0) {
        units.forEach((u) => {
          const opt = document.createElement('option');
          opt.value = u.id;
          opt.textContent = `${u.name}${u.isBase ? ' (الوحدة الأساسية)' : ''}`;
          drawerMaterialUnitSelect.appendChild(opt);
        });
        drawerMaterialUnitSelect.disabled = false;
        if (drawerMaterialQuantityInput) drawerMaterialQuantityInput.disabled = false;
        if (btnSubmitDrawerMaterial) btnSubmitDrawerMaterial.disabled = false;
      } else {
        const noUnitsOpt = document.createElement('option');
        noUnitsOpt.value = '';
        noUnitsOpt.textContent = 'لا توجد وحدات معرفة لهذا المنتج';
        drawerMaterialUnitSelect.appendChild(noUnitsOpt);
      }
    }
  }

  function deselectCatalogProduct() {
    selectedCatalogProduct = null;
    document.getElementById('selectedProductId').value = '';
    if (selectedProductContainer) selectedProductContainer.classList.add('d-none');
    if (drawerMaterialUnitSelect) {
      drawerMaterialUnitSelect.replaceChildren();
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = '-- اختر الوحدة --';
      drawerMaterialUnitSelect.appendChild(defaultOpt);
      drawerMaterialUnitSelect.disabled = true;
    }
    if (drawerMaterialQuantityInput) {
      drawerMaterialQuantityInput.value = '';
      drawerMaterialQuantityInput.disabled = true;
    }
    if (btnSubmitDrawerMaterial) btnSubmitDrawerMaterial.disabled = true;
  }

  if (btnDeselectProduct) btnDeselectProduct.addEventListener('click', deselectCatalogProduct);

  // Submit Drawer Add Material
  if (drawerAddMaterialForm) {
    drawerAddMaterialForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!activeDrawerStage || !selectedCatalogProduct) return;

      if (!drawerAddMaterialForm.checkValidity()) {
        drawerAddMaterialForm.classList.add('was-validated');
        return;
      }

      const productId = selectedCatalogProduct.id;
      const productUnitId = drawerMaterialUnitSelect.value;
      const plannedQuantity = drawerMaterialQuantityInput.value.trim();

      try {
        const res = await window.erpFetch(`/api/production/templates/${templateId}/stages/${activeDrawerStage.id}/materials`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ productId, productUnitId, plannedQuantity }),
        });
        const data = await res.json();
        if (res.ok && data.success) {
          if (!activeDrawerStage.plannedMaterials) activeDrawerStage.plannedMaterials = [];
          activeDrawerStage.plannedMaterials.push(data.data);
          activeDrawerStage.plannedMaterialsCount = activeDrawerStage.plannedMaterials.length;
          if (drawerTabMaterialsBadge) drawerTabMaterialsBadge.textContent = activeDrawerStage.plannedMaterialsCount;
          updateStageCardCounts(activeDrawerStage.id);

          renderDrawerMaterialsTable(activeDrawerStage.plannedMaterials);
          deselectCatalogProduct();
          showToast('تمت إضافة المادة المخططة للمرحلة بنجاح');
        } else {
          Swal.fire('خطأ', data.message || 'تعذر إضافة المادة', 'error');
        }
      } catch {
        Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
      }
    });
  }

  // ========================================================
  // 7. DRAWER TAB 3: REFERENCE DOCUMENTS MANAGEMENT
  // ========================================================

  const drawerAttachmentsList = document.getElementById('drawerStageAttachmentsList');
  const drawerUploadAttachmentForm = document.getElementById('drawerUploadAttachmentForm');
  const attachmentFileInput = document.getElementById('attachmentFileInput');
  const attachmentDescriptionInput = document.getElementById('attachmentDescriptionInput');
  const btnUploadAttachment = document.getElementById('btnUploadAttachment');
  const uploadSpinner = document.getElementById('uploadSpinner');

  async function loadDrawerStageAttachments(stageId) {
    if (!drawerAttachmentsList) return;
    drawerAttachmentsList.replaceChildren();

    try {
      const res = await window.erpFetch(`/api/production/templates/${templateId}/stages/${stageId}/attachments`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) {
          if (activeDrawerStage) {
            activeDrawerStage.attachments = data.data;
            activeDrawerStage.attachmentsCount = data.data.length;
            if (drawerTabAttachmentsBadge) drawerTabAttachmentsBadge.textContent = data.data.length;
            updateStageCardCounts(activeDrawerStage.id);
          }
          renderDrawerAttachmentsList(data.data);
        }
      }
    } catch (err) {
      console.warn('Failed to load stage attachments:', err);
    }
  }

  function renderDrawerAttachmentsList(attachments) {
    if (!drawerAttachmentsList) return;
    drawerAttachmentsList.replaceChildren();

    if (!attachments || attachments.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'text-center py-4 text-muted border border-dashed rounded-3 bg-light bg-opacity-50';
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-paperclip fs-2 mb-2 text-secondary opacity-50';
      const p1 = document.createElement('p');
      p1.className = 'mb-1 fw-bold';
      p1.textContent = 'لا توجد وثائق مرجعية لهذه المرحلة بعد.';
      const p2 = document.createElement('p');
      p2.className = 'small text-muted mb-0';
      p2.textContent = 'يمكن إرفاق مخطط أو PDF أو صورة توضيحية تساعد على تنفيذ المرحلة.';
      emptyDiv.append(icon, p1, p2);
      drawerAttachmentsList.appendChild(emptyDiv);
      return;
    }

    attachments.forEach((att, index) => {
      const card = document.createElement('div');
      card.className = 'attachment-item-card d-flex justify-content-between align-items-center gap-2';

      // Left info
      const infoDiv = document.createElement('div');
      infoDiv.className = 'd-flex align-items-center gap-3 overflow-hidden';

      // Icon based on mime
      const iconDiv = document.createElement('div');
      iconDiv.className = 'fs-3';
      if (att.mimeType === 'application/pdf') {
        const pdfIcon = document.createElement('i');
        pdfIcon.className = 'fa-solid fa-file-pdf text-danger';
        iconDiv.appendChild(pdfIcon);
      } else {
        const imgIcon = document.createElement('i');
        imgIcon.className = 'fa-solid fa-file-image text-primary';
        iconDiv.appendChild(imgIcon);
      }
      infoDiv.appendChild(iconDiv);

      const textDiv = document.createElement('div');
      textDiv.className = 'text-truncate';

      const nameA = document.createElement('a');
      nameA.href = `/api/production/templates/${templateId}/stages/${activeDrawerStage.id}/attachments/${att.id}/file`;
      nameA.target = '_blank';
      nameA.className = 'fw-bold text-dark text-decoration-none d-block text-truncate';
      nameA.textContent = att.originalFileName;
      textDiv.appendChild(nameA);

      const metaSpan = document.createElement('span');
      metaSpan.className = 'text-muted small';
      const sizeKb = (att.sizeBytes / 1024).toFixed(1);
      const sizeStr = att.sizeBytes > 1048576 ? `${(att.sizeBytes / 1048576).toFixed(2)} MB` : `${sizeKb} KB`;
      metaSpan.textContent = `${sizeStr} • #${att.sortOrder}`;

      if (att.description) {
        const descSpan = document.createElement('span');
        descSpan.className = 'ms-2 text-secondary fst-italic';
        descSpan.textContent = `— ${att.description}`;
        metaSpan.appendChild(descSpan);
      }
      textDiv.appendChild(metaSpan);
      infoDiv.appendChild(textDiv);
      card.appendChild(infoDiv);

      // Actions
      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'd-flex align-items-center gap-1 flex-shrink-0';

      // Download button
      const btnDownload = document.createElement('a');
      btnDownload.href = `/api/production/templates/${templateId}/stages/${activeDrawerStage.id}/attachments/${att.id}/file`;
      btnDownload.target = '_blank';
      btnDownload.className = 'btn btn-sm btn-light p-1';
      btnDownload.title = 'فتح / تحميل الملف';
      const iconDown = document.createElement('i');
      iconDown.className = 'fa-solid fa-arrow-up-right-from-square text-primary';
      btnDownload.appendChild(iconDown);
      actionsDiv.appendChild(btnDownload);

      if (canUpdate) {
        // Move Up
        const btnUp = document.createElement('button');
        btnUp.type = 'button';
        btnUp.className = 'btn btn-sm btn-light p-1';
        btnUp.title = 'تحريك لأعلى';
        btnUp.disabled = index === 0;
        const iconUp = document.createElement('i');
        iconUp.className = 'fa-solid fa-arrow-up text-secondary';
        btnUp.appendChild(iconUp);
        btnUp.addEventListener('click', () => moveAttachment(index, -1));
        actionsDiv.appendChild(btnUp);

        // Move Down
        const btnDown = document.createElement('button');
        btnDown.type = 'button';
        btnDown.className = 'btn btn-sm btn-light p-1';
        btnDown.title = 'تحريك لأسفل';
        btnDown.disabled = index === attachments.length - 1;
        const iconD = document.createElement('i');
        iconD.className = 'fa-solid fa-arrow-down text-secondary';
        btnDown.appendChild(iconD);
        btnDown.addEventListener('click', () => moveAttachment(index, 1));
        actionsDiv.appendChild(btnDown);

        // Delete
        const btnDel = document.createElement('button');
        btnDel.type = 'button';
        btnDel.className = 'btn btn-sm btn-light p-1 text-danger';
        btnDel.title = 'حذف الوثيقة';
        const iconDel = document.createElement('i');
        iconDel.className = 'fa-solid fa-trash-can';
        btnDel.appendChild(iconDel);
        btnDel.addEventListener('click', async () => {
          const resConfirm = await Swal.fire({
            title: 'حذف الوثيقة المرجعية',
            text: `هل تريد أرشفة وثيقة "${att.originalFileName}"؟`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#dc3545',
            confirmButtonText: 'نعم، حذف',
            cancelButtonText: 'إلغاء',
          });
          if (resConfirm.isConfirmed) {
            try {
              const res = await window.erpFetch(
                `/api/production/templates/${templateId}/stages/${activeDrawerStage.id}/attachments/${att.id}`,
                { method: 'DELETE' }
              );
              const data = await res.json();
              if (res.ok && data.success) {
                if (activeDrawerStage && Array.isArray(activeDrawerStage.attachments)) {
                  activeDrawerStage.attachments = activeDrawerStage.attachments.filter((a) => a.id !== att.id);
                  activeDrawerStage.attachments.forEach((a, idx) => {
                    a.sortOrder = idx + 1;
                  });
                  activeDrawerStage.attachmentsCount = activeDrawerStage.attachments.length;
                  if (drawerTabAttachmentsBadge) drawerTabAttachmentsBadge.textContent = activeDrawerStage.attachmentsCount;
                  updateStageCardCounts(activeDrawerStage.id);
                  renderDrawerAttachmentsList(activeDrawerStage.attachments);
                }
                showToast('تم حذف الوثيقة بنجاح');
              } else {
                Swal.fire('خطأ', data.message || 'تعذر حذف الوثيقة', 'error');
              }
            } catch {
              Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
            }
          }
        });
        actionsDiv.appendChild(btnDel);
      }

      card.appendChild(actionsDiv);
      drawerAttachmentsList.appendChild(card);
    });
  }

  async function moveAttachment(index, offset) {
    if (!activeDrawerStage || !Array.isArray(activeDrawerStage.attachments)) return;
    const targetIndex = index + offset;
    if (targetIndex < 0 || targetIndex >= activeDrawerStage.attachments.length) return;

    const previousOrder = [...activeDrawerStage.attachments];
    const movedItem = activeDrawerStage.attachments.splice(index, 1)[0];
    activeDrawerStage.attachments.splice(targetIndex, 0, movedItem);

    activeDrawerStage.attachments.forEach((a, idx) => {
      a.sortOrder = idx + 1;
    });
    renderDrawerAttachmentsList(activeDrawerStage.attachments);

    const attachmentIds = activeDrawerStage.attachments.map((a) => a.id);
    try {
      const res = await window.erpFetch(
        `/api/production/templates/${templateId}/stages/${activeDrawerStage.id}/attachments/reorder`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ attachmentIds }),
        }
      );
      const data = await res.json();
      if (!res.ok || !data.success) {
        activeDrawerStage.attachments = previousOrder;
        renderDrawerAttachmentsList(activeDrawerStage.attachments);
        Swal.fire('خطأ', data.message || 'تعذر إعادة ترتيب الوثائق', 'error');
      }
    } catch {
      activeDrawerStage.attachments = previousOrder;
      renderDrawerAttachmentsList(activeDrawerStage.attachments);
      Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
    }
  }

  // Upload Reference Document
  if (drawerUploadAttachmentForm) {
    drawerUploadAttachmentForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!activeDrawerStage) return;

      if (!drawerUploadAttachmentForm.checkValidity()) {
        drawerUploadAttachmentForm.classList.add('was-validated');
        return;
      }

      const file = attachmentFileInput.files[0];
      if (!file) {
        Swal.fire('تنبيه', 'يرجى اختيار ملف لرفعه', 'warning');
        return;
      }

      if (file.size > 20 * 1024 * 1024) {
        Swal.fire('خطأ', 'حجم الملف يتجاوز 20 ميغابايت المسموح بها', 'error');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);
      const desc = attachmentDescriptionInput.value.trim();
      if (desc) formData.append('description', desc);

      if (btnUploadAttachment) btnUploadAttachment.disabled = true;
      if (uploadSpinner) uploadSpinner.classList.remove('d-none');

      try {
        const res = await window.erpFetch(
          `/api/production/templates/${templateId}/stages/${activeDrawerStage.id}/attachments`,
          {
            method: 'POST',
            body: formData,
          }
        );
        const data = await res.json();
        if (res.ok && data.success) {
          if (!activeDrawerStage.attachments) activeDrawerStage.attachments = [];
          activeDrawerStage.attachments.push(data.data);
          activeDrawerStage.attachmentsCount = activeDrawerStage.attachments.length;
          if (drawerTabAttachmentsBadge) drawerTabAttachmentsBadge.textContent = activeDrawerStage.attachmentsCount;
          updateStageCardCounts(activeDrawerStage.id);

          renderDrawerAttachmentsList(activeDrawerStage.attachments);
          drawerUploadAttachmentForm.reset();
          drawerUploadAttachmentForm.classList.remove('was-validated');
          showToast('تم رفع الوثيقة المرجعية بنجاح');
        } else {
          Swal.fire('خطأ', data.message || 'تعذر رفع الوثيقة', 'error');
        }
      } catch {
        Swal.fire('خطأ', 'تعذر الاتصال بالخادم أثناء رفع الملف', 'error');
      } finally {
        if (btnUploadAttachment) btnUploadAttachment.disabled = false;
        if (uploadSpinner) uploadSpinner.classList.add('d-none');
      }
    });
  }

  // Update counts on Stage Card in real-time
  function updateStageCardCounts(stageId) {
    const stageCard = document.querySelector(`.stage-card[data-stage-id="${stageId}"]`);
    if (!stageCard) return;

    const stage = currentStages.find((s) => s.id === stageId);
    if (!stage) return;

    const matBadge = stageCard.querySelector('.stage-mat-count-badge');
    if (matBadge) matBadge.textContent = stage.plannedMaterialsCount || 0;

    const attBadge = stageCard.querySelector('.stage-att-count-badge');
    if (attBadge) attBadge.textContent = stage.attachmentsCount || 0;
  }

  // ========================================================
  // 8. WORKSPACE TABS & URL HASH SYNCHRONIZATION
  // ========================================================
  const workspaceTabs = document.getElementById('templateWorkspaceTabs');
  if (workspaceTabs) {
    // Sync tab switch with URL hash
    const tabTriggers = workspaceTabs.querySelectorAll('button[data-bs-toggle="pill"]');
    tabTriggers.forEach((trigger) => {
      trigger.addEventListener('shown.bs.tab', (e) => {
        const targetId = e.target.getAttribute('data-bs-target');
        if (targetId === '#pane-template-workflow') {
          history.replaceState(null, '', '#workflow');
        } else if (targetId === '#pane-template-specifications') {
          history.replaceState(null, '', '#specifications');
        } else if (targetId === '#pane-template-info') {
          history.replaceState(null, '', '#info');
        }
      });
    });

    // Handle deep linking from URL hash
    const currentHash = window.location.hash.toLowerCase();
    if (currentHash === '#workflow' || currentHash === '#stages') {
      const tab = document.getElementById('tab-template-workflow');
      if (tab) bootstrap.Tab.getOrCreateInstance(tab).show();
    } else if (currentHash === '#specifications' || currentHash === '#specs') {
      const tab = document.getElementById('tab-template-specifications');
      if (tab) bootstrap.Tab.getOrCreateInstance(tab).show();
    } else if (currentHash === '#info') {
      const tab = document.getElementById('tab-template-info');
      if (tab) bootstrap.Tab.getOrCreateInstance(tab).show();
    }

    // Header stat links click to switch tabs
    document.querySelectorAll('.header-stat-link').forEach((el) => {
      el.addEventListener('click', () => {
        const targetTabSelector = el.getAttribute('data-tab-target');
        if (targetTabSelector) {
          const tabBtn = document.querySelector(targetTabSelector);
          if (tabBtn) {
            bootstrap.Tab.getOrCreateInstance(tabBtn).show();
          }
        }
      });
    });
  }

  // ========================================================
  // 9. INITIAL RENDERING
  // ========================================================
  renderSpecifications();
  renderWorkflow();
});
