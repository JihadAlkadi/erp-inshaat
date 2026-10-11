/**
 * Production Order Show Page Workflow Actions
 *
 * Implements:
 * 1. Approve workflow action (DRAFT -> APPROVED)
 * 2. Reopen workflow action (APPROVED -> DRAFT)
 * 3. Pending toast display from sessionStorage
 * 4. Read-only invariants (no editing line contents)
 * 5. SweetAlert2 native modal confirmation and error feedback
 */
document.addEventListener('DOMContentLoaded', () => {
  const container = document.getElementById('productionOrderShowContainer');
  const orderId = container ? container.dataset.orderId : null;

  // Show pending toast if present
  const pendingToast = sessionStorage.getItem('pendingToast');
  if (pendingToast) {
    sessionStorage.removeItem('pendingToast');
    if (typeof Swal !== 'undefined') {
      Swal.mixin({
        toast: true,
        position: 'top-start',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true,
      }).fire({
        icon: 'success',
        title: pendingToast,
      });
    }
  }

  if (!orderId) return;

  function getErrorMessage(json, fallback) {
    if (typeof window.extractApiErrorMessage === 'function') {
      return window.extractApiErrorMessage(json, fallback);
    }
    return (json && json.message) || fallback || 'حدث خطأ غير متوقع';
  }

  // 1. Approve Order Handler
  const approveBtn = document.getElementById('approveOrderBtn');
  if (approveBtn) {
    approveBtn.addEventListener('click', () => {
      Swal.fire({
        title: 'اعتماد أمر الإنتاج',
        text: 'سيتم اعتماد أمر الإنتاج وإيقاف تعديل بنوده حتى تتم إعادته إلى حالة المسودة. هل تريد المتابعة؟',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#10AC84',
        cancelButtonColor: '#6B7280',
        confirmButtonText: 'نعم، اعتماد',
        cancelButtonText: 'إلغاء',
      }).then(async (result) => {
        if (!result.isConfirmed) return;

        approveBtn.disabled = true;
        const originalContent = approveBtn.innerHTML;
        approveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> جاري الاعتماد...';

        try {
          const res = await window.erpFetch(`/api/production/orders/${orderId}/approve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const json = await res.json();

          if (!res.ok || !json.success) {
            throw new Error(getErrorMessage(json, 'فشل اعتماد أمر الإنتاج'));
          }

          sessionStorage.setItem('pendingToast', 'تم اعتماد أمر الإنتاج بنجاح');
          window.location.reload();
        } catch (err) {
          approveBtn.disabled = false;
          approveBtn.innerHTML = originalContent;

          Swal.fire({
            icon: 'error',
            title: 'تعذر اعتماد أمر الإنتاج',
            text: err.message || 'حدث خطأ أثناء اعتماد أمر الإنتاج',
            confirmButtonText: 'حسناً',
            confirmButtonColor: '#0984E3',
          });
        }
      });
    });
  }

  // 2. Reopen Order Handler
  const reopenBtn = document.getElementById('reopenOrderBtn');
  if (reopenBtn) {
    reopenBtn.addEventListener('click', () => {
      Swal.fire({
        title: 'إعادة أمر الإنتاج إلى المسودة',
        text: 'سيصبح الطلب قابلاً للتعديل مرة أخرى، وسيتطلب إعادة الاعتماد بعد الانتهاء من التعديلات.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#F39C12',
        cancelButtonColor: '#6B7280',
        confirmButtonText: 'نعم، إعادة إلى مسودة',
        cancelButtonText: 'إلغاء',
      }).then(async (result) => {
        if (!result.isConfirmed) return;

        reopenBtn.disabled = true;
        const originalContent = reopenBtn.innerHTML;
        reopenBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> جاري الإعادة...';

        try {
          const res = await window.erpFetch(`/api/production/orders/${orderId}/reopen`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });
          const json = await res.json();

          if (!res.ok || !json.success) {
            throw new Error(getErrorMessage(json, 'فشل إعادة أمر الإنتاج إلى المسودة'));
          }

          sessionStorage.setItem('pendingToast', 'تمت إعادة أمر الإنتاج إلى المسودة بنجاح');
          window.location.reload();
        } catch (err) {
          reopenBtn.disabled = false;
          reopenBtn.innerHTML = originalContent;

          Swal.fire({
            icon: 'error',
            title: 'تعذر إعادة فتح أمر الإنتاج',
            text: err.message || 'حدث خطأ أثناء إعادة فتح أمر الإنتاج',
            confirmButtonText: 'حسناً',
            confirmButtonColor: '#0984E3',
          });
        }
      });
    });
  }

  // 3. Priority Update Handler (Admin mutation, independent of DRAFT/APPROVED lifecycle)
  const updatePriorityBtn = document.getElementById('updatePriorityBtn');
  const prioritySelect = document.getElementById('changePrioritySelect');
  if (updatePriorityBtn && prioritySelect) {
    updatePriorityBtn.addEventListener('click', async () => {
      const selectedPriority = prioritySelect.value;
      const currentPriority = prioritySelect.dataset.currentPriority;
      if (selectedPriority === currentPriority) {
        return;
      }

      updatePriorityBtn.disabled = true;
      const originalHtml = updatePriorityBtn.innerHTML;
      updatePriorityBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> جاري الحفظ...';

      try {
        const res = await window.erpFetch(`/api/production/orders/${orderId}/priority`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ priority: selectedPriority }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(getErrorMessage(json, 'فشل تحديث أولوية أمر الإنتاج'));
        }

        sessionStorage.setItem('pendingToast', 'تم تحديث أولوية أمر الإنتاج بنجاح');
        window.location.reload();
      } catch (err) {
        updatePriorityBtn.disabled = false;
        updatePriorityBtn.innerHTML = originalHtml;
        Swal.fire({
          icon: 'error',
          title: 'تعذر تحديث أولوية أمر الإنتاج',
          text: err.message || 'حدث خطأ أثناء تحديث الأولوية',
          confirmButtonText: 'حسناً',
          confirmButtonColor: '#0984E3',
        });
      }
    });
  }
});
