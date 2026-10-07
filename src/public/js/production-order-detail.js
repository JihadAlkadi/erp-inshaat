/**
 * Production Order Detail Workspace Client JS
 */
document.addEventListener('DOMContentLoaded', () => {
  // Read initial order data
  const dataScript = document.getElementById('initialOrderData');
  let currentOrder = null;
  if (dataScript && dataScript.textContent) {
    try {
      currentOrder = JSON.parse(dataScript.textContent.trim());
    } catch (e) {
      console.error('Failed to parse initial order JSON', e);
    }
  }

  if (!currentOrder) {
    console.error('Order data missing');
    return;
  }

  const orderId = currentOrder.id;

  // DOM elements
  const linesContainer = document.getElementById('orderLinesContainer');
  const emptyLinesState = document.getElementById('emptyLinesState');
  const alertBox = document.getElementById('orderAlert');
  const readinessStatusBadge = document.getElementById('readinessStatusBadge');
  const readinessPanel = document.getElementById('readinessPanel');
  const readinessIssuesList = document.getElementById('readinessIssuesList');
  const recheckReadinessBtn = document.getElementById('recheckReadinessBtn');

  const headerLineCount = document.getElementById('headerLineCount');
  const headerTotalQuantity = document.getElementById('headerTotalQuantity');
  const orderDescriptionText = document.getElementById('orderDescriptionText');
  const orderNotesBox = document.getElementById('orderNotesBox');

  // Modals
  const addLineModalEl = document.getElementById('addLineModal');
  const addLineModal = addLineModalEl ? new bootstrap.Modal(addLineModalEl) : null;
  const editQuantityModalEl = document.getElementById('editQuantityModal');
  const editQuantityModal = editQuantityModalEl ? new bootstrap.Modal(editQuantityModalEl) : null;
  const editHeaderModalEl = document.getElementById('editHeaderModal');
  const editHeaderModal = editHeaderModalEl ? new bootstrap.Modal(editHeaderModalEl) : null;

  // Buttons
  const openAddLineModalBtn = document.getElementById('openAddLineModalBtn');
  const emptyStateAddLineBtn = document.getElementById('emptyStateAddLineBtn');
  const archiveOrderBtn = document.getElementById('archiveOrderBtn');
  const editHeaderBtn = document.getElementById('editHeaderBtn');

  // Initial render
  renderOrderView();
  fetchReadiness();

  // Event Listeners
  if (openAddLineModalBtn) {
    openAddLineModalBtn.addEventListener('click', openAddLine);
  }
  if (emptyStateAddLineBtn) {
    emptyStateAddLineBtn.addEventListener('click', openAddLine);
  }
  if (recheckReadinessBtn) {
    recheckReadinessBtn.addEventListener('click', fetchReadiness);
  }

  if (archiveOrderBtn) {
    archiveOrderBtn.addEventListener('click', async () => {
      if (!confirm(`هل أنت متأكد من رغبتك في أرشفة طلب الإنتاج ${currentOrder.orderNumber}؟`)) {
        return;
      }
      try {
        const res = await window.erpFetch(`/api/production/orders/${orderId}`, {
          method: 'DELETE',
        });
        const resJson = await res.json();
        if (!res.ok || !resJson.success) {
          throw new Error(resJson.message || 'فشل أرشفة الطلب');
        }
        window.location.href = '/production/orders';
      } catch (err) {
        showError(err.message || 'حدث خطأ أثناء أرشفة الطلب');
      }
    });
  }

  if (editHeaderBtn) {
    editHeaderBtn.addEventListener('click', () => {
      const editDesc = document.getElementById('editDescriptionInput');
      const editNotes = document.getElementById('editNotesInput');
      if (editDesc) editDesc.value = currentOrder.description || '';
      if (editNotes) editNotes.value = currentOrder.notes || '';
      if (editHeaderModal) editHeaderModal.show();
    });
  }

  const editHeaderForm = document.getElementById('editHeaderForm');
  if (editHeaderForm) {
    editHeaderForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const descVal = document.getElementById('editDescriptionInput').value.trim() || null;
      const notesVal = document.getElementById('editNotesInput').value.trim() || null;
      const confirmBtn = document.getElementById('confirmEditHeaderBtn');

      confirmBtn.disabled = true;
      try {
        const res = await window.erpFetch(`/api/production/orders/${orderId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ description: descVal, notes: notesVal }),
        });
        const resJson = await res.json();
        if (!res.ok || !resJson.success) {
          throw new Error(resJson.message || 'فشل تحديث بيانات الطلب');
        }

        currentOrder = resJson.data;
        renderOrderView();
        if (editHeaderModal) editHeaderModal.hide();
      } catch (err) {
        alert(err.message || 'حدث خطأ أثناء حفظ التعديلات');
      } finally {
        confirmBtn.disabled = false;
      }
    });
  }

  // ==========================================
  // RENDER ORDER WORKSPACE
  // ==========================================

  function renderOrderView() {
    clearError();

    // Summary counts
    const lines = currentOrder.lines || [];
    let totalQty = 0;
    lines.forEach((l) => {
      totalQty += l.quantity;
    });

    if (headerLineCount) headerLineCount.textContent = lines.length.toString();
    if (headerTotalQuantity) headerTotalQuantity.textContent = totalQty.toString();

    if (orderDescriptionText) {
      orderDescriptionText.textContent = currentOrder.description || 'لا يوجد وصف محدد لهذا الطلب.';
    }

    if (lines.length === 0) {
      linesContainer.innerHTML = '';
      emptyLinesState.classList.remove('d-none');
      return;
    }

    emptyLinesState.classList.add('d-none');
    linesContainer.innerHTML = '';

    lines.forEach((line, index) => {
      const card = createLineCard(line, index, lines.length);
      linesContainer.appendChild(card);
    });
  }

  function createLineCard(line, index, totalLines) {
    const card = document.createElement('div');
    card.className = 'order-line-card';
    card.dataset.lineId = line.id;

    // Header
    const header = document.createElement('div');
    header.className = 'order-line-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'd-flex align-items-center gap-2 flex-wrap';

    const badge = document.createElement('span');
    badge.className = 'order-line-badge';
    badge.textContent = `#${line.sortOrder}`;
    headerLeft.appendChild(badge);

    const tmplName = document.createElement('span');
    tmplName.className = 'fw-bold text-dark';
    tmplName.textContent = line.template ? line.template.name : 'قالب غير معروف';
    headerLeft.appendChild(tmplName);

    if (line.template && line.template.code) {
      const tmplCode = document.createElement('span');
      tmplCode.className = 'badge bg-light text-secondary border font-monospace';
      tmplCode.textContent = line.template.code;
      headerLeft.appendChild(tmplCode);
    }

    header.appendChild(headerLeft);

    // Actions & Reordering controls
    const headerRight = document.createElement('div');
    headerRight.className = 'd-flex align-items-center gap-2 flex-wrap';

    // Move Up Button
    if (index > 0) {
      const upBtn = document.createElement('button');
      upBtn.type = 'button';
      upBtn.className = 'btn btn-outline-secondary btn-sm p-1';
      upBtn.setAttribute('title', 'نقل البند لأعلى');
      const upIcon = document.createElement('i');
      upIcon.className = 'fa-solid fa-arrow-up';
      upBtn.appendChild(upIcon);
      upBtn.addEventListener('click', () => moveLine(index, index - 1));
      headerRight.appendChild(upBtn);
    }

    // Move Down Button
    if (index < totalLines - 1) {
      const downBtn = document.createElement('button');
      downBtn.type = 'button';
      downBtn.className = 'btn btn-outline-secondary btn-sm p-1';
      downBtn.setAttribute('title', 'نقل البند لأسفل');
      const downIcon = document.createElement('i');
      downIcon.className = 'fa-solid fa-arrow-down';
      downBtn.appendChild(downIcon);
      downBtn.addEventListener('click', () => moveLine(index, index + 1));
      headerRight.appendChild(downBtn);
    }

    // Quantity Badge & Edit
    const qtyBadge = document.createElement('span');
    qtyBadge.className = 'badge bg-primary-subtle text-primary border border-primary-subtle px-2 py-1';
    qtyBadge.textContent = `الكمية: ${line.quantity}`;
    headerRight.appendChild(qtyBadge);

    const editQtyBtn = document.createElement('button');
    editQtyBtn.type = 'button';
    editQtyBtn.className = 'btn btn-outline-primary btn-sm py-0 px-2';
    editQtyBtn.style.fontSize = '0.75rem';
    editQtyBtn.textContent = 'تعديل الكمية';
    editQtyBtn.addEventListener('click', () => openEditQuantity(line));
    headerRight.appendChild(editQtyBtn);

    // Sync button
    const syncBtn = document.createElement('button');
    syncBtn.type = 'button';
    syncBtn.className = 'btn btn-outline-info btn-sm py-0 px-2';
    syncBtn.style.fontSize = '0.75rem';
    syncBtn.setAttribute('title', 'مزامنة خيارات البند مع القالب الحالي');
    const syncIcon = document.createElement('i');
    syncIcon.className = 'fa-solid fa-arrows-rotate me-1';
    syncBtn.appendChild(syncIcon);
    syncBtn.appendChild(document.createTextNode('مزامنة'));
    syncBtn.addEventListener('click', () => syncLineWithTemplate(line.id));
    headerRight.appendChild(syncBtn);

    // Archive Line button
    const archiveBtn = document.createElement('button');
    archiveBtn.type = 'button';
    archiveBtn.className = 'btn btn-outline-danger btn-sm py-0 px-2';
    archiveBtn.style.fontSize = '0.75rem';
    archiveBtn.setAttribute('title', 'أرشفة البند');
    const archIcon = document.createElement('i');
    archIcon.className = 'fa-solid fa-trash-can me-1';
    archiveBtn.appendChild(archIcon);
    archiveBtn.appendChild(document.createTextNode('أرشفة'));
    archiveBtn.addEventListener('click', () => archiveLine(line.id));
    headerRight.appendChild(archiveBtn);

    header.appendChild(headerRight);
    card.appendChild(header);

    // Body: Pattern Selections
    const body = document.createElement('div');
    body.className = 'order-line-body';

    const selections = line.patternSelections || [];
    if (selections.length === 0) {
      const noPatterns = document.createElement('div');
      noPatterns.className = 'text-muted small py-2';
      noPatterns.textContent = 'لا توجد أنماط متغيرة لهذا القالب (قالب ذو بنية موحدة).';
      body.appendChild(noPatterns);
    } else {
      const patternsRow = document.createElement('div');
      patternsRow.className = 'row g-3';

      selections.forEach((sel) => {
        const col = document.createElement('div');
        col.className = 'col-12 col-md-6 col-lg-4';

        const box = document.createElement('div');
        box.className = 'pattern-selection-box';

        const label = document.createElement('label');
        label.className = 'pattern-selection-label mb-2';
        const labelIcon = document.createElement('i');
        labelIcon.className = 'fa-solid fa-sliders text-secondary';
        label.appendChild(labelIcon);
        label.appendChild(document.createTextNode(` ${sel.patternName}`));
        box.appendChild(label);

        const select = document.createElement('select');
        select.className = 'form-select form-select-sm';

        const available = sel.availableOptions || [];
        available.forEach((opt) => {
          const optionEl = document.createElement('option');
          optionEl.value = opt.id;
          optionEl.textContent = opt.name;
          if (opt.id === sel.selectedOptionId) {
            optionEl.selected = true;
          }
          select.appendChild(optionEl);
        });

        // If selectedOptionId is not in available options (corrupted / archived), add a disabled indicator
        const isFound = available.some((o) => o.id === sel.selectedOptionId);
        if (!isFound) {
          const invalidOpt = document.createElement('option');
          invalidOpt.value = sel.selectedOptionId;
          invalidOpt.textContent = `[غير صالح: ${sel.selectedOptionName}]`;
          invalidOpt.selected = true;
          invalidOpt.disabled = true;
          select.appendChild(invalidOpt);
        }

        select.addEventListener('change', async (e) => {
          const newOptionId = e.target.value;
          await updatePatternSelection(line.id, sel.templatePatternId, newOptionId, select);
        });

        box.appendChild(select);
        col.appendChild(box);
        patternsRow.appendChild(col);
      });

      body.appendChild(patternsRow);
    }

    card.appendChild(body);
    return card;
  }

  // ==========================================
  // PATTERN SELECTION MUTATION
  // ==========================================

  async function updatePatternSelection(lineId, patternId, optionId, selectEl) {
    selectEl.disabled = true;
    try {
      const res = await window.erpFetch(
        `/api/production/orders/${orderId}/lines/${lineId}/patterns/${patternId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ optionId }),
        }
      );

      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.message || 'فشل تحديث خيار النمط');
      }

      // Update local line state
      const updatedLine = resJson.data;
      const idx = currentOrder.lines.findIndex((l) => l.id === lineId);
      if (idx !== -1) {
        currentOrder.lines[idx] = updatedLine;
      }

      fetchReadiness();
    } catch (err) {
      alert(err.message || 'حدث خطأ أثناء تعديل خيار النمط');
      fetchFreshOrder();
    } finally {
      selectEl.disabled = false;
    }
  }

  // ==========================================
  // LINE MUTATIONS (SYNC, QUANTITY, ARCHIVE, REORDER)
  // ==========================================

  async function syncLineWithTemplate(lineId) {
    if (!confirm('هل تريد مزامنة خيارات هذا البند مع الأنماط الحالية للقالب؟')) {
      return;
    }

    try {
      const res = await window.erpFetch(
        `/api/production/orders/${orderId}/lines/${lineId}/sync-template`,
        {
          method: 'POST',
        }
      );

      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.message || 'فشل مزامنة البند');
      }

      await fetchFreshOrder();
      fetchReadiness();
    } catch (err) {
      showError(err.message || 'حدث خطأ أثناء مزامنة البند');
    }
  }

  function openEditQuantity(line) {
    const lineIdInput = document.getElementById('editQuantityLineId');
    const qtyInput = document.getElementById('editQuantityInput');
    const alertBox = document.getElementById('editQuantityAlert');

    if (alertBox) alertBox.classList.add('d-none');
    if (lineIdInput) lineIdInput.value = line.id;
    if (qtyInput) qtyInput.value = line.quantity.toString();

    if (editQuantityModal) editQuantityModal.show();
  }

  const editQuantityForm = document.getElementById('editQuantityForm');
  if (editQuantityForm) {
    editQuantityForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const lineId = document.getElementById('editQuantityLineId').value;
      const newQty = parseInt(document.getElementById('editQuantityInput').value, 10);
      const submitBtn = document.getElementById('confirmEditQuantityBtn');
      const alertBox = document.getElementById('editQuantityAlert');

      if (!newQty || newQty < 1 || newQty > 10000) {
        if (alertBox) {
          alertBox.textContent = 'يرجى إدخال كمية صحيحة بين 1 و 10,000';
          alertBox.classList.remove('d-none');
        }
        return;
      }

      submitBtn.disabled = true;
      try {
        const res = await window.erpFetch(`/api/production/orders/${orderId}/lines/${lineId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quantity: newQty }),
        });

        const resJson = await res.json();
        if (!res.ok || !resJson.success) {
          throw new Error(resJson.message || 'فشل تعديل كمية البند');
        }

        const updatedLine = resJson.data;
        const idx = currentOrder.lines.findIndex((l) => l.id === lineId);
        if (idx !== -1) {
          currentOrder.lines[idx] = updatedLine;
        }

        renderOrderView();
        fetchReadiness();
        if (editQuantityModal) editQuantityModal.hide();
      } catch (err) {
        if (alertBox) {
          alertBox.textContent = err.message || 'حدث خطأ أثناء تعديل الكمية';
          alertBox.classList.remove('d-none');
        }
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  async function archiveLine(lineId) {
    if (!confirm('هل أنت متأكد من رغبتك في أرشفة هذا البند؟')) {
      return;
    }

    try {
      const res = await window.erpFetch(`/api/production/orders/${orderId}/lines/${lineId}`, {
        method: 'DELETE',
      });
      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.message || 'فشل أرشفة البند');
      }

      await fetchFreshOrder();
      fetchReadiness();
    } catch (err) {
      showError(err.message || 'حدث خطأ أثناء أرشفة البند');
    }
  }

  async function moveLine(fromIndex, toIndex) {
    const lines = [...(currentOrder.lines || [])];
    if (toIndex < 0 || toIndex >= lines.length) return;

    // Swap elements
    const temp = lines[fromIndex];
    lines[fromIndex] = lines[toIndex];
    lines[toIndex] = temp;

    const lineIds = lines.map((l) => l.id);

    try {
      const res = await window.erpFetch(`/api/production/orders/${orderId}/lines/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineIds }),
      });

      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.message || 'فشل إعادة ترتيب البنود');
      }

      currentOrder.lines = resJson.data;
      renderOrderView();
    } catch (err) {
      showError(err.message || 'حدث خطأ أثناء إعادة ترتيب البنود');
      fetchFreshOrder();
    }
  }

  // ==========================================
  // ADD LINE MODAL LOGIC
  // ==========================================

  let templatePickerCurrentPage = 1;
  let templatePickerTotalPages = 1;
  let templatePickerSearchTerm = '';
  let templatePickerLoading = false;
  let templatePickerRequestSeq = 0;
  const loadedTemplateIds = new Set();

  function openAddLine() {
    const addAlert = document.getElementById('addLineAlert');
    if (addAlert) addAlert.classList.add('d-none');

    document.getElementById('selectedTemplateId').value = '';
    const summary = document.getElementById('selectedTemplateSummary');
    if (summary) summary.classList.add('d-none');

    const previewSection = document.getElementById('patternsPreviewSection');
    if (previewSection) previewSection.classList.add('d-none');

    document.getElementById('lineQuantityInput').value = '1';
    document.getElementById('confirmAddLineBtn').disabled = true;

    selectedTemplateConfig = null;

    // Reset template picker state
    templatePickerCurrentPage = 1;
    templatePickerTotalPages = 1;
    templatePickerSearchTerm = '';
    templatePickerLoading = false;
    templatePickerRequestSeq = 0;
    loadedTemplateIds.clear();

    if (templateSearchInput) templateSearchInput.value = '';
    loadTemplatePickerPage(1, '', false);

    if (addLineModal) addLineModal.show();
  }

  const templateSearchInput = document.getElementById('templatePickerSearch');
  let templateSearchTimer = null;
  if (templateSearchInput) {
    templateSearchInput.addEventListener('input', (e) => {
      clearTimeout(templateSearchTimer);
      templateSearchTimer = setTimeout(() => {
        const searchTerm = e.target.value.trim();
        templatePickerCurrentPage = 1;
        templatePickerSearchTerm = searchTerm;
        loadedTemplateIds.clear();
        loadTemplatePickerPage(1, searchTerm, false);
      }, 300);
    });
  }

  async function loadTemplatePickerPage(page, search, isAppend) {
    const listContainer = document.getElementById('templatePickerList');
    if (!listContainer) return;

    const thisReqSeq = ++templatePickerRequestSeq;
    templatePickerLoading = true;

    // Remove previous Load More button if present
    const existingLoadMore = document.getElementById('templatePickerLoadMoreContainer');
    if (existingLoadMore) {
      if (isAppend) {
        const loadMoreBtn = document.getElementById('templatePickerLoadMoreBtn');
        if (loadMoreBtn) {
          loadMoreBtn.disabled = true;
          loadMoreBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1 text-primary"></span> جاري تحميل المزيد...';
        }
      } else {
        existingLoadMore.remove();
      }
    }

    if (!isAppend) {
      listContainer.innerHTML = '';
      const loadingDiv = document.createElement('div');
      loadingDiv.className = 'text-center py-2 text-muted small';
      loadingDiv.id = 'templatePickerLoadingIndicator';
      loadingDiv.innerHTML = '<span class="spinner-border spinner-border-sm me-1 text-primary"></span> جاري البحث...';
      listContainer.appendChild(loadingDiv);
    }

    try {
      const url = new URL('/api/production/templates/reference-options', window.location.origin);
      url.searchParams.set('page', page.toString());
      url.searchParams.set('limit', '20');
      if (search) url.searchParams.set('search', search);

      const res = await window.erpFetch(url.toString());
      const resJson = await res.json();

      // Race condition protection: ignore stale responses
      if (thisReqSeq !== templatePickerRequestSeq) {
        return;
      }

      if (!res.ok || !resJson.success) {
        throw new Error(resJson.message || 'فشل جلب القوالب');
      }

      // Remove loading indicator / old load more button
      const loadingInd = document.getElementById('templatePickerLoadingIndicator');
      if (loadingInd) loadingInd.remove();
      const oldLoadMore = document.getElementById('templatePickerLoadMoreContainer');
      if (oldLoadMore) oldLoadMore.remove();

      const templates = resJson.data.items || [];
      templatePickerCurrentPage = resJson.data.page || page;
      templatePickerTotalPages = resJson.data.totalPages || 1;

      if (!isAppend && templates.length === 0) {
        listContainer.innerHTML = '';
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'text-center py-2 text-muted small';
        emptyDiv.textContent = 'لا توجد قوالب فعالة مطابقة.';
        listContainer.appendChild(emptyDiv);
        return;
      }

      templates.forEach((tmpl) => {
        if (loadedTemplateIds.has(tmpl.id)) {
          return; // Prevent duplicate cards
        }
        loadedTemplateIds.add(tmpl.id);

        const itemBtn = document.createElement('button');
        itemBtn.type = 'button';
        itemBtn.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2 px-3 border-0 rounded mb-1';

        const nameSpan = document.createElement('span');
        nameSpan.className = 'fw-semibold text-dark';
        nameSpan.textContent = tmpl.name;
        itemBtn.appendChild(nameSpan);

        const codeSpan = document.createElement('span');
        codeSpan.className = 'badge bg-light text-secondary border font-monospace';
        codeSpan.textContent = tmpl.code;
        itemBtn.appendChild(codeSpan);

        itemBtn.addEventListener('click', () => onTemplateSelected(tmpl));
        listContainer.appendChild(itemBtn);
      });

      // Show "Load More" button if more pages exist
      if (templatePickerCurrentPage < templatePickerTotalPages) {
        const loadMoreContainer = document.createElement('div');
        loadMoreContainer.className = 'text-center pt-2 pb-1';
        loadMoreContainer.id = 'templatePickerLoadMoreContainer';

        const loadMoreBtn = document.createElement('button');
        loadMoreBtn.type = 'button';
        loadMoreBtn.className = 'btn btn-outline-primary btn-sm w-100 py-1';
        loadMoreBtn.id = 'templatePickerLoadMoreBtn';
        loadMoreBtn.innerHTML = '<i class="fa-solid fa-angles-down me-1"></i> تحميل المزيد';
        loadMoreBtn.addEventListener('click', () => {
          loadTemplatePickerPage(templatePickerCurrentPage + 1, templatePickerSearchTerm, true);
        });

        loadMoreContainer.appendChild(loadMoreBtn);
        listContainer.appendChild(loadMoreContainer);
      }
    } catch (err) {
      if (thisReqSeq !== templatePickerRequestSeq) return;

      if (!isAppend) {
        listContainer.innerHTML = '';
      }
      const errDiv = document.createElement('div');
      errDiv.className = 'text-center py-2 text-danger small';
      errDiv.textContent = err.message || 'خطأ في جلب القوالب';
      listContainer.appendChild(errDiv);
    } finally {
      if (thisReqSeq === templatePickerRequestSeq) {
        templatePickerLoading = false;
      }
    }
  }

  async function onTemplateSelected(tmpl) {
    document.getElementById('selectedTemplateId').value = tmpl.id;
    const summary = document.getElementById('selectedTemplateSummary');
    if (summary) {
      summary.textContent = `القالب المختار: ${tmpl.name} (${tmpl.code})`;
      summary.classList.remove('d-none');
    }

    const previewSection = document.getElementById('patternsPreviewSection');
    const previewContainer = document.getElementById('patternsPreviewContainer');
    previewContainer.innerHTML = '<div class="text-center py-2 text-muted small"><span class="spinner-border spinner-border-sm me-1"></span> جاري فحص أنماط القالب...</div>';
    previewSection.classList.remove('d-none');

    try {
      const res = await window.erpFetch(`/api/production/templates/${tmpl.id}/order-configuration`);
      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        throw new Error(resJson.message || 'فشل جلب خيارات القالب');
      }

      selectedTemplateConfig = resJson.data;
      renderPatternsPreview(selectedTemplateConfig);
      document.getElementById('confirmAddLineBtn').disabled = false;
    } catch (err) {
      previewContainer.innerHTML = '';
      const errDiv = document.createElement('div');
      errDiv.className = 'text-danger small';
      errDiv.textContent = err.message || 'تعذر تحميل خيارات الأنماط';
      previewContainer.appendChild(errDiv);
      document.getElementById('confirmAddLineBtn').disabled = true;
    }
  }

  function renderPatternsPreview(config) {
    const previewContainer = document.getElementById('patternsPreviewContainer');
    previewContainer.innerHTML = '';

    const patterns = config.patterns || [];
    if (patterns.length === 0) {
      const info = document.createElement('div');
      info.className = 'text-muted small';
      info.textContent = 'هذا القالب ذو بنية موحدة ولا يحتوي على أي أنماط متغيرة.';
      previewContainer.appendChild(info);
      return;
    }

    const row = document.createElement('div');
    row.className = 'row g-2';

    patterns.forEach((pat) => {
      const col = document.createElement('div');
      col.className = 'col-12 col-md-6';

      const label = document.createElement('label');
      label.className = 'form-label small fw-bold text-dark mb-1';
      label.textContent = pat.name;
      col.appendChild(label);

      const select = document.createElement('select');
      select.className = 'form-select form-select-sm pattern-preview-select';
      select.dataset.patternId = pat.id;

      const options = pat.options || [];
      options.forEach((opt) => {
        const optionEl = document.createElement('option');
        optionEl.value = opt.id;
        optionEl.textContent = opt.name;
        if (opt.id === pat.defaultOptionId) {
          optionEl.selected = true;
        }
        select.appendChild(optionEl);
      });

      col.appendChild(select);
      row.appendChild(col);
    });

    previewContainer.appendChild(row);
  }

  const addLineForm = document.getElementById('addLineForm');
  if (addLineForm) {
    addLineForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const templateId = document.getElementById('selectedTemplateId').value;
      const quantity = parseInt(document.getElementById('lineQuantityInput').value, 10);
      const addAlert = document.getElementById('addLineAlert');
      const submitBtn = document.getElementById('confirmAddLineBtn');

      if (!templateId) {
        addAlert.textContent = 'يرجى اختيار قالب التصنيع أولاً';
        addAlert.classList.remove('d-none');
        return;
      }

      if (!quantity || quantity < 1 || quantity > 10000) {
        addAlert.textContent = 'يرجى إدخال كمية صحيحة بين 1 و 10,000';
        addAlert.classList.remove('d-none');
        return;
      }

      // Collect pattern selections from preview dropdowns
      const patternSelects = document.querySelectorAll('.pattern-preview-select');
      const patternSelections = [];
      patternSelects.forEach((sel) => {
        patternSelections.push({
          patternId: sel.dataset.patternId,
          optionId: sel.value,
        });
      });

      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> جاري الإضافة...';

      try {
        const payload = {
          templateId,
          quantity,
          patternSelections: patternSelections.length > 0 ? patternSelections : undefined,
        };

        const res = await window.erpFetch(`/api/production/orders/${orderId}/lines`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const resJson = await res.json();
        if (!res.ok || !resJson.success) {
          throw new Error(resJson.message || 'فشل إضافة بند الإنتاج');
        }

        if (addLineModal) addLineModal.hide();
        await fetchFreshOrder();
        fetchReadiness();
      } catch (err) {
        addAlert.textContent = err.message || 'حدث خطأ أثناء إضافة البند';
        addAlert.classList.remove('d-none');
      } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> <span>إضافة البند للطلب</span>';
      }
    });
  }

  // ==========================================
  // READINESS ASSESSMENT (READ-ONLY)
  // ==========================================

  async function fetchReadiness() {
    try {
      const res = await window.erpFetch(`/api/production/orders/${orderId}/release-readiness`);
      const resJson = await res.json();
      if (!res.ok || !resJson.success) {
        return;
      }

      renderReadiness(resJson.data);
    } catch (e) {
      console.warn('Failed to load readiness status', e);
    }
  }

  function renderReadiness(readiness) {
    if (!readinessStatusBadge) return;
    readinessStatusBadge.innerHTML = '';

    if (readiness.ready) {
      const badge = document.createElement('span');
      badge.className = 'readiness-badge-ready';
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-circle-check';
      badge.appendChild(icon);
      badge.appendChild(document.createTextNode(' الطلب جاهز للإطلاق'));
      readinessStatusBadge.appendChild(badge);

      if (readinessPanel) readinessPanel.classList.add('d-none');
    } else {
      const badge = document.createElement('span');
      badge.className = 'readiness-badge-warning';
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-triangle-exclamation';
      badge.appendChild(icon);
      badge.appendChild(document.createTextNode(` يحتاج مراجعة (${readiness.issues.length} ملاحظات)`));
      readinessStatusBadge.appendChild(badge);

      if (readinessPanel) {
        readinessPanel.classList.remove('d-none');
        readinessIssuesList.innerHTML = '';

        readiness.issues.forEach((issue) => {
          const li = document.createElement('li');
          const issueIcon = document.createElement('i');
          issueIcon.className = 'fa-solid fa-circle-exclamation me-1';
          li.appendChild(issueIcon);
          li.appendChild(document.createTextNode(issue.message));
          readinessIssuesList.appendChild(li);
        });
      }
    }
  }

  // ==========================================
  // HELPERS
  // ==========================================

  async function fetchFreshOrder() {
    try {
      const res = await window.erpFetch(`/api/production/orders/${orderId}`);
      const resJson = await res.json();
      if (res.ok && resJson.success) {
        currentOrder = resJson.data;
        renderOrderView();
      }
    } catch (e) {
      console.error('Failed to refresh order', e);
    }
  }

  function showError(msg) {
    if (alertBox) {
      alertBox.textContent = msg;
      alertBox.classList.remove('d-none');
    }
  }

  function clearError() {
    if (alertBox) {
      alertBox.classList.add('d-none');
      alertBox.textContent = '';
    }
  }
});
