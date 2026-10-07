/**
 * Production Order Draft Editor Workspace
 *
 * Implements:
 * 1. Unified lines editor: All lines (both pre-existing and newly added) are rendered
 *    in the unified workspace under the search input with identical horizontal card layout.
 * 2. Search-first template picker: NO initial fetch on boot, debounced (300ms) query search,
 *    monotonic race protection counter, results displayed directly below search input.
 * 3. Immediate client duplicate detection across ALL lines:
 *    Canonical key = templateId + '|' + sorted(patternId:optionId).
 *    Blocks saving if any duplicate configurations exist.
 * 4. Single Save Action at the bottom:
 *    Synchronizes deletions, updates, and batch additions in one unified flow,
 *    then redirects to the Order Show page (/production/orders/:id) with success toast.
 * 5. SweetAlert2 Invariants: Zero native window dialogs; all actions use Swal.
 * 6. DOM XSS security: Native DOM APIs and textContent exclusively for user and API text.
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

  // Unified In-Memory Lines State
  // Each line: { id, isNew, template: { id, name, code, referenceNumber }, quantity, originalQuantity, patterns: [{ patternId, patternName, selectedOptionId, availableOptions }], originalSelections: Map, validationErrors: [] }
  let lines = (currentOrder.lines || []).map((line) => ({
    id: line.id,
    isNew: false,
    template: {
      id: line.templateId,
      name: line.template ? line.template.name : 'قالب',
      code: line.template ? line.template.code : '—',
      referenceNumber: line.template?.referenceNumber || null,
    },
    quantity: line.quantity,
    originalQuantity: line.quantity,
    patterns: (line.patternSelections || []).map((sel) => ({
      patternId: sel.templatePatternId,
      patternName: sel.patternName,
      selectedOptionId: sel.selectedOptionId,
      availableOptions:
        sel.availableOptions && sel.availableOptions.length > 0
          ? sel.availableOptions
          : [{ id: sel.selectedOptionId, name: sel.selectedOptionName }],
    })),
    originalSelections: new Map(
      (line.patternSelections || []).map((sel) => [sel.templatePatternId, sel.selectedOptionId])
    ),
    validationErrors: [],
  }));

  const deletedLineIds = new Set();

  // DOM Elements - Workspace & Summary
  const orderAlert = document.getElementById('orderAlert');
  const readinessStatusBadge = document.getElementById('readinessStatusBadge');
  const readinessPanel = document.getElementById('readinessPanel');
  const readinessIssuesList = document.getElementById('readinessIssuesList');
  const recheckReadinessBtn = document.getElementById('recheckReadinessBtn');
  const headerLineCount = document.getElementById('headerLineCount');
  const headerTotalQuantity = document.getElementById('headerTotalQuantity');
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

  // DOM Elements - Bottom Save Action
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
  const orderDescriptionText = document.getElementById('orderDescriptionText');
  const orderNotesBox = document.getElementById('orderNotesBox');

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
   * Evaluates all lines for validity and duplicates across the entire order.
   * Ensures that no two lines share the same template and exact same pattern options.
   * Returns true if all lines are valid.
   */
  function evaluateLines() {
    let allValid = true;
    const keyMap = new Map();

    lines.forEach((line) => {
      line.validationErrors = [];

      // 1. Validate Quantity
      const q = line.quantity;
      if (typeof q !== 'number' || isNaN(q) || !Number.isInteger(q) || q < 1 || q > 10000) {
        line.validationErrors.push('الكمية يجب أن تكون عدداً صحيحاً بين 1 و 10,000.');
        allValid = false;
      }

      // 2. Validate Pattern Selections
      for (const pat of line.patterns) {
        if (!pat.availableOptions || pat.availableOptions.length === 0) {
          line.validationErrors.push(`النمط "${pat.patternName}" لا يحتوي على خيارات فعالة.`);
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

      if (!keyMap.has(lineKey)) {
        keyMap.set(lineKey, []);
      }
      keyMap.get(lineKey).push(line);
    });

    // 4. Duplicate Collision Check across ALL lines in order
    keyMap.forEach((matchedLines) => {
      if (matchedLines.length > 1) {
        allValid = false;
        matchedLines.forEach((l) => {
          l.validationErrors.push(
            'هذه التركيبة (نفس القالب ونفس خيارات الأنماط) مكررة. لا يمكن حفظ أكثر من بند بنفس التركيبة في نفس الطلب.'
          );
        });
      }
    });

    return allValid;
  }

  // =========================================================================
  // Unified Lines Render
  // =========================================================================
  function renderLines() {
    const isValid = evaluateLines();

    // Update Counter Badges & Summary
    if (existingLinesCountBadge) {
      existingLinesCountBadge.textContent = `${lines.length} بند`;
    }
    if (headerLineCount) {
      headerLineCount.textContent = String(lines.length);
    }
    if (headerTotalQuantity) {
      const totalQty = lines.reduce((acc, cur) => acc + (Number.isInteger(cur.quantity) && cur.quantity > 0 ? cur.quantity : 0), 0);
      headerTotalQuantity.textContent = String(totalQty);
    }

    // Toggle Empty State
    if (lines.length === 0) {
      emptyLinesState.classList.remove('d-none');
    } else {
      emptyLinesState.classList.add('d-none');
    }

    orderLinesContainer.replaceChildren();

    lines.forEach((line, index) => {
      const card = document.createElement('div');
      const hasErrors = line.validationErrors && line.validationErrors.length > 0;
      card.className = `card editor-line-card ${hasErrors ? 'is-invalid' : ''}`;

      // 1. Card Header
      const header = document.createElement('div');
      header.className = 'editor-line-header';

      const rightDiv = document.createElement('div');
      rightDiv.className = 'd-flex align-items-center gap-2 flex-wrap';

      const badge = document.createElement('span');
      badge.className = line.isNew
        ? 'badge bg-primary text-white rounded-pill px-2 py-1 small'
        : 'badge bg-secondary-subtle text-secondary-emphasis border rounded-pill px-2 py-1 small font-monospace';
      badge.textContent = `بند #${index + 1}`;
      rightDiv.appendChild(badge);

      const nameEl = document.createElement('span');
      nameEl.className = 'fw-bold text-dark fs-6';
      nameEl.textContent = line.template.name;
      rightDiv.appendChild(nameEl);

      const codeEl = document.createElement('span');
      codeEl.className = 'text-muted small font-monospace';
      codeEl.textContent = `${line.template.code}${line.template.referenceNumber ? ' • المرجع: ' + line.template.referenceNumber : ''}`;
      rightDiv.appendChild(codeEl);

      header.appendChild(rightDiv);

      // Left Action: Remove Button [X]
      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'btn remove-line-btn';
      removeBtn.setAttribute('title', 'حذف هذا البند');
      removeBtn.setAttribute('aria-label', `حذف بند ${line.template.name}`);
      removeBtn.innerHTML = '<i class="fa-solid fa-xmark"></i>';

      removeBtn.addEventListener('click', () => {
        if (line.isNew) {
          // Instant removal without confirmation for new unsaved line
          lines.splice(index, 1);
          renderLines();
        } else {
          // SweetAlert confirmation for existing line
          Swal.fire({
            title: 'حذف البند من الطلب',
            text: `هل أنت متأكد من حذف البند #${index + 1} (${line.template.name})؟ سيتم تطبيق الحذف عند حفظ أمر الإنتاج.`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#EE5253',
            cancelButtonColor: '#6B7280',
            confirmButtonText: 'نعم، حذف',
            cancelButtonText: 'إلغاء',
          }).then((result) => {
            if (result.isConfirmed) {
              deletedLineIds.add(line.id);
              lines.splice(index, 1);
              renderLines();
            }
          });
        }
      });

      header.appendChild(removeBtn);
      card.appendChild(header);

      // 2. Card Body (Horizontal Aligned Controls)
      const body = document.createElement('div');
      body.className = 'editor-line-body';

      const fieldsRow = document.createElement('div');
      fieldsRow.className = 'editor-line-fields';

      // Quantity Control
      const qtyField = document.createElement('div');
      qtyField.className = 'editor-line-field';

      const qtyLabel = document.createElement('label');
      qtyLabel.textContent = 'الكمية المخططة:';
      qtyField.appendChild(qtyLabel);

      const qtyInput = document.createElement('input');
      qtyInput.type = 'number';
      qtyInput.className = 'form-control form-control-sm font-monospace text-center';
      qtyInput.min = '1';
      qtyInput.max = '10000';
      qtyInput.step = '1';
      qtyInput.value = String(line.quantity);
      qtyInput.style.width = '100px';

      qtyInput.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        line.quantity = isNaN(val) ? 0 : val;
        renderLines();
      });

      qtyField.appendChild(qtyInput);
      fieldsRow.appendChild(qtyField);

      // Pattern Options Controls
      if (!line.patterns || line.patterns.length === 0) {
        const noPatField = document.createElement('div');
        noPatField.className = 'editor-line-field';
        const noPatBadge = document.createElement('span');
        noPatBadge.className = 'badge bg-secondary-subtle text-secondary px-3 py-2 rounded-pill mt-3';
        noPatBadge.textContent = 'بدون أنماط اختيارية';
        noPatField.appendChild(noPatBadge);
        fieldsRow.appendChild(noPatField);
      } else {
        line.patterns.forEach((pat) => {
          const patField = document.createElement('div');
          patField.className = 'editor-line-field';

          const patLabel = document.createElement('label');
          patLabel.textContent = pat.patternName;
          patField.appendChild(patLabel);

          const select = document.createElement('select');
          select.className = 'form-select form-select-sm';
          select.style.minWidth = '160px';

          (pat.availableOptions || []).forEach((opt) => {
            const optEl = document.createElement('option');
            optEl.value = opt.id;
            optEl.textContent = opt.name;
            if (opt.id === pat.selectedOptionId) optEl.selected = true;
            select.appendChild(optEl);
          });

          select.addEventListener('change', (e) => {
            pat.selectedOptionId = e.target.value;
            renderLines();
          });

          patField.appendChild(select);
          fieldsRow.appendChild(patField);
        });
      }

      body.appendChild(fieldsRow);

      // Duplicate / Validation Alert
      if (hasErrors) {
        const alertBox = document.createElement('div');
        alertBox.className = 'alert alert-warning py-2 px-3 small mt-3 mb-0';
        line.validationErrors.forEach((msg) => {
          const alertItem = document.createElement('div');
          alertItem.className = 'd-flex align-items-center gap-2';
          alertItem.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-warning-emphasis"></i> <span>${msg}</span>`;
          alertBox.appendChild(alertItem);
        });
        body.appendChild(alertBox);
      }

      card.appendChild(body);
      orderLinesContainer.appendChild(card);
    });

    // Update Bottom Save Button State
    submitPendingLinesBtn.disabled = !isValid;
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
   * 3. Add new line directly to lines list.
   * 4. Re-render unified lines.
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

      // Build New Line object
      const newLine = {
        id: 'new_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        isNew: true,
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

      lines.push(newLine);
      renderLines();

      // Scroll smoothly to the newly added line
      const allCards = orderLinesContainer.querySelectorAll('.editor-line-card');
      if (allCards.length > 0) {
        allCards[allCards.length - 1].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } catch (err) {
      if (configSeq !== templateConfigurationRequestSeq) return;
      showComposerAlert(err.message || 'فشل تحميل إعدادات القالب المختار');
    }
  }

  // =========================================================================
  // Unified Save & Submit Handler (Bottom Save Button)
  // Synchronizes deletes, updates, and additions, then navigates to /production/orders/:id
  // =========================================================================
  submitPendingLinesBtn.addEventListener('click', async () => {
    clearComposerAlert();
    clearOrderAlert();

    const isValid = evaluateLines();
    if (!isValid) {
      renderLines();
      Swal.fire({
        icon: 'warning',
        title: 'تنبيه',
        text: 'يرجى تصحيح الأخطاء والبنود المكررة قبل حفظ الطلب.',
        confirmButtonText: 'حسناً',
        confirmButtonColor: '#0984E3',
      });
      return;
    }

    submitPendingLinesBtn.disabled = true;
    submitPendingSpinner.classList.remove('d-none');
    submitPendingIcon.classList.add('d-none');
    submitPendingLinesBtnText.textContent = 'جاري الحفظ...';

    try {
      // 1. Process Deletions
      for (const delId of deletedLineIds) {
        const res = await window.erpFetch(`/api/production/orders/${orderId}/lines/${delId}`, {
          method: 'DELETE',
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(getErrorMessage(json, 'فشل حذف أحد البنود'));
        }
      }
      deletedLineIds.clear();

      // 2. Process Updates for Existing Lines
      for (const line of lines) {
        if (!line.isNew) {
          // Update quantity if modified
          if (line.quantity !== line.originalQuantity) {
            const res = await window.erpFetch(`/api/production/orders/${orderId}/lines/${line.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ quantity: line.quantity }),
            });
            const json = await res.json();
            if (!res.ok || !json.success) {
              throw new Error(getErrorMessage(json, `فشل تحديث كمية البند ${line.template.name}`));
            }
            line.originalQuantity = line.quantity;
          }

          // Update pattern options if modified
          for (const pat of line.patterns) {
            const originalVal = line.originalSelections?.get(pat.patternId);
            if (pat.selectedOptionId !== originalVal) {
              const res = await window.erpFetch(
                `/api/production/orders/${orderId}/lines/${line.id}/patterns/${pat.patternId}`,
                {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ optionId: pat.selectedOptionId }),
                }
              );
              const json = await res.json();
              if (!res.ok || !json.success) {
                throw new Error(getErrorMessage(json, `فشل تعديل نمط ${pat.patternName}`));
              }
              line.originalSelections.set(pat.patternId, pat.selectedOptionId);
            }
          }
        }
      }

      // 3. Process Batch Additions for New Lines
      const newLines = lines.filter((l) => l.isNew);
      if (newLines.length > 0) {
        const payloadLines = newLines.map((line) => ({
          templateId: line.template.id,
          quantity: line.quantity,
          patternSelections: line.patterns.map((p) => ({
            patternId: p.patternId,
            optionId: p.selectedOptionId,
          })),
        }));

        const res = await window.erpFetch(`/api/production/orders/${orderId}/lines/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lines: payloadLines }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(getErrorMessage(json, 'فشل إضافة البنود الجديدة'));
        }
      }

      // 4. Success: Set pending toast and redirect to Order Show Page
      sessionStorage.setItem('pendingToast', 'تم حفظ أمر الإنتاج بنجاح');
      window.location.href = `/production/orders/${orderId}`;
    } catch (err) {
      submitPendingSpinner.classList.add('d-none');
      submitPendingIcon.classList.remove('d-none');
      submitPendingLinesBtn.disabled = false;
      submitPendingLinesBtnText.textContent = 'حفظ أمر الإنتاج';

      Swal.fire({
        icon: 'error',
        title: 'خطأ أثناء الحفظ',
        text: err.message || 'حدث خطأ أثناء حفظ أمر الإنتاج',
        confirmButtonText: 'حسناً',
        confirmButtonColor: '#0984E3',
      });
    }
  });

  // =========================================================================
  // Readiness Fetch
  // =========================================================================
  async function fetchReadiness() {
    try {
      const res = await window.erpFetch(`/api/production/orders/${orderId}/release-readiness`);
      const json = await res.json();
      if (!res.ok || !json.success || !json.data) return;

      const { ready, issues } = json.data;

      if (readinessStatusBadge) {
        readinessStatusBadge.innerHTML = ready
          ? '<span class="badge bg-success-subtle text-success px-3 py-1 rounded-pill"><i class="fa-solid fa-circle-check me-1"></i> جاهز للإطلاق</span>'
          : '<span class="badge bg-danger-subtle text-danger px-3 py-1 rounded-pill"><i class="fa-solid fa-triangle-exclamation me-1"></i> يحتاج مراجعة</span>';
      }

      if (!ready && issues && issues.length > 0) {
        readinessPanel.classList.remove('d-none');
        readinessIssuesList.replaceChildren();
        issues.forEach((issue) => {
          const li = document.createElement('li');
          li.className = 'small text-danger mb-1';
          li.textContent = issue.message;
          readinessIssuesList.appendChild(li);
        });
      } else {
        readinessPanel.classList.add('d-none');
      }
    } catch (err) {
      console.warn('Failed to fetch release readiness:', err);
    }
  }

  // =========================================================================
  // Edit Header Modal Handler
  // =========================================================================
  if (editHeaderBtn) {
    editHeaderBtn.addEventListener('click', () => {
      editDescriptionInput.value = currentOrder.description || '';
      editNotesInput.value = currentOrder.notes || '';
      editHeaderAlert.classList.add('d-none');
      editHeaderAlert.textContent = '';
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

        currentOrder.description = editDescriptionInput.value.trim() || null;
        currentOrder.notes = editNotesInput.value.trim() || null;

        if (orderDescriptionText) {
          orderDescriptionText.textContent = currentOrder.description || 'لا يوجد وصف محدد لهذا الطلب.';
        }
        if (orderNotesBox) {
          if (currentOrder.notes) {
            orderNotesBox.innerHTML = `<i class="fa-solid fa-note-sticky me-1 text-warning"></i> <strong>ملاحظات:</strong> ${currentOrder.notes}`;
            orderNotesBox.classList.remove('d-none');
          } else {
            orderNotesBox.classList.add('d-none');
          }
        }

        editHeaderModal.hide();
        showSuccessToast('تم تحديث بيانات الطلب بنجاح');
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
  // Render lines and readiness ONLY.
  // NO fetchTemplates() is called before user types a search keyword!
  // =========================================================================
  renderLines();
  fetchReadiness();
});
