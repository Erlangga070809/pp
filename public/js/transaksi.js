let currentPage = 1;
let totalPages = 1;

document.addEventListener('DOMContentLoaded', async () => {
  if (!App.requireAuth()) return;
  
  await loadTransactions();
  setupTransactionListeners();
});

async function loadTransactions(page = 1) {
  const container = document.getElementById('transactionsTableBody');
  if (!container) return;
  
  try {
    App.showSkeleton(container, 'text', 5);
    
    const search = document.getElementById('searchTransaction')?.value || '';
    const startDate = document.getElementById('startDate')?.value || '';
    const endDate = document.getElementById('endDate')?.value || '';
    const cashierId = document.getElementById('filterCashier')?.value || '';
    const paymentMethod = document.getElementById('filterPayment')?.value || '';
    
    const params = new URLSearchParams({
      search,
      start_date: startDate,
      end_date: endDate,
      cashier_id: cashierId,
      payment_method: paymentMethod,
      page,
      limit: 20
    });
    
    const response = await App.api(`/transactions?${params}`);
    const data = await response.json();
    
    if (data.success) {
      currentPage = data.data.page;
      totalPages = data.data.totalPages;
      renderTransactions(data.data.transactions);
      renderTransactionPagination();
    }
  } catch (error) {
    App.showToast('Gagal memuat transaksi', 'error');
  }
}

function renderTransactions(transactions) {
  const container = document.getElementById('transactionsTableBody');
  if (!container) return;
  
  if (transactions.length === 0) {
    App.showEmptyState(container.parentElement, 'Belum ada transaksi');
    return;
  }
  
  container.innerHTML = transactions.map(t => `
    <tr>
      <td>
        <div style="font-weight: 500;">${t.transaction_number}</div>
        <div style="font-size: 0.75rem; color: var(--muted);">${App.formatDate(t.created_at)}</div>
      </td>
      <td>${t.cashier_name}</td>
      <td>${App.formatCurrency(t.total)}</td>
      <td>
        <span class="badge badge-primary">${t.payment_method.toUpperCase()}</span>
      </td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="viewTransaction('${t.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
          Detail
        </button>
      </td>
    </tr>
  `).join('');
}

function renderTransactionPagination() {
  const container = document.getElementById('transactionPagination');
  if (!container) return;
  
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-outline'}" onclick="loadTransactions(${i})">${i}</button>`;
  }
  
  container.innerHTML = html;
}

function setupTransactionListeners() {
  const searchInput = document.getElementById('searchTransaction');
  const filterCashier = document.getElementById('filterCashier');
  const filterPayment = document.getElementById('filterPayment');
  const applyFilter = document.getElementById('applyFilter');
  
  if (searchInput) {
    searchInput.addEventListener('input', () => loadTransactions(1));
  }
  
  if (applyFilter) {
    applyFilter.addEventListener('click', () => loadTransactions(1));
  }
}

async function viewTransaction(transactionId) {
  try {
    const response = await App.api(`/transactions/${transactionId}`);
    const data = await response.json();
    
    if (data.success) {
      const transaction = data.data;
      
      const itemsHTML = transaction.items.map(item => `
        <div style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border-light);">
          <div>
            <div style="font-weight: 500;">${item.product_name}</div>
            <div style="font-size: 0.75rem; color: var(--muted);">${item.quantity} x ${App.formatCurrency(item.price_per_unit)}</div>
          </div>
          <div style="font-weight: 600;">${App.formatCurrency(item.subtotal)}</div>
        </div>
      `).join('');
      
      const content = `
        <div style="margin-bottom: 1rem;">
          <div style="font-size: 0.875rem; color: var(--muted); margin-bottom: 0.25rem;">No. Transaksi</div>
          <div style="font-weight: 600;">${transaction.transaction_number}</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
          <div>
            <div style="font-size: 0.875rem; color: var(--muted); margin-bottom: 0.25rem;">Tanggal</div>
            <div>${App.formatDate(transaction.created_at)}</div>
          </div>
          <div>
            <div style="font-size: 0.875rem; color: var(--muted); margin-bottom: 0.25rem;">Kasir</div>
            <div>${transaction.cashier_name}</div>
          </div>
        </div>
        <div style="background-color: var(--border-light); border-radius: var(--radius); padding: 1rem; margin-bottom: 1rem;">
          ${itemsHTML}
        </div>
        <div style="background-color: var(--border-light); border-radius: var(--radius); padding: 1rem;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <span style="color: var(--muted);">Subtotal</span>
            <span style="font-weight: 600;">${App.formatCurrency(transaction.subtotal)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <span style="color: var(--muted);">Total</span>
            <span style="font-weight: 600;">${App.formatCurrency(transaction.total)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
            <span style="color: var(--muted);">Pembayaran (${transaction.payment_method.toUpperCase()})</span>
            <span style="font-weight: 600;">${App.formatCurrency(transaction.payment_amount)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; padding-top: 0.5rem; border-top: 1px solid var(--border);">
            <span style="color: var(--muted);">Kembalian</span>
            <span style="font-weight: 600; color: var(--success);">${App.formatCurrency(transaction.change_amount)}</span>
          </div>
        </div>
      `;
      
      App.showModal('Detail Transaksi', content);
    }
  } catch (error) {
    App.showToast('Gagal memuat detail transaksi', 'error');
  }
}