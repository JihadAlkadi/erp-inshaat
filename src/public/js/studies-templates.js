/**
 * Studies Templates List Page Script
 * Follows UI design standards and project invariants:
 * - Uses window.erpFetch for all mutations
 * - Uses native DOM APIs (textContent, createElement) to prevent XSS
 * - Uses SweetAlert2 for all user confirmations
 */

document.addEventListener('DOMContentLoaded', () => {
  let currentPage = 1;
  const pageLimit = 10;
  let totalItems = 0;
  let totalPages = 1;

  const searchInput = document.getElementById('searchInput');
  const statusFilter = document.getElementById('statusFilter');
  const filterForm = document.getElementById('templateFilterForm');
  const resetFilterBtn = document.getElementById('resetFilterBtn');
  const tableBody = document.getElementById('templatesTableBody');
  const totalBadge = document.getElementById('totalTemplatesBadge');
  const paginationInfo = document.getElementById('paginationInfo');
  const paginationList = document.getElementById('paginationList');

  const permissions = window.STUDIES_PERMISSIONS || {
    canCreateTemplate: false,
    canUpdateTemplate: false,
    canDeleteTemplate: false,
  };

  async function loadTemplates(page = 1) {
    currentPage = page;
    tableBody.replaceChildren();

    const loadingRow = document.createElement('tr');
    const loadingTd = document.createElement('td');
    loadingTd.colSpan = 7;
    loadingTd.className = 'text-center py-5 text-muted';
    loadingTd.innerHTML = '<div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div> جاري تحميل البيانات...';
    loadingRow.appendChild(loadingTd);
    tableBody.appendChild(loadingRow);

    const params = new URLSearchParams({
      page: currentPage.toString(),
      limit: pageLimit.toString(),
    });

    const searchVal = searchInput ? searchInput.value.trim() : '';
    if (searchVal) {
      params.append('search', searchVal);
    }

    const statusVal = statusFilter ? statusFilter.value : '';
    if (statusVal === 'true' || statusVal === 'false') {
      params.append('isActive', statusVal);
    }

    try {
      const res = await fetch(`/api/studies/templates?${params.toString()}`);
      if (!res.ok) {
        throw new Error('فشل جلب قوالب التصنيع');
      }

      const resData = await res.json();
      if (!resData.success) {
        throw new Error(resData.message || 'حدث خطأ أثناء تحميل البيانات');
      }

      const data = resData.data;
      totalItems = data.total;
      totalPages = data.totalPages;

      if (totalBadge) {
        totalBadge.textContent = `${totalItems} قالب`;
      }

      renderTable(data.items);
      renderPagination(data.page, data.totalPages, data.total);
    } catch (err) {
      tableBody.replaceChildren();
      const errRow = document.createElement('tr');
      const errTd = document.createElement('td');
      errTd.colSpan = 7;
      errTd.className = 'text-center py-5 text-danger';
      errTd.textContent = err.message || 'تعذر تحميل قوالب التصنيع';
      errRow.appendChild(errTd);
      tableBody.appendChild(errRow);
    }
  }

  function renderTable(items) {
    tableBody.replaceChildren();

    if (!items || items.length === 0) {
      const emptyRow = document.createElement('tr');
      const emptyTd = document.createElement('td');
      emptyTd.colSpan = 7;
      emptyTd.className = 'text-center py-5 text-muted';

      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-cubes fs-1 text-secondary mb-3 d-block';
      const text = document.createElement('p');
      text.className = 'mb-0 fw-bold';
      text.textContent = 'لا توجد قوالب تصنيع مطابقة لمعايير البحث';

      emptyTd.appendChild(icon);
      emptyTd.appendChild(text);
      emptyRow.appendChild(emptyTd);
      tableBody.appendChild(emptyRow);
      return;
    }

    items.forEach((item) => {
      const tr = document.createElement('tr');

      // Name
      const tdName = document.createElement('td');
      tdName.className = 'ps-4';
      const nameLink = document.createElement('a');
      nameLink.href = `/studies/templates/${item.id}`;
      nameLink.className = 'fw-bold text-decoration-none text-dark d-block';
      nameLink.textContent = item.name;
      tdName.appendChild(nameLink);
      if (item.description) {
        const desc = document.createElement('div');
        desc.className = 'text-muted small text-truncate';
        desc.style.maxWidth = '250px';
        desc.textContent = item.description;
        tdName.appendChild(desc);
      }
      tr.appendChild(tdName);

      // Reference Number
      const tdRef = document.createElement('td');
      tdRef.textContent = item.referenceNumber || '—';
      tr.appendChild(tdRef);

      // Code
      const tdCode = document.createElement('td');
      const codeSpan = document.createElement('span');
      codeSpan.className = 'badge bg-light text-dark border font-monospace px-2 py-1';
      codeSpan.textContent = item.code;
      tdCode.appendChild(codeSpan);
      tr.appendChild(tdCode);

      // Stages Count
      const tdStages = document.createElement('td');
      tdStages.className = 'text-center';
      const stageBadge = document.createElement('span');
      stageBadge.className = 'badge bg-secondary-subtle text-secondary-emphasis rounded-pill px-2 py-1';
      stageBadge.textContent = `${item.stagesCount || 0} مراحل`;
      tdStages.appendChild(stageBadge);
      tr.appendChild(tdStages);

      // Status Badge
      const tdStatus = document.createElement('td');
      tdStatus.className = 'text-center';
      const statusBadge = document.createElement('span');
      if (item.isActive) {
        statusBadge.className = 'badge bg-success-subtle text-success px-2 py-1 rounded-pill';
        statusBadge.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i> نشط';
      } else {
        statusBadge.className = 'badge bg-danger-subtle text-danger px-2 py-1 rounded-pill';
        statusBadge.innerHTML = '<i class="fa-solid fa-circle-xmark me-1"></i> معطل';
      }
      tdStatus.appendChild(statusBadge);
      tr.appendChild(tdStatus);

      // Updated At
      const tdDate = document.createElement('td');
      tdDate.className = 'small text-muted';
      tdDate.textContent = item.updatedAt ? new Date(item.updatedAt).toLocaleDateString('ar-EG') : '—';
      tr.appendChild(tdDate);

      // Actions
      const tdActions = document.createElement('td');
      tdActions.className = 'text-center pe-4';
      const btnGroup = document.createElement('div');
      btnGroup.className = 'd-inline-flex gap-1';

      // View
      const btnView = document.createElement('a');
      btnView.href = `/studies/templates/${item.id}`;
      btnView.className = 'btn btn-sm btn-outline-info';
      btnView.title = 'عرض التفاصيل وسير العمل';
      btnView.innerHTML = '<i class="fa-solid fa-eye"></i>';
      btnGroup.appendChild(btnView);

      // Edit
      if (permissions.canUpdateTemplate) {
        const btnEdit = document.createElement('a');
        btnEdit.href = `/studies/templates/${item.id}/edit`;
        btnEdit.className = 'btn btn-sm btn-outline-primary';
        btnEdit.title = 'تعديل البيانات الأساسية';
        btnEdit.innerHTML = '<i class="fa-solid fa-pen-to-square"></i>';
        btnGroup.appendChild(btnEdit);

        // Toggle Status
        const btnToggle = document.createElement('button');
        btnToggle.type = 'button';
        btnToggle.className = `btn btn-sm ${item.isActive ? 'btn-outline-warning' : 'btn-outline-success'}`;
        btnToggle.title = item.isActive ? 'تعطيل القالب' : 'تفعيل القالب';
        btnToggle.innerHTML = `<i class="fa-solid ${item.isActive ? 'fa-ban' : 'fa-check'}"></i>`;
        btnToggle.addEventListener('click', () => handleToggleStatus(item));
        btnGroup.appendChild(btnToggle);
      }

      // Archive
      if (permissions.canDeleteTemplate) {
        const btnArchive = document.createElement('button');
        btnArchive.type = 'button';
        btnArchive.className = 'btn btn-sm btn-outline-danger';
        btnArchive.title = 'أرشفة القالب';
        btnArchive.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
        btnArchive.addEventListener('click', () => handleArchive(item));
        btnGroup.appendChild(btnArchive);
      }

      tdActions.appendChild(btnGroup);
      tr.appendChild(tdActions);

      tableBody.appendChild(tr);
    });
  }

  function renderPagination(page, pages, total) {
    if (paginationInfo) {
      const from = total === 0 ? 0 : (page - 1) * pageLimit + 1;
      const to = Math.min(page * pageLimit, total);
      paginationInfo.textContent = `عرض ${from} إلى ${to} من إجمالي ${total} قالب`;
    }

    if (!paginationList) return;
    paginationList.replaceChildren();

    if (pages <= 1) return;

    // Previous
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${page === 1 ? 'disabled' : ''}`;
    const prevA = document.createElement('a');
    prevA.className = 'page-link';
    prevA.href = '#';
    prevA.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
    prevA.addEventListener('click', (e) => {
      e.preventDefault();
      if (page > 1) loadTemplates(page - 1);
    });
    prevLi.appendChild(prevA);
    paginationList.appendChild(prevLi);

    // Numbered pages
    for (let p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || (p >= page - 2 && p <= page + 2)) {
        const pageLi = document.createElement('li');
        pageLi.className = `page-item ${p === page ? 'active' : ''}`;
        const pageA = document.createElement('a');
        pageA.className = 'page-link';
        pageA.href = '#';
        pageA.textContent = p.toString();
        pageA.addEventListener('click', (e) => {
          e.preventDefault();
          loadTemplates(p);
        });
        pageLi.appendChild(pageA);
        paginationList.appendChild(pageLi);
      } else if (p === page - 3 || p === page + 3) {
        const dotsLi = document.createElement('li');
        dotsLi.className = 'page-item disabled';
        dotsLi.innerHTML = '<span class="page-link">...</span>';
        paginationList.appendChild(dotsLi);
      }
    }

    // Next
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${page === pages ? 'disabled' : ''}`;
    const nextA = document.createElement('a');
    nextA.className = 'page-link';
    nextA.href = '#';
    nextA.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
    nextA.addEventListener('click', (e) => {
      e.preventDefault();
      if (page < pages) loadTemplates(page + 1);
    });
    nextLi.appendChild(nextA);
    paginationList.appendChild(nextLi);
  }

  function handleArchive(item) {
    Swal.fire({
      title: 'أرشفة قالب التصنيع',
      text: `هل أنت متأكد من رغبتك في أرشفة القالب "${item.name}"؟ سيتم الاحتفاظ بكافة بياناته ومراحله تاريخياً.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#EE5253',
      cancelButtonColor: '#6B7280',
      confirmButtonText: 'نعم، أرشفة',
      cancelButtonText: 'إلغاء',
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await window.erpFetch(`/api/studies/templates/${item.id}`, {
            method: 'DELETE',
          });
          const data = await res.json();
          if (res.ok && data.success) {
            Swal.fire({
              icon: 'success',
              title: 'تمت الأرشفة',
              text: 'تمت أرشفة قالب التصنيع بنجاح.',
              timer: 2000,
              showConfirmButton: false,
            });
            loadTemplates(currentPage);
          } else {
            Swal.fire('خطأ', data.message || 'تعذر أرشفة القالب', 'error');
          }
        } catch (err) {
          Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
        }
      }
    });
  }

  function handleToggleStatus(item) {
    const newStatus = !item.isActive;
    Swal.fire({
      title: newStatus ? 'تفعيل القالب' : 'تعطيل القالب',
      text: newStatus
        ? `هل تريد تفعيل القالب "${item.name}" ليصبح متاحاً للإنتاج؟`
        : `هل تريد تعطيل القالب "${item.name}" وإيقاف استخدامه مؤقتاً؟`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: newStatus ? '#10AC84' : '#FF9F43',
      cancelButtonColor: '#6B7280',
      confirmButtonText: newStatus ? 'نعم، تفعيل' : 'نعم، تعطيل',
      cancelButtonText: 'إلغاء',
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const res = await window.erpFetch(`/api/studies/templates/${item.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isActive: newStatus }),
          });
          const data = await res.json();
          if (res.ok && data.success) {
            Swal.fire({
              icon: 'success',
              title: newStatus ? 'تم التفعيل' : 'تم التعطيل',
              timer: 1500,
              showConfirmButton: false,
            });
            loadTemplates(currentPage);
          } else {
            Swal.fire('خطأ', data.message || 'تعذر تعديل حالة القالب', 'error');
          }
        } catch (err) {
          Swal.fire('خطأ', 'تعذر الاتصال بالخادم', 'error');
        }
      }
    });
  }

  if (filterForm) {
    filterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      loadTemplates(1);
    });
  }

  if (resetFilterBtn) {
    resetFilterBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (statusFilter) statusFilter.value = '';
      loadTemplates(1);
    });
  }

  // Initial load
  loadTemplates(1);
});
