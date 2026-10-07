/**
 * Production Order Draft Editor Workspace
 *
 * Implements:
 * 1. Search-first template picker: NO initial fetch on boot, debounced (300ms) query search,
 *    monotonic race protection counter, results displayed directly below search input.
 * 2. Client-side Pending Lines: Selecting template stages a pending line with quantity
 *    and pattern configuration; multiple pending lines supported.
 * 3. Client duplicate detection: Validates unique configurations against currentOrder.lines
 *    and across all pendingLines (canonical key: templateId + sorted pattern:option).
 * 4. Atomic Batch Addition: All valid pending lines are submitted via POST /lines/batch.
 * 5. SweetAlert2 Invariants: Zero native window dialogs; all actions use Swal dialogs and toasts.
 * 6. Navigation protection when unsaved pending lines exist.
 * 7. DOM XSS security: Native DOM APIs and textContent exclusively for user and API text.
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

  // 2. Monotonic Sequence Counters (NEVER reset to zero)
  let templatePickerRequestSeq = 0;
  let templateConfigurationRequestSeq = 0;

  // Search State
  let templateSearchTerm = '';
  let templateCurrentPage = 1;
  let templateTotalPages = 1;
  let templateSearchDebounceTimer = null;
  const loadedTemplateIds = new Set();

  // Pending Lines State (Client-Side Staging)
  // Each item: { localId, template: { id, name, code, referenceNumber }, quantity, patterns: [{ patternId, patternName, selectedOptionId, availableOptions }] }
  let pendingLines = [];

  // DOM Elements - Workspace & Summary
  const orderAlert = document.getElementById('orderAlert');
  const readinessStatusBadge = document.getElementById('readinessStatusBadge');
  const readinessPanel = document.getElementById('readinessPanel');
  const readinessIssuesList = document.getElementById('readinessIssuesList');
  const recheckReadinessBtn = document.getElementById('recheckReadinessBtn');
  const headerLineCount = document.getElementById('headerLineCount');
  const headerTotalQuantity = document.getElementById('headerTotalQuantity');
  const orderDescriptionText = document.getElementById('orderDescriptionText');
  const orderNotesBox = document.getElementById('orderNotesBox');
  const existingLinesCountBadge = document.getElementById('existingLinesCountBadge');
  const orderLinesContainer = document.getElementById('orderLinesContainer');
  const emptyLinesState = document.getElementById('emptyLinesState');

  // DOM Elements - Search-First Composer
  const templateSearchInput = document.getElementById('templateSearchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const searchResultsWrapper = document.getElementById('searchResultsWrapper');
  const searchResultsList = document.getElementById('searchResultsList');
  const templateLoadMoreBtn = document.getElementById('templateLoadMoreBtn');
  const composerAlert = document.getElementById('composerAlert');

  // DOM Elements - Pending Lines Section
  const pendingLinesSection = document.getElementById('pendingLinesSection');
  const pendingLinesContainer = document.getElementById('pendingLinesContainer');
  const pendingLinesCountBadge = document.getElementById('pendingLinesCountBadge');
  const submitPendingLinesBtn = document.getElementById('submitPendingLinesBtn');
  const submitPendingLinesBtnText = document.getElementById('submitPendingLinesBtnText');
  const submitPendingSpinner = document.getElementById('submitPendingSpinner');
  const submitPendingIcon = document.getElementById('submitPendingIcon');

  // DOM Elements - Navigation & Actions
  const viewOrderNavBtn = document.getElementById('viewOrderNavBtn');
  const backToListNavBtn = document.getElementById('backToListNavBtn');
  const archiveOrderBtn = document.getElementById('archiveOrderBtn');

  // DOM Elements - Edit Header Modal
  const editHeaderBtn = document.getElementById('editHeaderBtn');
  const editHeaderModalEl = document.getElementById('editHeaderModal');
  const editHeaderModal = editHeaderModalEl ? new bootstrap.Modal(editHeaderModalEl) : null;
  const editHeaderForm = document.getElementById('editHeaderForm');
  const editDescriptionInput = document.getElementById('editDescriptionInput');
  const editNotesInput = document.getElementById('editNotesInput');
  const editHeaderAlert = document.getElementById('editHeaderAlert');
  const confirmEditHeaderBtn = document.getElementById('confirmEditHeaderBtn');

  // =========================================================================
  // Helpers: API Error Extraction & Feedback
  // =========================================================================
  function getErrorMessage(json, fallback) {
    if (typeof window.extractApiErrorMessage === 'function') {
      return window.extractApiErrorMessage(json, fallback);
    }
    return (json && json.message) || fallback || 'حدث خطأ غير متوقع';
  }

  function showSuccessToast(message) {
    if (typeof Swal !== 'undefined') {
      Swal.mixin({
        toast: true,
        position: 'top-start',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
      }).fire({
        icon: 'success',
        title: message,
      });
    }
  }

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
  // Canonical Key & Duplication Rules
  // Key format: templateId + '|' + sorted(patternId:optionId). Quantity is NOT part of key.
  // =========================================================================
  function canonicalizeConfiguration(templateId, selections) {
    if (!selections || selections.length === 0) {
      return templateId;
    }
    const sorted = [...selections].sort((a, b) => a.patternId.localeCompare(b.patternId));
    const parts = sorted.map((s) => `${s.patternId}:${s.optionId}`);
    return `${templateId}|${parts.join('|')}`;
  }

  /**
   * Evaluates all pending lines for validity and duplicates.
   * Compares each against:
   * 1. currentOrder.lines
   * 2. other pendingLines
   * Returns true if all pending lines are valid and can be submitted.
   */
  function evaluatePendingLines() {
    if (pendingLines.length === 0) {
      return false;
    }

    let allValid = true;

    // Track keys across pending lines to detect intra-pending collisions
    const pendingKeyMap = new Map(); // key -> array of line localIds

    pendingLines.forEach((line) => {
      line.validationErrors = [];

      // 1. Validate Quantity
      const q = line.quantity;
      if (typeof q !== 'number' || isNaN(q) || !Number.isInteger(q) || q < 1 || q > 10000) {
        line.validationErrors.push('الكمية يجب أن تكون عدداً صحيحاً بين 1 و 10,000.');
        allValid = false;
      }

      // 2. Validate Pattern Selections (every pattern must have a valid selected option)
      for (const pat of line.patterns) {
        if (!pat.availableOptions || pat.availableOptions.length === 0) {
          line.validationErrors.push(`النمط "${pat.patternName}" لا يحتوي على خيارات فعالة. يجب تحديث القالب قبل استخدامه في أمر الإنتاج.`);
          allValid = false;
        } else if (!pat.selectedOptionId) {
          line.validationErrors.push(`يرجى تحديد خيار للنمط "${pat.patternName}".`);
          allValid = false;
        }
      }

      // 3. Compute Canonical Key
      const selections = line.patterns.map((p) => ({
        patternId: p.patternId,
        optionId: p.selectedOptionId,
      }));
      const lineKey = canonicalizeConfiguration(line.template.id, selections);
      line.canonicalKey = lineKey;

      // 4. Collision check against existing active lines in currentOrder
      if (currentOrder && currentOrder.lines) {
        for (const existingLine of currentOrder.lines) {
          const existingSelections = (existingLine.patternSelections || []).map((s) => ({
            patternId: s.templatePatternId,
            optionId: s.selectedOptionId,
          }));
          const existingKey = canonicalizeConfiguration(existingLine.templateId, existingSelections);

          if (lineKey === existingKey) {
            line.validationErrors.push(
              `هذه التركيبة موجودة مسبقًا في البند #${existingLine.sortOrder}. عدّل كمية البند الموجود بدل إضافتها مرة أخرى.`
            );
            allValid = false;
            break;
          }
        }
      }

      // Group by canonical key for intra-pending duplicate detection
      if (!pendingKeyMap.has(lineKey)) {
        pendingKeyMap.set(lineKey, []);
      }
      pendingKeyMap.get(lineKey).push(line.localId);
    });

    // 5. Intra-pending duplicates check
    pendingKeyMap.forEach((localIds) => {
      if (localIds.length > 1) {
        allValid = false;
        localIds.forEach((id) => {
          const item = pendingLines.find((l) => l.localId === id);
          if (item) {
            item.validationErrors.push('هذه التركيبة مكررة ضمن البنود غير المحفوظة.');
          }
        });
      }
    });

    return allValid;
  }

  // =========================================================================
  // Search-First Composer: Fetch Templates with Race Protection
  // =========================================================================
  async function executeTemplateSearch(isLoadMore = false) {
    const seq = ++templatePickerRequestSeq;
    const requestedPage = isLoadMore ? templateCurrentPage + 1 : 1;

    clearComposerAlert();

    if (!isLoadMore) {
      templateCurrentPage = 1;
      loadedTemplateIds.clear();
      searchResultsList.replaceChildren();

      const loader = document.createElement('div');
      loader.className = 'text-center py-3 text-muted small';
      loader.innerHTML = '<div class="spinner-border spinner-border-sm me-1 text-primary"></div> جاري البحث...';
      searchResultsList.appendChild(loader);
      searchResultsWrapper.classList.remove('d-none');
    } else {
      templateLoadMoreBtn.disabled = true;
      templateLoadMoreBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> جاري التحميل...';
    }

    try {
      const url = new URL('/api/production/templates/reference-options', window.location.origin);
      url.searchParams.set('page', String(requestedPage));
      url.searchParams.set('limit', '20');
      if (templateSearchTerm) {
        url.searchParams.set('search', templateSearchTerm);
      }

      const res = await window.erpFetch(url.pathname + url.search);
      const json = await res.json();

      // Discard stale out-of-order responses
      if (seq !== templatePickerRequestSeq) return;

      if (!res.ok || !json.success || !json.data) {
        throw new Error(getErrorMessage(json, 'تعذر جلب نتائج البحث'));
      }

      const { items, page, totalPages } = json.data;

      if (!Array.isArray(items) || typeof page !== 'number' || typeof totalPages !== 'number') {
        throw new Error('بيانات استجابة القوالب غير صالحة من الخادم');
      }

      templateCurrentPage = page;
      templateTotalPages = totalPages;

      if (!isLoadMore) {
        searchResultsList.replaceChildren();
      }

      if (items.length === 0 && templateCurrentPage === 1) {
        const emptyEl = document.createElement('div');
        emptyEl.className = 'text-center py-3 text-muted small';
        emptyEl.textContent = 'لم يتم العثور على قوالب تطابق البحث.';
        searchResultsList.appendChild(emptyEl);
        templateLoadMoreBtn.classList.add('d-none');
        return;
      }

      items.forEach((tmpl) => {
        if (loadedTemplateIds.has(tmpl.id)) return;
        loadedTemplateIds.add(tmpl.id);

        // Keyboard accessible button for each result item
        const resultBtn = document.createElement('button');
        resultBtn.type = 'button';
        resultBtn.className = 'list-group-item list-group-item-action search-result-btn d-flex justify-content-between align-items-center';

        const infoDiv = document.createElement('div');
        const nameEl = document.createElement('div');
        nameEl.className = 'fw-bold text-dark small';
        nameEl.textContent = tmpl.name;
        infoDiv.appendChild(nameEl);

        const metaEl = document.createElement('div');
        metaEl.className = 'text-muted small font-monospace';
        metaEl.textContent = `${tmpl.code}${tmpl.referenceNumber ? ' • المرجع: ' + tmpl.referenceNumber : ''}`;
        infoDiv.appendChild(metaEl);

        const chevron = document.createElement('i');
        chevron.className = 'fa-solid fa-chevron-left text-muted small';

        resultBtn.appendChild(infoDiv);
        resultBtn.appendChild(chevron);

        resultBtn.addEventListener('click', () => {
          onSelectTemplateFromSearch(tmpl);
        });

        searchResultsList.appendChild(resultBtn);
      });

      // Update Load More Button visibility
      if (templateCurrentPage < templateTotalPages) {
        templateLoadMoreBtn.classList.remove('d-none');
        templateLoadMoreBtn.disabled = false;
        templateLoadMoreBtn.innerHTML = '<i class="fa-solid fa-arrow-down me-1"></i> تحميل المزيد';
      } else {
        templateLoadMoreBtn.classList.add('d-none');
      }
    } catch (err) {
      if (seq !== templatePickerRequestSeq) return;

      if (!isLoadMore) {
        searchResultsList.replaceChildren();
        const errorEl = document.createElement('div');
        errorEl.className = 'text-center py-2 text-danger small';
        errorEl.textContent = err.message || 'حدث خطأ أثناء البحث';
        searchResultsList.appendChild(errorEl);
        templateLoadMoreBtn.classList.add('d-none');
      } else {
        templateLoadMoreBtn.disabled = false;
        templateLoadMoreBtn.innerHTML = '<i class="fa-solid fa-arrow-down me-1"></i> تحميل المزيد';
        showComposerAlert(err.message || 'تعذر تحميل المزيد من النتائج');
      }
    }
  }

  /**
   * User clicks a search result:
   * 1. Fetch order configuration for the template.
   * 2. Clear search input and hide search results.
   * 3. Add client-side Pending Line.
   * 4. Does NOT call POST /lines.
   */
  async function onSelectTemplateFromSearch(tmpl) {
    const configSeq = ++templateConfigurationRequestSeq;

    // Clear search UI immediately
    templateSearchInput.value = '';
    templateSearchTerm = '';
    clearSearchBtn.classList.add('d-none');
    searchResultsWrapper.classList.add('d-none');
    searchResultsList.replaceChildren();

    try {
      const res = await window.erpFetch(`/api/production/templates/${tmpl.id}/order-configuration`);
      const json = await res.json();

      if (configSeq !== templateConfigurationRequestSeq) return;

      if (!res.ok || !json.success) {
        throw new Error(getErrorMessage(json, 'تعذر جلب إعدادات القالب'));
      }

      const config = json.data;

      // Build Pending Line object
      const newPendingLine = {
        localId: 'pending_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        template: {
          id: tmpl.id,
          name: tmpl.name,
          code: tmpl.code,
          referenceNumber: tmpl.referenceNumber || null,
        },
        quantity: 1,
        patterns: (config.patterns || []).map((pat) => ({
          patternId: pat.id,
          patternName: pat.name,
          selectedOptionId:
            pat.defaultOptionId || (pat.options && pat.options.length > 0 ? pat.options[0].id : null),
          availableOptions: pat.options || [],
        })),
        validationErrors: [],
      };

      pendingLines.push(newPendingLine);
      renderPendingLines();

      // Scroll to pending lines section smoothly
      pendingLinesSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (err) {
      if (configSeq !== templateConfigurationRequestSeq) return;
      showComposerAlert(err.message || 'فشل تحميل إعدادات القالب المختار');
    }
  }

  // =========================================================================
  // Pending Lines: Render & Interactions
  // =========================================================================
  // =========================================================================
  // Pending Lines: Render & Interactions (Directly under search)
  // =========================================================================
  function renderPendingLines() {
    const isValid = evaluatePendingLines();

    if (pendingLines.length === 0) {
      pendingLinesSection.classList.add('d-none');
      pendingLinesContainer.replaceChildren();
      submitPendingLinesBtn.disabled = true;
      submitPendingLinesBtnText.textContent = 'حفظ جميع البنود الجديدة (0)';
      if (!currentOrder.lines || currentOrder.lines.length === 0) {
        emptyLinesState.classList.remove('d-none');
      }
      return;
    }

    emptyLinesState.classList.add('d-none');
    pendingLinesSection.classList.remove('d-none');
    pendingLinesCountBadge.textContent = `${pendingLines.length} بند`;
    submitPendingLinesBtnText.textContent = `حفظ جميع البنود الجديدة (${pendingLines.length})`;
    submitPendingLinesBtn.disabled = !isValid;

    pendingLinesContainer.replaceChildren();

    pendingLines.forEach((line, index) => {
      const card = document.createElement('div');
      const hasErrors = line.validationErrors && line.validationErrors.length > 0;
      card.className = `card pending-line-card ${hasErrors ? 'is-invalid' : ''}`;

      // 1. Header with Template Info, Save Button, and [X] Remove Button
      const header = document.createElement('div');
      header.className = 'pending-line-header d-flex justify-content-between align-items-center flex-wrap gap-2';

      const headerInfo = document.createElement('div');
      headerInfo.className = 'd-flex align-items-center gap-2 flex-wrap';

      const badge = document.createElement('span');
      badge.className = 'badge bg-primary text-white px-2 py-1 rounded-pill small';
      badge.innerHTML = `<i class="fa-solid fa-sparkles me-1"></i> بند جديد #${index + 1}`;
      headerInfo.appendChild(badge);

      const title = document.createElement('h6');
      title.className = 'fw-bold mb-0 text-dark';
      title.textContent = line.template.name;
      headerInfo.appendChild(title);

      const meta = document.createElement('span');
      meta.className = 'text-muted small font-monospace';
      meta.textContent = `${line.template.code}${line.template.referenceNumber ? ' • المرجع: ' + line.template.referenceNumber : ''}`;
      headerInfo.appendChild(meta);

      header.appendChild(headerInfo);

      // Header Actions: Direct Save Button + Discard [X] Button
      const headerActions = document.createElement('div');
      headerActions.className = 'd-flex align-items-center gap-2';

      const addSingleBtn = document.createElement('button');
      addSingleBtn.type = 'button';
      addSingleBtn.className = 'btn btn-sm production-theme-btn py-1 px-3 d-inline-flex align-items-center gap-1 shadow-sm';
      addSingleBtn.innerHTML = '<i class="fa-solid fa-plus"></i> <span>إضافة إلى الطلب</span>';
      addSingleBtn.disabled = hasErrors;

      addSingleBtn.addEventListener('click', async () => {
        if (line.validationErrors && line.validationErrors.length > 0) return;
        addSingleBtn.disabled = true;
        addSingleBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> جاري الإضافة...';

        try {
          const res = await window.erpFetch(`/api/production/orders/${orderId}/lines`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              templateId: line.template.id,
              quantity: line.quantity,
              patternSelections: line.patterns.map((p) => ({
                patternId: p.patternId,
                optionId: p.selectedOptionId,
              })),
            }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) {
            throw new Error(getErrorMessage(json, 'فشل إضافة بند الإنتاج'));
          }

          pendingLines = pendingLines.filter((l) => l.localId !== line.localId);
          renderPendingLines();
          await refreshOrder();
          showSuccessToast('تمت إضافة بند الإنتاج إلى الطلب بنجاح');
        } catch (err) {
          showComposerAlert(err.message || 'حدث خطأ أثناء إضافة البند');
          addSingleBtn.disabled = false;
          addSingleBtn.innerHTML = '<i class="fa-solid fa-plus"></i> <span>إضافة إلى الطلب</span>';
        }
      });

      headerActions.appendChild(addSingleBtn);

      // X Remove button (Client-side removal, NO confirmation, NO API call)
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn remove-pending-btn p-0';
      removeBtn.setAttribute('title', 'إلغاء هذا البند');
      removeBtn.setAttribute('aria-label', `إلغاء بند ${line.template.name}`);
      removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';
      removeBtn.addEventListener('click', () => {
        pendingLines = pendingLines.filter((l) => l.localId !== line.localId);
        renderPendingLines();
      });
      headerActions.appendChild(removeBtn);

      header.appendChild(headerActions);
      card.appendChild(header);

      // 2. Card Body
      const body = document.createElement('div');
      body.className = 'card-body p-3';

      const configRow = document.createElement('div');
      configRow.className = 'row g-3 align-items-end';

      // Quantity Column
      const qtyCol = document.createElement('div');
      qtyCol.className = 'col-12 col-md-3';

      const qtyLabel = document.createElement('label');
      qtyLabel.className = 'form-label fw-bold text-dark small mb-1';
      qtyLabel.textContent = 'الكمية المخططة:';
      qtyCol.appendChild(qtyLabel);

      const qtyInput = document.createElement('input');
      qtyInput.type = 'number';
      qtyInput.className = 'form-control form-control-sm font-monospace fs-6';
      qtyInput.min = '1';
      qtyInput.max = '10000';
      qtyInput.step = '1';
      qtyInput.value = String(line.quantity);

      qtyInput.addEventListener('input', (e) => {
        const parsed = parseInt(e.target.value, 10);
        line.quantity = isNaN(parsed) ? 0 : parsed;
        renderPendingLines();
      });

      qtyCol.appendChild(qtyInput);
      configRow.appendChild(qtyCol);

      // Patterns Column
      const patternsCol = document.createElement('div');
      patternsCol.className = 'col-12 col-md-9';

      if (!line.patterns || line.patterns.length === 0) {
        const noPat = document.createElement('div');
        noPat.className = 'p-2 rounded bg-light border text-muted small';
        noPat.textContent = 'لا يحتوي هذا القالب على أنماط اختيارية. يتم اعتماد القالب مباشرة بالكمية المحددة.';
        patternsCol.appendChild(noPat);
      } else {
        const patternsGrid = document.createElement('div');
        patternsGrid.className = 'row g-2';

        line.patterns.forEach((pat) => {
          const patCol = document.createElement('div');
          patCol.className = 'col-12 col-sm-6 col-lg-4';

          const patLabel = document.createElement('label');
          patLabel.className = 'form-label small fw-bold text-dark mb-1';
          patLabel.textContent = pat.patternName;
          patCol.appendChild(patLabel);

          if (!pat.availableOptions || pat.availableOptions.length === 0) {
            const noOpt = document.createElement('div');
            noOpt.className = 'text-danger small';
            noOpt.textContent = 'لا توجد خيارات فعالة.';
            patCol.appendChild(noOpt);
          } else {
            const select = document.createElement('select');
            select.className = 'form-select form-select-sm';

            pat.availableOptions.forEach((opt) => {
              const optEl = document.createElement('option');
              optEl.value = opt.id;
              optEl.textContent = opt.name;
              if (opt.id === pat.selectedOptionId) {
                optEl.selected = true;
              }
              select.appendChild(optEl);
            });

            select.addEventListener('change', (e) => {
              pat.selectedOptionId = e.target.value;
              renderPendingLines();
            });

            patCol.appendChild(select);
          }

          patternsGrid.appendChild(patCol);
        });

        patternsCol.appendChild(patternsGrid);
      }

      configRow.appendChild(patternsCol);
      body.appendChild(configRow);

      // 3. Validation Errors / Duplicate Notice
      if (hasErrors) {
        const alertBox = document.createElement('div');
        alertBox.className = 'alert alert-warning py-2 px-3 small mt-3 mb-0';
        alertBox.setAttribute('role', 'alert');

        line.validationErrors.forEach((errMsg) => {
          const item = document.createElement('div');
          item.className = 'd-flex align-items-center gap-2';
          const icon = document.createElement('i');
          icon.className = 'fa-solid fa-triangle-exclamation text-warning-emphasis';
          const text = document.createElement('span');
          text.textContent = errMsg;
          item.appendChild(icon);
          item.appendChild(text);
          alertBox.appendChild(item);
        });

        body.appendChild(alertBox);
      }

      card.appendChild(body);
      pendingLinesContainer.appendChild(card);
    });
  }

  // =========================================================================
  // Batch Add Submission (POST /lines/batch)
  // =========================================================================
  submitPendingLinesBtn.addEventListener('click', async () => {
    clearComposerAlert();
    clearOrderAlert();

    const isValid = evaluatePendingLines();
    if (!isValid || pendingLines.length === 0) {
      renderPendingLines();
      return;
    }

    const payloadLines = pendingLines.map((line) => ({
      templateId: line.template.id,
      quantity: line.quantity,
      patternSelections: line.patterns.map((p) => ({
        patternId: p.patternId,
        optionId: p.selectedOptionId,
      })),
    }));

    const count = payloadLines.length;

    submitPendingLinesBtn.disabled = true;
    submitPendingSpinner.classList.remove('d-none');
    submitPendingIcon.classList.add('d-none');
    submitPendingLinesBtnText.textContent = 'جاري الإضافة...';

    try {
      const res = await window.erpFetch(`/api/production/orders/${orderId}/lines/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines: payloadLines }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(getErrorMessage(json, 'فشل إضافة بنود الإنتاج'));
      }

      // Success: Clear pending lines state & refresh order
      pendingLines = [];
      renderPendingLines();
      await refreshOrder();

      showSuccessToast(`تمت إضافة ${count} بنود إلى أمر الإنتاج بنجاح`);
    } catch (err) {
      showComposerAlert(err.message || 'حدث خطأ أثناء إضافة البنود');
      // Keep pendingLines intact so user doesn't lose their input
      renderPendingLines();
    } finally {
      submitPendingSpinner.classList.add('d-none');
      submitPendingIcon.classList.remove('d-none');
      evaluatePendingLines();
      submitPendingLinesBtnText.textContent = `حفظ جميع البنود الجديدة (${pendingLines.length})`;
    }
  });

  // =========================================================================
  // Existing Lines Section: Render & Actions
  // =========================================================================
  function renderOrderLines() {
    orderLinesContainer.replaceChildren();

    const activeCount = currentOrder.lines ? currentOrder.lines.length : 0;
    if (existingLinesCountBadge) {
      existingLinesCountBadge.textContent = `${activeCount} بند`;
    }

    if (!currentOrder.lines || currentOrder.lines.length === 0) {
      if (pendingLines.length === 0) {
        emptyLinesState.classList.remove('d-none');
      } else {
        emptyLinesState.classList.add('d-none');
      }
      return;
    }

    emptyLinesState.classList.add('d-none');

    currentOrder.lines.forEach((line, index) => {
      const card = document.createElement('div');
      card.className = 'card existing-line-card';

      const body = document.createElement('div');
      body.className = 'card-body p-3 p-md-4';

      const row = document.createElement('div');
      row.className = 'row g-3 align-items-center';

      // 1. Sort Order & Template Info
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

      // Reorder buttons [↑] [↓]
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

      // 2. Quantity Input & Explicit Save Button [💾]
      const colQty = document.createElement('div');
      colQty.className = 'col-6 col-md-2';

      const qtyLabel = document.createElement('label');
      qtyLabel.className = 'form-label small fw-bold text-muted mb-1';
      qtyLabel.textContent = 'الكمية:';
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
      qtySaveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i>';
      qtySaveBtn.title = 'حفظ الكمية';

      qtySaveBtn.addEventListener('click', async () => {
        const val = parseInt(qtyInput.value, 10);
        if (isNaN(val) || val < 1 || val > 10000) {
          showOrderAlert('الكمية يجب أن تكون عدداً صحيحاً بين 1 و 10,000');
          return;
        }

        qtySaveBtn.disabled = true;
        try {
          const res = await window.erpFetch(`/api/production/orders/${orderId}/lines/${line.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ quantity: val }),
          });
          const json = await res.json();
          if (!res.ok || !json.success) throw new Error(getErrorMessage(json, 'فشل تحديث الكمية'));

          showSuccessToast('تم تحديث الكمية بنجاح');
          await refreshOrder();
        } catch (err) {
          showOrderAlert(err.message || 'تعذر تحديث الكمية');
        } finally {
          qtySaveBtn.disabled = false;
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
        const noPat = document.createElement('span');
        noPat.className = 'badge bg-secondary-subtle text-secondary px-2 py-1 rounded-pill';
        noPat.textContent = 'بدون أنماط اختيارية';
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

          const opts =
            sel.availableOptions && sel.availableOptions.length > 0
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

            select.disabled = true;

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
                const errCode = (json && json.code) || '';
                if (errCode === 'PRODUCTION_ORDER_LINE_DUPLICATE_CONFIGURATION') {
                  throw new Error('لا يمكن استخدام هذه الخيارات لأن هناك بندًا آخر بنفس القالب والتركيبة.');
                }
                throw new Error(getErrorMessage(json, 'فشل تغيير خيار النمط'));
              }

              select.dataset.previousVal = newOptionId;
              showSuccessToast('تم تعديل خيار النمط بنجاح');
              await refreshOrder();
            } catch (err) {
              select.value = prevOptionId;
              showOrderAlert(err.message || 'تعذر تعديل خيار النمط');
            } finally {
              select.disabled = false;
            }
          });

          patItem.appendChild(select);
          patRow.appendChild(patItem);
        });

        colPatterns.appendChild(patRow);
      }
      row.appendChild(colPatterns);

      // 4. Line Actions: Sync & Archive (SweetAlert2)
      const colActions = document.createElement('div');
      colActions.className = 'col-12 col-md-2 text-md-end d-flex d-md-block gap-2';

      // Sync button
      const syncBtn = document.createElement('button');
      syncBtn.type = 'button';
      syncBtn.className = 'btn btn-sm btn-outline-secondary w-100 mb-1 d-inline-flex align-items-center justify-content-center gap-1';
      syncBtn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i> <span>مزامنة</span>';
      syncBtn.title = 'مزامنة الخيارات مع القالب الحي';

      syncBtn.addEventListener('click', () => {
        Swal.fire({
          title: 'مزامنة البند مع القالب',
          text: 'قد تؤدي المزامنة إلى استبدال خيارات لم تعد فعالة أو إزالة أنماط لم تعد موجودة في القالب. هل تريد المتابعة؟',
          icon: 'question',
          showCancelButton: true,
          confirmButtonColor: '#0984E3',
          cancelButtonColor: '#6B7280',
          confirmButtonText: 'نعم، مزامنة',
          cancelButtonText: 'إلغاء',
        }).then(async (result) => {
          if (result.isConfirmed) {
            try {
              clearOrderAlert();
              const res = await window.erpFetch(`/api/production/orders/${orderId}/lines/${line.id}/sync-template`, {
                method: 'POST',
              });
              const json = await res.json();
              if (!res.ok || !json.success) throw new Error(getErrorMessage(json, 'فشلت المزامنة مع القالب'));

              showSuccessToast('تمت مزامنة البند بنجاح');
              await refreshOrder();
            } catch (err) {
              showOrderAlert(err.message || 'فشلت مزامنة البند مع القالب');
            }
          }
        });
      });
      colActions.appendChild(syncBtn);

      // Archive Line button
      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn btn-sm btn-outline-danger w-100 d-inline-flex align-items-center justify-content-center gap-1';
      delBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> <span>أرشفة</span>';
      delBtn.title = 'أرشفة هذا البند';

      delBtn.addEventListener('click', () => {
        const lineTitle = `#${line.sortOrder} - ${line.template ? line.template.name : 'قالب'}`;
        Swal.fire({
          title: 'أرشفة بند الإنتاج',
          text: `هل أنت متأكد من أرشفة البند "${lineTitle}"؟ سيتم إزالته من البنود النشطة، ويمكن استخدام نفس التركيبة لاحقًا.`,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#EE5253',
          cancelButtonColor: '#6B7280',
          confirmButtonText: 'نعم، أرشفة',
          cancelButtonText: 'إلغاء',
        }).then(async (result) => {
          if (result.isConfirmed) {
            try {
              clearOrderAlert();
              const res = await window.erpFetch(`/api/production/orders/${orderId}/lines/${line.id}`, {
                method: 'DELETE',
              });
              const json = await res.json();
              if (!res.ok || !json.success) throw new Error(getErrorMessage(json, 'فشل أرشفة البند'));

              showSuccessToast('تمت أرشفة البند بنجاح');
              await refreshOrder();
            } catch (err) {
              showOrderAlert(err.message || 'تعذر أرشفة البند');
            }
          }
        });
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
      if (!res.ok || !json.success) throw new Error(getErrorMessage(json, 'فشل إعادة الترتيب'));

      showSuccessToast('تم إعادة ترتيب البنود بنجاح');
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
      if (!res.ok || !json.success) throw new Error(getErrorMessage(json, 'تعذر جلب بيانات الطلب'));

      currentOrder = json.data;

      // Update Header KPI Metrics
      if (headerLineCount) headerLineCount.textContent = String(currentOrder.summary.lineCount);
      if (headerTotalQuantity) headerTotalQuantity.textContent = String(currentOrder.summary.totalQuantity);
      if (orderDescriptionText) orderDescriptionText.textContent = currentOrder.description || 'لا يوجد وصف محدد لهذا الطلب.';
      if (orderNotesBox) {
        if (currentOrder.notes) {
          orderNotesBox.classList.remove('d-none');
          orderNotesBox.replaceChildren();

          const icon = document.createElement('i');
          icon.className = 'fa-solid fa-note-sticky me-1 text-secondary';
          const strong = document.createElement('strong');
          strong.textContent = 'ملاحظات:';
          const text = document.createTextNode(` ${currentOrder.notes}`);

          orderNotesBox.append(icon, strong, text);
        } else {
          orderNotesBox.classList.add('d-none');
          orderNotesBox.replaceChildren();
        }
      }

      renderOrderLines();
      await fetchReadiness();
      renderPendingLines();
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
      readinessStatusBadge.replaceChildren();

      if (readiness.ready) {
        const badge = document.createElement('span');
        badge.className = 'badge bg-success-subtle text-success px-2 py-1 rounded-pill small';

        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-circle-check me-1';

        badge.append(icon, document.createTextNode(' جاهز'));
        readinessStatusBadge.appendChild(badge);
        readinessPanel.classList.add('d-none');
      } else {
        const issueCount = Array.isArray(readiness.issues) ? readiness.issues.length : 0;
        const badge = document.createElement('span');
        badge.className = 'badge bg-warning-subtle text-warning-emphasis px-2 py-1 rounded-pill small';

        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-triangle-exclamation me-1';

        badge.append(icon, document.createTextNode(` بانتظار استكمال الجاهزية (${issueCount})`));
        readinessStatusBadge.appendChild(badge);

        readinessIssuesList.replaceChildren();
        (readiness.issues || []).forEach((issue) => {
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
  // Unsaved Pending Lines Guard for In-Page Navigation
  // =========================================================================
  function guardNavigation(e, targetUrl) {
    if (pendingLines.length > 0) {
      e.preventDefault();
      Swal.fire({
        title: 'لديك بنود غير محفوظة',
        text: 'سيتم فقدان البنود التي أعددتها ولم تضفها إلى الطلب. هل تريد المغادرة؟',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EE5253',
        cancelButtonColor: '#6B7280',
        confirmButtonText: 'متابعة المغادرة',
        cancelButtonText: 'البقاء',
      }).then((result) => {
        if (result.isConfirmed) {
          window.location.href = targetUrl;
        }
      });
    }
  }

  if (viewOrderNavBtn) {
    viewOrderNavBtn.addEventListener('click', (e) => {
      guardNavigation(e, viewOrderNavBtn.getAttribute('href'));
    });
  }

  if (backToListNavBtn) {
    backToListNavBtn.addEventListener('click', (e) => {
      guardNavigation(e, backToListNavBtn.getAttribute('href'));
    });
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
        if (!res.ok || !json.success) throw new Error(getErrorMessage(json, 'فشل تحديث البيانات'));

        editHeaderModal.hide();
        showSuccessToast('تم تحديث بيانات الطلب بنجاح');
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
  // Archive Order Handler (SweetAlert2)
  // =========================================================================
  if (archiveOrderBtn) {
    archiveOrderBtn.addEventListener('click', () => {
      Swal.fire({
        title: `أرشفة أمر الإنتاج ${currentOrder.orderNumber}`,
        text: `هل أنت متأكد من أرشفة أمر الإنتاج "${currentOrder.orderNumber}"؟ سيختفي من الأوامر النشطة ولن تتمكن من تعديل مسودته من القوائم العادية.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EE5253',
        cancelButtonColor: '#6B7280',
        confirmButtonText: 'نعم، أرشفة',
        cancelButtonText: 'إلغاء',
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            const res = await window.erpFetch(`/api/production/orders/${orderId}`, {
              method: 'DELETE',
            });
            const json = await res.json();
            if (!res.ok || !json.success) throw new Error(getErrorMessage(json, 'فشلت أرشفة الطلب'));

            sessionStorage.setItem('pendingToast', 'تمت أرشفة أمر الإنتاج بنجاح');
            window.location.href = '/production/orders';
          } catch (err) {
            Swal.fire({
              icon: 'error',
              title: 'تعذر الأرشفة',
              text: err.message || 'حدث خطأ أثناء أرشفة الطلب',
              confirmButtonText: 'حسناً',
              confirmButtonColor: '#0984E3',
            });
          }
        }
      });
    });
  }

  // =========================================================================
  // Search Input Event Listeners
  // =========================================================================
  templateSearchInput.addEventListener('input', (e) => {
    clearTimeout(templateSearchDebounceTimer);
    const val = e.target.value.trim();

    if (val.length === 0) {
      // Invalidate pending requests and clear results
      ++templatePickerRequestSeq;
      templateSearchTerm = '';
      clearSearchBtn.classList.add('d-none');
      searchResultsWrapper.classList.add('d-none');
      searchResultsList.replaceChildren();
      templateLoadMoreBtn.classList.add('d-none');
      return;
    }

    clearSearchBtn.classList.remove('d-none');

    templateSearchDebounceTimer = setTimeout(() => {
      templateSearchTerm = val;
      executeTemplateSearch(false);
    }, 300);
  });

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      ++templatePickerRequestSeq;
      templateSearchInput.value = '';
      templateSearchTerm = '';
      clearSearchBtn.classList.add('d-none');
      searchResultsWrapper.classList.add('d-none');
      searchResultsList.replaceChildren();
      templateLoadMoreBtn.classList.add('d-none');
      templateSearchInput.focus();
    });
  }

  templateLoadMoreBtn.addEventListener('click', () => {
    if (templateCurrentPage < templateTotalPages) {
      executeTemplateSearch(true);
    }
  });

  if (recheckReadinessBtn) {
    recheckReadinessBtn.addEventListener('click', () => {
      fetchReadiness();
    });
  }

  // =========================================================================
  // Initial Boot:
  // Render existing lines and readiness ONLY.
  // NO fetchTemplates() is called before user types a search keyword!
  // =========================================================================
  renderOrderLines();
  fetchReadiness();
});
