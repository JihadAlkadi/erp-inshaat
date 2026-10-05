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
    const categoryId = categoryFilterSelect ? categoryFilterSelect.value : '';
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
          tdName.textContent = p.name;
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

          if (permissions.canUpdateProduct) {
            const editBtn = document.createElement('a');
            editBtn.href = `/inventory/products/${encodeURIComponent(p.id)}/edit`;
            editBtn.className = 'btn btn-sm btn-outline-primary rounded-pill px-3 me-1';
            editBtn.textContent = 'تعديل';
            tdActions.appendChild(editBtn);
          }

          if (permissions.canDeleteProduct) {
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn btn-sm btn-outline-danger rounded-pill px-3';
            delBtn.textContent = 'أرشفة';
            delBtn.addEventListener('click', () => handleDeleteProduct(p));
            tdActions.appendChild(delBtn);
          }

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
    if (!confirm(`هل أنت متأكد من أرشفة منتج "${product.name}"؟`)) {
      return;
    }

    try {
      const res = await window.erpFetch(`/api/inventory/products/${encodeURIComponent(product.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json();

      if (json.success) {
        showAlert(json.message || 'تمت أرشفة المنتج بنجاح', 'success');
        loadProducts(currentPage);
      } else {
        showAlert(json.message || 'فشل في أرشفة المنتج');
      }
    } catch (err) {
      showAlert('حدث خطأ أثناء تنفيذ عملية أرشفة المنتج');
    }
  }

  if (productsTableBody) {
    loadCategoryOptionsForProduct(categoryFilterSelect);
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
  }

  // ==========================================
  // 2. PRODUCT CREATE PAGE (/inventory/products/create)
  // ==========================================

  const createProductForm = document.getElementById('createProductForm');
  const baseSpecsContainer = document.getElementById('baseSpecsContainer');
  const btnAddBaseSpec = document.getElementById('btnAddBaseSpec');
  const productCategorySelect = document.getElementById('productCategoryId');

  if (createProductForm) {
    loadCategoryOptionsForProduct(productCategorySelect);

    if (btnAddBaseSpec && baseSpecsContainer) {
      btnAddBaseSpec.addEventListener('click', () => {
        baseSpecsContainer.appendChild(createSpecRowElement());
      });
    }

    createProductForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameInput = document.getElementById('productName');
      const codeInput = document.getElementById('productCode');
      const catSelect = document.getElementById('productCategoryId');
      const locInput = document.getElementById('productLocationName');
      const descInput = document.getElementById('productDescription');
      const activeCheckbox = document.getElementById('productIsActive');

      const baseNameInput = document.getElementById('baseUnitName');
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

      const baseUnitName = baseNameInput ? baseNameInput.value.trim() : '';
      const baseUnitPrice = basePriceInput ? basePriceInput.value.trim() : '';
      const baseUnitBarcode = baseBarcodeInput ? baseBarcodeInput.value.trim() || null : null;

      if (!name) {
        showAlert('اسم المنتج مطلوب');
        return;
      }
      if (!code) {
        showAlert('رمز المنتج مطلوب');
        return;
      }
      if (!baseUnitName) {
        showAlert('اسم الوحدة الأساسية مطلوب');
        return;
      }
      if (!baseUnitPrice) {
        showAlert('سعر الوحدة الأساسية مطلوب');
        return;
      }

      const specsResult = collectSpecifications(baseSpecsContainer);
      if (!specsResult.valid) {
        showAlert(specsResult.message || 'بيانات مواصفات الوحدة غير صالحة');
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
        const res = await window.erpFetch('/api/inventory/products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json();

        if (json.success && json.data) {
          // Direct redirect to edit units page
          window.location.href = `/inventory/products/${encodeURIComponent(json.data.id)}/edit#units`;
        } else {
          showAlert(json.message || 'فشل في إنشاء المنتج');
        }
      } catch (err) {
        showAlert('حدث خطأ أثناء إرسال بيانات المنتج إلى الخادم');
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

          if (permissions.canUpdateProduct) {
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn btn-sm btn-outline-primary rounded-pill px-3 me-1';
            editBtn.textContent = 'تعديل';
            editBtn.addEventListener('click', () => openEditUnitModal(unit));
            tdActions.appendChild(editBtn);

            // Base unit cannot be deleted
            if (!unit.isBase) {
              const delBtn = document.createElement('button');
              delBtn.type = 'button';
              delBtn.className = 'btn btn-sm btn-outline-danger rounded-pill px-3';
              delBtn.textContent = 'أرشفة';
              delBtn.addEventListener('click', () => handleDeleteUnit(unit));
              tdActions.appendChild(delBtn);
            }
          }

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
    if (editProductForm) {
      editProductForm.addEventListener('submit', async (e) => {
        e.preventDefault();

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
          showAlert('اسم المنتج مطلوب');
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
            showAlert('تم حفظ بيانات المنتج بنجاح', 'success');
            loadProductData();
          } else {
            showAlert(json.message || 'فشل في حفظ التعديلات');
          }
        } catch (err) {
          showAlert('حدث خطأ أثناء إرسال التعديلات إلى الخادم');
        } finally {
          if (submitBtn) submitBtn.disabled = false;
          if (spinner) spinner.classList.add('d-none');
        }
      });
    }

    // Archive Product Button
    if (btnArchiveProduct) {
      btnArchiveProduct.addEventListener('click', async () => {
        if (!confirm('هل أنت متأكد من أرشفة هذا المنتج بالكامل؟')) return;

        try {
          const res = await window.erpFetch(`/api/inventory/products/${encodeURIComponent(productId)}`, {
            method: 'DELETE',
          });
          const json = await res.json();

          if (json.success) {
            window.location.href = '/inventory/products';
          } else {
            showAlert(json.message || 'فشل في أرشفة المنتج');
          }
        } catch (err) {
          showAlert('حدث خطأ أثناء تنفيذ عملية الأرشفة');
        }
      });
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
              showAlert('تمت إضافة الوحدة بنجاح', 'success');
              loadProductUnits();
            } else {
              showAlert(json.message || 'فشل في إضافة الوحدة', 'danger', addAlert);
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
              showAlert('تم حفظ تعديلات الوحدة بنجاح', 'success');
              loadProductUnits();
            } else {
              showAlert(json.message || 'فشل في حفظ تعديلات الوحدة', 'danger', editAlert);
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
      if (!confirm(`هل أنت متأكد من أرشفة وحدة "${unit.name}"؟`)) {
        return;
      }

      try {
        const res = await window.erpFetch(`/api/inventory/products/${encodeURIComponent(productId)}/units/${encodeURIComponent(unit.id)}`, {
          method: 'DELETE',
        });
        const json = await res.json();

        if (json.success) {
          showAlert(json.message || 'تمت أرشفة الوحدة بنجاح', 'success');
          loadProductUnits();
        } else {
          showAlert(json.message || 'فشل في أرشفة الوحدة');
        }
      } catch (err) {
        showAlert('حدث خطأ أثناء أرشفة الوحدة');
      }
    }

    // Initial loading for Edit page
    loadProductData();
    loadProductUnits();
  }
});
