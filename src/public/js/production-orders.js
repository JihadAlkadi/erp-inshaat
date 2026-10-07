/**
 * Production Orders List Client JS
 */
document.addEventListener('DOMContentLoaded', () => {
  let currentPage = 1;
  const limit = 15;
  let currentSearch = '';
  let searchTimeout = null;
  let pendingArchiveOrderId = null;

  const tableBody = document.getElementById('ordersTableBody');
  const emptyState = document.getElementById('emptyOrdersState');
  const paginationList = document.getElementById('ordersPaginationList');
  const paginationInfo = document.getElementById('ordersPaginationInfo');
  const searchInput = document.getElementById('orderSearchInput');
  const refreshBtn = document.getElementById('refreshOrdersBtn');

  const kpiTotalOrders = document.getElementById('kpiTotalOrders');
  const kpiDraftOrders = document.getElementById('kpiDraftOrders');
  const kpiTotalQuantity = document.getElementById('kpiTotalQuantity');

  const archiveModal = new bootstrap.Modal(document.getElementById('archiveOrderModal'));
  const archiveModalOrderNumber = document.getElementById('archiveModalOrderNumber');
  const confirmArchiveBtn = document.getElementById('confirmArchiveOrderBtn');

  // Initial load
  loadOrders();

  // Search input with debounce
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentSearch = e.target.value.trim();
        currentPage = 1;
        loadOrders();
      }, 350);
    });
  }

  // Refresh button
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadOrders();
    });
  }

  // Confirm archive handler
  if (confirmArchiveBtn) {
    confirmArchiveBtn.addEventListener('click', async () => {
      if (!pendingArchiveOrderId) return;

      confirmArchiveBtn.disabled = true;
      confirmArchiveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> جاري الأرشفة...';

      try {
        const response = await window.erpFetch(`/api/production/orders/${pendingArchiveOrderId}`, {
          method: 'DELETE',
        });
        const resJson = await response.json();
        if (!response.ok || !resJson.success) {
          throw new Error(resJson.message || 'فشل أرشفة الطلب');
        }

        archiveModal.hide();
        loadOrders();
      } catch (err) {
        alert(err.message || 'حدث خطأ أثناء أرشفة الطلب');
      } finally {
        confirmArchiveBtn.disabled = false;
        confirmArchiveBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> <span>تأكيد الأرشفة</span>';
        pendingArchiveOrderId = null;
      }
    });
  }

  async function loadOrders() {
    setLoadingState();

    try {
      const url = new URL('/api/production/orders', window.location.origin);
      url.searchParams.set('page', currentPage.toString());
      url.searchParams.set('limit', limit.toString());
      if (currentSearch) {
        url.searchParams.set('search', currentSearch);
      }

      const res = await window.erpFetch(url.toString());
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'فشل جلب أوامر الإنتاج');
      }

      renderOrdersTable(data.data);
    } catch (err) {
      renderErrorState(err.message || 'تعذر تحميل أوامر الإنتاج');
    }
  }

  function setLoadingState() {
    tableBody.innerHTML = '';
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.className = 'text-center py-5 text-muted';

    const spinner = document.createElement('div');
    spinner.className = 'spinner-border text-primary spinner-border-sm me-2';
    spinner.setAttribute('role', 'status');

    td.appendChild(spinner);
    td.appendChild(document.createTextNode(' جاري تحميل أوامر الإنتاج...'));
    tr.appendChild(td);
    tableBody.appendChild(tr);
    emptyState.classList.add('d-none');
  }

  function renderErrorState(message) {
    tableBody.innerHTML = '';
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.className = 'text-center py-4 text-danger';

    const icon = document.createElement('i');
    icon.className = 'fa-solid fa-circle-exclamation me-2';
    td.appendChild(icon);
    td.appendChild(document.createTextNode(message));

    tr.appendChild(td);
    tableBody.appendChild(tr);
  }

  function renderOrdersTable(result) {
    const { items, total, page, totalPages } = result;

    tableBody.innerHTML = '';

    // Update KPI metrics
    let totalQty = 0;
    items.forEach((item) => {
      totalQty += item.summary.totalQuantity;
    });

    if (kpiTotalOrders) kpiTotalOrders.textContent = total.toString();
    if (kpiDraftOrders) kpiDraftOrders.textContent = total.toString();
    if (kpiTotalQuantity) kpiTotalQuantity.textContent = totalQty.toString();

    if (items.length === 0) {
      emptyState.classList.remove('d-none');
      paginationInfo.textContent = 'عرض 0 من إجمالي 0 أمر';
      paginationList.innerHTML = '';
      return;
    }

    emptyState.classList.add('d-none');

    items.forEach((order) => {
      const tr = document.createElement('tr');

      // 1. Order Number
      const tdNumber = document.createElement('td');
      tdNumber.className = 'py-3 px-3';
      const orderLink = document.createElement('a');
      orderLink.href = `/production/orders/${order.id}`;
      orderLink.className = 'fw-bold text-primary font-monospace text-decoration-none';
      orderLink.textContent = order.orderNumber;
      tdNumber.appendChild(orderLink);
      tr.appendChild(tdNumber);

      // 2. Status Badge
      const tdStatus = document.createElement('td');
      tdStatus.className = 'py-3 px-3';
      const badge = document.createElement('span');
      badge.className = 'badge bg-warning-subtle text-warning border border-warning-subtle px-2 py-1';
      badge.style.fontSize = '0.75rem';
      badge.textContent = 'مسودة DRAFT';
      tdStatus.appendChild(badge);
      tr.appendChild(tdStatus);

      // 3. Description
      const tdDesc = document.createElement('td');
      tdDesc.className = 'py-3 px-3 text-muted small';
      tdDesc.style.maxWidth = '250px';
      tdDesc.textContent = order.description || '—';
      tr.appendChild(tdDesc);

      // 4. Line Count
      const tdLines = document.createElement('td');
      tdLines.className = 'py-3 px-3 text-center fw-bold text-dark';
      tdLines.textContent = order.summary.lineCount.toString();
      tr.appendChild(tdLines);

      // 5. Total Quantity
      const tdQty = document.createElement('td');
      tdQty.className = 'py-3 px-3 text-center fw-bold text-primary';
      tdQty.textContent = order.summary.totalQuantity.toString();
      tr.appendChild(tdQty);

      // 6. Created By
      const tdUser = document.createElement('td');
      tdUser.className = 'py-3 px-3 small text-secondary';
      tdUser.textContent = order.createdByUser ? order.createdByUser.fullName : '—';
      tr.appendChild(tdUser);

      // 7. Created At
      const tdDate = document.createElement('td');
      tdDate.className = 'py-3 px-3 small text-muted';
      tdDate.textContent = new Date(order.createdAt).toLocaleDateString('ar-EG');
      tr.appendChild(tdDate);

      // 8. Actions
      const tdActions = document.createElement('td');
      tdActions.className = 'py-3 px-3 text-end text-nowrap';

      // View Button -> /production/orders/:id (Read-Only)
      const viewBtn = document.createElement('a');
      viewBtn.href = `/production/orders/${order.id}`;
      viewBtn.className = 'btn btn-sm btn-outline-secondary me-1';
      viewBtn.setAttribute('title', 'عرض تفاصيل الطلب');
      const viewIcon = document.createElement('i');
      viewIcon.className = 'fa-solid fa-eye me-1';
      viewBtn.appendChild(viewIcon);
      const viewText = document.createElement('span');
      viewText.textContent = 'عرض';
      viewBtn.appendChild(viewText);
      tdActions.appendChild(viewBtn);

      // Edit Button -> /production/orders/:id/edit (Draft Editor)
      if (window.canUpdateOrder && order.status === 'DRAFT') {
        const editBtn = document.createElement('a');
        editBtn.href = `/production/orders/${order.id}/edit`;
        editBtn.className = 'btn btn-sm btn-outline-primary me-1';
        editBtn.setAttribute('title', 'تعديل وإعداد الطلب');
        const editIcon = document.createElement('i');
        editIcon.className = 'fa-solid fa-pen-to-square me-1';
        editBtn.appendChild(editIcon);
        const editText = document.createElement('span');
        editText.textContent = 'تعديل';
        editBtn.appendChild(editText);
        tdActions.appendChild(editBtn);
      }

      // Archive Button (if permitted)
      if (window.canDeleteOrder && order.status === 'DRAFT') {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn btn-sm btn-outline-danger';
        delBtn.setAttribute('title', 'أرشفة الطلب');
        const delIcon = document.createElement('i');
        delIcon.className = 'fa-solid fa-trash-can';
        delBtn.appendChild(delIcon);

        delBtn.addEventListener('click', () => {
          pendingArchiveOrderId = order.id;
          archiveModalOrderNumber.textContent = order.orderNumber;
          archiveModal.show();
        });

        tdActions.appendChild(delBtn);
      }
      tr.appendChild(tdActions);

      tableBody.appendChild(tr);
    });

    renderPagination(total, page, totalPages);
  }

  function renderPagination(total, page, totalPages) {
    paginationInfo.textContent = `عرض صفحة ${page} من إجمالي ${totalPages} (إجمالي الأوامر: ${total})`;
    paginationList.innerHTML = '';

    if (totalPages <= 1) return;

    // Prev Button
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${page <= 1 ? 'disabled' : ''}`;
    const prevLink = document.createElement('button');
    prevLink.className = 'page-link';
    prevLink.textContent = 'السابق';
    prevLink.addEventListener('click', () => {
      if (currentPage > 1) {
        currentPage--;
        loadOrders();
      }
    });
    prevLi.appendChild(prevLink);
    paginationList.appendChild(prevLi);

    // Page Numbers
    for (let p = 1; p <= totalPages; p++) {
      const pageLi = document.createElement('li');
      pageLi.className = `page-item ${p === page ? 'active' : ''}`;
      const pageLink = document.createElement('button');
      pageLink.className = 'page-link';
      pageLink.textContent = p.toString();
      pageLink.addEventListener('click', () => {
        if (currentPage !== p) {
          currentPage = p;
          loadOrders();
        }
      });
      pageLi.appendChild(pageLink);
      paginationList.appendChild(pageLi);
    }

    // Next Button
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${page >= totalPages ? 'disabled' : ''}`;
    const nextLink = document.createElement('button');
    nextLink.className = 'page-link';
    nextLink.textContent = 'التالي';
    nextLink.addEventListener('click', () => {
      if (currentPage < totalPages) {
        currentPage++;
        loadOrders();
      }
    });
    nextLi.appendChild(nextLink);
    paginationList.appendChild(nextLi);
  }
});
