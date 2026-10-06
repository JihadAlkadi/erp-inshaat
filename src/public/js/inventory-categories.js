/**
 * Inventory Categories Management Script
 * Handles category tree view, lazy-loading child nodes, search, create, edit, and soft delete.
 * Security: Uses window.erpFetch for all mutations and native DOM APIs to prevent XSS.
 */

document.addEventListener('DOMContentLoaded', () => {
  const treeContainer = document.getElementById('categoryTreeContainer');
  const treeStatusBadge = document.getElementById('treeStatusBadge');
  const categorySearchInput = document.getElementById('categorySearchInput');
  const btnRefreshTree = document.getElementById('btnRefreshTree');
  const searchResultsArea = document.getElementById('searchResultsArea');
  const searchResultsTableBody = document.getElementById('searchResultsTableBody');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const alertContainer = document.getElementById('categoryAlertContainer') || document.getElementById('categoryFormAlertContainer');

  // Form elements (if on create or edit page)
  const createCategoryForm = document.getElementById('createCategoryForm');
  const editCategoryForm = document.getElementById('editCategoryForm');
  const categoryParentSelect = document.getElementById('categoryParentId');

  const permissions = window.INVENTORY_PERMISSIONS || {
    canCreateCategory: false,
    canUpdateCategory: false,
    canDeleteCategory: false,
  };

  /**
   * Helper to extract and format Arabic error messages from API response
   */
  function extractApiErrorMessage(responseBody, fallback) {
    if (!responseBody) return fallback || 'حدث خطأ غير متوقع';

    const errorMessages = [];

    if (responseBody.errors && typeof responseBody.errors === 'object' && !Array.isArray(responseBody.errors)) {
      Object.keys(responseBody.errors).forEach((key) => {
        const val = responseBody.errors[key];
        if (Array.isArray(val)) {
          val.forEach((msg) => {
            if (typeof msg === 'string' && msg.trim() !== '') {
              errorMessages.push(msg.trim());
            }
          });
        } else if (typeof val === 'string' && val.trim() !== '') {
          errorMessages.push(val.trim());
        }
      });
    } else if (Array.isArray(responseBody.errors)) {
      responseBody.errors.forEach((msg) => {
        if (typeof msg === 'string' && msg.trim() !== '') {
          errorMessages.push(msg.trim());
        }
      });
    }

    if (errorMessages.length === 0 && responseBody.message && typeof responseBody.message === 'string') {
      errorMessages.push(responseBody.message);
    }

    const uniqueMessages = [];
    errorMessages.forEach((msg) => {
      if (uniqueMessages.indexOf(msg) === -1) {
        uniqueMessages.push(msg);
      }
    });

    if (uniqueMessages.length > 0) {
      return uniqueMessages.join('، ');
    }

    return fallback || 'حدث خطأ أثناء معالجة الطلب';
  }

  /**
   * Helper to show form error in #formAlert or SweetAlert2
   */
  function showFormError(message) {
    const alertEl = document.getElementById('formAlert');
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
        confirmButtonColor: '#10AC84',
      });
    } else {
      showAlert(message, 'danger');
    }
  }

  /**
   * Helper to clear form error alert
   */
  function clearFormError() {
    const alertEl = document.getElementById('formAlert');
    if (alertEl) {
      alertEl.textContent = '';
      alertEl.classList.add('d-none');
    }
  }

  /**
   * Helper to show Bootstrap alert safely without innerHTML XSS.
   */
  function showAlert(message, type = 'danger') {
    if (!alertContainer) return;
    alertContainer.textContent = ''; // clear

    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show rounded-3 shadow-sm`;
    alertDiv.role = 'alert';

    const icon = document.createElement('i');
    icon.className = type === 'success' ? 'fa-solid fa-check-circle me-2' : 'fa-solid fa-triangle-exclamation me-2';
    alertDiv.appendChild(icon);

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    alertDiv.appendChild(msgSpan);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'btn-close';
    closeBtn.setAttribute('data-bs-dismiss', 'alert');
    closeBtn.setAttribute('aria-label', 'Close');
    alertDiv.appendChild(closeBtn);

    alertContainer.appendChild(alertDiv);
    alertContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Helper to fetch all active category options across pages without truncation.
   * Fails closed if any page fails, response is invalid, or pagination metadata is inconsistent.
   */
  async function fetchAllActiveCategoryOptions() {
    const allItems = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const res = await fetch(`/api/inventory/categories/options?page=${page}&limit=100`);
      if (!res.ok) {
        throw new Error(`Failed to load category options (HTTP ${res.status})`);
      }

      let json;
      try {
        json = await res.json();
      } catch (e) {
        throw new Error('Invalid JSON received for category options');
      }

      if (!json || json.success !== true || !json.data || !Array.isArray(json.data.items)) {
        throw new Error('Invalid response structure for category options');
      }

      const { items, page: resPage, totalPages: resTotalPages } = json.data;

      if (
        typeof resPage !== 'number' ||
        typeof resTotalPages !== 'number' ||
        resPage <= 0 ||
        resTotalPages <= 0 ||
        resPage !== page ||
        resPage > resTotalPages
      ) {
        throw new Error('Inconsistent pagination metadata received for category options');
      }

      totalPages = resTotalPages;
      allItems.push(...items);
      page++;
    }

    return allItems;
  }

  /**
   * Fetch category options for dropdown selectors (handles inactive current parent preservation).
   * Rebuilds select only after 100% of pages are successfully fetched (fail-closed).
   */
  async function loadCategoryOptions(selectedId = '', currentParentName = '') {
    if (!categoryParentSelect) return;

    try {
      // 1. Fetch all pages first into temporary array
      const options = await fetchAllActiveCategoryOptions();

      // 2. Only rebuild select after complete success
      while (categoryParentSelect.options.length > 1) {
        categoryParentSelect.remove(1);
      }

      const currentCategoryId = editCategoryForm ? editCategoryForm.dataset.categoryId : null;
      let selectedFound = false;

      options.forEach((cat) => {
        // Do not include the current category itself in edit mode (self-parent prevention)
        if (currentCategoryId && cat.id === currentCategoryId) {
          return;
        }

        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.parentName ? `${cat.name} (${cat.code}) - [${cat.parentName}]` : `${cat.name} (${cat.code})`;
        if (cat.id === selectedId) {
          opt.selected = true;
          selectedFound = true;
        }
        categoryParentSelect.appendChild(opt);
      });

      // If current parent is inactive (not returned in options), preserve it
      if (selectedId && !selectedFound && selectedId !== currentCategoryId) {
        const inactiveOpt = document.createElement('option');
        inactiveOpt.value = selectedId;
        inactiveOpt.selected = true;
        inactiveOpt.textContent = currentParentName ? `${currentParentName} (معطلة)` : 'الفئة الأب الحالية (معطلة)';
        categoryParentSelect.appendChild(inactiveOpt);
      }
    } catch (err) {
      console.error('Failed to load category options:', err);
      showAlert('فشل في تحميل قائمة فئات المنتجات بشكل كامل. تم الحفاظ على الحالة الحالية لمنع فقدان البيانات.');
    }
  }

  // --- Category Tree Logic ---

  /**
   * Builds a single Category Node DOM element.
   */
  function createCategoryNodeElement(category, level = 0) {
    const nodeWrapper = document.createElement('div');
    nodeWrapper.className = 'tree-node-wrapper';
    nodeWrapper.dataset.categoryId = category.id;

    const nodeItem = document.createElement('div');
    nodeItem.className = 'tree-node-item d-flex justify-content-between align-items-center';

    // Left info section
    const leftDiv = document.createElement('div');
    leftDiv.className = 'd-flex align-items-center gap-2';

    // Toggle button or spacer
    if (category.hasChildren) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'tree-toggle-btn';
      toggleBtn.dataset.categoryId = category.id;
      toggleBtn.dataset.loaded = 'false';
      toggleBtn.dataset.expanded = 'false';

      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-chevron-left';
      toggleBtn.appendChild(icon);

      toggleBtn.addEventListener('click', () => handleToggleChildren(toggleBtn, nodeWrapper, level + 1));
      leftDiv.appendChild(toggleBtn);
    } else {
      const spacer = document.createElement('span');
      spacer.style.width = '24px';
      spacer.style.display = 'inline-block';
      leftDiv.appendChild(spacer);
    }

    // Folder Icon
    const folderIcon = document.createElement('i');
    folderIcon.className = category.hasChildren ? 'fa-solid fa-folder text-warning me-1' : 'fa-regular fa-folder text-muted me-1';
    leftDiv.appendChild(folderIcon);

    // Name
    const nameSpan = document.createElement('span');
    nameSpan.className = 'fw-bold text-dark';
    nameSpan.textContent = category.name;
    leftDiv.appendChild(nameSpan);

    // Code Badge
    const codeBadge = document.createElement('span');
    codeBadge.className = 'badge bg-light text-muted border font-monospace ms-1';
    codeBadge.textContent = category.code;
    leftDiv.appendChild(codeBadge);

    // Status Badge
    const statusBadge = document.createElement('span');
    statusBadge.className = category.isActive ? 'badge bg-success bg-opacity-10 text-success border border-success ms-1' : 'badge bg-secondary bg-opacity-10 text-secondary border ms-1';
    statusBadge.textContent = category.isActive ? 'نشطة' : 'معطلة';
    leftDiv.appendChild(statusBadge);

    // Product Count Badge
    if (category.productCount > 0) {
      const productBadge = document.createElement('span');
      productBadge.className = 'badge bg-info bg-opacity-10 text-info border border-info ms-1';
      productBadge.textContent = `${category.productCount} منتج`;
      leftDiv.appendChild(productBadge);
    }

    nodeItem.appendChild(leftDiv);

    // Right Actions section
    const rightDiv = document.createElement('div');
    rightDiv.className = 'd-inline-flex gap-1 align-items-center';

    // Add subcategory button
    if (permissions.canCreateCategory) {
      const addSubBtn = document.createElement('a');
      addSubBtn.href = `/inventory/categories/create?parentId=${encodeURIComponent(category.id)}`;
      addSubBtn.className = 'btn btn-sm btn-outline-success';
      addSubBtn.title = 'إضافة فئة فرعية';
      const addIcon = document.createElement('i');
      addIcon.className = 'fa-solid fa-plus';
      addSubBtn.appendChild(addIcon);
      rightDiv.appendChild(addSubBtn);
    }

    // Edit button
    if (permissions.canUpdateCategory) {
      const editBtn = document.createElement('a');
      editBtn.href = `/inventory/categories/${encodeURIComponent(category.id)}/edit`;
      editBtn.className = 'btn btn-sm btn-outline-primary';
      editBtn.title = 'تعديل الفئة';
      const editIcon = document.createElement('i');
      editIcon.className = 'fa-solid fa-pen-to-square';
      editBtn.appendChild(editIcon);
      rightDiv.appendChild(editBtn);
    }

    // Archive button
    if (permissions.canDeleteCategory) {
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn btn-sm btn-outline-danger';
      deleteBtn.title = 'أرشفة الفئة';
      const delIcon = document.createElement('i');
      delIcon.className = 'fa-solid fa-trash-can';
      deleteBtn.appendChild(delIcon);
      deleteBtn.addEventListener('click', () => handleDeleteCategory(category));
      rightDiv.appendChild(deleteBtn);
    }

    nodeItem.appendChild(rightDiv);
    nodeWrapper.appendChild(nodeItem);

    // Container for children
    if (category.hasChildren) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children-container d-none';
      nodeWrapper.appendChild(childrenContainer);
    }

    return nodeWrapper;
  }

  /**
   * Handles expanding and collapsing a tree node with pagination load more support.
   */
  async function handleToggleChildren(toggleBtn, nodeWrapper, level) {
    const childrenContainer = nodeWrapper.querySelector('.tree-children-container');
    if (!childrenContainer) return;

    const isExpanded = toggleBtn.dataset.expanded === 'true';
    const isLoaded = toggleBtn.dataset.loaded === 'true';
    const categoryId = toggleBtn.dataset.categoryId;

    if (isExpanded) {
      // Collapse
      childrenContainer.classList.add('d-none');
      toggleBtn.classList.remove('expanded');
      toggleBtn.dataset.expanded = 'false';
    } else {
      // Expand
      if (!isLoaded) {
        toggleBtn.disabled = true;
        let childPage = 1;
        const childLimit = 50;

        async function fetchChildrenPage(page) {
          try {
            const res = await fetch(`/api/inventory/categories/${encodeURIComponent(categoryId)}/children?page=${page}&limit=${childLimit}`);
            const json = await res.json();

            if (json.success && json.data) {
              if (page === 1) {
                childrenContainer.textContent = '';
              }
              // Remove old load more button if exists
              const oldBtn = childrenContainer.querySelector('.btn-load-more-children');
              if (oldBtn) oldBtn.remove();

              json.data.items.forEach((child) => {
                childrenContainer.appendChild(createCategoryNodeElement(child, level));
              });

              if (json.data.page < json.data.totalPages) {
                const loadMoreBtn = document.createElement('button');
                loadMoreBtn.type = 'button';
                loadMoreBtn.className = 'btn btn-sm btn-link text-decoration-none text-muted my-1 ps-4 btn-load-more-children';
                loadMoreBtn.textContent = `تحميل المزيد (${json.data.total - page * childLimit} متبقية)...`;
                loadMoreBtn.addEventListener('click', () => {
                  childPage++;
                  fetchChildrenPage(childPage);
                });
                childrenContainer.appendChild(loadMoreBtn);
              }

              toggleBtn.dataset.loaded = 'true';
            } else {
              showAlert(json.message || 'فشل في تحميل الفئات الفرعية');
            }
          } catch (err) {
            showAlert('حدث خطأ أثناء تحميل الفئات الفرعية');
          } finally {
            toggleBtn.disabled = false;
          }
        }

        await fetchChildrenPage(1);
      }

      childrenContainer.classList.remove('d-none');
      toggleBtn.classList.add('expanded');
      toggleBtn.dataset.expanded = 'true';
    }
  }

  /**
   * Loads root categories into tree container with pagination load more support.
   */
  async function loadRootCategories() {
    if (!treeContainer) return;

    treeContainer.textContent = '';
    const spinner = document.createElement('div');
    spinner.className = 'text-center py-4 text-muted';
    const spinIcon = document.createElement('div');
    spinIcon.className = 'spinner-border spinner-border-sm text-success me-2';
    spinner.appendChild(spinIcon);
    const spinnerText = document.createElement('span');
    spinnerText.textContent = 'جاري تحميل شجرة الفئات...';
    spinner.appendChild(spinnerText);
    treeContainer.appendChild(spinner);

    if (treeStatusBadge) treeStatusBadge.textContent = 'جاري التحميل...';

    let rootPage = 1;
    const rootLimit = 50;

    async function fetchRootsPage(page) {
      try {
        const res = await fetch(`/api/inventory/categories/roots?page=${page}&limit=${rootLimit}`);
        const json = await res.json();

        if (page === 1) {
          treeContainer.textContent = '';
        }
        // Remove old load more button if present
        const oldRootBtn = treeContainer.querySelector('.btn-load-more-roots');
        if (oldRootBtn) oldRootBtn.remove();

        if (json.success && json.data) {
          const roots = json.data.items;
          if (treeStatusBadge) treeStatusBadge.textContent = `${json.data.total} فئة رئيسية`;

          if (page === 1 && roots.length === 0) {
            const emptyDiv = document.createElement('div');
            emptyDiv.className = 'text-center py-5 text-muted';
            emptyDiv.textContent = 'لا توجد فئات بعد. ابدأ بإضافة فئة رئيسية.';
            treeContainer.appendChild(emptyDiv);
            return;
          }

          roots.forEach((root) => {
            treeContainer.appendChild(createCategoryNodeElement(root, 0));
          });

          if (json.data.page < json.data.totalPages) {
            const loadMoreRootsBtn = document.createElement('div');
            loadMoreRootsBtn.className = 'text-center my-3 btn-load-more-roots';
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'btn btn-sm btn-outline-secondary rounded-pill px-4';
            btn.textContent = `تحميل المزيد من الفئات الرئيسية (${json.data.total - page * rootLimit} متبقية)...`;
            btn.addEventListener('click', () => {
              rootPage++;
              fetchRootsPage(rootPage);
            });
            loadMoreRootsBtn.appendChild(btn);
            treeContainer.appendChild(loadMoreRootsBtn);
          }
        } else {
          showAlert(json.message || 'فشل في تحميل الفئات');
        }
      } catch (err) {
        showAlert('حدث خطأ أثناء الاتصال بالخادم لتحميل الفئات');
      }
    }

    await fetchRootsPage(1);
  }

  /**
   * Handles soft delete (archive) of a category using SweetAlert2 confirmation.
   */
  async function handleDeleteCategory(category) {
    const actionTitle = 'أرشفة الفئة';
    const actionText = `هل أنت متأكد من رغبتك في أرشفة فئة "${category.name}"؟ لن تظهر في الخيارات الجديدة.`;

    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: actionTitle,
        text: actionText,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EE5253',
        cancelButtonColor: '#6B7280',
        confirmButtonText: 'نعم، أرشفة الفئة',
        cancelButtonText: 'إلغاء',
      }).then(async (result) => {
        if (result.isConfirmed) {
          await executeDeleteCategory(category);
        }
      });
    } else {
      if (confirm(actionText)) {
        await executeDeleteCategory(category);
      }
    }
  }

  async function executeDeleteCategory(category) {
    try {
      const res = await window.erpFetch(`/api/inventory/categories/${encodeURIComponent(category.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json();

      if (json.success) {
        if (typeof Swal !== 'undefined') {
          const Toast = Swal.mixin({
            toast: true,
            position: 'top-start',
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
          });
          Toast.fire({ icon: 'success', title: json.message || 'تمت أرشفة الفئة بنجاح' });
        } else {
          showAlert(json.message || 'تمت أرشفة الفئة بنجاح', 'success');
        }
        loadRootCategories();
      } else {
        const errorMsg = extractApiErrorMessage(json, 'فشل في أرشفة الفئة');
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            icon: 'error',
            title: 'تعذر أرشفة الفئة',
            text: errorMsg,
            confirmButtonText: 'حسناً',
            confirmButtonColor: '#10AC84',
          });
        } else {
          showAlert(errorMsg, 'danger');
        }
      }
    } catch (err) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: 'error',
          title: 'خطأ في الاتصال',
          text: 'تعذر الاتصال بالخادم أثناء أرشفة الفئة',
          confirmButtonText: 'حسناً',
          confirmButtonColor: '#10AC84',
        });
      } else {
        showAlert('حدث خطأ أثناء تنفيذ عملية الأرشفة', 'danger');
      }
    }
  }

  /**
   * Handles Flat Search for categories.
   */
  let searchTimeout = null;
  if (categorySearchInput) {
    categorySearchInput.addEventListener('input', (e) => {
      const term = e.target.value.trim();
      clearTimeout(searchTimeout);

      if (term === '') {
        if (searchResultsArea) searchResultsArea.classList.add('d-none');
        if (treeContainer) treeContainer.classList.remove('d-none');
        return;
      }

      searchTimeout = setTimeout(() => performSearch(term), 300);
    });
  }

  if (btnClearSearch) {
    btnClearSearch.addEventListener('click', () => {
      if (categorySearchInput) categorySearchInput.value = '';
      if (searchResultsArea) searchResultsArea.classList.add('d-none');
      if (treeContainer) treeContainer.classList.remove('d-none');
    });
  }

  if (btnRefreshTree) {
    btnRefreshTree.addEventListener('click', () => {
      loadRootCategories();
    });
  }

  async function performSearch(term) {
    if (!searchResultsArea || !searchResultsTableBody) return;

    searchResultsArea.classList.remove('d-none');
    if (treeContainer) treeContainer.classList.add('d-none');

    searchResultsTableBody.textContent = '';
    const loadingRow = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.className = 'text-center py-3 text-muted';
    td.textContent = 'جاري البحث...';
    loadingRow.appendChild(td);
    searchResultsTableBody.appendChild(loadingRow);

    try {
      const res = await fetch(`/api/inventory/categories/search?search=${encodeURIComponent(term)}&limit=50`);
      const json = await res.json();

      searchResultsTableBody.textContent = '';

      if (json.success && json.data) {
        const items = json.data.items;
        if (items.length === 0) {
          const emptyRow = document.createElement('tr');
          const emptyTd = document.createElement('td');
          emptyTd.colSpan = 6;
          emptyTd.className = 'text-center py-4 text-muted';
          emptyTd.textContent = 'لم يتم العثور على نتائج مطابقة للبحث';
          emptyRow.appendChild(emptyTd);
          searchResultsTableBody.appendChild(emptyRow);
          return;
        }

        items.forEach((cat) => {
          const tr = document.createElement('tr');

          // Name
          const tdName = document.createElement('td');
          tdName.className = 'fw-bold';
          tdName.textContent = cat.name;
          tr.appendChild(tdName);

          // Code
          const tdCode = document.createElement('td');
          const codeBadge = document.createElement('span');
          codeBadge.className = 'badge bg-light text-muted border font-monospace';
          codeBadge.textContent = cat.code;
          tdCode.appendChild(codeBadge);
          tr.appendChild(tdCode);

          // Parent
          const tdParent = document.createElement('td');
          tdParent.className = 'text-muted';
          tdParent.textContent = cat.parentName || '-- رئيسية --';
          tr.appendChild(tdParent);

          // Status
          const tdStatus = document.createElement('td');
          const stBadge = document.createElement('span');
          stBadge.className = cat.isActive ? 'badge bg-success bg-opacity-10 text-success border border-success' : 'badge bg-secondary bg-opacity-10 text-secondary border';
          stBadge.textContent = cat.isActive ? 'نشطة' : 'معطلة';
          tdStatus.appendChild(stBadge);
          tr.appendChild(tdStatus);

          // Products
          const tdProducts = document.createElement('td');
          tdProducts.textContent = `${cat.productCount} منتج`;
          tr.appendChild(tdProducts);

          // Actions
          const tdActions = document.createElement('td');
          tdActions.className = 'text-end';
          const actionGroup = document.createElement('div');
          actionGroup.className = 'd-inline-flex gap-1';

          if (permissions.canUpdateCategory) {
            const editLink = document.createElement('a');
            editLink.href = `/inventory/categories/${encodeURIComponent(cat.id)}/edit`;
            editLink.className = 'btn btn-sm btn-outline-primary';
            editLink.title = 'تعديل الفئة';
            const editIcon = document.createElement('i');
            editIcon.className = 'fa-solid fa-pen-to-square';
            editLink.appendChild(editIcon);
            actionGroup.appendChild(editLink);
          }

          if (permissions.canDeleteCategory) {
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn btn-sm btn-outline-danger';
            delBtn.title = 'أرشفة الفئة';
            const delIcon = document.createElement('i');
            delIcon.className = 'fa-solid fa-trash-can';
            delBtn.appendChild(delIcon);
            delBtn.addEventListener('click', () => handleDeleteCategory(cat));
            actionGroup.appendChild(delBtn);
          }

          tdActions.appendChild(actionGroup);

          tr.appendChild(tdActions);
          searchResultsTableBody.appendChild(tr);
        });
      }
    } catch (err) {
      searchResultsTableBody.textContent = '';
      showAlert('حدث خطأ أثناء البحث عن الفئات');
    }
  }

  // --- Category Form Handling (Create & Edit) ---

  if (createCategoryForm) {
    const initialParentId = categoryParentSelect ? categoryParentSelect.dataset.initialParent : '';
    loadCategoryOptions(initialParentId);

    createCategoryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormError();

      const nameInput = document.getElementById('categoryName');
      const codeInput = document.getElementById('categoryCode');
      const descInput = document.getElementById('categoryDescription');
      const parentSelect = document.getElementById('categoryParentId');
      const activeCheckbox = document.getElementById('categoryIsActive');
      const submitBtn = document.getElementById('btnSubmitCategory');
      const spinner = document.getElementById('submitSpinner');

      const name = nameInput ? nameInput.value.trim() : '';
      const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
      const description = descInput ? descInput.value.trim() || null : null;
      const parentId = parentSelect && parentSelect.value ? parentSelect.value : null;
      const isActive = activeCheckbox ? activeCheckbox.checked : true;

      if (!createCategoryForm.checkValidity()) {
        e.stopPropagation();
        createCategoryForm.classList.add('was-validated');
        showFormError('يرجى التحقق من ملء جميع الحقول المطلوبة بشكل صحيح.');
        return;
      }

      if (!name) {
        showFormError('اسم الفئة مطلوب');
        return;
      }
      if (!code) {
        showFormError('رمز الفئة (الكود) مطلوب');
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      if (spinner) spinner.classList.remove('d-none');

      try {
        const payload = { name, code, description, parentId, isActive };
        const res = await window.erpFetch('/api/inventory/categories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();

        if (json.success) {
          sessionStorage.setItem('pendingToast', 'تم إنشاء الفئة بنجاح');
          window.location.href = '/inventory/categories';
        } else {
          const errorMsg = extractApiErrorMessage(json, 'فشل في إنشاء الفئة');
          showFormError(errorMsg);
        }
      } catch (err) {
        showFormError('حدث خطأ أثناء إرسال البيانات إلى الخادم');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (spinner) spinner.classList.add('d-none');
      }
    });
  }

  if (editCategoryForm) {
    const categoryId = editCategoryForm.dataset.categoryId;

    // Load category details
    async function loadCategoryDetails() {
      try {
        const res = await fetch(`/api/inventory/categories/${encodeURIComponent(categoryId)}`);
        const json = await res.json();

        if (json.success && json.data) {
          const cat = json.data;
          const codeInput = document.getElementById('categoryCodeReadOnly');
          const nameInput = document.getElementById('categoryName');
          const descInput = document.getElementById('categoryDescription');
          const activeCheckbox = document.getElementById('categoryIsActive');
          const codeBadge = document.getElementById('categoryCodeBadge');

          if (codeInput) codeInput.value = cat.code;
          if (codeBadge) codeBadge.textContent = cat.code;
          if (nameInput) nameInput.value = cat.name;
          if (descInput) descInput.value = cat.description || '';
          if (activeCheckbox) activeCheckbox.checked = cat.isActive;
          await loadCategoryOptions(cat.parentId || '', cat.parent ? cat.parent.name : '');
        } else {
          showFormError(json.message || 'فشل في تحميل بيانات الفئة');
        }
      } catch (err) {
        showFormError('حدث خطأ أثناء تحميل بيانات الفئة');
      }
    }

    loadCategoryDetails();

    editCategoryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormError();

      const nameInput = document.getElementById('categoryName');
      const descInput = document.getElementById('categoryDescription');
      const parentSelect = document.getElementById('categoryParentId');
      const activeCheckbox = document.getElementById('categoryIsActive');
      const submitBtn = document.getElementById('btnSubmitCategory');
      const spinner = document.getElementById('submitSpinner');

      const name = nameInput ? nameInput.value.trim() : '';
      const description = descInput ? descInput.value.trim() || null : null;
      const parentId = parentSelect && parentSelect.value ? parentSelect.value : null;
      const isActive = activeCheckbox ? activeCheckbox.checked : true;

      if (!editCategoryForm.checkValidity()) {
        e.stopPropagation();
        editCategoryForm.classList.add('was-validated');
        showFormError('يرجى التحقق من ملء جميع الحقول المطلوبة بشكل صحيح.');
        return;
      }

      if (!name) {
        showFormError('اسم الفئة مطلوب');
        return;
      }

      if (submitBtn) submitBtn.disabled = true;
      if (spinner) spinner.classList.remove('d-none');

      try {
        const payload = { name, description, parentId, isActive };
        const res = await window.erpFetch(`/api/inventory/categories/${encodeURIComponent(categoryId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();

        if (json.success) {
          sessionStorage.setItem('pendingToast', 'تم حفظ تعديلات الفئة بنجاح');
          window.location.href = '/inventory/categories';
        } else {
          const errorMsg = extractApiErrorMessage(json, 'فشل في حفظ تعديلات الفئة');
          showFormError(errorMsg);
        }
      } catch (err) {
        showFormError('حدث خطأ أثناء إرسال التعديلات إلى الخادم');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (spinner) spinner.classList.add('d-none');
      }
    });
  }

  // Initial load for tree if tree container is present
  if (treeContainer) {
    loadRootCategories();
  }
});
