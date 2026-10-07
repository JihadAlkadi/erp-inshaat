/**
 * Production Order Details (Read-Only) Client Script
 *
 * Invariant: This script NEVER performs any mutating HTTP requests (POST, PATCH, DELETE).
 * All draft order edits take place exclusively in /production/orders/:id/edit.
 */
document.addEventListener('DOMContentLoaded', () => {
  const dataEl = document.getElementById('initialOrderData');
  if (!dataEl) return;

  try {
    const orderData = JSON.parse(dataEl.textContent || '{}');
    // Ensure display elements are consistently formatted
    if (orderData && orderData.orderNumber) {
      const headerOrderNumber = document.getElementById('headerOrderNumber');
      if (headerOrderNumber) {
        headerOrderNumber.textContent = orderData.orderNumber;
      }
    }
  } catch (err) {
    console.error('Failed to parse initial order data:', err);
  }
});
