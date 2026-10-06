/**
 * Inventory Products & Units Management Script
 * Handles product catalog listing, creation with base unit, editing, unit conversion graph mutations.
 * Security: Uses window.erpFetch for all mutations and native DOM APIs to prevent XSS.
 */

document.addEventListener('DOMContentLoaded', () => {
  const alertContainer = document.getElementById('productAlertContainer') || document.getElementById('productFormAlertContainer');

  const permissions = window.INVENTORY_PERMISSIONS || {
    canCreateProduct: false,
    canUpdateProduct: false,
    canDeleteProduct: false,
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
  function showFormError(message, containerId = 'formAlert') {
    const alertEl = document.getElementById(containerId);
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
  function clearFormError(containerId = 'formAlert') {
    const alertEl = document.getElementById(containerId);
    if (alertEl) {
      alertEl.textContent = '';
      alertEl.classList.add('d-none');
    }
  }

  /**
   * Helper to show Bootstrap alert safely without innerHTML XSS.
   */
  function showAlert(message, type = 'danger', targetContainer = null) {
    const container = targetContainer || alertContainer;
    if (!container) return;
    container.textContent = ''; // clear

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

    container.appendChild(alertDiv);
    container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Helper to create dynamic specification row DOM element.
   */
  function createSpecRowElement(spec = { name: '', value: '', unit: '' }) {
    const row = document.createElement('div');
    row.className = 'row g-2 align-items-center spec-row';

    // Spec Name
    const colName = document.createElement('div');
    colName.className = 'col-12 col-sm-4';
    const inputName = document.createElement('input');
    inputName.type = 'text';
    inputName.className = 'form-control form-control-sm spec-name-input';
    inputName.placeholder = 'اسم الخاصية (مثال: الطول)';
    inputName.maxLength = 100;
    inputName.value = spec.name || '';
    colName.appendChild(inputName);
    row.appendChild(colName);

    // Spec Value
    const colVal = document.createElement('div');
    colVal.className = 'col-12 col-sm-4';
    const inputVal = document.createElement('input');
    inputVal.type = 'text';
    inputVal.className = 'form-control form-control-sm spec-value-input';
    inputVal.placeholder = 'القيمة (مثال: 50)';
    inputVal.maxLength = 255;
    inputVal.value = spec.value || '';
    colVal.appendChild(inputVal);
    row.appendChild(colVal);

    // Spec Unit
    const colUnit = document.createElement('div');
    colUnit.className = 'col-8 col-sm-3';
    const inputUnit = document.createElement('input');
    inputUnit.type = 'text';
    inputUnit.className = 'form-control form-control-sm spec-unit-input';
    inputUnit.placeholder = 'الوحدة (مثال: سم)';
    inputUnit.maxLength = 50;
    inputUnit.value = spec.unit || '';
    colUnit.appendChild(inputUnit);
    row.appendChild(colUnit);

    // Remove Button
    const colBtn = document.createElement('div');
    colBtn.className = 'col-4 col-sm-1 text-end';
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-sm btn-outline-danger w-100';
    delBtn.title = 'حذف الخاصية';
    const delIcon = document.createElement('i');
    delIcon.className = 'fa-solid fa-trash';
    delBtn.appendChild(delIcon);
    delBtn.addEventListener('click', () => row.remove());
    colBtn.appendChild(delBtn);
    row.appendChild(colBtn);

    return row;
  }

  /**
   * Helper to collect specifications from a container.
   * Returns validation result:
   * - If both name and value are empty: row is ignored.
   * - If name provided but value empty: invalid.
   * - If value provided but name empty: invalid.
   */
  function collectSpecifications(container) {
    if (!container) return { valid: true, specifications: null };
    const rows = container.querySelectorAll('.spec-row');
    if (rows.length === 0) return { valid: true, specifications: null };

    const specs = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const nameInput = r.querySelector('.spec-name-input');
      const valInput = r.querySelector('.spec-value-input');
      const unitInput = r.querySelector('.spec-unit-input');

      const name = nameInput ? nameInput.value.trim() : '';
      const value = valInput ? valInput.value.trim() : '';
      const unit = unitInput ? unitInput.value.trim() || null : null;

      if (!name && !value) {
        continue;
      }

      if (name && !value) {
        return {
          valid: false,
          specifications: null,
          message: `تم إدخال اسم الخاصية "${name}" بدون تحديد القيمة`,
        };
      }

      if (!name && value) {
        return {
          valid: false,
          specifications: null,
          message: `تم إدخال قيمة الخاصية "${value}" بدون تحديد اسم الخاصية`,
        };
      }

      specs.push({ name, value, unit });
    }

    return {
      valid: true,
      specifications: specs.length > 0 ? specs : null,
    };
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
   * Populate category options dropdown (preserving inactive current category).
   * Rebuilds select only after 100% of pages are successfully fetched (fail-closed).
   */
  async function loadCategoryOptionsForProduct(selectElement, selectedId = '', currentCategoryName = '') {
    if (!selectElement) return;

    try {
      // 1. Fetch all pages first into temporary array
      const options = await fetchAllActiveCategoryOptions();

      // 2. Only rebuild select after complete success
      while (selectElement.options.length > 1) {
        selectElement.remove(1);
      }

      let selectedFound = false;

      options.forEach((cat) => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = cat.parentName ? `${cat.name} (${cat.code}) - [${cat.parentName}]` : `${cat.name} (${cat.code})`;
        if (cat.id === selectedId) {
          opt.selected = true;
          selectedFound = true;
        }
        selectElement.appendChild(opt);
      });

      if (selectedId && !selectedFound) {
        const inactiveOpt = document.createElement('option');
        inactiveOpt.value = selectedId;
        inactiveOpt.selected = true;
        inactiveOpt.textContent = currentCategoryName ? `${currentCategoryName} (معطلة)` : 'الفئة الحالية (معطلة)';
        selectElement.appendChild(inactiveOpt);
      }
    } catch (err) {
      console.error('Failed to load category options:', err);
      showAlert('فشل في تحميل قائمة فئات المنتجات بشكل كامل. تم الحفاظ على الحالة الحالية لمنع فقدان البيانات.');
    }
  }

  // ==========================================
  // 1. PRODUCT LIST PAGE (/inventory/products)
  // ==========================================

  const productsTableBody = document.getElementById('productsTableBody');
  const productSearchInput = document.getElementById('productSearchInput');
  const categoryFilterSelect = document.getElementById('categoryFilterSelect');
  const statusFilterSelect = document.getElementById('statusFilterSelect');
  const btnRefreshProducts = document.getElementById('btnRefreshProducts');
  const productsCountBadge = document.getElementById('productsCountBadge');
  const productsPagination = document.getElementById('productsPagination');
  const paginationInfo = document.getElementById('paginationInfo');

  // Category Tree DOM Elements
  const desktopCategoryTreeContainer = document.getElementById('desktopCategoryTreeContainer');
  const desktopCategoryTreeSearch = document.getElementById('desktopCategoryTreeSearch');
  const desktopAllProductsBtn = document.getElementById('desktopAllProductsBtn');
  const desktopTreeCountBadge = document.getElementById('desktopTreeCountBadge');

  const mobileCategoryTreeContainer = document.getElementById('mobileCategoryTreeContainer');
  const mobileCategoryTreeSearch = document.getElementById('mobileCategoryTreeSearch');
  const mobileAllProductsBtn = document.getElementById('mobileAllProductsBtn');
  const categoryOffcanvasEl = document.getElementById('categoryOffcanvas');

  const activeCategoryBanner = document.getElementById('activeCategoryBanner');
  const activeCategoryName = document.getElementById('activeCategoryName');
  const btnClearCategoryFilter = document.getElementById('btnClearCategoryFilter');

  let selectedCategoryId = null;
  let selectedCategoryName = null;
  let categoryTreeData = [];

  let currentPage = 1;
  const pageLimit = 20;
  let listSearchTimeout = null;

  async function loadProducts(page = 1) {
    if (!productsTableBody) return;

    currentPage = page;
    productsTableBody.textContent = '';

    const loadingRow = document.createElement('tr');
    const loadingTd = document.createElement('td');
    loadingTd.colSpan = 8;
    loadingTd.className = 'text-center py-5 text-muted';
    const spin = document.createElement('div');
    spin.className = 'spinner-border spinner-border-sm text-success me-2';
    loadingTd.appendChild(spin);
    const txt = document.createElement('span');
    txt.textContent = 'جاري تحميل المنتجات...';
    loadingTd.appendChild(txt);
    loadingRow.appendChild(loadingTd);
    productsTableBody.appendChild(loadingRow);

    const search = productSearchInput ? productSearchInput.value.trim() : '';
    const categoryId = selectedCategoryId || (categoryFilterSelect ? categoryFilterSelect.value : '');
    const status = statusFilterSelect ? statusFilterSelect.value : 'active';

    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageLimit),
      status,
    });
    if (search) params.append('search', search);
    if (categoryId) params.append('categoryId', categoryId);

    try {
      const res = await fetch(`/api/inventory/products?${params.toString()}`);
      const json = await res.json();

      productsTableBody.textContent = '';

      if (json.success && json.data) {
        const { items, total, totalPages } = json.data;

        if (productsCountBadge) productsCountBadge.textContent = `${total} منتج`;
        if (paginationInfo) {
          const from = total === 0 ? 0 : (page - 1) * pageLimit + 1;
          const to = Math.min(total, page * pageLimit);
          paginationInfo.textContent = `عرض ${from} إلى ${to} من إجمالي ${total} منتج`;
        }

        if (items.length === 0) {
          const emptyRow = document.createElement('tr');
          const emptyTd = document.createElement('td');
          emptyTd.colSpan = 8;
          emptyTd.className = 'text-center py-5 text-muted';
          emptyTd.textContent = 'لا توجد منتجات مطابقة للبحث أو التصفية الحالية.';
          emptyRow.appendChild(emptyTd);
          productsTableBody.appendChild(emptyRow);
          renderPagination(0, 1);
          return;
        }

        items.forEach((p) => {
          const tr = document.createElement('tr');

          // Name
          const tdName = document.createElement('td');
          tdName.className = 'ps-4 fw-bold';
          const nameLink = document.createElement('a');
          nameLink.href = `/inventory/products/${encodeURIComponent(p.id)}`;
          nameLink.className = 'text-decoration-none text-dark fw-bold';
          nameLink.textContent = p.name;
          tdName.appendChild(nameLink);
          tr.appendChild(tdName);

          // Code
          const tdCode = document.createElement('td');
          const codeBadge = document.createElement('span');
          codeBadge.className = 'badge bg-light text-muted border font-monospace';
          codeBadge.textContent = p.code;
          tdCode.appendChild(codeBadge);
          tr.appendChild(tdCode);

          // Category
          const tdCat = document.createElement('td');
          tdCat.className = 'text-muted';
          tdCat.textContent = p.categoryName || '-- غير مصنف --';
          tr.appendChild(tdCat);

          // Base Unit
          const tdBase = document.createElement('td');
          const baseBadge = document.createElement('span');
          baseBadge.className = 'badge bg-success bg-opacity-10 text-success border border-success';
          baseBadge.textContent = p.baseUnitName || 'غير متسق';
          tdBase.appendChild(baseBadge);
          tr.appendChild(tdBase);

          // Unit Count
          const tdUnits = document.createElement('td');
          tdUnits.textContent = `${p.unitCount} وحدة`;
          tr.appendChild(tdUnits);

          // Location
          const tdLoc = document.createElement('td');
          tdLoc.className = 'text-muted small';
          tdLoc.textContent = p.locationName || '--';
          tr.appendChild(tdLoc);

          // Status
          const tdStatus = document.createElement('td');
          const stBadge = document.createElement('span');
          stBadge.className = p.isActive ? 'badge bg-success bg-opacity-10 text-success border border-success' : 'badge bg-secondary bg-opacity-10 text-secondary border';
          stBadge.textContent = p.isActive ? 'نشط' : 'معطل';
          tdStatus.appendChild(stBadge);
          tr.appendChild(tdStatus);

          // Actions
          const tdActions = document.createElement('td');
          tdActions.className = 'text-end pe-4';
          const actionGroup = document.createElement('div');
          actionGroup.className = 'd-inline-flex gap-1';

          // View Details Button
          const viewBtn = document.createElement('a');
          viewBtn.href = `/inventory/products/${encodeURIComponent(p.id)}`;
          viewBtn.className = 'btn btn-sm btn-outline-info';
          viewBtn.title = 'عرض تفاصيل المنتج';
          const viewIcon = document.createElement('i');
          viewIcon.className = 'fa-solid fa-eye';
          viewBtn.appendChild(viewIcon);
          actionGroup.appendChild(viewBtn);

          if (permissions.canUpdateProduct) {
            const editBtn = document.createElement('a');
            editBtn.href = `/inventory/products/${encodeURIComponent(p.id)}/edit`;
            editBtn.className = 'btn btn-sm btn-outline-primary';
            editBtn.title = 'تعديل المنتج';
            const editIcon = document.createElement('i');
            editIcon.className = 'fa-solid fa-pen-to-square';
            editBtn.appendChild(editIcon);
            actionGroup.appendChild(editBtn);
          }

          if (permissions.canDeleteProduct) {
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn btn-sm btn-outline-danger';
            delBtn.title = 'أرشفة المنتج';
            const delIcon = document.createElement('i');
            delIcon.className = 'fa-solid fa-trash-can';
            delBtn.appendChild(delIcon);
            delBtn.addEventListener('click', () => handleDeleteProduct(p));
            actionGroup.appendChild(delBtn);
          }

          tdActions.appendChild(actionGroup);

          tr.appendChild(tdActions);
          productsTableBody.appendChild(tr);
        });

        renderPagination(totalPages, page);
      } else {
        showAlert(json.message || 'فشل في تحميل المنتجات');
      }
    } catch (err) {
      showAlert('حدث خطأ أثناء الاتصال بالخادم لتحميل قائمة المنتجات');
    }
  }

  function renderPagination(totalPages, page) {
    if (!productsPagination) return;
    productsPagination.textContent = '';

    if (totalPages <= 1) return;

    // Previous
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${page === 1 ? 'disabled' : ''}`;
    const prevA = document.createElement('a');
    prevA.className = 'page-link';
    prevA.href = '#';
    prevA.textContent = 'السابق';
    prevA.addEventListener('click', (e) => {
      e.preventDefault();
      if (page > 1) loadProducts(page - 1);
    });
    prevLi.appendChild(prevA);
    productsPagination.appendChild(prevLi);

    // Page numbers (up to 5 pages around current)
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
        loadProducts(i);
      });
      pageLi.appendChild(pageA);
      productsPagination.appendChild(pageLi);
    }

    // Next
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${page === totalPages ? 'disabled' : ''}`;
    const nextA = document.createElement('a');
    nextA.className = 'page-link';
    nextA.href = '#';
    nextA.textContent = 'التالي';
    nextA.addEventListener('click', (e) => {
      e.preventDefault();
      if (page < totalPages) loadProducts(page + 1);
    });
    nextLi.appendChild(nextA);
    productsPagination.appendChild(nextLi);
  }

  async function handleDeleteProduct(product) {
    const actionTitle = 'أرشفة المنتج';
    const actionText = `هل أنت متأكد من رغبتك في أرشفة منتج "${product.name}"؟ لن يظهر في القوائم النشطة.`;

    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: actionTitle,
        text: actionText,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#EE5253',
        cancelButtonColor: '#6B7280',
        confirmButtonText: 'نعم، أرشفة المنتج',
        cancelButtonText: 'إلغاء',
      }).then(async (result) => {
        if (result.isConfirmed) {
          await executeDeleteProduct(product);
        }
      });
    } else {
      if (confirm(actionText)) {
        await executeDeleteProduct(product);
      }
    }
  }

  async function executeDeleteProduct(product) {
    try {
      const res = await window.erpFetch(`/api/inventory/products/${encodeURIComponent(product.id)}`, {
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
          Toast.fire({ icon: 'success', title: json.message || 'تمت أرشفة المنتج بنجاح' });
        } else {
          showAlert(json.message || 'تمت أرشفة المنتج بنجاح', 'success');
        }
        loadProducts(currentPage);
      } else {
        const errorMsg = extractApiErrorMessage(json, 'فشل في أرشفة المنتج');
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            icon: 'error',
            title: 'تعذر أرشفة المنتج',
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
          text: 'تعذر الاتصال بالخادم أثناء أرشفة المنتج',
          confirmButtonText: 'حسناً',
          confirmButtonColor: '#10AC84',
        });
      } else {
        showAlert('حدث خطأ أثناء تنفيذ عملية أرشفة المنتج', 'danger');
      }
    }
  }

  // --- Product Category Tree Logic ---

  /**
   * Loads the full category hierarchy for product filtering (fail-closed, all-or-nothing).
   */
  async function loadProductCategoryTree() {
    if (!desktopCategoryTreeContainer && !mobileCategoryTreeContainer) return;

    try {
      const rootsRes = await fetch('/api/inventory/categories/roots?page=1&limit=100');
      if (!rootsRes.ok) throw new Error('فشل في تحميل الفئات الرئيسية');
      const rootsJson = await rootsRes.json();
      if (!rootsJson.success || !rootsJson.data) throw new Error(rootsJson.message || 'استجابة غير صالحة');

      const roots = rootsJson.data.items;

      async function populateChildrenRecursively(node) {
        if (!node.hasChildren) {
          node.children = [];
          return;
        }
        const childRes = await fetch(`/api/inventory/categories/${encodeURIComponent(node.id)}/children?page=1&limit=100`);
        if (!childRes.ok) throw new Error(`فشل في تحميل الفئات الفرعية لـ ${node.name}`);
        const childJson = await childRes.json();
        if (!childJson.success || !childJson.data) throw new Error(`استجابة غير صالحة لـ ${node.name}`);
        node.children = childJson.data.items;
        await Promise.all(node.children.map((child) => populateChildrenRecursively(child)));
      }

      await Promise.all(roots.map((root) => populateChildrenRecursively(root)));

      categoryTreeData = roots;
      if (desktopTreeCountBadge) desktopTreeCountBadge.textContent = String(roots.length);

      renderCategoryTreePanel(desktopCategoryTreeContainer, false);
      renderCategoryTreePanel(mobileCategoryTreeContainer, true);
    } catch (err) {
      console.error('Failed to load category tree:', err);
      const errorMsg = 'تعذر تحميل شجرة الفئات';
      if (desktopCategoryTreeContainer) {
        desktopCategoryTreeContainer.textContent = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'text-center py-4 text-danger small';
        errDiv.textContent = errorMsg;
        desktopCategoryTreeContainer.appendChild(errDiv);
      }
      if (mobileCategoryTreeContainer) {
        mobileCategoryTreeContainer.textContent = '';
        const errDiv = document.createElement('div');
        errDiv.className = 'text-center py-4 text-danger small';
        errDiv.textContent = errorMsg;
        mobileCategoryTreeContainer.appendChild(errDiv);
      }
    }
  }

  function renderCategoryTreePanel(container, isMobile) {
    if (!container) return;
    container.textContent = '';

    if (categoryTreeData.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'text-center py-4 text-muted small';
      emptyDiv.textContent = 'لا توجد فئات بعد';
      container.appendChild(emptyDiv);
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'p-0 m-0 list-unstyled category-tree-root-list';

    categoryTreeData.forEach((cat) => {
      ul.appendChild(createCategoryTreeItemElement(cat, isMobile));
    });

    container.appendChild(ul);
  }

  function createCategoryTreeItemElement(cat, isMobile) {
    const li = document.createElement('li');
    li.className = 'category-tree-li mb-1';
    li.dataset.categoryId = cat.id;
    li.dataset.categoryName = (cat.name || '').toLowerCase();
    li.dataset.categoryCode = (cat.code || '').toLowerCase();

    const nodeItem = document.createElement('div');
    nodeItem.className = `category-tree-node-item ${selectedCategoryId === cat.id ? 'active' : ''}`;
    nodeItem.dataset.categoryId = cat.id;
    nodeItem.setAttribute('role', 'button');
    nodeItem.setAttribute('tabindex', '0');

    // Title & folder
    const titleDiv = document.createElement('div');
    titleDiv.className = 'category-tree-node-title';

    // Toggle button if has children
    let childrenUl = null;

    if (cat.hasChildren && cat.children && cat.children.length > 0) {
      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'category-tree-toggle-btn expanded';
      toggleBtn.dataset.expanded = 'true';
      const toggleIcon = document.createElement('i');
      toggleIcon.className = 'fa-solid fa-chevron-left';
      toggleBtn.appendChild(toggleIcon);

      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isExp = toggleBtn.dataset.expanded === 'true';
        if (isExp) {
          if (childrenUl) childrenUl.classList.add('d-none');
          toggleBtn.classList.remove('expanded');
          toggleBtn.dataset.expanded = 'false';
        } else {
          if (childrenUl) childrenUl.classList.remove('d-none');
          toggleBtn.classList.add('expanded');
          toggleBtn.dataset.expanded = 'true';
        }
      });

      titleDiv.appendChild(toggleBtn);
    } else {
      const spacer = document.createElement('span');
      spacer.style.width = '20px';
      spacer.style.display = 'inline-block';
      titleDiv.appendChild(spacer);
    }

    // Folder icon
    const folderIcon = document.createElement('i');
    folderIcon.className = cat.hasChildren ? 'fa-solid fa-folder text-warning' : 'fa-regular fa-folder text-muted';
    titleDiv.appendChild(folderIcon);

    // Name text
    const nameSpan = document.createElement('span');
    nameSpan.textContent = cat.name;
    titleDiv.appendChild(nameSpan);

    nodeItem.appendChild(titleDiv);

    // Product count badge if > 0
    if (cat.productCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'badge bg-light text-muted border font-monospace ms-1';
      badge.textContent = String(cat.productCount);
      nodeItem.appendChild(badge);
    }

    // Click handler to select category
    nodeItem.addEventListener('click', () => {
      selectCategory(cat.id, cat.name, isMobile);
    });

    li.appendChild(nodeItem);

    // Children container (EXPANDED by default)
    if (cat.hasChildren && cat.children && cat.children.length > 0) {
      childrenUl = document.createElement('ul');
      childrenUl.className = 'category-tree-children p-0 m-0';
      cat.children.forEach((child) => {
        childrenUl.appendChild(createCategoryTreeItemElement(child, isMobile));
      });
      li.appendChild(childrenUl);
    }

    return li;
  }

  function selectCategory(categoryId, categoryName, isMobile = false) {
    selectedCategoryId = categoryId;
    selectedCategoryName = categoryName;

    updateCategorySelectionUI();

    if (isMobile && categoryOffcanvasEl && typeof bootstrap !== 'undefined') {
      const offcanvasInstance = bootstrap.Offcanvas.getInstance(categoryOffcanvasEl);
      if (offcanvasInstance) {
        offcanvasInstance.hide();
      }
    }

    // Reset to page 1 and load products
    loadProducts(1);
  }

  function selectAllProducts(isMobile = false) {
    selectedCategoryId = null;
    selectedCategoryName = null;

    updateCategorySelectionUI();

    if (isMobile && categoryOffcanvasEl && typeof bootstrap !== 'undefined') {
      const offcanvasInstance = bootstrap.Offcanvas.getInstance(categoryOffcanvasEl);
      if (offcanvasInstance) {
        offcanvasInstance.hide();
      }
    }

    // Reset to page 1 and load products
    loadProducts(1);
  }

  function updateCategorySelectionUI() {
    if (desktopAllProductsBtn) {
      if (!selectedCategoryId) {
        desktopAllProductsBtn.classList.add('active');
      } else {
        desktopAllProductsBtn.classList.remove('active');
      }
    }
    if (mobileAllProductsBtn) {
      if (!selectedCategoryId) {
        mobileAllProductsBtn.classList.add('active');
      } else {
        mobileAllProductsBtn.classList.remove('active');
      }
    }

    const allNodeItems = document.querySelectorAll('.category-tree-node-item[data-category-id]');
    allNodeItems.forEach((item) => {
      if (item.dataset.categoryId === selectedCategoryId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    if (activeCategoryBanner && activeCategoryName) {
      if (selectedCategoryId && selectedCategoryName) {
        activeCategoryName.textContent = selectedCategoryName;
        activeCategoryBanner.classList.remove('d-none');
        activeCategoryBanner.classList.add('d-flex');
      } else {
        activeCategoryName.textContent = '';
        activeCategoryBanner.classList.add('d-none');
        activeCategoryBanner.classList.remove('d-flex');
      }
    }
  }

  function filterCategoryTree(searchTerm, container) {
    if (!container) return;
    const term = (searchTerm || '').trim().toLowerCase();

    const allLis = container.querySelectorAll('.category-tree-li');
    if (!term) {
      allLis.forEach((li) => {
        li.classList.remove('d-none');
      });
      return;
    }

    allLis.forEach((li) => {
      const name = li.dataset.categoryName || '';
      const code = li.dataset.categoryCode || '';
      const isMatch = name.includes(term) || code.includes(term);

      if (isMatch) {
        li.classList.remove('d-none');
        let parent = li.parentElement;
        while (parent && parent !== container) {
          if (parent.classList.contains('category-tree-li')) {
            parent.classList.remove('d-none');
          }
          if (parent.classList.contains('category-tree-children')) {
            parent.classList.remove('d-none');
          }
          parent = parent.parentElement;
        }
      } else {
        const matchingDescendant = li.querySelector(`.category-tree-li[data-category-name*="${term}"]`);
        if (!matchingDescendant) {
          li.classList.add('d-none');
        } else {
          li.classList.remove('d-none');
        }
      }
    });
  }

  if (productsTableBody) {
    if (categoryFilterSelect) {
      loadCategoryOptionsForProduct(categoryFilterSelect);
    }
    loadProductCategoryTree();
    loadProducts(1);

    if (productSearchInput) {
      productSearchInput.addEventListener('input', () => {
        clearTimeout(listSearchTimeout);
        listSearchTimeout = setTimeout(() => loadProducts(1), 300);
      });
    }

    if (categoryFilterSelect) {
      categoryFilterSelect.addEventListener('change', () => loadProducts(1));
    }

    if (statusFilterSelect) {
      statusFilterSelect.addEventListener('change', () => loadProducts(1));
    }

    if (btnRefreshProducts) {
      btnRefreshProducts.addEventListener('click', () => loadProducts(currentPage));
    }

    if (desktopCategoryTreeSearch && desktopCategoryTreeContainer) {
      desktopCategoryTreeSearch.addEventListener('input', (e) => {
        filterCategoryTree(e.target.value, desktopCategoryTreeContainer);
      });
    }

    if (mobileCategoryTreeSearch && mobileCategoryTreeContainer) {
      mobileCategoryTreeSearch.addEventListener('input', (e) => {
        filterCategoryTree(e.target.value, mobileCategoryTreeContainer);
      });
    }

    if (desktopAllProductsBtn) {
      desktopAllProductsBtn.addEventListener('click', () => selectAllProducts(false));
    }

    if (mobileAllProductsBtn) {
      mobileAllProductsBtn.addEventListener('click', () => selectAllProducts(true));
    }

    if (btnClearCategoryFilter) {
      btnClearCategoryFilter.addEventListener('click', () => selectAllProducts(false));
    }
  }

  // ==========================================
  // 2. PRODUCT CREATE PAGE (/inventory/products/create)
  // ==========================================

  const createProductForm = document.getElementById('createProductForm');
  const baseSpecsContainer = document.getElementById('baseSpecsContainer');
  const btnAddBaseSpec = document.getElementById('btnAddBaseSpec');
  const productCategorySelect = document.getElementById('productCategoryId');
  const additionalUnitsContainer = document.getElementById('additionalUnitsContainer');
  const emptyAdditionalUnitsNotice = document.getElementById('emptyAdditionalUnitsNotice');
  const btnAddAdditionalUnit = document.getElementById('btnAddAdditionalUnit');
  const baseNameInput = document.getElementById('baseUnitName');

  if (createProductForm) {
    loadCategoryOptionsForProduct(productCategorySelect);

    if (btnAddBaseSpec && baseSpecsContainer) {
      btnAddBaseSpec.addEventListener('click', () => {
        baseSpecsContainer.appendChild(createSpecRowElement());
      });
    }

    // Dynamic Additional Units State
    let additionalUnits = [];

    function updateFormulaPreview(unit, cardElement) {
      const previewText = cardElement.querySelector('.formula-preview-text');
      if (!previewText) return;

      const unitName = unit.name || '[الوحدة]';
      const factor = unit.conversionQuantity || '?';
      let targetName = baseNameInput ? baseNameInput.value.trim() || 'الوحدة الأساسية' : 'الوحدة الأساسية';

      if (unit.equivalentToTarget !== '__BASE__') {
        const targetUnit = additionalUnits.find((u) => u.id === unit.equivalentToTarget);
        if (targetUnit && targetUnit.name) {
          targetName = targetUnit.name;
        } else {
          targetName = 'وحدة سابقة';
        }
      }

      previewText.textContent = `1 ${unitName} = ${factor} × ${targetName}`;
    }

    function refreshTargetSelectOptions() {
      if (!additionalUnitsContainer) return;

      const cards = additionalUnitsContainer.querySelectorAll('.additional-unit-card');
      cards.forEach((card, idx) => {
        const select = card.querySelector('.unit-target-select');
        if (!select) return;

        const currentVal = additionalUnits[idx].equivalentToTarget;
        select.textContent = ''; // clear

        // Option 1: Base Unit
        const baseOpt = document.createElement('option');
        baseOpt.value = '__BASE__';
        const bName = baseNameInput ? baseNameInput.value.trim() : '';
        baseOpt.textContent = `الوحدة الأساسية: ${bName || 'الوحدة الأساسية'}`;
        select.appendChild(baseOpt);

        // Options: Preceding units only (Strict DAG / acyclic invariant)
        for (let p = 0; p < idx; p++) {
          const prevUnit = additionalUnits[p];
          const prevOpt = document.createElement('option');
          prevOpt.value = prevUnit.id;
          prevOpt.textContent = `الوحدة #${p + 1}: ${prevUnit.name || 'وحدة غير مسماة'}`;
          select.appendChild(prevOpt);
        }

        // Restore value if valid, else fallback to __BASE__
        const validValues = ['__BASE__', ...additionalUnits.slice(0, idx).map((u) => u.id)];
        if (validValues.includes(currentVal)) {
          select.value = currentVal;
        } else {
          select.value = '__BASE__';
          additionalUnits[idx].equivalentToTarget = '__BASE__';
        }

        updateFormulaPreview(additionalUnits[idx], card);
      });
    }

    function renderAdditionalUnits() {
      if (!additionalUnitsContainer || !emptyAdditionalUnitsNotice) return;

      if (additionalUnits.length === 0) {
        emptyAdditionalUnitsNotice.classList.remove('d-none');
        additionalUnitsContainer.textContent = '';
        return;
      }

      emptyAdditionalUnitsNotice.classList.add('d-none');
      additionalUnitsContainer.textContent = '';

      additionalUnits.forEach((unit, idx) => {
        const card = document.createElement('div');
        card.className = 'card border border-light-subtle shadow-sm additional-unit-card';
        card.style.borderRadius = '10px';
        card.dataset.unitId = unit.id;

        // Card Header
        const header = document.createElement('div');
        header.className = 'card-header bg-light py-2 px-3 d-flex justify-content-between align-items-center';

        const titleDiv = document.createElement('div');
        titleDiv.className = 'd-flex align-items-center gap-2';

        const badge = document.createElement('span');
        badge.className = 'badge bg-primary bg-opacity-10 text-primary border border-primary font-monospace';
        badge.textContent = `الوحدة الإضافية #${idx + 1}`;
        titleDiv.appendChild(badge);

        const nameHeading = document.createElement('span');
        nameHeading.className = 'fw-bold text-dark unit-name-heading small';
        nameHeading.textContent = unit.name ? unit.name : 'وحدة جديدة';
        titleDiv.appendChild(nameHeading);
        header.appendChild(titleDiv);

        // Delete button
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-sm btn-outline-danger py-1 px-2 d-inline-flex align-items-center gap-1';
        delBtn.style.borderRadius = '6px';
        delBtn.title = 'حذف هذه الوحدة';

        const delIcon = document.createElement('i');
        delIcon.className = 'fa-solid fa-trash';
        delBtn.appendChild(delIcon);

        const delText = document.createElement('span');
        delText.className = 'small';
        delText.textContent = 'حذف الوحدة';
        delBtn.appendChild(delText);

        delBtn.addEventListener('click', () => {
          const removedId = unit.id;
          additionalUnits.splice(idx, 1);
          additionalUnits.forEach((u) => {
            if (u.equivalentToTarget === removedId) {
              u.equivalentToTarget = '__BASE__';
            }
          });
          renderAdditionalUnits();
        });
        header.appendChild(delBtn);
        card.appendChild(header);

        // Card Body
        const body = document.createElement('div');
        body.className = 'card-body p-3';

        // Row 1: Name, ConversionQuantity, Target Select
        const row1 = document.createElement('div');
        row1.className = 'row g-3 mb-3';

        // Name
        const colName = document.createElement('div');
        colName.className = 'col-12 col-md-4';
        const labelName = document.createElement('label');
        labelName.className = 'form-label fw-bold text-dark small mb-1';
        labelName.textContent = 'اسم الوحدة ';
        const reqStar1 = document.createElement('span');
        reqStar1.className = 'text-danger';
        reqStar1.textContent = '*';
        labelName.appendChild(reqStar1);
        colName.appendChild(labelName);

        const igName = document.createElement('div');
        igName.className = 'input-group input-group-sm has-validation';
        const igNameSpan = document.createElement('span');
        igNameSpan.className = 'input-group-text bg-light text-muted';
        const igNameIcon = document.createElement('i');
        igNameIcon.className = 'fa-solid fa-tag';
        igNameSpan.appendChild(igNameIcon);
        igName.appendChild(igNameSpan);

        const inputName = document.createElement('input');
        inputName.type = 'text';
        inputName.className = 'form-control unit-name-input';
        inputName.required = true;
        inputName.maxLength = 100;
        inputName.placeholder = 'مثال: كرتونة، طرد، دزينة';
        inputName.value = unit.name;
        igName.appendChild(inputName);

        const fbName = document.createElement('div');
        fbName.className = 'invalid-feedback';
        fbName.textContent = 'يرجى إدخال اسم الوحدة.';
        igName.appendChild(fbName);
        colName.appendChild(igName);
        row1.appendChild(colName);

        // Conversion Quantity
        const colConv = document.createElement('div');
        colConv.className = 'col-12 col-md-4';
        const labelConv = document.createElement('label');
        labelConv.className = 'form-label fw-bold text-dark small mb-1';
        labelConv.textContent = 'معامل التحويل (الكمية) ';
        const reqStar2 = document.createElement('span');
        reqStar2.className = 'text-danger';
        reqStar2.textContent = '*';
        labelConv.appendChild(reqStar2);
        colConv.appendChild(labelConv);

        const igConv = document.createElement('div');
        igConv.className = 'input-group input-group-sm has-validation';
        const igConvSpan = document.createElement('span');
        igConvSpan.className = 'input-group-text bg-light text-muted';
        const igConvIcon = document.createElement('i');
        igConvIcon.className = 'fa-solid fa-calculator';
        igConvSpan.appendChild(igConvIcon);
        igConv.appendChild(igConvSpan);

        const inputConv = document.createElement('input');
        inputConv.type = 'number';
        inputConv.step = 'any';
        inputConv.min = '0.000001';
        inputConv.className = 'form-control font-monospace unit-conv-input';
        inputConv.required = true;
        inputConv.placeholder = 'مثال: 24';
        inputConv.value = unit.conversionQuantity;
        igConv.appendChild(inputConv);

        const fbConv = document.createElement('div');
        fbConv.className = 'invalid-feedback';
        fbConv.textContent = 'يرجى إدخال معامل تحويل صالح (أكبر من 0).';
        igConv.appendChild(fbConv);
        colConv.appendChild(igConv);
        row1.appendChild(colConv);

        // Target Unit Select
        const colTarget = document.createElement('div');
        colTarget.className = 'col-12 col-md-4';
        const labelTarget = document.createElement('label');
        labelTarget.className = 'form-label fw-bold text-dark small mb-1';
        labelTarget.textContent = 'تعادل الوحدة (الوحدة المقابلة) ';
        const reqStar3 = document.createElement('span');
        reqStar3.className = 'text-danger';
        reqStar3.textContent = '*';
        labelTarget.appendChild(reqStar3);
        colTarget.appendChild(labelTarget);

        const igTarget = document.createElement('div');
        igTarget.className = 'input-group input-group-sm has-validation';
        const igTargetSpan = document.createElement('span');
        igTargetSpan.className = 'input-group-text bg-light text-muted';
        const igTargetIcon = document.createElement('i');
        igTargetIcon.className = 'fa-solid fa-link';
        igTargetSpan.appendChild(igTargetIcon);
        igTarget.appendChild(igTargetSpan);

        const selectTarget = document.createElement('select');
        selectTarget.className = 'form-select unit-target-select';
        selectTarget.required = true;
        igTarget.appendChild(selectTarget);

        const fbTarget = document.createElement('div');
        fbTarget.className = 'invalid-feedback';
        fbTarget.textContent = 'يرجى اختيار الوحدة المقابلة.';
        igTarget.appendChild(fbTarget);
        colTarget.appendChild(igTarget);
        row1.appendChild(colTarget);
        body.appendChild(row1);

        // Row 2: Price & Barcode
        const row2 = document.createElement('div');
        row2.className = 'row g-3 mb-3';

        // Price
        const colPrice = document.createElement('div');
        colPrice.className = 'col-12 col-md-6';
        const labelPrice = document.createElement('label');
        labelPrice.className = 'form-label fw-bold text-dark small mb-1';
        labelPrice.textContent = 'السعر المرجعي للوحدة ';
        const reqStar4 = document.createElement('span');
        reqStar4.className = 'text-danger';
        reqStar4.textContent = '*';
        labelPrice.appendChild(reqStar4);
        colPrice.appendChild(labelPrice);

        const igPrice = document.createElement('div');
        igPrice.className = 'input-group input-group-sm has-validation';
        const igPriceSpan = document.createElement('span');
        igPriceSpan.className = 'input-group-text bg-light text-muted';
        const igPriceIcon = document.createElement('i');
        igPriceIcon.className = 'fa-solid fa-money-bill-wave';
        igPriceSpan.appendChild(igPriceIcon);
        igPrice.appendChild(igPriceSpan);

        const inputPrice = document.createElement('input');
        inputPrice.type = 'number';
        inputPrice.step = '0.0001';
        inputPrice.min = '0';
        inputPrice.className = 'form-control font-monospace unit-price-input';
        inputPrice.required = true;
        inputPrice.placeholder = '0.00';
        inputPrice.value = unit.price;
        igPrice.appendChild(inputPrice);

        const fbPrice = document.createElement('div');
        fbPrice.className = 'invalid-feedback';
        fbPrice.textContent = 'يرجى إدخال سعر صالح (0 أو أكبر).';
        igPrice.appendChild(fbPrice);
        colPrice.appendChild(igPrice);
        row2.appendChild(colPrice);

        // Barcode
        const colBarcode = document.createElement('div');
        colBarcode.className = 'col-12 col-md-6';
        const labelBarcode = document.createElement('label');
        labelBarcode.className = 'form-label fw-bold text-dark small mb-1';
        labelBarcode.textContent = 'الباركود (اختياري)';
        colBarcode.appendChild(labelBarcode);

        const igBarcode = document.createElement('div');
        igBarcode.className = 'input-group input-group-sm';
        const igBarcodeSpan = document.createElement('span');
        igBarcodeSpan.className = 'input-group-text bg-light text-muted';
        const igBarcodeIcon = document.createElement('i');
        igBarcodeIcon.className = 'fa-solid fa-barcode';
        igBarcodeSpan.appendChild(igBarcodeIcon);
        igBarcode.appendChild(igBarcodeSpan);

        const inputBarcode = document.createElement('input');
        inputBarcode.type = 'text';
        inputBarcode.className = 'form-control font-monospace unit-barcode-input';
        inputBarcode.maxLength = 100;
        inputBarcode.placeholder = 'مثال: 628100099999';
        inputBarcode.value = unit.barcode;
        igBarcode.appendChild(inputBarcode);
        colBarcode.appendChild(igBarcode);
        row2.appendChild(colBarcode);
        body.appendChild(row2);

        // Row 3: Formula Preview
        const previewAlert = document.createElement('div');
        previewAlert.className = 'alert alert-light border py-2 px-3 mb-0 small text-primary fw-bold';
        previewAlert.style.borderRadius = '6px';
        const previewIcon = document.createElement('i');
        previewIcon.className = 'fa-solid fa-calculator me-1';
        previewAlert.appendChild(previewIcon);
        const previewSpan = document.createElement('span');
        previewSpan.className = 'formula-preview-text';
        previewAlert.appendChild(previewSpan);
        body.appendChild(previewAlert);

        card.appendChild(body);
        additionalUnitsContainer.appendChild(card);

        // Event Listeners
        inputName.addEventListener('input', () => {
          unit.name = inputName.value.trim();
          nameHeading.textContent = unit.name ? unit.name : 'وحدة جديدة';
          refreshTargetSelectOptions();
        });

        inputConv.addEventListener('input', () => {
          unit.conversionQuantity = inputConv.value.trim();
          updateFormulaPreview(unit, card);
        });

        selectTarget.addEventListener('change', () => {
          unit.equivalentToTarget = selectTarget.value;
          updateFormulaPreview(unit, card);
        });

        inputPrice.addEventListener('input', () => {
          unit.price = inputPrice.value.trim();
        });

        inputBarcode.addEventListener('input', () => {
          unit.barcode = inputBarcode.value.trim();
        });
      });

      refreshTargetSelectOptions();
    }

    if (btnAddAdditionalUnit) {
      btnAddAdditionalUnit.addEventListener('click', () => {
        const newUnit = {
          id: 'unit_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
          name: '',
          conversionQuantity: '',
          equivalentToTarget: additionalUnits.length === 0 ? '__BASE__' : additionalUnits[additionalUnits.length - 1].id,
          price: '',
          barcode: '',
          specifications: [],
        };
        additionalUnits.push(newUnit);
        renderAdditionalUnits();
      });
    }

    if (baseNameInput) {
      baseNameInput.addEventListener('input', () => {
        refreshTargetSelectOptions();
      });
    }

    createProductForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFormError();

      if (!createProductForm.checkValidity()) {
        e.stopPropagation();
        createProductForm.classList.add('was-validated');
        showFormError('يرجى التحقق من ملء جميع الحقول المطلوبة المميزة باللون الأحمر.');
        return;
      }

      const nameInput = document.getElementById('productName');
      const codeInput = document.getElementById('productCode');
      const catSelect = document.getElementById('productCategoryId');
      const locInput = document.getElementById('productLocationName');
      const descInput = document.getElementById('productDescription');
      const activeCheckbox = document.getElementById('productIsActive');

      const baseNameInputEl = document.getElementById('baseUnitName');
      const basePriceInput = document.getElementById('baseUnitPrice');
      const baseBarcodeInput = document.getElementById('baseUnitBarcode');

      const submitBtn = document.getElementById('btnSubmitProduct');
      const spinner = document.getElementById('submitSpinner');

      const name = nameInput ? nameInput.value.trim() : '';
      const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
      const categoryId = catSelect && catSelect.value ? catSelect.value : null;
      const locationName = locInput ? locInput.value.trim() || null : null;
      const description = descInput ? descInput.value.trim() || null : null;
      const isActive = activeCheckbox ? activeCheckbox.checked : true;

      const baseUnitName = baseNameInputEl ? baseNameInputEl.value.trim() : '';
      const baseUnitPrice = basePriceInput ? basePriceInput.value.trim() : '';
      const baseUnitBarcode = baseBarcodeInput ? baseBarcodeInput.value.trim() || null : null;

      // Duplicate unit names validation
      const allUnitNames = [baseUnitName.toLowerCase(), ...additionalUnits.map((u) => u.name.trim().toLowerCase())];
      const uniqueNames = new Set(allUnitNames);
      if (uniqueNames.size !== allUnitNames.length) {
        showFormError('توجد وحدات مكررة بنفس الاسم. يجب أن يكون اسم كل وحدة فريداً داخل المنتج.');
        return;
      }

      // Barcode collision check on client side
      const barcodes = [baseUnitBarcode, ...additionalUnits.map((u) => (u.barcode ? u.barcode.trim() : null))].filter(Boolean);
      const uniqueBarcodes = new Set(barcodes);
      if (uniqueBarcodes.size !== barcodes.length) {
        showFormError('يوجد تكرار في رمز الباركود بين الوحدات المدخلة.');
        return;
      }

      // Additional units numeric checks
      for (const u of additionalUnits) {
        const cq = parseFloat(u.conversionQuantity);
        if (isNaN(cq) || cq <= 0) {
          showFormError(`معامل التحويل للوحدة "${u.name || 'بدون اسم'}" غير صالح. يجب أن يكون أكبر تماماً من الصفر.`);
          return;
        }
        const pr = parseFloat(u.price);
        if (isNaN(pr) || pr < 0) {
          showFormError(`سعر الوحدة "${u.name || 'بدون اسم'}" غير صالح. يجب أن يكون صفراً أو أكبر.`);
          return;
        }
      }

      const specsResult = collectSpecifications(baseSpecsContainer);
      if (!specsResult.valid) {
        showFormError(specsResult.message || 'بيانات مواصفات الوحدة غير صالحة.');
        return;
      }
      const specifications = specsResult.specifications;

      const payload = {
        name,
        code,
        categoryId,
        locationName,
        description,
        isActive,
        baseUnit: {
          name: baseUnitName,
          barcode: baseUnitBarcode,
          price: baseUnitPrice,
          specifications,
        },
      };

      if (submitBtn) submitBtn.disabled = true;
      if (spinner) spinner.classList.remove('d-none');

      try {
        // Step 1: Create product with base unit
        const res = await window.erpFetch('/api/inventory/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();

        if (!json.success || !json.data) {
          showFormError(extractApiErrorMessage(json, 'فشل في إنشاء المنتج'));
          if (submitBtn) submitBtn.disabled = false;
          if (spinner) spinner.classList.add('d-none');
          return;
        }

        const createdProduct = json.data;
        const productId = createdProduct.id;
        const baseUnitId = createdProduct.baseUnitId;

        // Step 2: Create additional units sequentially
        if (additionalUnits.length > 0) {
          const unitIdMap = new Map();
          unitIdMap.set('__BASE__', baseUnitId);

          for (let i = 0; i < additionalUnits.length; i++) {
            const u = additionalUnits[i];
            const targetRealId = unitIdMap.get(u.equivalentToTarget) || baseUnitId;

            const unitPayload = {
              name: u.name,
              conversionQuantity: String(u.conversionQuantity),
              equivalentToUnitId: targetRealId,
              price: String(u.price),
              barcode: u.barcode ? u.barcode.trim() : null,
            };

            const unitRes = await window.erpFetch(`/api/inventory/products/${encodeURIComponent(productId)}/units`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(unitPayload),
            });
            const unitJson = await unitRes.json();

            if (!unitJson.success || !unitJson.data) {
              sessionStorage.setItem(
                'pendingToast',
                `تم إنشاء المنتج، لكن تعذر إضافة الوحدة "${u.name}". يمكنك استكمال الوحدات هنا.`
              );
              window.location.href = `/inventory/products/${encodeURIComponent(productId)}/edit#units`;
              return;
            }

            unitIdMap.set(u.id, unitJson.data.id);
          }
        }

        sessionStorage.setItem('pendingToast', 'تم حفظ المنتج وجميع وحداته بنجاح!');
        window.location.href = '/inventory/products';
      } catch (err) {
        showFormError('حدث خطأ أثناء إرسال بيانات المنتج إلى الخادم.');
      } finally {
        if (submitBtn) submitBtn.disabled = false;
        if (spinner) spinner.classList.add('d-none');
      }
    });
  }

  // ==========================================
  // 3. PRODUCT EDIT PAGE (/inventory/products/:id/edit)
  // ==========================================

  const tabsContent = document.getElementById('productEditTabsContent');
  const editProductForm = document.getElementById('editProductForm');
  const productUnitsTableBody = document.getElementById('productUnitsTableBody');
  const unitsCountPill = document.getElementById('unitsCountPill');
  const btnArchiveProduct = document.getElementById('btnArchiveProduct');

  // Add unit modal elements
  const addUnitModalEl = document.getElementById('addUnitModal');
  const addUnitForm = document.getElementById('addUnitForm');
  const btnOpenAddUnitModal = document.getElementById('btnOpenAddUnitModal');
  const newUnitEquivalentSelect = document.getElementById('newUnitEquivalentToUnitId');
  const unitSpecsContainer = document.getElementById('unitSpecsContainer');
  const btnAddUnitSpec = document.getElementById('btnAddUnitSpec');
  const newUnitNameInput = document.getElementById('newUnitName');
  const formulaNewUnitNamePreview = document.getElementById('formulaNewUnitNamePreview');
  const formulaPreviewText = document.getElementById('formulaPreviewText');
  const newUnitConversionQuantityInput = document.getElementById('newUnitConversionQuantity');

  // Edit unit modal elements
  const editUnitModalEl = document.getElementById('editUnitModal');
  const editUnitForm = document.getElementById('editUnitForm');
  const editUnitEquivalentSelect = document.getElementById('editUnitEquivalentToUnitId');
  const editUnitSpecsContainer = document.getElementById('editUnitSpecsContainer');
  const btnAddEditUnitSpec = document.getElementById('btnAddEditUnitSpec');

  if (tabsContent) {
    const productId = tabsContent.dataset.productId;
    let currentProductData = null;
    let currentUnitsList = [];

    // Check hash for #units
    if (window.location.hash === '#units') {
      const unitsTabBtn = document.getElementById('units-tab');
      if (unitsTabBtn) {
        const tabTrigger = new bootstrap.Tab(unitsTabBtn);
        tabTrigger.show();
      }
    }

    // Load Product Data
    async function loadProductData() {
      try {
        const res = await fetch(`/api/inventory/products/${encodeURIComponent(productId)}`);
        const json = await res.json();

        if (json.success && json.data) {
          currentProductData = json.data;

          const titleEl = document.getElementById('productHeaderTitle');
          const subTitleEl = document.getElementById('productHeaderSubtitle');
          const codeBadge = document.getElementById('productCodeBadge');

          if (titleEl) titleEl.textContent = `تعديل: ${currentProductData.name}`;
          if (subTitleEl) subTitleEl.textContent = `الكود: ${currentProductData.code} | الوحدة الأساسية: ${currentProductData.baseUnitName}`;
          if (codeBadge) codeBadge.textContent = currentProductData.code;

          const codeInput = document.getElementById('editProductCode');
          const nameInput = document.getElementById('editProductName');
          const catSelect = document.getElementById('editProductCategoryId');
          const locInput = document.getElementById('editProductLocationName');
          const descInput = document.getElementById('editProductDescription');
          const activeCheckbox = document.getElementById('editProductIsActive');

          if (codeInput) codeInput.value = currentProductData.code;
          if (nameInput) nameInput.value = currentProductData.name;
          if (locInput) locInput.value = currentProductData.locationName || '';
          if (descInput) descInput.value = currentProductData.description || '';
          if (activeCheckbox) activeCheckbox.checked = currentProductData.isActive;

          await loadCategoryOptionsForProduct(catSelect, currentProductData.categoryId || '', currentProductData.categoryName || '');
        } else {
          showAlert(json.message || 'فشل في تحميل بيانات المنتج');
        }
      } catch (err) {
        showAlert('حدث خطأ أثناء تحميل بيانات المنتج');
      }
    }

    /**
     * Helper to fetch all product units across pages without truncation.
     * Fails closed if any page fails, response is invalid, or pagination metadata is inconsistent.
     */
    async function fetchAllProductUnits(productId) {
      const allUnits = [];
      let page = 1;
      let totalPages = 1;

      while (page <= totalPages) {
        const res = await fetch(
          `/api/inventory/products/${encodeURIComponent(productId)}/units?page=${page}&limit=100`
        );
        if (!res.ok) {
          throw new Error(`Failed to load product units (HTTP ${res.status})`);
        }

        let json;
        try {
          json = await res.json();
        } catch (e) {
          throw new Error('Invalid JSON received for product units');
        }

        if (!json || json.success !== true || !json.data || !Array.isArray(json.data.items)) {
          throw new Error('Invalid response structure for product units');
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
          throw new Error('Inconsistent product unit pagination metadata');
        }

        totalPages = resTotalPages;
        allUnits.push(...items);
        page++;
      }

      return allUnits;
    }

    // Load Product Units (Fetch all pages without truncation, fail-closed)
    async function loadProductUnits() {
      if (!productUnitsTableBody) return;

      const hadExistingData = currentUnitsList && currentUnitsList.length > 0;
      if (!hadExistingData) {
        productUnitsTableBody.textContent = '';
        const loadingRow = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7;
        td.className = 'text-center py-4 text-muted';
        td.textContent = 'جاري تحميل وحدات القياس...';
        loadingRow.appendChild(td);
        productUnitsTableBody.appendChild(loadingRow);
      }

      try {
        const units = await fetchAllProductUnits(productId);

        // Update currentUnitsList and UI only after complete success
        currentUnitsList = units;

        if (unitsCountPill) unitsCountPill.textContent = String(currentUnitsList.length);

        productUnitsTableBody.textContent = '';

        if (currentUnitsList.length === 0) {
          const emptyRow = document.createElement('tr');
          const emptyTd = document.createElement('td');
          emptyTd.colSpan = 7;
          emptyTd.className = 'text-center py-4 text-muted';
          emptyTd.textContent = 'لا توجد وحدات معرّفة لهذا المنتج.';
          emptyRow.appendChild(emptyTd);
          productUnitsTableBody.appendChild(emptyRow);
          return;
        }

        currentUnitsList.forEach((unit) => {
          const tr = document.createElement('tr');

          // Name
          const tdName = document.createElement('td');
          tdName.className = 'ps-4 fw-bold';
          tdName.textContent = unit.name;
          tr.appendChild(tdName);

          // Unit Type
          const tdType = document.createElement('td');
          if (unit.isBase) {
            const baseBadge = document.createElement('span');
            baseBadge.className = 'badge bg-success text-white';
            baseBadge.textContent = 'الوحدة الأساسية';
            tdType.appendChild(baseBadge);
          } else {
            const addBadge = document.createElement('span');
            addBadge.className = 'badge bg-light text-muted border';
            addBadge.textContent = 'وحدة إضافية';
            tdType.appendChild(addBadge);
          }
          tr.appendChild(tdType);

          // Formula
          const tdFormula = document.createElement('td');
          if (unit.isBase) {
            tdFormula.className = 'text-muted';
            tdFormula.textContent = 'مرجع القياس الأساسي';
          } else {
            const eqSpan = document.createElement('span');
            eqSpan.className = 'fw-bold text-dark';
            eqSpan.textContent = `1 ${unit.name} = ${unit.conversionQuantity} × ${unit.equivalentToUnitName || 'وحدة'}`;
            tdFormula.appendChild(eqSpan);
          }
          tr.appendChild(tdFormula);

          // Price
          const tdPrice = document.createElement('td');
          tdPrice.className = 'font-monospace fw-bold';
          tdPrice.textContent = unit.price;
          tr.appendChild(tdPrice);

          // Barcode
          const tdBarcode = document.createElement('td');
          if (unit.barcode) {
            const bcBadge = document.createElement('span');
            bcBadge.className = 'badge bg-light text-dark border font-monospace';
            bcBadge.textContent = unit.barcode;
            tdBarcode.appendChild(bcBadge);
          } else {
            tdBarcode.className = 'text-muted';
            tdBarcode.textContent = '--';
          }
          tr.appendChild(tdBarcode);

          // Specifications
          const tdSpecs = document.createElement('td');
          if (unit.specifications && unit.specifications.length > 0) {
            const specBadgesDiv = document.createElement('div');
            specBadgesDiv.className = 'd-flex flex-wrap gap-1';
            unit.specifications.forEach((s) => {
              const sBadge = document.createElement('span');
              sBadge.className = 'badge bg-light text-dark border';
              sBadge.textContent = s.unit ? `${s.name}: ${s.value} ${s.unit}` : `${s.name}: ${s.value}`;
              specBadgesDiv.appendChild(sBadge);
            });
            tdSpecs.appendChild(specBadgesDiv);
          } else {
            tdSpecs.className = 'text-muted';
            tdSpecs.textContent = '--';
          }
          tr.appendChild(tdSpecs);

          // Actions
          const tdActions = document.createElement('td');
          tdActions.className = 'text-end pe-4';
          const actionGroup = document.createElement('div');
          actionGroup.className = 'd-inline-flex gap-1';

          if (permissions.canUpdateProduct) {
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn btn-sm btn-outline-primary';
            editBtn.title = 'تعديل الوحدة';
            const editIcon = document.createElement('i');
            editIcon.className = 'fa-solid fa-pen-to-square';
            editBtn.appendChild(editIcon);
            editBtn.addEventListener('click', () => openEditUnitModal(unit));
            actionGroup.appendChild(editBtn);

            // Base unit cannot be deleted
            if (!unit.isBase) {
              const delBtn = document.createElement('button');
              delBtn.type = 'button';
              delBtn.className = 'btn btn-sm btn-outline-danger';
              delBtn.title = 'أرشفة الوحدة';
              const delIcon = document.createElement('i');
              delIcon.className = 'fa-solid fa-trash-can';
              delBtn.appendChild(delIcon);
              delBtn.addEventListener('click', () => handleDeleteUnit(unit));
              actionGroup.appendChild(delBtn);
            }
          }

          tdActions.appendChild(actionGroup);

          tr.appendChild(tdActions);
          productUnitsTableBody.appendChild(tr);
        });
      } catch (err) {
        console.error('Failed to load product units:', err);
        showAlert('فشل في تحميل جميع وحدات المنتج. لم يتم اعتماد بيانات جزئية حفاظاً على سلامة علاقات التحويل.');

        if (!hadExistingData) {
          productUnitsTableBody.textContent = '';
          const errRow = document.createElement('tr');
          const errTd = document.createElement('td');
          errTd.colSpan = 7;
          errTd.className = 'text-center py-4 text-danger';
          errTd.textContent = 'تعذر تحميل وحدات القياس. يرجى إعادة المحاولة.';
          errRow.appendChild(errTd);
          productUnitsTableBody.appendChild(errRow);
        }
      }
    }

    // Save Product Info Form
    // Save Product Info Form
    if (editProductForm) {
      editProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearFormError();

        if (!editProductForm.checkValidity()) {
          e.stopPropagation();
          editProductForm.classList.add('was-validated');
          showFormError('يرجى التحقق من صحة البيانات المدخلة.');
          return;
        }

        const nameInput = document.getElementById('editProductName');
        const catSelect = document.getElementById('editProductCategoryId');
        const locInput = document.getElementById('editProductLocationName');
        const descInput = document.getElementById('editProductDescription');
        const activeCheckbox = document.getElementById('editProductIsActive');
        const submitBtn = document.getElementById('btnSaveProduct');
        const spinner = document.getElementById('saveProductSpinner');

        const name = nameInput ? nameInput.value.trim() : '';
        const categoryId = catSelect && catSelect.value ? catSelect.value : null;
        const locationName = locInput ? locInput.value.trim() || null : null;
        const description = descInput ? descInput.value.trim() || null : null;
        const isActive = activeCheckbox ? activeCheckbox.checked : true;

        if (!name) {
          showFormError('اسم المنتج مطلوب.');
          return;
        }

        if (submitBtn) submitBtn.disabled = true;
        if (spinner) spinner.classList.remove('d-none');

        try {
          const payload = { name, categoryId, locationName, description, isActive };
          const res = await window.erpFetch(`/api/inventory/products/${encodeURIComponent(productId)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
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
              Toast.fire({ icon: 'success', title: 'تم حفظ بيانات المنتج بنجاح' });
            } else {
              showAlert('تم حفظ بيانات المنتج بنجاح', 'success');
            }
            loadProductData();
          } else {
            showFormError(extractApiErrorMessage(json, 'فشل في حفظ التعديلات'));
          }
        } catch (err) {
          showFormError('حدث خطأ أثناء إرسال التعديلات إلى الخادم.');
        } finally {
          if (submitBtn) submitBtn.disabled = false;
          if (spinner) spinner.classList.add('d-none');
        }
      });
    }

    // Archive Product Button
    if (btnArchiveProduct) {
      btnArchiveProduct.addEventListener('click', async () => {
        const actionTitle = 'أرشفة المنتج';
        const actionText = 'هل أنت متأكد من رغبتك في أرشفة هذا المنتج بالكامل؟ سيتم تعطيله في النظام.';

        if (typeof Swal !== 'undefined') {
          Swal.fire({
            title: actionTitle,
            text: actionText,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#EE5253',
            cancelButtonColor: '#6B7280',
            confirmButtonText: 'نعم، أرشفة المنتج',
            cancelButtonText: 'إلغاء',
          }).then(async (result) => {
            if (result.isConfirmed) {
              await executeArchiveProduct();
            }
          });
        } else {
          if (confirm(actionText)) {
            await executeArchiveProduct();
          }
        }
      });

      async function executeArchiveProduct() {
        try {
          const res = await window.erpFetch(`/api/inventory/products/${encodeURIComponent(productId)}`, {
            method: 'DELETE',
          });
          const json = await res.json();

          if (json.success) {
            sessionStorage.setItem('pendingToast', 'تمت أرشفة المنتج بنجاح');
            window.location.href = '/inventory/products';
          } else {
            const errorMsg = extractApiErrorMessage(json, 'فشل في أرشفة المنتج');
            if (typeof Swal !== 'undefined') {
              Swal.fire({
                icon: 'error',
                title: 'تعذر أرشفة المنتج',
                text: errorMsg,
                confirmButtonText: 'حسناً',
                confirmButtonColor: '#10AC84',
              });
            } else {
              showFormError(errorMsg);
            }
          }
        } catch (err) {
          if (typeof Swal !== 'undefined') {
            Swal.fire({
              icon: 'error',
              title: 'خطأ في الاتصال',
              text: 'تعذر الاتصال بالخادم أثناء أرشفة المنتج',
              confirmButtonText: 'حسناً',
              confirmButtonColor: '#10AC84',
            });
          } else {
            showFormError('حدث خطأ أثناء تنفيذ عملية الأرشفة');
          }
        }
      }
    }

    // Add Unit Modal Handling
    if (btnOpenAddUnitModal && addUnitModalEl) {
      const addModal = new bootstrap.Modal(addUnitModalEl);

      btnOpenAddUnitModal.addEventListener('click', () => {
        const addAlert = document.getElementById('addUnitAlertContainer');
        if (addAlert) addAlert.textContent = '';
        if (addUnitForm) addUnitForm.reset();
        if (unitSpecsContainer) unitSpecsContainer.textContent = '';

        // Populate equivalent units options with current units of this product
        if (newUnitEquivalentSelect) {
          while (newUnitEquivalentSelect.options.length > 1) {
            newUnitEquivalentSelect.remove(1);
          }
          currentUnitsList.forEach((u) => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.isBase ? `${u.name} (الوحدة الأساسية)` : u.name;
            newUnitEquivalentSelect.appendChild(opt);
          });
        }

        updateFormulaPreview();
        addModal.show();
      });

      if (btnAddUnitSpec && unitSpecsContainer) {
        btnAddUnitSpec.addEventListener('click', () => {
          unitSpecsContainer.appendChild(createSpecRowElement());
        });
      }

      function updateFormulaPreview() {
        const name = newUnitNameInput ? newUnitNameInput.value.trim() || '[الوحدة الجديدة]' : '[الوحدة الجديدة]';
        const qty = newUnitConversionQuantityInput ? newUnitConversionQuantityInput.value.trim() || '...' : '...';
        const targetOpt = newUnitEquivalentSelect && newUnitEquivalentSelect.selectedIndex > 0
          ? newUnitEquivalentSelect.options[newUnitEquivalentSelect.selectedIndex].text
          : '[الوحدة المقابلة]';

        if (formulaNewUnitNamePreview) formulaNewUnitNamePreview.textContent = name;
        if (formulaPreviewText) formulaPreviewText.textContent = `المعادلة: 1 ${name} = ${qty} × ${targetOpt}`;
      }

      if (newUnitNameInput) newUnitNameInput.addEventListener('input', updateFormulaPreview);
      if (newUnitConversionQuantityInput) newUnitConversionQuantityInput.addEventListener('input', updateFormulaPreview);
      if (newUnitEquivalentSelect) newUnitEquivalentSelect.addEventListener('change', updateFormulaPreview);

      if (addUnitForm) {
        addUnitForm.addEventListener('submit', async (e) => {
          e.preventDefault();

          if (!addUnitForm.checkValidity()) {
            e.stopPropagation();
            addUnitForm.classList.add('was-validated');
            return;
          }

          const name = newUnitNameInput ? newUnitNameInput.value.trim() : '';
          const conversionQuantity = newUnitConversionQuantityInput ? newUnitConversionQuantityInput.value.trim() : '';
          const equivalentToUnitId = newUnitEquivalentSelect ? newUnitEquivalentSelect.value : '';
          const priceInput = document.getElementById('newUnitPrice');
          const barcodeInput = document.getElementById('newUnitBarcode');
          const submitBtn = document.getElementById('btnSubmitAddUnit');
          const spinner = document.getElementById('addUnitSpinner');
          const addAlert = document.getElementById('addUnitAlertContainer');

          const price = priceInput ? priceInput.value.trim() : '';
          const barcode = barcodeInput ? barcodeInput.value.trim() || null : null;

          if (!name) {
            showAlert('اسم الوحدة مطلوب', 'danger', addAlert);
            return;
          }
          if (!conversionQuantity || parseFloat(conversionQuantity) <= 0) {
            showAlert('معامل التحويل مطلوب ويجب أن يكون أكبر من الصفر', 'danger', addAlert);
            return;
          }
          if (!equivalentToUnitId) {
            showAlert('الوحدة المقابلة مطلوبة', 'danger', addAlert);
            return;
          }
          if (!price) {
            showAlert('سعر الوحدة مطلوب', 'danger', addAlert);
            return;
          }

          const specsResult = collectSpecifications(unitSpecsContainer);
          if (!specsResult.valid) {
            showAlert(specsResult.message || 'بيانات مواصفات الوحدة غير صالحة', 'danger', addAlert);
            return;
          }
          const specifications = specsResult.specifications;

          const payload = {
            name,
            conversionQuantity,
            equivalentToUnitId,
            price,
            barcode,
            specifications,
          };

          if (submitBtn) submitBtn.disabled = true;
          if (spinner) spinner.classList.remove('d-none');

          try {
            const res = await window.erpFetch(`/api/inventory/products/${encodeURIComponent(productId)}/units`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            const json = await res.json();

            if (json.success) {
              addModal.hide();
              if (typeof Swal !== 'undefined') {
                const Toast = Swal.mixin({
                  toast: true,
                  position: 'top-start',
                  showConfirmButton: false,
                  timer: 3000,
                  timerProgressBar: true,
                });
                Toast.fire({ icon: 'success', title: 'تمت إضافة الوحدة بنجاح' });
              } else {
                showAlert('تمت إضافة الوحدة بنجاح', 'success');
              }
              loadProductUnits();
            } else {
              showAlert(extractApiErrorMessage(json, 'فشل في إضافة الوحدة'), 'danger', addAlert);
            }
          } catch (err) {
            showAlert('حدث خطأ أثناء إرسال بيانات الوحدة', 'danger', addAlert);
          } finally {
            if (submitBtn) submitBtn.disabled = false;
            if (spinner) spinner.classList.add('d-none');
          }
        });
      }
    }

    // Edit Unit Modal Handling
    let editModalInstance = null;
    if (editUnitModalEl) {
      editModalInstance = new bootstrap.Modal(editUnitModalEl);

      if (btnAddEditUnitSpec && editUnitSpecsContainer) {
        btnAddEditUnitSpec.addEventListener('click', () => {
          editUnitSpecsContainer.appendChild(createSpecRowElement());
        });
      }

      if (editUnitForm) {
        editUnitForm.addEventListener('submit', async (e) => {
          e.preventDefault();

          if (!editUnitForm.checkValidity()) {
            e.stopPropagation();
            editUnitForm.classList.add('was-validated');
            return;
          }

          const unitIdInput = document.getElementById('editUnitId');
          const unitId = unitIdInput ? unitIdInput.value : '';
          const nameInput = document.getElementById('editUnitName');
          const priceInput = document.getElementById('editUnitPrice');
          const barcodeInput = document.getElementById('editUnitBarcode');
          const convInput = document.getElementById('editUnitConversionQuantity');
          const eqSelect = document.getElementById('editUnitEquivalentToUnitId');
          const submitBtn = document.getElementById('btnSubmitEditUnit');
          const spinner = document.getElementById('editUnitSpinner');
          const editAlert = document.getElementById('editUnitAlertContainer');

          const unit = currentUnitsList.find((u) => u.id === unitId);
          if (!unit) return;

          const name = nameInput ? nameInput.value.trim() : '';
          const price = priceInput ? priceInput.value.trim() : '';
          const barcode = barcodeInput ? barcodeInput.value.trim() || null : null;

          if (!name) {
            showAlert('اسم الوحدة مطلوب', 'danger', editAlert);
            return;
          }
          if (!price) {
            showAlert('سعر الوحدة مطلوب', 'danger', editAlert);
            return;
          }

          const payload = { name, price, barcode };

          if (!unit.isBase) {
            const conversionQuantity = convInput ? convInput.value.trim() : '';
            const equivalentToUnitId = eqSelect ? eqSelect.value : '';

            if (!conversionQuantity || parseFloat(conversionQuantity) <= 0) {
              showAlert('معامل التحويل مطلوب ويجب أن يكون أكبر من الصفر', 'danger', editAlert);
              return;
            }
            if (!equivalentToUnitId) {
              showAlert('الوحدة المقابلة مطلوبة', 'danger', editAlert);
              return;
            }
            payload.conversionQuantity = conversionQuantity;
            payload.equivalentToUnitId = equivalentToUnitId;
          }

          const specsResult = collectSpecifications(editUnitSpecsContainer);
          if (!specsResult.valid) {
            showAlert(specsResult.message || 'بيانات مواصفات الوحدة غير صالحة', 'danger', editAlert);
            return;
          }
          payload.specifications = specsResult.specifications;

          if (submitBtn) submitBtn.disabled = true;
          if (spinner) spinner.classList.remove('d-none');

          try {
            const res = await window.erpFetch(`/api/inventory/products/${encodeURIComponent(productId)}/units/${encodeURIComponent(unitId)}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
            });
            const json = await res.json();

            if (json.success) {
              editModalInstance.hide();
              if (typeof Swal !== 'undefined') {
                const Toast = Swal.mixin({
                  toast: true,
                  position: 'top-start',
                  showConfirmButton: false,
                  timer: 3000,
                  timerProgressBar: true,
                });
                Toast.fire({ icon: 'success', title: 'تم حفظ تعديلات الوحدة بنجاح' });
              } else {
                showAlert('تم حفظ تعديلات الوحدة بنجاح', 'success');
              }
              loadProductUnits();
            } else {
              showAlert(extractApiErrorMessage(json, 'فشل في حفظ تعديلات الوحدة'), 'danger', editAlert);
            }
          } catch (err) {
            showAlert('حدث خطأ أثناء إرسال التعديلات', 'danger', editAlert);
          } finally {
            if (submitBtn) submitBtn.disabled = false;
            if (spinner) spinner.classList.add('d-none');
          }
        });
      }
    }

    function openEditUnitModal(unit) {
      if (!editModalInstance) return;

      const editAlert = document.getElementById('editUnitAlertContainer');
      if (editAlert) editAlert.textContent = '';

      const unitIdInput = document.getElementById('editUnitId');
      const nameInput = document.getElementById('editUnitName');
      const priceInput = document.getElementById('editUnitPrice');
      const barcodeInput = document.getElementById('editUnitBarcode');
      const baseAlert = document.getElementById('editBaseUnitAlert');
      const convSection = document.getElementById('editConversionFormulaSection');
      const convInput = document.getElementById('editUnitConversionQuantity');

      if (unitIdInput) unitIdInput.value = unit.id;
      if (nameInput) nameInput.value = unit.name;
      if (priceInput) priceInput.value = unit.price;
      if (barcodeInput) barcodeInput.value = unit.barcode || '';

      if (unit.isBase) {
        if (baseAlert) baseAlert.classList.remove('d-none');
        if (convSection) convSection.classList.add('d-none');
      } else {
        if (baseAlert) baseAlert.classList.add('d-none');
        if (convSection) convSection.classList.remove('d-none');
        if (convInput) convInput.value = unit.conversionQuantity || '';

        // Populate equivalent units options (excluding self)
        if (editUnitEquivalentSelect) {
          while (editUnitEquivalentSelect.options.length > 1) {
            editUnitEquivalentSelect.remove(1);
          }
          currentUnitsList.forEach((u) => {
            if (u.id === unit.id) return;
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.textContent = u.isBase ? `${u.name} (الوحدة الأساسية)` : u.name;
            if (u.id === unit.equivalentToUnitId) {
              opt.selected = true;
            }
            editUnitEquivalentSelect.appendChild(opt);
          });
        }
      }

      // Populate specs
      if (editUnitSpecsContainer) {
        editUnitSpecsContainer.textContent = '';
        if (unit.specifications && unit.specifications.length > 0) {
          unit.specifications.forEach((s) => {
            editUnitSpecsContainer.appendChild(createSpecRowElement(s));
          });
        }
      }

      editModalInstance.show();
    }

    async function handleDeleteUnit(unit) {
      const actionTitle = 'أرشفة وحدة القياس';
      const actionText = `هل أنت متأكد من رغبتك في أرشفة وحدة "${unit.name}"؟`;

      if (typeof Swal !== 'undefined') {
        Swal.fire({
          title: actionTitle,
          text: actionText,
          icon: 'warning',
          showCancelButton: true,
          confirmButtonColor: '#EE5253',
          cancelButtonColor: '#6B7280',
          confirmButtonText: 'نعم، أرشفة الوحدة',
          cancelButtonText: 'إلغاء',
        }).then(async (result) => {
          if (result.isConfirmed) {
            await executeDeleteUnit(unit);
          }
        });
      } else {
        if (confirm(actionText)) {
          await executeDeleteUnit(unit);
        }
      }
    }

    async function executeDeleteUnit(unit) {
      try {
        const res = await window.erpFetch(`/api/inventory/products/${encodeURIComponent(productId)}/units/${encodeURIComponent(unit.id)}`, {
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
            Toast.fire({ icon: 'success', title: json.message || 'تمت أرشفة الوحدة بنجاح' });
          } else {
            showAlert(json.message || 'تمت أرشفة الوحدة بنجاح', 'success');
          }
          loadProductUnits();
        } else {
          const errorMsg = extractApiErrorMessage(json, 'فشل في أرشفة الوحدة');
          if (typeof Swal !== 'undefined') {
            Swal.fire({
              icon: 'error',
              title: 'تعذر أرشفة الوحدة',
              text: errorMsg,
              confirmButtonText: 'حسناً',
              confirmButtonColor: '#10AC84',
            });
          } else {
            showAlert(errorMsg);
          }
        }
      } catch (err) {
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            icon: 'error',
            title: 'خطأ في الاتصال',
            text: 'حدث خطأ أثناء أرشفة الوحدة',
            confirmButtonText: 'حسناً',
            confirmButtonColor: '#10AC84',
          });
        } else {
          showAlert('حدث خطأ أثناء أرشفة الوحدة');
        }
      }
    }

    // Initial loading for Edit page
    loadProductData();
    loadProductUnits();
  }
});
