/**
 * Production Order Draft Editor Workspace
 *
 * Implements:
 * 1. Monotonically increasing request sequence counters for Template Search and Template Configuration.
 * 2. Real-time client duplicate pre-check preventing same Template + Option combinations.
 * 3. Quantity updates, Pattern Option updates with rollback on collision, Line reordering, Line archiving, and Template sync.
 * 4. Strict DOM security using Native DOM APIs and textContent.
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Initial State Initialization
  const initialDataEl = document.getElementById('initialOrderData');
  if (!initialDataEl) return;

  let currentOrder = null;
  try {
    currentOrder = JSON.parse(initialDataEl.textContent || '{}');
  } catch (err) {
    console.error('Failed to parse initial order JSON:', err);
    return;
  }

  const orderId = currentOrder.id;

  // 2. Global Monotonic Sequence Counters (NEVER reset to 0)
  let templatePickerRequestSeq = 0;
  let templateConfigurationRequestSeq = 0;

  // Template Search State
  let templateSearchTerm = '';
  let templateCurrentPage = 1;
  let templateTotalPages = 1;
  let templateSearchDebounceTimer = null;
  const loadedTemplateIds = new Set();

  // Composer Active Selection State
  let selectedTemplate = null;
  let currentTemplateConfig = null; // { templateId, templateName, patterns: [...] }

  // DOM Elements - Workspace & Alerts
  const orderAlert = document.getElementById('orderAlert');
  const readinessStatusBadge = document.getElementById('readinessStatusBadge');
  const readinessPanel = document.getElementById('readinessPanel');
  const readinessIssuesList = document.getElementById('readinessIssuesList');
  const recheckReadinessBtn = document.getElementById('recheckReadinessBtn');
  const headerLineCount = document.getElementById('headerLineCount');
  const headerTotalQuantity = document.getElementById('headerTotalQuantity');
  const orderDescriptionText = document.getElementById('orderDescriptionText');
  const orderNotesBox = document.getElementById('orderNotesBox');
  const orderLinesContainer = document.getElementById('orderLinesContainer');
  const emptyLinesState = document.getElementById('emptyLinesState');

  // DOM Elements - Composer
  const templateSearchInput = document.getElementById('templateSearchInput');
  const templateListContainer = document.getElementById('templateListContainer');
  const templateLoadMoreBtn = document.getElementById('templateLoadMoreBtn');
  const selectedTemplateBox = document.getElementById('selectedTemplateBox');
  const selectedTemplateName = document.getElementById('selectedTemplateName');
  const selectedTemplateMeta = document.getElementById('selectedTemplateMeta');
  const resetSelectedTemplateBtn = document.getElementById('resetSelectedTemplateBtn');
  const composerQuantityInput = document.getElementById('composerQuantityInput');
  const composerPatternsContainer = document.getElementById('composerPatternsContainer');
  const composerAlert = document.getElementById('composerAlert');
  const composerDuplicateNotice = document.getElementById('composerDuplicateNotice');
  const composerDuplicateNoticeText = document.getElementById('composerDuplicateNoticeText');
  const composerAddLineBtn = document.getElementById('composerAddLineBtn');

  // DOM Elements - Modals
  const editHeaderBtn = document.getElementById('editHeaderBtn');
  const editHeaderModalEl = document.getElementById('editHeaderModal');
  const editHeaderModal = editHeaderModalEl ? new bootstrap.Modal(editHeaderModalEl) : null;
  const editHeaderForm = document.getElementById('editHeaderForm');
  const editDescriptionInput = document.getElementById('editDescriptionInput');
  const editNotesInput = document.getElementById('editNotesInput');
  const editHeaderAlert = document.getElementById('editHeaderAlert');
  const confirmEditHeaderBtn = document.getElementById('confirmEditHeaderBtn');

  const archiveOrderBtn = document.getElementById('archiveOrderBtn');
  const archiveOrderModalEl = document.getElementById('archiveOrderModal');
  const archiveOrderModal = archiveOrderModalEl ? new bootstrap.Modal(archiveOrderModalEl) : null;
  const confirmArchiveOrderBtn = document.getElementById('confirmArchiveOrderBtn');

  // =========================================================================
  // Helper: Display Alerts
  // =========================================================================
  function showOrderAlert(message) {
    if (!orderAlert) return;
    orderAlert.textContent = message;
    orderAlert.classList.remove('d-none');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function clearOrderAlert() {
    if (!orderAlert) return;
    orderAlert.textContent = '';
    orderAlert.classList.add('d-none');
  }

  function showComposerAlert(message) {
    if (!composerAlert) return;
    composerAlert.textContent = message;
    composerAlert.classList.remove('d-none');
  }

  function clearComposerAlert() {
    if (!composerAlert) return;
    composerAlert.textContent = '';
    composerAlert.classList.add('d-none');
  }

  // =========================================================================
  // Canonical Client Hash / Key for Duplicate Detection
  // =========================================================================
  function canonicalizeSelections(templateId, selections) {
    if (!selections || selections.length === 0) {
      return templateId;
    }
    const sorted = [...selections].sort((a, b) =>
      a.patternId.localeCompare(b.patternId)
    );
    const parts = sorted.map((s) => `${s.patternId}:${s.optionId}`);
    return `${templateId}|${parts.join('|')}`;
  }

  function checkComposerDuplicate() {
    clearComposerAlert();
    composerDuplicateNotice.classList.add('d-none');
    composerDuplicateNoticeText.textContent = '';

    if (!selectedTemplate) {
      composerAddLineBtn.disabled = true;
      return false;
    }

    // Check if configuration has any pattern without options
    if (currentTemplateConfig && currentTemplateConfig.patterns) {
      for (const pat of currentTemplateConfig.patterns) {
        if (!pat.options || pat.options.length === 0) {
          showComposerAlert(`النمط "${pat.name}" لا يحتوي على خيارات فعالة. يجب تحديث قالب التصنيع قبل استخدامه في أمر الإنتاج.`);
          composerAddLineBtn.disabled = true;
          return true;
        }
      }
    }

    // Gather selected options from composer DOM
    const currentSelections = [];
    if (currentTemplateConfig && currentTemplateConfig.patterns) {
      for (const pat of currentTemplateConfig.patterns) {
        const select = document.getElementById(`composerPatternSelect-${pat.id}`);
        if (select && select.value) {
          currentSelections.push({
            patternId: pat.id,
            optionId: select.value,
          });
        }
      }
    }

    const composerKey = canonicalizeSelections(selectedTemplate.id, currentSelections);

    // Compare against existing lines in currentOrder
    if (currentOrder && currentOrder.lines) {
      for (const line of currentOrder.lines) {
        const lineSelections = (line.patternSelections || []).map((s) => ({
          patternId: s.templatePatternId,
          optionId: s.selectedOptionId,
        }));
        const lineKey = canonicalizeSelections(line.templateId, lineSelections);

        if (composerKey === lineKey) {
          composerDuplicateNoticeText.textContent = `هذه التركيبة موجودة مسبقًا في البند #${line.sortOrder}. عدّل كمية البند الموجود بدل إضافة بند مكرر.`;
          composerDuplicateNotice.classList.remove('d-none');
          composerAddLineBtn.disabled = true;
          return true;
        }
      }
    }

    composerAddLineBtn.disabled = false;
    return false;
  }

  // =========================================================================
  // Template Picker: Fetch & Render with Race Protection
  // =========================================================================
  async function fetchTemplates(isLoadMore = false) {
    const seq = ++templatePickerRequestSeq;

    if (!isLoadMore) {
      templateCurrentPage = 1;
      loadedTemplateIds.clear();
      templateListContainer.innerHTML = '';
      const loader = document.createElement('div');
      loader.className = 'text-center py-3 text-muted small';
      loader.innerHTML = '<div class="spinner-border spinner-border-sm me-1 text-primary"></div> جاري تحميل القوالب...';
      templateListContainer.appendChild(loader);
    } else {
      templateLoadMoreBtn.disabled = true;
      templateLoadMoreBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> جاري التحميل...';
    }

    try {
      const url = new URL('/api/production/templates/reference-options', window.location.origin);
      url.searchParams.set('page', String(templateCurrentPage));
      url.searchParams.set('limit', '20');
      if (templateSearchTerm) {
        url.searchParams.set('search', templateSearchTerm);
      }

      const res = await window.erpFetch(url.pathname + url.search);
      const json = await res.json();

      // Discard out-of-order stale responses
      if (seq !== templatePickerRequestSeq) return;

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'تعذر جلب قائمة القوالب');
      }

      const { items, pagination } = json.data;
      templateTotalPages = pagination ? pagination.totalPages : 1;

      if (!isLoadMore) {
        templateListContainer.innerHTML = '';
      }

      if (items.length === 0 && templateCurrentPage === 1) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'text-center py-3 text-muted small';
        emptyEl.textContent = 'لم يتم العثور على قوالب تطابق البحث.';
        templateListContainer.appendChild(emptyEl);
        templateLoadMoreBtn.classList.add('d-none');
        return;
      }

      items.forEach((tmpl) => {
        if (loadedTemplateIds.has(tmpl.id)) return;
        loadedTemplateIds.add(tmpl.id);

        const itemCard = document.createElement('div');
        itemCard.className = 'p-2 mb-1 border rounded bg-white template-pick-card cursor-pointer d-flex justify-content-between align-items-center';
        itemCard.style.cursor = 'pointer';

        const infoDiv = document.createElement('div');
        const nameEl = document.createElement('div');
        nameEl.className = 'fw-bold text-dark small';
        nameEl.textContent = tmpl.name;
        infoDiv.appendChild(nameEl);

        const metaEl = document.createElement('div');
        metaEl.className = 'text-muted small font-monospace';
        metaEl.textContent = `${tmpl.code}${tmpl.referenceNumber ? ' • ' + tmpl.referenceNumber : ''}`;
        infoDiv.appendChild(metaEl);

        const selectIcon = document.createElement('div');
        selectIcon.className = 'text-primary small';
        selectIcon.innerHTML = '<i class="fa-solid fa-check-circle"></i>';

        itemCard.appendChild(infoDiv);
        itemCard.appendChild(selectIcon);

        itemCard.addEventListener('click', () => {
          selectTemplate(tmpl);
        });

        templateListContainer.appendChild(itemCard);
      });

      // Update Load More Button visibility
      if (templateCurrentPage < templateTotalPages) {
        templateLoadMoreBtn.classList.remove('d-none');
        templateLoadMoreBtn.disabled = false;
        templateLoadMoreBtn.innerHTML = '<i class="fa-solid fa-arrow-down me-1"></i> تحميل المزيد من القوالب';
      } else {
        templateLoadMoreBtn.classList.add('d-none');
      }
    } catch (err) {
      if (seq !== templatePickerRequestSeq) return;
      if (!isLoadMore) {
        templateListContainer.innerHTML = '';
        const errorEl = document.createElement('div');
        errorEl.className = 'text-center py-2 text-danger small';
        errorEl.textContent = err.message || 'حدث خطأ أثناء تحميل القوالب';
        templateListContainer.appendChild(errorEl);
      }
    }
  }

  // =========================================================================
  // Template Selection & Order Configuration Fetching
  // =========================================================================
  async function selectTemplate(tmpl) {
    selectedTemplate = tmpl;

    // Show summary box
    selectedTemplateName.textContent = tmpl.name;
    selectedTemplateMeta.textContent = `الكود: ${tmpl.code}${tmpl.referenceNumber ? ' | المرجع: ' + tmpl.referenceNumber : ''}`;
    selectedTemplateBox.classList.remove('d-none');

    // Fetch order configuration with independent monotonic sequence counter
    const configSeq = ++templateConfigurationRequestSeq;

    composerPatternsContainer.innerHTML = '';
    const loadingEl = document.createElement('div');
    loadingEl.className = 'text-center py-3 text-muted small';
    loadingEl.innerHTML = '<div class="spinner-border spinner-border-sm me-1 text-primary"></div> جاري تحميل أنماط القالب...';
    composerPatternsContainer.appendChild(loadingEl);

    composerAddLineBtn.disabled = true;

    try {
      const res = await window.erpFetch(`/api/production/templates/${tmpl.id}/order-configuration`);
      const json = await res.json();

      // Discard out-of-order response
      if (configSeq !== templateConfigurationRequestSeq) return;

      if (!res.ok || !json.success) {
        throw new Error(json.message || 'تعذر جلب تفاصيل وتكوينات القالب');
      }

      currentTemplateConfig = json.data;
      renderComposerPatterns(currentTemplateConfig);
      checkComposerDuplicate();
    } catch (err) {
      if (configSeq !== templateConfigurationRequestSeq) return;
      composerPatternsContainer.innerHTML = '';
      const errEl = document.createElement('div');
      errEl.className = 'text-center py-2 text-danger small';
      errEl.textContent = err.message || 'حدث خطأ أثناء تحميل إعدادات القالب';
      composerPatternsContainer.appendChild(errEl);
      composerAddLineBtn.disabled = true;
    }
  }

  function resetComposerSelection() {
    // Invalidate any in-flight configuration request (do NOT reset counter to zero!)
    ++templateConfigurationRequestSeq;

    selectedTemplate = null;
    currentTemplateConfig = null;

    selectedTemplateBox.classList.add('d-none');
    selectedTemplateName.textContent = '—';
    selectedTemplateMeta.textContent = '—';

    composerPatternsContainer.innerHTML = '';
    const placeholder = document.createElement('div');
    placeholder.className = 'text-center py-3 text-muted small';
    placeholder.textContent = 'يرجى اختيار قالب تصنيع أولاً لعرض خيارات الأنماط التابعة له.';
    composerPatternsContainer.appendChild(placeholder);

    composerQuantityInput.value = '1';
    composerDuplicateNotice.classList.add('d-none');
    composerDuplicateNoticeText.textContent = '';
    clearComposerAlert();
    composerAddLineBtn.disabled = true;
  }

  function renderComposerPatterns(config) {
    composerPatternsContainer.innerHTML = '';

    if (!config.patterns || config.patterns.length === 0) {
      const noPatternsEl = document.createElement('div');
      noPatternsEl.className = 'text-center py-2 text-muted small';
      noPatternsEl.textContent = 'هذا القالب لا يحتوي على أنماط اختيارية. يمكنك تحديد الكمية والإضافة مباشرة.';
      composerPatternsContainer.appendChild(noPatternsEl);
      return;
    }

    const row = document.createElement('div');
    row.className = 'row g-3';

    config.patterns.forEach((pat) => {
      const col = document.createElement('div');
      col.className = 'col-12';

      const label = document.createElement('label');
      label.className = 'form-label small fw-bold text-dark mb-1';
      label.textContent = pat.name;
      col.appendChild(label);

      if (!pat.options || pat.options.length === 0) {
        const errorNote = document.createElement('div');
        errorNote.className = 'text-danger small';
        errorNote.textContent = `النمط "${pat.name}" لا يحتوي على خيارات فعالة.`;
        col.appendChild(errorNote);
      } else {
        const select = document.createElement('select');
        select.className = 'form-select';
        select.id = `composerPatternSelect-${pat.id}`;
        select.dataset.patternId = pat.id;

        pat.options.forEach((opt) => {
          const optEl = document.createElement('option');
          optEl.value = opt.id;
          optEl.textContent = opt.name;
          if (pat.defaultOptionId === opt.id) {
            optEl.selected = true;
          }
          select.appendChild(optEl);
        });

        // Trigger duplicate precheck on option change
        select.addEventListener('change', () => {
          checkComposerDuplicate();
        });

        col.appendChild(select);
      }

      row.appendChild(col);
    });

    composerPatternsContainer.appendChild(row);
  }

  // =========================================================================
  // Add Line Handler
  // =========================================================================
  composerAddLineBtn.addEventListener('click', async () => {
    clearComposerAlert();
    clearOrderAlert();

    if (!selectedTemplate) {
      showComposerAlert('يرجى اختيار قالب تصنيع أولاً.');
      return;
    }

    const qty = parseInt(composerQuantityInput.value, 10);
    if (isNaN(qty) || qty < 1 || qty > 10000) {
      showComposerAlert('كمية البند يجب أن تكون عدداً صحيحاً بين 1 و 10,000.');
      return;
    }

    // Precheck again before network call
    if (checkComposerDuplicate()) {
      return;
    }

    const patternSelections = [];
    if (currentTemplateConfig && currentTemplateConfig.patterns) {
      for (const pat of currentTemplateConfig.patterns) {
        const select = document.getElementById(`composerPatternSelect-${pat.id}`);
        if (!select || !select.value) {
          showComposerAlert(`يرجى تحديد خيار للنمط "${pat.name}".`);
          return;
        }
        patternSelections.push({
          patternId: pat.id,
          optionId: select.value,
        });
      }
    }

    composerAddLineBtn.disabled = true;
    composerAddLineBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> جاري الإضافة...';

    try {
      const res = await window.erpFetch(`/api/production/orders/${orderId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate.id,
          quantity: qty,
          patternSelections,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'فشل إضافة بند الإنتاج');
      }

      // Success: refresh whole order state
      await refreshOrder();
      resetComposerSelection();
    } catch (err) {
      showComposerAlert(err.message || 'حدث خطأ غير متوقع أثناء إضافة البند');
    } finally {
      composerAddLineBtn.disabled = false;
      composerAddLineBtn.innerHTML = '<i class="fa-solid fa-plus"></i> <span class="fw-bold">إضافة البند للطلب</span>';
    }
  });

  // =========================================================================
  // Lines Section: Render & Actions
  // =========================================================================
  function renderOrderLines() {
    orderLinesContainer.innerHTML = '';

    if (!currentOrder.lines || currentOrder.lines.length === 0) {
      emptyLinesState.classList.remove('d-none');
      return;
    }

    emptyLinesState.classList.add('d-none');

    currentOrder.lines.forEach((line, index) => {
      const card = document.createElement('div');
      card.className = 'card border-0 shadow-sm order-line-card';
      card.style.borderRadius = '12px';

      const body = document.createElement('div');
      body.className = 'card-body p-3 p-md-4';

      const row = document.createElement('div');
      row.className = 'row g-3 align-items-center';

      // 1. Sort & Template Info
      const colInfo = document.createElement('div');
      colInfo.className = 'col-12 col-md-4';

      const titleRow = document.createElement('div');
      titleRow.className = 'd-flex align-items-center gap-2 mb-1';

      const sortBadge = document.createElement('span');
      sortBadge.className = 'badge bg-secondary-subtle text-secondary border px-2 py-1 font-monospace';
      sortBadge.textContent = `#${line.sortOrder}`;
      titleRow.appendChild(sortBadge);

      const titleEl = document.createElement('h6');
      titleEl.className = 'fw-bold mb-0 text-dark';
      titleEl.textContent = line.template ? line.template.name : 'قالب غير معروف';
      titleRow.appendChild(titleEl);
      colInfo.appendChild(titleRow);

      const metaEl = document.createElement('div');
      metaEl.className = 'text-muted small font-monospace';
      metaEl.textContent = `الكود: ${line.template ? line.template.code : '—'}${line.template?.referenceNumber ? ' • المرجع: ' + line.template.referenceNumber : ''}`;
      colInfo.appendChild(metaEl);

      // Reorder buttons
      const reorderGroup = document.createElement('div');
      reorderGroup.className = 'btn-group btn-group-sm mt-2';

      const moveUpBtn = document.createElement('button');
      moveUpBtn.type = 'button';
      moveUpBtn.className = 'btn btn-outline-secondary py-0 px-2';
      moveUpBtn.innerHTML = '<i class="fa-solid fa-arrow-up"></i>';
      moveUpBtn.title = 'تحريك للأعلى';
      moveUpBtn.disabled = index === 0;
      moveUpBtn.addEventListener('click', () => moveLine(index, -1));
      reorderGroup.appendChild(moveUpBtn);

      const moveDownBtn = document.createElement('button');
      moveDownBtn.type = 'button';
      moveDownBtn.className = 'btn btn-outline-secondary py-0 px-2';
      moveDownBtn.innerHTML = '<i class="fa-solid fa-arrow-down"></i>';
      moveDownBtn.title = 'تحريك للأسفل';
      moveDownBtn.disabled = index === currentOrder.lines.length - 1;
      moveDownBtn.addEventListener('click', () => moveLine(index, 1));
      reorderGroup.appendChild(moveDownBtn);

      colInfo.appendChild(reorderGroup);
      row.appendChild(colInfo);

      // 2. Quantity Input & Save
      const colQty = document.createElement('div');
      colQty.className = 'col-6 col-md-2';

      const qtyLabel = document.createElement('label');
      qtyLabel.className = 'form-label small fw-bold text-muted mb-1';
      qtyLabel.textContent = 'الكمية (1..10000)';
      colQty.appendChild(qtyLabel);

      const qtyInputGroup = document.createElement('div');
      qtyInputGroup.className = 'input-group input-group-sm';

      const qtyInput = document.createElement('input');
      qtyInput.type = 'number';
      qtyInput.className = 'form-control font-monospace';
      qtyInput.min = '1';
      qtyInput.max = '10000';
      qtyInput.step = '1';
      qtyInput.value = String(line.quantity);

      const qtySaveBtn = document.createElement('button');
      qtySaveBtn.type = 'button';
      qtySaveBtn.className = 'btn btn-outline-primary';
      qtySaveBtn.innerHTML = '<i class="fa-solid fa-save"></i>';
      qtySaveBtn.title = 'حفظ الكمية';

      qtySaveBtn.addEventListener('click', async () => {
        const val = parseInt(qtyInput.value, 10);
        if (isNaN(val) || val < 1 || val > 10000) {
          showOrderAlert('الكمية يجب أن تكون عدداً صحيحاً بين 1 و 10,000');
          return;
        }
        try {
          const res = await window.erpFetch(`/api/production/orders/${orderId}/lines/${line.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity: val }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json.message || 'فشل تحديث الكمية');
          await refreshOrder();
        } catch (err) {
          showOrderAlert(err.message || 'تعذر تحديث الكمية');
        }
      });

      qtyInputGroup.appendChild(qtyInput);
      qtyInputGroup.appendChild(qtySaveBtn);
      colQty.appendChild(qtyInputGroup);
      row.appendChild(colQty);

      // 3. Pattern Option Selects
      const colPatterns = document.createElement('div');
      colPatterns.className = 'col-12 col-md-4';

      if (!line.patternSelections || line.patternSelections.length === 0) {
        const noPat = document.createElement('div');
        noPat.className = 'text-muted small';
        noPat.textContent = 'قالب بدون أنماط اختيارية';
        colPatterns.appendChild(noPat);
      } else {
        const patRow = document.createElement('div');
        patRow.className = 'd-flex flex-column gap-2';

        line.patternSelections.forEach((sel) => {
          const patItem = document.createElement('div');

          const patLabel = document.createElement('label');
          patLabel.className = 'form-label small fw-bold text-muted mb-0';
          patLabel.textContent = sel.patternName;
          patItem.appendChild(patLabel);

          const select = document.createElement('select');
          select.className = 'form-select form-select-sm';
          select.dataset.lineId = line.id;
          select.dataset.patternId = sel.templatePatternId;
          select.dataset.previousVal = sel.selectedOptionId;

          // Populate available options if available, or fallback to current option
          const opts = sel.availableOptions && sel.availableOptions.length > 0
            ? sel.availableOptions
            : [{ id: sel.selectedOptionId, name: sel.selectedOptionName }];

          opts.forEach((opt) => {
            const optEl = document.createElement('option');
            optEl.value = opt.id;
            optEl.textContent = opt.name;
            if (opt.id === sel.selectedOptionId) optEl.selected = true;
            select.appendChild(optEl);
          });

          // Handle Option Change with Rollback on Collision
          select.addEventListener('change', async () => {
            const newOptionId = select.value;
            const prevOptionId = select.dataset.previousVal;

            if (newOptionId === prevOptionId) return;

            try {
              clearOrderAlert();
              const res = await window.erpFetch(
                `/api/production/orders/${orderId}/lines/${line.id}/patterns/${sel.templatePatternId}`,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ optionId: newOptionId }),
                }
              );

              const json = await res.json();
              if (!res.ok || !json.success) {
                // Restore previous selection in UI
                select.value = prevOptionId;
                throw new Error(json.message || 'فشل تغيير خيار النمط');
              }

              // Update stored previous value and refresh
              select.dataset.previousVal = newOptionId;
              await refreshOrder();
            } catch (err) {
              select.value = prevOptionId;
              showOrderAlert(err.message || 'تعذر تعديل خيار النمط نظراً لوجود تعارض في التركيبة');
            }
          });

          patItem.appendChild(select);
          patRow.appendChild(patItem);
        });

        colPatterns.appendChild(patRow);
      }
      row.appendChild(colPatterns);

      // 4. Line Actions: Sync & Archive
      const colActions = document.createElement('div');
      colActions.className = 'col-12 col-md-2 text-md-end d-flex d-md-block gap-2';

      const syncBtn = document.createElement('button');
      syncBtn.type = 'button';
      syncBtn.className = 'btn btn-sm btn-outline-secondary w-100 mb-1 d-inline-flex align-items-center justify-content-center gap-1';
      syncBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> <span>مزامنة</span>';
      syncBtn.title = 'مزامنة الخيارات مع القالب الحي';
      syncBtn.addEventListener('click', async () => {
        try {
          clearOrderAlert();
          const res = await window.erpFetch(`/api/production/orders/${orderId}/lines/${line.id}/sync-template`, {
            method: 'POST',
          });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json.message || 'فشلت المزامنة مع القالب');
          await refreshOrder();
        } catch (err) {
          showOrderAlert(err.message || 'فشلت مزامنة البند مع القالب');
        }
      });
      colActions.appendChild(syncBtn);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-sm btn-outline-danger w-100 d-inline-flex align-items-center justify-content-center gap-1';
      delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> <span>أرشفة</span>';
      delBtn.title = 'أرشفة هذا البند';
      delBtn.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من رغبتك في أرشفة هذا البند؟')) return;
        try {
          clearOrderAlert();
          const res = await window.erpFetch(`/api/production/orders/${orderId}/lines/${line.id}`, {
            method: 'DELETE',
          });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(json.message || 'فشل حذف البند');
          await refreshOrder();
        } catch (err) {
          showOrderAlert(err.message || 'تعذر أرشفة البند');
        }
      });
      colActions.appendChild(delBtn);

      row.appendChild(colActions);

      body.appendChild(row);
      card.appendChild(body);
      orderLinesContainer.appendChild(card);
    });
  }

  // =========================================================================
  // Reorder Lines
  // =========================================================================
  async function moveLine(index, delta) {
    if (!currentOrder || !currentOrder.lines) return;
    const targetIndex = index + delta;
    if (targetIndex < 0 || targetIndex >= currentOrder.lines.length) return;

    const newLines = [...currentOrder.lines];
    const [moved] = newLines.splice(index, 1);
    newLines.splice(targetIndex, 0, moved);

    const lineIds = newLines.map((l) => l.id);

    try {
      clearOrderAlert();
      const res = await window.erpFetch(`/api/production/orders/${orderId}/lines/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineIds }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'فشل إعادة الترتيب');
      await refreshOrder();
    } catch (err) {
      showOrderAlert(err.message || 'تعذر إعادة ترتيب البنود');
    }
  }

  // =========================================================================
  // Refresh Order & Readiness State
  // =========================================================================
  async function refreshOrder() {
    try {
      const res = await window.erpFetch(`/api/production/orders/${orderId}`);
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'تعذر جلب بيانات الطلب');

      currentOrder = json.data;

      // Update Header KPI Metrics
      if (headerLineCount) headerLineCount.textContent = String(currentOrder.summary.lineCount);
      if (headerTotalQuantity) headerTotalQuantity.textContent = String(currentOrder.summary.totalQuantity);
      if (orderDescriptionText) orderDescriptionText.textContent = currentOrder.description || 'لا يوجد وصف محدد لهذا الطلب.';
      if (orderNotesBox) {
        if (currentOrder.notes) {
          orderNotesBox.classList.remove('d-none');
          orderNotesBox.innerHTML = `<i class="fa-solid fa-note-sticky me-1 text-secondary"></i> <strong>ملاحظات:</strong> ${currentOrder.notes}`;
        } else {
          orderNotesBox.classList.add('d-none');
        }
      }

      renderOrderLines();
      await fetchReadiness();
      checkComposerDuplicate();
    } catch (err) {
      showOrderAlert(err.message || 'حدث خطأ أثناء تحديث بيانات الطلب');
    }
  }

  async function fetchReadiness() {
    try {
      const res = await window.erpFetch(`/api/production/orders/${orderId}/release-readiness`);
      const json = await res.json();
      if (!res.ok || !json.success) return;

      const readiness = json.data;
      readinessStatusBadge.innerHTML = '';

      if (readiness.ready) {
        const badge = document.createElement('span');
        badge.className = 'badge bg-success-subtle text-success border border-success-subtle px-2 py-1';
        badge.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i> جاهز للإطلاق';
        readinessStatusBadge.appendChild(badge);
        readinessPanel.classList.add('d-none');
      } else {
        const badge = document.createElement('span');
        badge.className = 'badge bg-warning-subtle text-warning-emphasis border border-warning-subtle px-2 py-1';
        badge.innerHTML = `<i class="fa-solid fa-triangle-exclamation me-1"></i> بانتظار استكمال الجاهزية (${readiness.issues.length})`;
        readinessStatusBadge.appendChild(badge);

        readinessIssuesList.innerHTML = '';
        readiness.issues.forEach((issue) => {
          const li = document.createElement('li');
          li.className = 'small text-danger mb-1';
          li.textContent = issue.message;
          readinessIssuesList.appendChild(li);
        });

        readinessPanel.classList.remove('d-none');
      }
    } catch (err) {
      console.warn('Failed to fetch readiness status:', err);
    }
  }

  // =========================================================================
  // Header Edit Modal Handlers
  // =========================================================================
  if (editHeaderBtn) {
    editHeaderBtn.addEventListener('click', () => {
      editDescriptionInput.value = currentOrder.description || '';
      editNotesInput.value = currentOrder.notes || '';
      editHeaderAlert.classList.add('d-none');
      editHeaderModal.show();
    });
  }

  if (editHeaderForm) {
    editHeaderForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      confirmEditHeaderBtn.disabled = true;
      confirmEditHeaderBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> جاري الحفظ...';

      try {
        const res = await window.erpFetch(`/api/production/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: editDescriptionInput.value.trim() || null,
            notes: editNotesInput.value.trim() || null,
          }),
        });

        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'فشل تحديث البيانات');

        editHeaderModal.hide();
        await refreshOrder();
      } catch (err) {
        editHeaderAlert.textContent = err.message || 'تعذر حفظ التعديلات';
        editHeaderAlert.classList.remove('d-none');
      } finally {
        confirmEditHeaderBtn.disabled = false;
        confirmEditHeaderBtn.textContent = 'حفظ التعديلات';
      }
    });
  }

  // =========================================================================
  // Archive Order Modal Handlers
  // =========================================================================
  if (archiveOrderBtn && archiveOrderModal) {
    archiveOrderBtn.addEventListener('click', () => {
      archiveOrderModal.show();
    });
  }

  if (confirmArchiveOrderBtn) {
    confirmArchiveOrderBtn.addEventListener('click', async () => {
      confirmArchiveOrderBtn.disabled = true;
      confirmArchiveOrderBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> جاري الأرشفة...';

      try {
        const res = await window.erpFetch(`/api/production/orders/${orderId}`, {
          method: 'DELETE',
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error(json.message || 'فشلت أرشفة الطلب');

        window.location.href = '/production/orders';
      } catch (err) {
        showOrderAlert(err.message || 'تعذر أرشفة الطلب');
        archiveOrderModal.hide();
      } finally {
        confirmArchiveOrderBtn.disabled = false;
        confirmArchiveOrderBtn.textContent = 'أرشفة';
      }
    });
  }

  // =========================================================================
  // Event Listeners - Search & Load More
  // =========================================================================
  templateSearchInput.addEventListener('input', (e) => {
    clearTimeout(templateSearchDebounceTimer);
    templateSearchDebounceTimer = setTimeout(() => {
      templateSearchTerm = e.target.value.trim();
      fetchTemplates(false);
    }, 300);
  });

  templateLoadMoreBtn.addEventListener('click', () => {
    if (templateCurrentPage < templateTotalPages) {
      templateCurrentPage++;
      fetchTemplates(true);
    }
  });

  resetSelectedTemplateBtn.addEventListener('click', () => {
    resetComposerSelection();
  });

  if (recheckReadinessBtn) {
    recheckReadinessBtn.addEventListener('click', () => {
      fetchReadiness();
    });
  }

  // Initial Boot
  fetchTemplates(false);
  renderOrderLines();
  fetchReadiness();
});
