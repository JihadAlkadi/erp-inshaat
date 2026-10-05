/**
 * Inventory Categories Management Script
 * Handles categories table view, search, pagination, create, edit, and soft delete.
 * Security: Uses window.erpFetch for all mutations and native DOM APIs to prevent XSS.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Table & Listing Elements
  const categoriesTableBody = document.getElementById('categoriesTableBody');
  const categorySearchForm = document.getElementById('categorySearchForm');
  const categorySearchInput = document.getElementById('categorySearchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const categoriesPagination = document.getElementById('categoriesPagination');
  const categoriesPaginationInfo = document.getElementById('categoriesPaginationInfo');
  const alertContainer = document.getElementById('categoryAlertContainer') || document.getElementById('categoryFormAlertContainer');

  // Form Elements (if on create or edit page)
  const createCategoryForm = document.getElementById('createCategoryForm');
  const editCategoryForm = document.getElementById('editCategoryForm');
  const categoryParentSelect = document.getElementById('categoryParentId');

  const permissions = window.INVENTORY_PERMISSIONS || {
    canCreateCategory: false,
    canUpdateCategory: false,
    canDeleteCategory: false,
  };

  let currentPage = 1;
  let currentSearch = '';
  let searchDebounceTimeout = null;

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
      const options = await fetchAllActiveCategoryOptions();

      while (categoryParentSelect.options.length > 1) {
        categoryParentSelect.remove(1);
      }

      const currentCategoryId = editCategoryForm ? editCategoryForm.dataset.categoryId : null;
      let selectedFound = false;

      options.forEach((cat) => {
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

  // ==========================================
  // 1. CATEGORIES MANAGEMENT TABLE LOGIC
  // ==========================================

  async function loadCategories(page = 1, search = '') {
    if (!categoriesTableBody) return;

    currentPage = page;
    currentSearch = search;

    // Show loading spinner row
    categoriesTableBody.textContent = '';
    const loadingRow = document.createElement('tr');
    const loadingTd = document.createElement('td');
    loadingTd.colSpan = 7;
    loadingTd.className = 'text-center py-5 text-muted';
    const spinner = document.createElement('div');
    spinner.className = 'spinner-border spinner-border-sm text-secondary me-2';
    spinner.setAttribute('role', 'status');
    loadingTd.appendChild(spinner);
    const spinnerText = document.createElement('span');
    spinnerText.textContent = 'جاري تحميل الفئات...';
    loadingTd.appendChild(spinnerText);
    loadingRow.appendChild(loadingTd);
    categoriesTableBody.appendChild(loadingRow);

    try {
      const queryParams = new URLSearchParams({
        page: String(page),
        limit: '15',
      });
      if (search && search.trim() !== '') {
        queryParams.set('search', search.trim());
      }

      const res = await fetch(`/api/inventory/categories?${queryParams.toString()}`);
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      const json = await res.json();

      categoriesTableBody.textContent = '';

      if (json.success && json.data) {
        const { items, total, totalPages, page: currentResPage } = json.data;

        if (items.length === 0) {
          const emptyRow = document.createElement('tr');
          const emptyTd = document.createElement('td');
          emptyTd.colSpan = 7;
          emptyTd.className = 'text-center py-5 text-muted';
          emptyTd.textContent = search ? 'لم يتم العثور على فئات مطابقة للبحث' : 'لا توجد فئات حتى الآن. ابدأ بإضافة فئة جديدة.';
          emptyRow.appendChild(emptyTd);
          categoriesTableBody.appendChild(emptyRow);

          if (categoriesPaginationInfo) {
            categoriesPaginationInfo.textContent = 'لا توجد نتائج';
          }
          if (categoriesPagination) {
            categoriesPagination.textContent = '';
          }
          return;
        }

        items.forEach((cat) => {
          const tr = document.createElement('tr');

          // Name
          const tdName = document.createElement('td');
          tdName.className = 'py-3 px-4';
          const nameWrap = document.createElement('div');
          nameWrap.className = 'd-flex align-items-center gap-2';

          const iconWrap = document.createElement('div');
          iconWrap.className = 'bg-light text-muted p-2 rounded-3 d-flex align-items-center justify-content-center';
          iconWrap.style.width = '36px';
          iconWrap.style.height = '36px';
          const icon = document.createElement('i');
          icon.className = 'fa-solid fa-folder text-muted';
          iconWrap.appendChild(icon);
          nameWrap.appendChild(iconWrap);

          const textWrap = document.createElement('div');
          const nameStrong = document.createElement('strong');
          nameStrong.className = 'text-dark d-block';
          nameStrong.textContent = cat.name;
          textWrap.appendChild(nameStrong);
          if (cat.description) {
            const descSmall = document.createElement('small');
            descSmall.className = 'text-muted d-block text-truncate';
            descSmall.style.maxWidth = '250px';
            descSmall.textContent = cat.description;
            textWrap.appendChild(descSmall);
          }
          nameWrap.appendChild(textWrap);
          tdName.appendChild(nameWrap);
          tr.appendChild(tdName);

          // Code
          const tdCode = document.createElement('td');
          tdCode.className = 'py-3';
          const codeBadge = document.createElement('span');
          codeBadge.className = 'badge bg-light text-muted border font-monospace';
          codeBadge.textContent = cat.code;
          tdCode.appendChild(codeBadge);
          tr.appendChild(tdCode);

          // Parent Category
          const tdParent = document.createElement('td');
          tdParent.className = 'py-3 text-muted small';
          if (cat.parentId && cat.parentName) {
            tdParent.textContent = cat.parentName;
          } else {
            const rootBadge = document.createElement('span');
            rootBadge.className = 'badge bg-light text-dark border';
            rootBadge.textContent = 'فئة رئيسية';
            tdParent.appendChild(rootBadge);
          }
          tr.appendChild(tdParent);

          // Products Count
          const tdProducts = document.createElement('td');
          tdProducts.className = 'py-3 text-center';
          const prodBadge = document.createElement('span');
          prodBadge.className = 'badge bg-light text-dark border';
          prodBadge.textContent = String(cat.productCount || 0);
          tdProducts.appendChild(prodBadge);
          tr.appendChild(tdProducts);

          // Subcategories Count
          const tdChildren = document.createElement('td');
          tdChildren.className = 'py-3 text-center';
          const childBadge = document.createElement('span');
          childBadge.className = 'badge bg-light text-dark border';
          childBadge.textContent = String(cat.childrenCount || 0);
          tdChildren.appendChild(childBadge);
          tr.appendChild(tdChildren);

          // Status
          const tdStatus = document.createElement('td');
          tdStatus.className = 'py-3 text-center';
          const stBadge = document.createElement('span');
          stBadge.className = cat.isActive
            ? 'badge bg-success bg-opacity-10 text-success border border-success'
            : 'badge bg-secondary bg-opacity-10 text-secondary border';
          stBadge.textContent = cat.isActive ? 'نشط' : 'معطل';
          tdStatus.appendChild(stBadge);
          tr.appendChild(tdStatus);

          // Actions
          const tdActions = document.createElement('td');
          tdActions.className = 'py-3 text-center px-4';
          const actionGroup = document.createElement('div');
          actionGroup.className = 'd-flex justify-content-center gap-1';

          if (permissions.canUpdateCategory) {
            const editBtn = document.createElement('a');
            editBtn.href = `/inventory/categories/${encodeURIComponent(cat.id)}/edit`;
            editBtn.className = 'btn btn-sm btn-outline-primary';
            editBtn.title = 'تعديل الفئة';
            const editIcon = document.createElement('i');
            editIcon.className = 'fa-solid fa-pen';
            editBtn.appendChild(editIcon);
            actionGroup.appendChild(editBtn);
          }

          if (permissions.canDeleteCategory) {
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn btn-sm btn-outline-danger';
            delBtn.title = 'أرشفة الفئة';
            const delIcon = document.createElement('i');
            delIcon.className = 'fa-solid fa-box-archive';
            delBtn.appendChild(delIcon);
            delBtn.addEventListener('click', () => handleDeleteCategory(cat));
            actionGroup.appendChild(delBtn);
          }

          tdActions.appendChild(actionGroup);
          tr.appendChild(tdActions);

          categoriesTableBody.appendChild(tr);
        });

        renderCategoriesPagination(totalPages, currentResPage, total);
      } else {
        showAlert(json.message || 'فشل في تحميل الفئات');
      }
    } catch (err) {
      console.error('Error loading categories:', err);
      showAlert('حدث خطأ أثناء الاتصال بالخادم لتحميل قائمة الفئات');
    }
  }

  function renderCategoriesPagination(totalPages, page, total) {
    if (categoriesPaginationInfo) {
      categoriesPaginationInfo.textContent = `عرض الصفحة ${page} من ${totalPages || 1} (إجمالي ${total} فئة)`;
    }

    if (!categoriesPagination) return;
    categoriesPagination.textContent = '';

    if (totalPages <= 1) return;

    // Previous Button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${page === 1 ? 'disabled' : ''}`;
    const prevA = document.createElement('a');
    prevA.className = 'page-link';
    prevA.href = '#';
    prevA.textContent = 'السابق';
    prevA.addEventListener('click', (e) => {
      e.preventDefault();
      if (page > 1) loadCategories(page - 1, currentSearch);
    });
    prevLi.appendChild(prevA);
    categoriesPagination.appendChild(prevLi);

    // Numbered Pages
    const start = Math.max(1, page - 2);
    const end = Math.min(totalPages, page + 2);

    for (let i = start; i <= end; i++) {
      const pageLi = document.createElement('li');
      pageLi.className = `page-item ${i === page ? 'active' : ''}`;
      const pageA = document.createElement('a');
      pageA.className = 'page-link';
      pageA.href = '#';
      pageA.textContent = String(i);
      pageA.addEventListener('click', (e) => {
        e.preventDefault();
        loadCategories(i, currentSearch);
      });
      pageLi.appendChild(pageA);
      categoriesPagination.appendChild(pageLi);
    }

    // Next Button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${page === totalPages ? 'disabled' : ''}`;
    const nextA = document.createElement('a');
    nextA.className = 'page-link';
    nextA.href = '#';
    nextA.textContent = 'التالي';
    nextA.addEventListener('click', (e) => {
      e.preventDefault();
      if (page < totalPages) loadCategories(page + 1, currentSearch);
    });
    nextLi.appendChild(nextA);
    categoriesPagination.appendChild(nextLi);
  }

  async function handleDeleteCategory(category) {
    if (!confirm(`هل أنت متأكد من أرشفة فئة "${category.name}"؟`)) {
      return;
    }

    try {
      const res = await window.erpFetch(`/api/inventory/categories/${encodeURIComponent(category.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json();

      if (json.success) {
        showAlert(json.message || 'تمت أرشفة الفئة بنجاح', 'success');
        loadCategories(currentPage, currentSearch);
      } else {
        showAlert(json.message || 'فشل في أرشفة الفئة');
      }
    } catch (err) {
      showAlert('حدث خطأ أثناء تنفيذ عملية الأرشفة');
    }
  }

  // Bind Table search events
  if (categoriesTableBody) {
    loadCategories(1, '');

    if (categorySearchForm) {
      categorySearchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const term = categorySearchInput ? categorySearchInput.value.trim() : '';
        if (btnClearSearch) {
          if (term) {
            btnClearSearch.classList.remove('d-none');
          } else {
            btnClearSearch.classList.add('d-none');
          }
        }
        loadCategories(1, term);
      });
    }

    if (categorySearchInput) {
      categorySearchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim();
        clearTimeout(searchDebounceTimeout);
        if (btnClearSearch) {
          if (term) {
            btnClearSearch.classList.remove('d-none');
          } else {
            btnClearSearch.classList.add('d-none');
          }
        }
        searchDebounceTimeout = setTimeout(() => {
          loadCategories(1, term);
        }, 350);
      });
    }

    if (btnClearSearch) {
      btnClearSearch.addEventListener('click', () => {
        if (categorySearchInput) categorySearchInput.value = '';
        btnClearSearch.classList.add('d-none');
        loadCategories(1, '');
      });
    }
  }

  // ==========================================
  // 2. CATEGORY FORM HANDLING (CREATE & EDIT)
  // ==========================================

  if (createCategoryForm) {
    const initialParentId = categoryParentSelect ? categoryParentSelect.dataset.initialParent : '';
    loadCategoryOptions(initialParentId);

    createCategoryForm.addEventListener('submit', async (e) => {
      e.preventDefault();

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

      if (!name) {
        showAlert('اسم الفئة مطلوب');
        return;
      }
      if (!code) {
        showAlert('رمز الفئة (الكود) مطلوب');
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
          window.location.href = '/inventory/categories';
        } else {
          showAlert(json.message || 'فشل في إنشاء الفئة');
        }
      } catch (err) {
        showAlert('حدث خطأ أثناء إرسال البيانات إلى الخادم');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (spinner) spinner.classList.add('d-none');
      }
    });
  }

  if (editCategoryForm) {
    const categoryId = editCategoryForm.dataset.categoryId;

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
          showAlert(json.message || 'فشل في تحميل بيانات الفئة');
        }
      } catch (err) {
        showAlert('حدث خطأ أثناء تحميل بيانات الفئة');
      }
    }

    loadCategoryDetails();

    editCategoryForm.addEventListener('submit', async (e) => {
      e.preventDefault();

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

      if (!name) {
        showAlert('اسم الفئة مطلوب');
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
          window.location.href = '/inventory/categories';
        } else {
          showAlert(json.message || 'فشل في حفظ تعديلات الفئة');
        }
      } catch (err) {
        showAlert('حدث خطأ أثناء إرسال التعديلات إلى الخادم');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (spinner) spinner.classList.add('d-none');
      }
    });
  }
});
