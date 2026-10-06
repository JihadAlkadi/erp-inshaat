/**
 * Studies Template Details & Workflow Workspace Script
 * Implements:
 * - Dynamic Consecutive Department Groups (Presentation Only)
 * - HTML5 Drag & Drop reordering with atomic rollback on failure
 * - Accessible keyboard/button up/down reordering
 * - Stages CRUD
 * - Planned Materials management with dynamic product unit filtering
 * - Dynamic Specifications CRUD & reordering
 * - XSS safe rendering via native DOM APIs
 */

document.addEventListener('DOMContentLoaded', () => {
  const config = window.STUDIES_CONFIG || {};
  const templateId = config.templateId;
  const canUpdate = config.canUpdateTemplate;
  const canDelete = config.canDeleteTemplate;
  const departmentsMap = new Map();
  (config.departments || []).forEach((d) => departmentsMap.set(d.id, d));
  const productsMap = new Map();
  (config.products || []).forEach((p) => productsMap.set(p.id, p));

  let currentStages = Array.isArray(config.initialStages) ? [...config.initialStages] : [];
  currentStages.sort((a, b) => a.sortOrder - b.sortOrder);

  let activeStageForMaterials = null;
  let draggedStageId = null;

  // DOM Containers
  const workflowContainer = document.getElementById('workflowGroupsContainer');
  const emptyStagesNotice = document.getElementById('emptyStagesNotice');
  const headerStageCount = document.getElementById('headerStageCount');

  // Modals & Forms
  const addStageModalEl = document.getElementById('addStageModal');
  const addStageModal = addStageModalEl ? new bootstrap.Modal(addStageModalEl) : null;
  const addStageForm = document.getElementById('addStageForm');

  const editStageModalEl = document.getElementById('editStageModal');
  const editStageModal = editStageModalEl ? new bootstrap.Modal(editStageModalEl) : null;
  const editStageForm = document.getElementById('editStageForm');

  const stageMaterialsModalEl = document.getElementById('stageMaterialsModal');
  const stageMaterialsModal = stageMaterialsModalEl ? new bootstrap.Modal(stageMaterialsModalEl) : null;
  const addStageMaterialForm = document.getElementById('addStageMaterialForm');
  const selectMaterialProduct = document.getElementById('selectMaterialProduct');
  const selectMaterialUnit = document.getElementById('selectMaterialUnit');

  const addSpecModalEl = document.getElementById('addSpecModal');
  const addSpecModal = addSpecModalEl ? new bootstrap.Modal(addSpecModalEl) : null;
  const addSpecForm = document.getElementById('addSpecForm');

  const editSpecModalEl = document.getElementById('editSpecModal');
  const editSpecModal = editSpecModalEl ? new bootstrap.Modal(editSpecModalEl) : null;
  const editSpecForm = document.getElementById('editSpecForm');

  // ========================================================
  // 1. CONSECUTIVE DEPARTMENT GROUPING & RENDERING
  // ========================================================

  /**
   * Derives consecutive department groups purely for presentation.
   * If consecutive stages have the same departmentId, they are grouped together.
   * If departmentId changes, a new visual group starts.
   */
  function deriveConsecutiveGroups(stages) {
    if (!stages || stages.length === 0) return [];

    const groups = [];
    let currentGroup = null;

    stages.forEach((stage, idx) => {
      const dept = departmentsMap.get(stage.departmentId) || {
        id: stage.departmentId,
        name: 'قسم غير محدد',
        code: 'N/A',
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
    workflowContainer.replaceChildren();

    if (headerStageCount) {
      headerStageCount.textContent = currentStages.length.toString();
    }

    if (currentStages.length === 0) {
      if (emptyStagesNotice) emptyStagesNotice.classList.remove('d-none');
      return;
    }

    if (emptyStagesNotice) emptyStagesNotice.classList.add('d-none');

    const consecutiveGroups = deriveConsecutiveGroups(currentStages);

    consecutiveGroups.forEach((group, groupIndex) => {
      const groupEl = document.createElement('div');
      groupEl.className = 'department-workflow-group';

      // Group Header
      const headerEl = document.createElement('div');
      headerEl.className = 'department-workflow-header';

      const titleEl = document.createElement('div');
      titleEl.className = 'department-workflow-title';

      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-industry text-primary';
      icon.style.color = '#4F46E5';

      const nameSpan = document.createElement('span');
      nameSpan.textContent = group.departmentName;

      const codeBadge = document.createElement('span');
      codeBadge.className = 'badge bg-white text-secondary border font-monospace small';
      codeBadge.textContent = group.departmentCode;

      titleEl.appendChild(icon);
      titleEl.appendChild(nameSpan);
      titleEl.appendChild(codeBadge);

      const countBadge = document.createElement('span');
      countBadge.className = 'badge bg-light text-muted border rounded-pill px-2 py-1 small';
      countBadge.textContent = `${group.stages.length} مراحل متتالية`;

      headerEl.appendChild(titleEl);
      headerEl.appendChild(countBadge);
      groupEl.appendChild(headerEl);

      // Group Body
      const bodyEl = document.createElement('div');
      bodyEl.className = 'department-workflow-body';

      group.stages.forEach((stage) => {
        const cardEl = createStageCardElement(stage);
        bodyEl.appendChild(cardEl);
      });

      groupEl.appendChild(bodyEl);
      workflowContainer.appendChild(groupEl);
    });
  }

  function createStageCardElement(stage) {
    const card = document.createElement('div');
    card.className = 'stage-card';
    card.dataset.stageId = stage.id;
    card.dataset.sortOrder = stage.sortOrder.toString();

    // 1. Drag Handle
    if (canUpdate) {
      const dragHandle = document.createElement('div');
      dragHandle.className = 'stage-drag-handle';
      dragHandle.title = 'اسحب لإعادة الترتيب';
      dragHandle.innerHTML = '<i class="fa-solid fa-grip-vertical"></i>';

      // Drag events
      card.draggable = true;
      card.addEventListener('dragstart', handleDragStart);
      card.addEventListener('dragover', handleDragOver);
      card.addEventListener('dragleave', handleDragLeave);
      card.addEventListener('drop', handleDrop);
      card.addEventListener('dragend', handleDragEnd);

      card.appendChild(dragHandle);
    }

    // 2. Global Order Badge
    const orderBadge = document.createElement('div');
    orderBadge.className = 'stage-order-badge';
    orderBadge.textContent = stage.sortOrder.toString();
    card.appendChild(orderBadge);

    // 3. Info
    const info = document.createElement('div');
    info.className = 'stage-info';

    const title = document.createElement('div');
    title.className = 'stage-name';
    title.textContent = stage.name;
    info.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'stage-meta';

    // Duration
    if (stage.estimatedDurationMinutes) {
      const durationItem = document.createElement('span');
      durationItem.className = 'stage-meta-item';
      const durHours = Math.floor(stage.estimatedDurationMinutes / 60);
      const durMins = stage.estimatedDurationMinutes % 60;
      let durText = `${stage.estimatedDurationMinutes} دقيقة`;
      if (durHours > 0) {
        durText = `${durHours} ساعة ${durMins > 0 ? `و ${durMins} دقيقة` : ''}`;
      }
      durationItem.innerHTML = `<i class="fa-regular fa-clock"></i> ${durText}`;
      meta.appendChild(durationItem);
    }

    // Cost
    if (stage.estimatedCost) {
      const costItem = document.createElement('span');
      costItem.className = 'stage-meta-item text-success';
      costItem.innerHTML = `<i class="fa-solid fa-coins"></i> ${parseFloat(stage.estimatedCost).toLocaleString()} ر.س`;
      meta.appendChild(costItem);
    }

    // Materials count
    const matCount = Array.isArray(stage.plannedMaterials) ? stage.plannedMaterials.length : 0;
    const matItem = document.createElement('span');
    matItem.className = 'stage-meta-item';
    matItem.innerHTML = `<i class="fa-solid fa-boxes-stacked text-primary"></i> ${matCount} مواد مخططة`;
    meta.appendChild(matItem);

    if (stage.description) {
      const descItem = document.createElement('span');
      descItem.className = 'stage-meta-item text-truncate d-block';
      descItem.style.maxWidth = '300px';
      descItem.textContent = stage.description;
      meta.appendChild(descItem);
    }

    info.appendChild(meta);
    card.appendChild(info);

    // 4. Actions
    const actions = document.createElement('div');
    actions.className = 'stage-actions';

    // Accessibility move buttons
    if (canUpdate) {
      const globalIndex = currentStages.findIndex((s) => s.id === stage.id);

      const btnUp = document.createElement('button');
      btnUp.type = 'button';
      btnUp.className = 'btn btn-sm btn-light p-1';
      btnUp.title = 'تحريك لأعلى';
      btnUp.innerHTML = '<i class="fa-solid fa-arrow-up text-secondary"></i>';
      btnUp.disabled = globalIndex === 0;
      btnUp.addEventListener('click', () => handleMoveStage(globalIndex, -1));
      actions.appendChild(btnUp);

      const btnDown = document.createElement('button');
      btnDown.type = 'button';
      btnDown.className = 'btn btn-sm btn-light p-1';
      btnDown.title = 'تحريك لأسفل';
      btnDown.innerHTML = '<i class="fa-solid fa-arrow-down text-secondary"></i>';
      btnDown.disabled = globalIndex === currentStages.length - 1;
      btnDown.addEventListener('click', () => handleMoveStage(globalIndex, 1));
      actions.appendChild(btnDown);
    }

    // Planned Materials Button
    const btnMaterials = document.createElement('button');
    btnMaterials.type = 'button';
    btnMaterials.className = 'btn btn-sm btn-outline-primary d-inline-flex align-items-center gap-1';
    btnMaterials.style.borderRadius = '6px';
    btnMaterials.innerHTML = '<i class="fa-solid fa-boxes-stacked"></i> <span>المواد</span>';
    btnMaterials.addEventListener('click', () => openStageMaterialsModal(stage));
    actions.appendChild(btnMaterials);

    // Edit Stage
    if (canUpdate) {
      const btnEdit = document.createElement('button');
      btnEdit.type = 'button';
      btnEdit.className = 'btn btn-sm btn-light p-1';
      btnEdit.title = 'تعديل المرحلة';
      btnEdit.innerHTML = '<i class="fa-solid fa-pen text-primary"></i>';
      btnEdit.addEventListener('click', () => openEditStageModal(stage));
      actions.appendChild(btnEdit);
    }

    // Archive Stage
    if (canDelete) {
      const btnDelete = document.createElement('button');
      btnDelete.type = 'button';
      btnDelete.className = 'btn btn-sm btn-light p-1';
      btnDelete.title = 'أرشفة المرحلة';
      btnDelete.innerHTML = '<i class="fa-solid fa-trash-can text-danger"></i>';
      btnDelete.addEventListener('click', () => handleArchiveStage(stage));
      actions.appendChild(btnDelete);
    }

    card.appendChild(actions);
    return card;
  }

  // ========================================================
  // 2. DRAG & DROP AND REORDERING LOGIC
  // ========================================================

  function handleDragStart(e) {
    draggedStageId = this.dataset.stageId;
    this.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', draggedStageId);
  }

  function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    this.classList.add('drag-over');
  }

  function handleDragLeave(e) {
    this.classList.remove('drag-over');
  }

  function handleDragEnd(e) {
    this.classList.remove('is-dragging');
    document.querySelectorAll('.stage-card').forEach((el) => el.classList.remove('drag-over'));
  }

  async function handleDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    const targetStageId = this.dataset.stageId;

    if (!draggedStageId || draggedStageId === targetStageId) return;

    const fromIndex = currentStages.findIndex((s) => s.id === draggedStageId);
    const toIndex = currentStages.findIndex((s) => s.id === targetStageId);

    if (fromIndex === -1 || toIndex === -1) return;

    // Snapshot for rollback
    const previousStages = [...currentStages];

    // Reorder in memory
    const [moved] = currentStages.splice(fromIndex, 1);
    currentStages.splice(toIndex, 0, moved);

    // Re-assign sortOrder densely
    currentStages.forEach((s, idx) => {
      s.sortOrder = idx + 1;
    });

    // Render immediately for snappy UI
    renderWorkflow();

    // Persist to backend
    const stageIds = currentStages.map((s) => s.id);
    await persistStageReorder(stageIds, previousStages);
  }

  async function handleMoveStage(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= currentStages.length) return;

    const previousStages = [...currentStages];

    // Swap
    const temp = currentStages[index];
    currentStages[index] = currentStages[targetIndex];
    currentStages[targetIndex] = temp;

    // Re-assign sortOrder densely
    currentStages.forEach((s, idx) => {
      s.sortOrder = idx + 1;
    });

    renderWorkflow();

    const stageIds = currentStages.map((s) => s.id);
    await persistStageReorder(stageIds, previousStages);
  }

  async function persistStageReorder(stageIds, fallbackStages) {
    try {
      const res = await window.erpFetch(`/api/studies/templates/${templateId}/stages/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageIds }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        // Sync with returned stages
        if (Array.isArray(data.data)) {
          currentStages = data.data;
          renderWorkflow();
        }
        showLightweightToast('تم تحديث ترتيب المراحل بنجاح');
      } else {
        // Rollback
        currentStages = fallbackStages;
        renderWorkflow();
        Swal.fire('خطأ في الترتيب', data.message || 'تعذر حفظ الترتيب الجديد', 'error');
      }
    } catch (err) {
      currentStages = fallbackStages;
      renderWorkflow();
      Swal.fire('خطأ', 'تعذر الاتصال بالخادم لحفظ الترتيب', 'error');
    }
  }

  function showLightweightToast(msg) {
    if (window.Swal) {
      const Toast = Swal.mixin({
        toast: true,
        position: 'top-start',
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
      });
      Toast.fire({
        icon: 'success',
        title: msg,
      });
    }
  }

  // ========================================================
  // 3. STAGE CRUD
  // ========================================================

  if (addStageForm) {
    addStageForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!addStageForm.checkValidity()) {
        addStageForm.classList.add('was-validated');
        return;
      }

      const name = document.getElementById('newStageName').value.trim();
      const departmentId = document.getElementById('newStageDepartmentId').value;
      const durationVal = document.getElementById('newStageDuration').value;
      const costVal = document.getElementById('newStageCost').value;
      const description = document.getElementById('newStageDescription').value.trim();

      const payload = {
        name,
        departmentId,
        estimatedDurationMinutes: durationVal ? parseInt(durationVal, 10) : undefined,
        estimatedCost: costVal ? parseFloat(costVal) : undefined,
        description: description || undefined,
      };

      try {
        const res = await window.erpFetch(`/api/studies/templates/${templateId}/stages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          currentStages.push(data.data);
          currentStages.sort((a, b) => a.sortOrder - b.sortOrder);
          renderWorkflow();
          if (addStageModal) addStageModal.hide();
          addStageForm.reset();
          addStageForm.classList.remove('was-validated');
          showLightweightToast('تمت إضافة المرحلة بنجاح');
        } else {
          Swal.fire('خطأ', data.message || 'تعذر إضافة المرحلة', 'error');
        }
      } catch (err) {
        Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
      }
    });
  }

  function openEditStageModal(stage) {
    document.getElementById('editStageId').value = stage.id;
    document.getElementById('editStageName').value = stage.name;
    document.getElementById('editStageDepartmentId').value = stage.departmentId;
    document.getElementById('editStageDuration').value = stage.estimatedDurationMinutes || '';
    document.getElementById('editStageCost').value = stage.estimatedCost || '';
    document.getElementById('editStageDescription').value = stage.description || '';
    if (editStageModal) editStageModal.show();
  }

  if (editStageForm) {
    editStageForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!editStageForm.checkValidity()) {
        editStageForm.classList.add('was-validated');
        return;
      }

      const stageId = document.getElementById('editStageId').value;
      const name = document.getElementById('editStageName').value.trim();
      const departmentId = document.getElementById('editStageDepartmentId').value;
      const durationVal = document.getElementById('editStageDuration').value;
      const costVal = document.getElementById('editStageCost').value;
      const description = document.getElementById('editStageDescription').value.trim();

      const payload = {
        name,
        departmentId,
        estimatedDurationMinutes: durationVal ? parseInt(durationVal, 10) : null,
        estimatedCost: costVal ? parseFloat(costVal) : null,
        description: description || null,
      };

      try {
        const res = await window.erpFetch(`/api/studies/templates/${templateId}/stages/${stageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          const idx = currentStages.findIndex((s) => s.id === stageId);
          if (idx !== -1) {
            currentStages[idx] = data.data;
            renderWorkflow();
          }
          if (editStageModal) editStageModal.hide();
          showLightweightToast('تم تحديث بيانات المرحلة بنجاح');
        } else {
          Swal.fire('خطأ', data.message || 'تعذر تعديل المرحلة', 'error');
        }
      } catch (err) {
        Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
      }
    });
  }

  function handleArchiveStage(stage) {
    Swal.fire({
      title: 'أرشفة مرحلة التصنيع',
      text: `هل أنت متأكد من رغبتك في أرشفة المرحلة "${stage.name}"؟ سيتم إعادة ترتيب المراحل المتبقية تلقائياً.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EE5253',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'نعم، أرشفة',
      cancelButtonText: 'إلغاء',
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await window.erpFetch(`/api/studies/templates/${templateId}/stages/${stage.id}`, {
            method: 'DELETE',
          });
          const data = await res.json();
          if (res.ok && data.success) {
            // Remove from memory and re-compact
            currentStages = currentStages.filter((s) => s.id !== stage.id);
            currentStages.forEach((s, idx) => {
              s.sortOrder = idx + 1;
            });
            renderWorkflow();
            showLightweightToast('تمت أرشفة المرحلة بنجاح');
          } else {
            Swal.fire('خطأ', data.message || 'تعذر أرشفة المرحلة', 'error');
          }
        } catch (err) {
          Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
        }
      }
    });
  }

  // ========================================================
  // 4. PLANNED MATERIALS MANAGEMENT
  // ========================================================

  function openStageMaterialsModal(stage) {
    activeStageForMaterials = stage;
    const stageTitle = document.getElementById('materialsModalStageName');
    if (stageTitle) stageTitle.textContent = stage.name;

    renderStageMaterialsTable(stage.plannedMaterials || []);

    if (addStageMaterialForm) {
      addStageMaterialForm.reset();
      addStageMaterialForm.classList.remove('was-validated');
      if (selectMaterialUnit) {
        selectMaterialUnit.replaceChildren();
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '-- اختر الوحدة --';
        selectMaterialUnit.appendChild(opt);
        selectMaterialUnit.disabled = true;
      }
    }

    if (stageMaterialsModal) stageMaterialsModal.show();
  }

  if (selectMaterialProduct) {
    selectMaterialProduct.addEventListener('change', () => {
      const prodId = selectMaterialProduct.value;
      if (!selectMaterialUnit) return;

      selectMaterialUnit.replaceChildren();
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = '-- اختر الوحدة --';
      selectMaterialUnit.appendChild(defaultOpt);

      if (!prodId) {
        selectMaterialUnit.disabled = true;
        return;
      }

      const product = productsMap.get(prodId);
      if (product && Array.isArray(product.units) && product.units.length > 0) {
        product.units.forEach((u) => {
          if (u.isActive) {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = `${u.name} (${u.code})`;
            selectMaterialUnit.appendChild(opt);
          }
        });
        selectMaterialUnit.disabled = false;
      } else {
        selectMaterialUnit.disabled = true;
      }
    });
  }

  function renderStageMaterialsTable(materials) {
    const tableBody = document.getElementById('stageMaterialsTableBody');
    if (!tableBody) return;
    tableBody.replaceChildren();

    if (!materials || materials.length === 0) {
      const emptyRow = document.createElement('tr');
      const emptyTd = document.createElement('td');
      emptyTd.colSpan = canUpdate ? 5 : 4;
      emptyTd.className = 'text-center py-4 text-muted small';
      emptyTd.textContent = 'لا توجد مواد مخططة محددة لهذه المرحلة بعد.';
      emptyRow.appendChild(emptyTd);
      tableBody.appendChild(emptyRow);
      return;
    }

    materials.forEach((mat) => {
      const tr = document.createElement('tr');

      // Product Name
      const tdName = document.createElement('td');
      tdName.className = 'fw-bold text-dark';
      tdName.textContent = mat.product ? mat.product.name : 'مادة مجهولة';
      tr.appendChild(tdName);

      // Product Code
      const tdCode = document.createElement('td');
      const codeSpan = document.createElement('span');
      codeSpan.className = 'badge bg-light text-dark border font-monospace';
      codeSpan.textContent = mat.product ? mat.product.code : '—';
      tdCode.appendChild(codeSpan);
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

      // Actions
      if (canUpdate) {
        const tdActions = document.createElement('td');
        tdActions.className = 'text-center';
        const btnDelete = document.createElement('button');
        btnDelete.type = 'button';
        btnDelete.className = 'btn btn-sm btn-light p-1';
        btnDelete.title = 'حذف المادة المخططة';
        btnDelete.innerHTML = '<i class="fa-solid fa-trash-can text-danger"></i>';
        btnDelete.addEventListener('click', () => handleDeleteStageMaterial(mat));
        tdActions.appendChild(btnDelete);
        tr.appendChild(tdActions);
      }

      tableBody.appendChild(tr);
    });
  }

  if (addStageMaterialForm) {
    addStageMaterialForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!activeStageForMaterials) return;

      if (!addStageMaterialForm.checkValidity()) {
        addStageMaterialForm.classList.add('was-validated');
        return;
      }

      const productId = selectMaterialProduct.value;
      const productUnitId = selectMaterialUnit.value;
      const plannedQuantity = document.getElementById('inputMaterialQuantity').value;

      const payload = {
        productId,
        productUnitId,
        plannedQuantity: parseFloat(plannedQuantity),
      };

      try {
        const res = await window.erpFetch(
          `/api/studies/templates/${templateId}/stages/${activeStageForMaterials.id}/materials`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          }
        );

        const data = await res.json();
        if (res.ok && data.success) {
          if (!activeStageForMaterials.plannedMaterials) {
            activeStageForMaterials.plannedMaterials = [];
          }
          activeStageForMaterials.plannedMaterials.push(data.data);
          renderStageMaterialsTable(activeStageForMaterials.plannedMaterials);
          renderWorkflow(); // update materials count on stage card
          addStageMaterialForm.reset();
          addStageMaterialForm.classList.remove('was-validated');
          if (selectMaterialUnit) selectMaterialUnit.disabled = true;
          showLightweightToast('تمت إضافة المادة المخططة للمرحلة بنجاح');
        } else {
          Swal.fire('خطأ', data.message || 'تعذر إضافة المادة', 'error');
        }
      } catch (err) {
        Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
      }
    });
  }

  function handleDeleteStageMaterial(mat) {
    if (!activeStageForMaterials) return;

    Swal.fire({
      title: 'حذف المادة المخططة',
      text: `هل تريد إزالة هذه المادة من المرحلة؟`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EE5253',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'نعم، حذف',
      cancelButtonText: 'إلغاء',
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await window.erpFetch(
            `/api/studies/templates/${templateId}/stages/${activeStageForMaterials.id}/materials/${mat.id}`,
            {
              method: 'DELETE',
            }
          );

          const data = await res.json();
          if (res.ok && data.success) {
            activeStageForMaterials.plannedMaterials = (activeStageForMaterials.plannedMaterials || []).filter(
              (m) => m.id !== mat.id
            );
            renderStageMaterialsTable(activeStageForMaterials.plannedMaterials);
            renderWorkflow();
            showLightweightToast('تم حذف المادة المخططة');
          } else {
            Swal.fire('خطأ', data.message || 'تعذر حذف المادة', 'error');
          }
        } catch (err) {
          Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
        }
      }
    });
  }

  // ========================================================
  // 5. SPECIFICATIONS CRUD & REORDERING
  // ========================================================

  const btnOpenAddSpec = document.getElementById('btnOpenAddSpecModal');
  if (btnOpenAddSpec && addSpecModal) {
    btnOpenAddSpec.addEventListener('click', () => {
      addSpecForm.reset();
      addSpecForm.classList.remove('was-validated');
      addSpecModal.show();
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
      const unit = document.getElementById('newSpecUnit').value.trim();

      const payload = {
        name,
        value,
        unit: unit || undefined,
      };

      try {
        const res = await window.erpFetch(`/api/studies/templates/${templateId}/specifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          sessionStorage.setItem('pendingToast', 'تمت إضافة الخاصية بنجاح');
          window.location.reload();
        } else {
          Swal.fire('خطأ', data.message || 'تعذر إضافة الخاصية', 'error');
        }
      } catch (err) {
        Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
      }
    });
  }

  // Handle Edit Spec
  document.querySelectorAll('.btn-edit-spec').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.spec-item');
      if (!card) return;
      const specId = card.dataset.specId;
      const name = card.querySelector('.spec-display-name')?.textContent || '';
      const val = card.querySelector('.spec-display-value')?.textContent || '';
      const unit = card.querySelector('.spec-display-unit')?.textContent || '';

      document.getElementById('editSpecId').value = specId;
      document.getElementById('editSpecName').value = name;
      document.getElementById('editSpecValue').value = val;
      document.getElementById('editSpecUnit').value = unit;

      if (editSpecModal) editSpecModal.show();
    });
  });

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
      const unit = document.getElementById('editSpecUnit').value.trim();

      const payload = {
        name,
        value,
        unit: unit || null,
      };

      try {
        const res = await window.erpFetch(`/api/studies/templates/${templateId}/specifications/${specId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (res.ok && data.success) {
          sessionStorage.setItem('pendingToast', 'تم تعديل الخاصية بنجاح');
          window.location.reload();
        } else {
          Swal.fire('خطأ', data.message || 'تعذر حفظ التعديل', 'error');
        }
      } catch (err) {
        Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
      }
    });
  }

  // Handle Delete Spec
  document.querySelectorAll('.btn-delete-spec').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.spec-item');
      if (!card) return;
      const specId = card.dataset.specId;
      const name = card.querySelector('.spec-display-name')?.textContent || '';

      Swal.fire({
        title: 'حذف الخاصية',
        text: `هل أنت متأكد من حذف خاصية "${name}"؟`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EE5253',
        cancelButtonColor: '#6B7280',
        confirmButtonText: 'نعم، حذف',
        cancelButtonText: 'إلغاء',
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            const res = await window.erpFetch(`/api/studies/templates/${templateId}/specifications/${specId}`, {
              method: 'DELETE',
            });
            const data = await res.json();
            if (res.ok && data.success) {
              sessionStorage.setItem('pendingToast', 'تم حذف الخاصية بنجاح');
              window.location.reload();
            } else {
              Swal.fire('خطأ', data.message || 'تعذر حذف الخاصية', 'error');
            }
          } catch (err) {
            Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
          }
        }
      });
    });
  });

  // Handle Move Spec Up / Down
  async function reorderSpecs(specCards) {
    const specificationIds = Array.from(specCards).map((c) => c.dataset.specId);
    try {
      const res = await window.erpFetch(`/api/studies/templates/${templateId}/specifications/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specificationIds }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        window.location.reload();
      } else {
        Swal.fire('خطأ', data.message || 'تعذر إعادة ترتيب الخصائص', 'error');
      }
    } catch (err) {
      Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
    }
  }

  document.querySelectorAll('.btn-move-spec-up').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.spec-item');
      const prev = card.previousElementSibling;
      if (prev && prev.classList.contains('spec-item')) {
        card.parentNode.insertBefore(card, prev);
        const all = document.querySelectorAll('#specificationsContainer .spec-item');
        reorderSpecs(all);
      }
    });
  });

  document.querySelectorAll('.btn-move-spec-down').forEach((btn) => {
    btn.addEventListener('click', () => {
      const card = btn.closest('.spec-item');
      const next = card.nextElementSibling;
      if (next && next.classList.contains('spec-item')) {
        card.parentNode.insertBefore(next, card);
        const all = document.querySelectorAll('#specificationsContainer .spec-item');
        reorderSpecs(all);
      }
    });
  });

  // ========================================================
  // 6. TEMPLATE STATUS TOGGLE & ARCHIVE
  // ========================================================

  const btnToggleStatus = document.getElementById('btnToggleTemplateStatus');
  if (btnToggleStatus) {
    btnToggleStatus.addEventListener('click', () => {
      const isCurrentlyActive = btnToggleStatus.classList.contains('btn-outline-warning');
      const newStatus = !isCurrentlyActive;

      Swal.fire({
        title: newStatus ? 'تفعيل القالب' : 'تعطيل القالب',
        text: newStatus
          ? 'هل تريد تفعيل القالب ليصبح متاحاً للإنتاج؟'
          : 'هل تريد تعطيل القالب وإيقاف استخدامه مؤقتاً؟',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: newStatus ? '#10AC84' : '#FF9F43',
        cancelButtonColor: '#6B7280',
        confirmButtonText: newStatus ? 'نعم، تفعيل' : 'نعم، تعطيل',
        cancelButtonText: 'إلغاء',
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            const res = await window.erpFetch(`/api/studies/templates/${templateId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ isActive: newStatus }),
            });
            const data = await res.json();
            if (res.ok && data.success) {
              sessionStorage.setItem('pendingToast', newStatus ? 'تم تفعيل القالب بنجاح' : 'تم تعطيل القالب بنجاح');
              window.location.reload();
            } else {
              Swal.fire('خطأ', data.message || 'تعذر تعديل حالة القالب', 'error');
            }
          } catch (err) {
            Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
          }
        }
      });
    });
  }

  const btnArchive = document.getElementById('btnArchiveTemplate');
  if (btnArchive) {
    btnArchive.addEventListener('click', () => {
      Swal.fire({
        title: 'أرشفة قالب التصنيع',
        text: 'هل أنت متأكد من رغبتك في أرشفة هذا القالب؟ سيتم الاحتفاظ بكافة بياناته ومراحله تاريخياً.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EE5253',
        cancelButtonColor: '#6B7280',
        confirmButtonText: 'نعم، أرشفة',
        cancelButtonText: 'إلغاء',
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            const res = await window.erpFetch(`/api/studies/templates/${templateId}`, {
              method: 'DELETE',
            });
            const data = await res.json();
            if (res.ok && data.success) {
              sessionStorage.setItem('pendingToast', 'تمت أرشفة قالب التصنيع بنجاح');
              window.location.href = '/studies/templates';
            } else {
              Swal.fire('خطأ', data.message || 'تعذر أرشفة القالب', 'error');
            }
          } catch (err) {
            Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
          }
        }
      });
    });
  }

  const btnOpenAddStageModal = document.getElementById('btnOpenAddStageModal');
  if (btnOpenAddStageModal && addStageModal) {
    btnOpenAddStageModal.addEventListener('click', () => {
      addStageForm.reset();
      addStageForm.classList.remove('was-validated');
      addStageModal.show();
    });
  }

  // Initial workflow render
  renderWorkflow();
});
