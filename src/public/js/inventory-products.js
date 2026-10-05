/**
 * Inventory Products & Units Management Script
 * Handles product catalog listing, category tree filtering (desktop & mobile offcanvas),
 * creation with base unit, editing, and unit conversion graph mutations.
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
   * Populate category options dropdown for product forms.
   */
  async function loadCategoryOptionsForProduct(selectElement, selectedId = '', currentCategoryName = '') {
    if (!selectElement) return;

    try {
      const options = await fetchAllActiveCategoryOptions();

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
  const productSearchForm = document.getElementById('productSearchForm');
  const productSearchInput = document.getElementById('productSearchInput');
  const statusFilterSelect = document.getElementById('statusFilterSelect');
  const btnClearProductSearch = document.getElementById('btnClearProductSearch');
  const productsPagination = document.getElementById('productsPagination');
  const paginationInfo = document.getElementById('paginationInfo');

  // Category Tree Filter Elements (Desktop & Mobile)
  const categoryTreeNodesContainer = document.getElementById('categoryTreeNodesContainer');
  const categoryTreeLoading = document.getElementById('categoryTreeLoading');
  const desktopCategoryCountBadge = document.getElementById('desktopCategoryCountBadge');
  const categoryTreeSearchInput = document.getElementById('categoryTreeSearchInput');
  const allCategoriesOption = document.getElementById('allCategoriesOption');

  const mobileCategoryTreeNodesContainer = document.getElementById('mobileCategoryTreeNodesContainer');
  const mobileCategoryTreeSearchInput = document.getElementById('mobileCategoryTreeSearchInput');
  const mobileAllCategoriesOption = document.getElementById('mobileAllCategoriesOption');
  const mobileSelectedCategoryBadge = document.getElementById('mobileSelectedCategoryBadge');
  const productCategoryOffcanvasEl = document.getElementById('productCategoryOffcanvas');

  const activeCategoryFilterBar = document.getElementById('activeCategoryFilterBar');
  const activeCategoryFilterName = document.getElementById('activeCategoryFilterName');
  const btnResetCategoryFilter = document.getElementById('btnResetCategoryFilter');

  let currentPage = 1;
  const pageLimit = 15;
  let selectedCategoryId = '';
  let listSearchTimeout = null;

  /**
   * Builds and initializes category tree in desktop panel & mobile offcanvas.
   */
  async function initCategoryTree() {
    if (!categoryTreeNodesContainer && !mobileCategoryTreeNodesContainer) return;

    try {
      const allCategories = await fetchAllActiveCategoryOptions();

      if (desktopCategoryCountBadge) {
        desktopCategoryCountBadge.textContent = String(allCategories.length);
      }

      if (categoryTreeLoading) {
        categoryTreeLoading.remove();
      }

      // Group categories into parent-to-children structure
      const childrenMap = new Map();
      const rootCategories = [];

      allCategories.forEach((cat) => {
        if (!cat.parentId) {
          rootCategories.push(cat);
        } else {
          if (!childrenMap.has(cat.parentId)) {
            childrenMap.set(cat.parentId, []);
          }
          childrenMap.get(cat.parentId).push(cat);
        }
      });

      // Render Tree Node DOM function
      function createTreeNode(cat, isMobile) {
        const wrapper = document.createElement('div');
        wrapper.className = 'category-tree-node-wrapper mb-1';
        wrapper.dataset.categoryId = cat.id;
        wrapper.dataset.categoryName = cat.name.toLowerCase();

        const item = document.createElement('div');
        item.className = 'category-tree-item d-flex align-items-center justify-content-between px-2 py-2 rounded-2';
        item.dataset.categoryId = cat.id;
        item.role = 'button';

        const children = childrenMap.get(cat.id) || [];
        const hasChildren = children.length > 0;

        const leftSide = document.createElement('div');
        leftSide.className = 'd-flex align-items-center gap-2 flex-grow-1 overflow-hidden';

        if (hasChildren) {
          const toggleBtn = document.createElement('button');
          toggleBtn.type = 'button';
          toggleBtn.className = 'category-tree-toggle btn btn-link p-0 text-muted';
          const chevron = document.createElement('i');
          chevron.className = 'fa-solid fa-chevron-left small';
          toggleBtn.appendChild(chevron);
          leftSide.appendChild(toggleBtn);

          toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sublist = wrapper.querySelector('.category-tree-sublist');
            if (sublist) {
              const isCollapsed = sublist.classList.contains('d-none');
              if (isCollapsed) {
                sublist.classList.remove('d-none');
                toggleBtn.classList.add('expanded');
                chevron.className = 'fa-solid fa-chevron-down small';
              } else {
                sublist.classList.add('d-none');
                toggleBtn.classList.remove('expanded');
                chevron.className = 'fa-solid fa-chevron-left small';
              }
            }
          });
        } else {
          const spacer = document.createElement('span');
          spacer.style.width = '14px';
          spacer.style.display = 'inline-block';
          leftSide.appendChild(spacer);
        }

        const folderIcon = document.createElement('i');
        folderIcon.className = hasChildren ? 'fa-solid fa-folder text-warning me-1' : 'fa-regular fa-folder text-muted me-1';
        leftSide.appendChild(folderIcon);

        const label = document.createElement('span');
        label.className = 'category-name-text text-truncate';
        label.textContent = cat.name;
        leftSide.appendChild(label);

        item.appendChild(leftSide);

        if (cat.productCount > 0) {
          const countBadge = document.createElement('span');
          countBadge.className = 'badge bg-light text-muted border small';
          countBadge.textContent = String(cat.productCount);
          item.appendChild(countBadge);
        }

        // Click handler to filter products
        item.addEventListener('click', () => {
          selectCategory(cat.id, cat.name);
        });

        wrapper.appendChild(item);

        // Sublist if has children
        if (hasChildren) {
          const sublist = document.createElement('div');
          sublist.className = 'category-tree-sublist ps-3 d-none border-start border-2 ms-2 mt-1';
          children.forEach((child) => {
            sublist.appendChild(createTreeNode(child, isMobile));
          });
          wrapper.appendChild(sublist);
        }

        return wrapper;
      }

      // Populate desktop tree
      if (categoryTreeNodesContainer) {
        categoryTreeNodesContainer.textContent = '';
        if (rootCategories.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'text-center py-4 text-muted small';
          empty.textContent = 'لا توجد فئات حتى الآن';
          categoryTreeNodesContainer.appendChild(empty);
        } else {
          rootCategories.forEach((root) => {
            categoryTreeNodesContainer.appendChild(createTreeNode(root, false));
          });
        }
      }

      // Populate mobile tree
      if (mobileCategoryTreeNodesContainer) {
        mobileCategoryTreeNodesContainer.textContent = '';
        if (rootCategories.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'text-center py-4 text-muted small';
          empty.textContent = 'لا توجد فئات حتى الآن';
          mobileCategoryTreeNodesContainer.appendChild(empty);
        } else {
          rootCategories.forEach((root) => {
            mobileCategoryTreeNodesContainer.appendChild(createTreeNode(root, true));
          });
        }
      }
    } catch (err) {
      console.error('Failed to initialize category tree:', err);
      if (categoryTreeNodesContainer) {
        categoryTreeNodesContainer.textContent = '';
        const errMsg = document.createElement('div');
        errMsg.className = 'text-center py-3 text-danger small';
        errMsg.textContent = 'تعذر تحميل شجرة الفئات';
        categoryTreeNodesContainer.appendChild(errMsg);
      }
    }
  }

  /**
   * Selects a category, highlights it, updates badges/filter bar, and triggers loadProducts.
   */
  function selectCategory(categoryId, categoryName) {
    selectedCategoryId = categoryId;

    // Update active class on desktop & mobile tree items
    const allTreeItems = document.querySelectorAll('.category-tree-item');
    allTreeItems.forEach((el) => {
      if (el.dataset.categoryId === categoryId) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    });

    if (categoryId) {
      if (allCategoriesOption) allCategoriesOption.classList.remove('active');
      if (mobileAllCategoriesOption) mobileAllCategoriesOption.classList.remove('active');

      if (activeCategoryFilterBar) activeCategoryFilterBar.classList.remove('d-none');
      if (activeCategoryFilterName) activeCategoryFilterName.textContent = categoryName;
      if (mobileSelectedCategoryBadge) mobileSelectedCategoryBadge.textContent = categoryName;
    } else {
      if (allCategoriesOption) allCategoriesOption.classList.add('active');
      if (mobileAllCategoriesOption) mobileAllCategoriesOption.classList.add('active');

      if (activeCategoryFilterBar) activeCategoryFilterBar.classList.add('d-none');
      if (mobileSelectedCategoryBadge) mobileSelectedCategoryBadge.textContent = 'الكل';
    }

    // Close mobile offcanvas if open
    if (productCategoryOffcanvasEl) {
      const offcanvasInstance = bootstrap.Offcanvas.getInstance(productCategoryOffcanvasEl);
      if (offcanvasInstance) {
        offcanvasInstance.hide();
      }
    }

    loadProducts(1);
  }

  /**
   * Filters tree nodes by search text.
   */
  function filterTreeNodes(container, query) {
    if (!container) return;
    const term = query.trim().toLowerCase();
    const wrappers = container.querySelectorAll('.category-tree-node-wrapper');

    wrappers.forEach((wrap) => {
      const name = wrap.dataset.categoryName || '';
      if (!term || name.includes(term)) {
        wrap.classList.remove('d-none');
      } else {
        wrap.classList.add('d-none');
      }
    });
  }

  // Tree search events
  if (categoryTreeSearchInput) {
    categoryTreeSearchInput.addEventListener('input', (e) => {
      filterTreeNodes(categoryTreeNodesContainer, e.target.value);
    });
  }

  if (mobileCategoryTreeSearchInput) {
    mobileCategoryTreeSearchInput.addEventListener('input', (e) => {
      filterTreeNodes(mobileCategoryTreeNodesContainer, e.target.value);
    });
  }

  // "All Products" reset button handlers
  if (allCategoriesOption) {
    allCategoriesOption.addEventListener('click', () => {
      selectCategory('', '');
    });
  }

  if (mobileAllCategoriesOption) {
    mobileAllCategoriesOption.addEventListener('click', () => {
      selectCategory('', '');
    });
  }

  if (btnResetCategoryFilter) {
    btnResetCategoryFilter.addEventListener('click', () => {
      selectCategory('', '');
    });
  }

  /**
   * Loads products table with search, categoryId filter, and pagination.
   */
  async function loadProducts(page = 1) {
    if (!productsTableBody) return;

    currentPage = page;
    productsTableBody.textContent = '';

    const loadingRow = document.createElement('tr');
    const loadingTd = document.createElement('td');
    loadingTd.colSpan = 8;
    loadingTd.className = 'text-center py-5 text-muted';
    const spin = document.createElement('div');
    spin.className = 'spinner-border spinner-border-sm text-secondary me-2';
    spin.setAttribute('role', 'status');
    loadingTd.appendChild(spin);
    const txt = document.createElement('span');
    txt.textContent = 'جاري تحميل المنتجات...';
    loadingTd.appendChild(txt);
    loadingRow.appendChild(loadingTd);
    productsTableBody.appendChild(loadingRow);

    const search = productSearchInput ? productSearchInput.value.trim() : '';
    const status = statusFilterSelect ? statusFilterSelect.value : 'active';

    const params = new URLSearchParams({
      page: String(page),
      limit: String(pageLimit),
      status,
    });
    if (search) params.append('search', search);
    if (selectedCategoryId) params.append('categoryId', selectedCategoryId);

    try {
      const res = await fetch(`/api/inventory/products?${params.toString()}`);
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}`);
      }
      const json = await res.json();

      productsTableBody.textContent = '';

      if (json.success && json.data) {
        const { items, total, totalPages } = json.data;

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

          // Product Name & Description (Matching System Users pattern)
          const tdName = document.createElement('td');
          tdName.className = 'py-3 px-4';
          const nameWrap = document.createElement('div');
          nameWrap.className = 'd-flex align-items-center gap-2';

          const iconBox = document.createElement('div');
          iconBox.className = 'bg-light text-muted p-2 rounded-3 d-flex align-items-center justify-content-center';
          iconBox.style.width = '36px';
          iconBox.style.height = '36px';
          const icon = document.createElement('i');
          icon.className = 'fa-solid fa-cube text-muted';
          iconBox.appendChild(icon);
          nameWrap.appendChild(iconBox);

          const textWrap = document.createElement('div');
          const nameStrong = document.createElement('strong');
          nameStrong.className = 'text-dark d-block';
          nameStrong.textContent = p.name;
          textWrap.appendChild(nameStrong);
          if (p.description) {
            const descSmall = document.createElement('small');
            descSmall.className = 'text-muted d-block text-truncate';
            descSmall.style.maxWidth = '250px';
            descSmall.textContent = p.description;
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
          codeBadge.textContent = p.code;
          tdCode.appendChild(codeBadge);
          tr.appendChild(tdCode);

          // Category
          const tdCat = document.createElement('td');
          tdCat.className = 'py-3 text-muted small';
          tdCat.textContent = p.categoryName || '-- غير مصنف --';
          tr.appendChild(tdCat);

          // Base Unit
          const tdBase = document.createElement('td');
          tdBase.className = 'py-3';
          const baseBadge = document.createElement('span');
          baseBadge.className = 'badge bg-secondary bg-opacity-10 text-dark border';
          baseBadge.textContent = p.baseUnitName || 'غير متسق';
          tdBase.appendChild(baseBadge);
          tr.appendChild(tdBase);

          // Unit Count
          const tdUnits = document.createElement('td');
          tdUnits.className = 'py-3 text-center';
          const unitBadge = document.createElement('span');
          unitBadge.className = 'badge bg-light text-dark border';
          unitBadge.textContent = `${p.unitCount} وحدة`;
          tdUnits.appendChild(unitBadge);
          tr.appendChild(tdUnits);

          // Location
          const tdLoc = document.createElement('td');
          tdLoc.className = 'py-3 text-muted small';
          tdLoc.textContent = p.locationName || '--';
          tr.appendChild(tdLoc);

          // Status
          const tdStatus = document.createElement('td');
          tdStatus.className = 'py-3 text-center';
          const stBadge = document.createElement('span');
          stBadge.className = p.isActive
            ? 'badge bg-success bg-opacity-10 text-success border border-success'
            : 'badge bg-secondary bg-opacity-10 text-secondary border';
          stBadge.textContent = p.isActive ? 'نشط' : 'معطل';
          tdStatus.appendChild(stBadge);
          tr.appendChild(tdStatus);

          // Actions
          const tdActions = document.createElement('td');
          tdActions.className = 'py-3 text-center px-4';
          const actionGroup = document.createElement('div');
          actionGroup.className = 'd-flex justify-content-center gap-1';

          if (permissions.canUpdateProduct) {
            const editBtn = document.createElement('a');
            editBtn.href = `/inventory/products/${encodeURIComponent(p.id)}/edit`;
            editBtn.className = 'btn btn-sm btn-outline-primary';
            editBtn.title = 'تعديل المنتج';
            const editIcon = document.createElement('i');
            editIcon.className = 'fa-solid fa-pen';
            editBtn.appendChild(editIcon);
            actionGroup.appendChild(editBtn);
          }

          if (permissions.canDeleteProduct) {
            const delBtn = document.createElement('button');
            delBtn.type = 'button';
            delBtn.className = 'btn btn-sm btn-outline-danger';
            delBtn.title = 'أرشفة المنتج';
            const delIcon = document.createElement('i');
            delIcon.className = 'fa-solid fa-box-archive';
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
      console.error('Error loading products:', err);
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

    // Page numbers
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

  // Initialize Product Listing
  if (productsTableBody) {
    initCategoryTree();
    loadProducts(1);

    if (productSearchForm) {
      productSearchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const term = productSearchInput ? productSearchInput.value.trim() : '';
        if (btnClearProductSearch) {
          if (term) {
            btnClearProductSearch.classList.remove('d-none');
          } else {
            btnClearProductSearch.classList.add('d-none');
          }
        }
        loadProducts(1);
      });
    }

    if (productSearchInput) {
      productSearchInput.addEventListener('input', (e) => {
        const term = e.target.value.trim();
        clearTimeout(listSearchTimeout);
        if (btnClearProductSearch) {
          if (term) {
            btnClearProductSearch.classList.remove('d-none');
          } else {
            btnClearProductSearch.classList.add('d-none');
          }
        }
        listSearchTimeout = setTimeout(() => loadProducts(1), 350);
      });
    }

    if (btnClearProductSearch) {
      btnClearProductSearch.addEventListener('click', () => {
        if (productSearchInput) productSearchInput.value = '';
        btnClearProductSearch.classList.add('d-none');
        loadProducts(1);
      });
    }

    if (statusFilterSelect) {
      statusFilterSelect.addEventListener('change', () => loadProducts(1));
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

          if (titleEl) {
            titleEl.textContent = `تعديل: ${currentProductData.name}`;
            const boxIcon = document.createElement('i');
            boxIcon.className = 'fa-solid fa-box-open text-muted fs-5 ms-2';
            titleEl.appendChild(boxIcon);
          }
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

    // Load Product Units
    async function loadProductUnits() {
      if (!productUnitsTableBody) return;

      const hadExistingData = currentUnitsList && currentUnitsList.length > 0;
      if (!hadExistingData) {
        productUnitsTableBody.textContent = '';
        const loadingRow = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7;
        td.className = 'text-center py-5 text-muted';
        td.textContent = 'جاري تحميل وحدات القياس...';
        loadingRow.appendChild(td);
        productUnitsTableBody.appendChild(loadingRow);
      }

      try {
        const units = await fetchAllProductUnits(productId);

        currentUnitsList = units;

        if (unitsCountPill) unitsCountPill.textContent = String(currentUnitsList.length);

        productUnitsTableBody.textContent = '';

        if (currentUnitsList.length === 0) {
          const emptyRow = document.createElement('tr');
          const emptyTd = document.createElement('td');
          emptyTd.colSpan = 7;
          emptyTd.className = 'text-center py-5 text-muted';
          emptyTd.textContent = 'لا توجد وحدات معرّفة لهذا المنتج.';
          emptyRow.appendChild(emptyTd);
          productUnitsTableBody.appendChild(emptyRow);
          return;
        }

        currentUnitsList.forEach((unit) => {
          const tr = document.createElement('tr');

          // Name
          const tdName = document.createElement('td');
          tdName.className = 'py-3 px-4 fw-bold';
          tdName.textContent = unit.name;
          tr.appendChild(tdName);

          // Unit Type
          const tdType = document.createElement('td');
          tdType.className = 'py-3';
          if (unit.isBase) {
            const baseBadge = document.createElement('span');
            baseBadge.className = 'badge bg-success bg-opacity-10 text-success border border-success';
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
          tdFormula.className = 'py-3';
          if (unit.isBase) {
            tdFormula.className = 'py-3 text-muted small';
            tdFormula.textContent = 'مرجع القياس الأساسي';
          } else {
            const eqSpan = document.createElement('span');
            eqSpan.className = 'fw-bold text-dark small';
            eqSpan.textContent = `1 ${unit.name} = ${unit.conversionQuantity} × ${unit.equivalentToUnitName || 'وحدة'}`;
            tdFormula.appendChild(eqSpan);
          }
          tr.appendChild(tdFormula);

          // Price
          const tdPrice = document.createElement('td');
          tdPrice.className = 'py-3 font-monospace fw-bold';
          tdPrice.textContent = unit.price;
          tr.appendChild(tdPrice);

          // Barcode
          const tdBarcode = document.createElement('td');
          tdBarcode.className = 'py-3';
          if (unit.barcode) {
            const bcBadge = document.createElement('span');
            bcBadge.className = 'badge bg-light text-dark border font-monospace';
            bcBadge.textContent = unit.barcode;
            tdBarcode.appendChild(bcBadge);
          } else {
            tdBarcode.className = 'py-3 text-muted small';
            tdBarcode.textContent = '--';
          }
          tr.appendChild(tdBarcode);

          // Specifications
          const tdSpecs = document.createElement('td');
          tdSpecs.className = 'py-3';
          if (unit.specifications && unit.specifications.length > 0) {
            const specBadgesDiv = document.createElement('div');
            specBadgesDiv.className = 'd-flex flex-wrap gap-1';
            unit.specifications.forEach((s) => {
              const sBadge = document.createElement('span');
              sBadge.className = 'badge bg-light text-dark border small';
              sBadge.textContent = s.unit ? `${s.name}: ${s.value} ${s.unit}` : `${s.name}: ${s.value}`;
              specBadgesDiv.appendChild(sBadge);
            });
            tdSpecs.appendChild(specBadgesDiv);
          } else {
            tdSpecs.className = 'py-3 text-muted small';
            tdSpecs.textContent = '--';
          }
          tr.appendChild(tdSpecs);

          // Actions
          const tdActions = document.createElement('td');
          tdActions.className = 'py-3 text-center px-4';
          const actionGroup = document.createElement('div');
          actionGroup.className = 'd-flex justify-content-center gap-1';

          if (permissions.canUpdateProduct) {
            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'btn btn-sm btn-outline-primary';
            editBtn.title = 'تعديل الوحدة';
            const editIcon = document.createElement('i');
            editIcon.className = 'fa-solid fa-pen';
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
              delIcon.className = 'fa-solid fa-box-archive';
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
          errTd.className = 'text-center py-5 text-danger';
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
