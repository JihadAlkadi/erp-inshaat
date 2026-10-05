/**
 * Inventory Categories Management Script
 * Handles categories table view, status toggling, soft delete, create, and edit.
 * Security: Uses window.erpFetch for all mutations and native DOM APIs to prevent XSS.
 */

document.addEventListener('DOMContentLoaded', () => {
  const alertContainer =
    document.getElementById('categoryAlertContainer') ||
    document.getElementById('categoryFormAlertContainer');

  // Form elements (if on create or edit page)
  const createCategoryForm = document.getElementById('createCategoryForm');
  const editCategoryForm = document.getElementById('editCategoryForm');
  const categoryParentSelect = document.getElementById('categoryParentId');

  /**
   * Helper to extract error message from API response
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

    const uniqueMessages = Array.from(new Set(errorMessages));
    if (uniqueMessages.length > 0) {
      return uniqueMessages.join('، ');
    }

    return fallback || 'حدث خطأ أثناء معالجة الطلب';
  }

  /**
   * Helper to show Bootstrap alert safely without innerHTML XSS.
   */
  function showAlert(message, type = 'danger') {
    if (!alertContainer) {
      if (typeof Swal !== 'undefined') {
        Swal.fire({
          icon: type === 'success' ? 'success' : 'error',
          title: type === 'success' ? 'تمت العملية' : 'خطأ',
          text: message,
          confirmButtonText: 'حسناً',
          confirmButtonColor: '#10AC84',
        });
      } else {
        alert(message);
      }
      return;
    }

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

      if (selectedId && !selectedFound) {
        const preservedOpt = document.createElement('option');
        preservedOpt.value = selectedId;
        preservedOpt.textContent = currentParentName ? `${currentParentName} (معطلة حالياً)` : 'الفئة الأب الحالية (معطلة)';
        preservedOpt.selected = true;
        categoryParentSelect.appendChild(preservedOpt);
      }
    } catch (err) {
      console.error('Failed to load category options:', err);
      showAlert('فشل في تحميل خيارات الفئات الأب. يرجى إعادة المحاولة.');
    }
  }

  /**
   * Delegated Click Listener for Category Table Actions (Toggle status, Soft delete)
   */
  document.addEventListener('click', (e) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    // 1. Toggle Category Status
    const toggleBtn = target.closest('[data-action="toggle-category-status"]');
    if (toggleBtn) {
      e.preventDefault();
      const categoryId = toggleBtn.getAttribute('data-category-id');
      const categoryName = toggleBtn.getAttribute('data-category-name') || '';
      const newStatus = toggleBtn.getAttribute('data-new-status') === 'true';

      if (categoryId) {
        handleCategoryStatusToggle(categoryId, newStatus, categoryName);
      }
      return;
    }

    // 2. Delete Category
    const deleteBtn = target.closest('[data-action="delete-category"]');
    if (deleteBtn) {
      e.preventDefault();
      const categoryId = deleteBtn.getAttribute('data-category-id');
      const categoryName = deleteBtn.getAttribute('data-category-name') || '';

      if (categoryId) {
        handleCategorySoftDelete(categoryId, categoryName);
      }
      return;
    }
  });

  function handleCategoryStatusToggle(categoryId, newStatus, categoryName) {
    const actionTitle = newStatus ? 'تفعيل الفئة' : 'تعطيل الفئة';
    const actionText = newStatus
      ? `هل أنت متأكد من تفعيل فئة "${categoryName}"؟`
      : `هل أنت متأكد من تعطيل فئة "${categoryName}"؟ يشترط عدم وجود فئات فرعية أو منتجات تابعة لها.`;
    const confirmBtnText = newStatus ? 'نعم، تفعيل' : 'نعم، تعطيل';
    const confirmBtnColor = newStatus ? '#10AC84' : '#FF9F43';

    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title: actionTitle,
        text: actionText,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: confirmBtnColor,
        cancelButtonColor: '#6B7280',
        confirmButtonText: confirmBtnText,
        cancelButtonText: 'إلغاء',
      }).then((result) => {
        if (result.isConfirmed) {
          executeCategoryStatusToggle(categoryId, newStatus);
        }
      });
    } else {
      if (confirm(actionText)) {
        executeCategoryStatusToggle(categoryId, newStatus);
      }
    }
  }

  async function executeCategoryStatusToggle(categoryId, newStatus) {
    try {
      const res = await window.erpFetch(`/api/inventory/categories/${encodeURIComponent(categoryId)}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ isActive: newStatus }),
      });
      const json = await res.json();

      if (res.ok && json.success) {
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            icon: 'success',
            title: 'نجحت العملية',
            text: newStatus ? 'تم تفعيل الفئة بنجاح' : 'تم تعطيل الفئة بنجاح',
            confirmButtonText: 'حسناً',
            confirmButtonColor: '#10AC84',
          }).then(() => {
            window.location.reload();
          });
        } else {
          window.location.reload();
        }
      } else {
        const errorMsg = extractApiErrorMessage(json, 'فشل تغيير حالة الفئة');
        showAlert(errorMsg, 'danger');
      }
    } catch (err) {
      showAlert('حدث خطأ في الاتصال بالخادم، يرجى المحاولة مرة أخرى.', 'danger');
    }
  }

  function handleCategorySoftDelete(categoryId, categoryName) {
    const title = 'أرشفة الفئة';
    const text = `هل أنت متأكد من أرشفة فئة "${categoryName}"؟ يشترط عدم وجود فئات فرعية أو منتجات تابعة لها.`;

    if (typeof Swal !== 'undefined') {
      Swal.fire({
        title,
        text,
        icon: 'error',
        showCancelButton: true,
        confirmButtonColor: '#EE5253',
        cancelButtonColor: '#6B7280',
        confirmButtonText: 'نعم، أرشفة الفئة',
        cancelButtonText: 'إلغاء',
      }).then((result) => {
        if (result.isConfirmed) {
          executeCategorySoftDelete(categoryId);
        }
      });
    } else {
      if (confirm(text)) {
        executeCategorySoftDelete(categoryId);
      }
    }
  }

  async function executeCategorySoftDelete(categoryId) {
    try {
      const res = await window.erpFetch(`/api/inventory/categories/${encodeURIComponent(categoryId)}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
        },
      });
      const json = await res.json();

      if (res.ok && json.success) {
        if (typeof Swal !== 'undefined') {
          Swal.fire({
            icon: 'success',
            title: 'تمت الأرشفة',
            text: 'تمت أرشفة الفئة بنجاح',
            confirmButtonText: 'حسناً',
            confirmButtonColor: '#10AC84',
          }).then(() => {
            window.location.reload();
          });
        } else {
          window.location.reload();
        }
      } else {
        const errorMsg = extractApiErrorMessage(json, 'فشل أرشفة الفئة');
        showAlert(errorMsg, 'danger');
      }
    } catch (err) {
      showAlert('حدث خطأ في الاتصال بالخادم أثناء الأرشفة.', 'danger');
    }
  }

  // --- Category Form Handling (Create & Edit) ---

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
          showAlert(extractApiErrorMessage(json, 'فشل في إنشاء الفئة'));
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
          showAlert(extractApiErrorMessage(json, 'فشل في حفظ تعديلات الفئة'));
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
