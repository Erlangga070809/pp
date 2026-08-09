let currentPeriod = 'week';

document.addEventListener('DOMContentLoaded', async () => {
  if (!App.requireOwner()) return;
  
  await loadSalesReport();
  await loadProductsReport();
  await loadStockReport();
  await loadCashiersReport();
  setupReportListeners();
});

async function loadSalesReport(period = 'week') {
  const container = document.getElementById('salesReportContent');
  if (!container) return;
  
  try {
    App.showSkeleton(container, 'card', 2);
    
    const response = await App.api(`/reports/sales?period=${period}`);
    const data = await response.json();
    
    if (data.success) {
      renderSalesReport(data.data);
    }
  } catch (error) {
    App.showToast('Gagal memuat laporan penjualan', 'error');
  }
}

function renderSalesReport(reportData) {
  const container = document.getElementById('salesReportContent');
  if (!container) return;
  
  container.innerHTML = `
    <div class="stats-grid" style="margin-bottom: 1rem;">
      <div class="stat-card">
        <div class="stat-label">Total Transaksi</div>
        <div class="stat-value">${reportData.summary.total_transactions}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Omzet</div>
        <div class="stat-value">${App.formatCurrency(reportData.summary.total_revenue)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Rata-rata Transaksi</div>
        <div class="stat-value">${App.formatCurrency(reportData.summary.average_transaction)}</div>
      </div>
    </div>
    <div class="chart-container">
      <canvas id="reportChart" class="chart-canvas"></canvas>
    </div>
  `;
  
  renderReportChart(reportData.chart);
}

function renderReportChart(chartData) {
  const canvas = document.getElementById('reportChart');
  if (!canvas) return;
  
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = 300;
  const ctx = canvas.getContext('2d');
  
  if (!chartData || chartData.length === 0) {
    ctx.fillStyle = '#64748B';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Belum ada data', canvas.width / 2, canvas.height / 2);
    return;
  }
  
  const padding = { top: 20, right: 30, bottom: 40, left: 80 };
  const chartWidth = canvas.width - padding.left - padding.right;
  const chartHeight = canvas.height - padding.top - padding.bottom;
  
  const maxSales = Math.max(...chartData.map(d => d.total_sales), 1);
  const barWidth = chartWidth / chartData.length - 10;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartHeight / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(canvas.width - padding.right, y);
    ctx.stroke();
    
    ctx.fillStyle = '#64748B';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'right';
    const value = Math.round(maxSales * (1 - i / 4));
    ctx.fillText(App.formatCurrency(value), padding.left - 10, y + 4);
  }
  
  chartData.forEach((data, index) => {
    const x = padding.left + (chartWidth / chartData.length) * index + 5;
    const barHeight = (data.total_sales / maxSales) * chartHeight;
    const y = padding.top + chartHeight - barHeight;
    
    const gradient = ctx.createLinearGradient(x, y, x, padding.top + chartHeight);
    gradient.addColorStop(0, '#2563EB');
    gradient.addColorStop(1, '#DBEAFE');
    ctx.fillStyle = gradient;
    
    ctx.beginPath();
    ctx.roundRect(x, y, barWidth, barHeight, [4, 4, 0, 0]);
    ctx.fill();
    
    ctx.fillStyle = '#64748B';
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(App.formatDateShort(data.date), x + barWidth / 2, padding.top + chartHeight + 20);
  });
}

async function loadProductsReport(period = 'week') {
  const container = document.getElementById('productsReportContent');
  if (!container) return;
  
  try {
    const response = await App.api(`/reports/products?period=${period}`);
    const data = await response.json();
    
    if (data.success) {
      if (data.data.length === 0) {
        App.showEmptyState(container, 'Belum ada data produk terjual');
        return;
      }
      
      container.innerHTML = `
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Produk</th>
                <th>SKU</th>
                <th>Terjual</th>
                <th>Total Omzet</th>
              </tr>
            </thead>
            <tbody>
              ${data.data.map(p => `
                <tr>
                  <td style="font-weight: 500;">${p.product_name}</td>
                  <td>${p.product_sku}</td>
                  <td>${p.total_quantity}</td>
                  <td style="font-weight: 600;">${App.formatCurrency(p.total_revenue)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  } catch (error) {
    App.showToast('Gagal memuat laporan produk', 'error');
  }
}

async function loadStockReport() {
  const container = document.getElementById('stockReportContent');
  if (!container) return;
  
  try {
    const response = await App.api('/reports/stock');
    const data = await response.json();
    
    if (data.success) {
      if (data.data.length === 0) {
        App.showEmptyState(container, 'Belum ada data stok');
        return;
      }
      
      container.innerHTML = `
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Produk</th>
                <th>SKU</th>
                <th>Stok</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${data.data.map(p => `
                <tr>
                  <td style="font-weight: 500;">${p.name}</td>
                  <td>${p.sku}</td>
                  <td style="font-weight: 600;">${p.stock}</td>
                  <td>
                    ${p.stock_status === 'out_of_stock' ? '<span class="badge badge-danger">Habis</span>' :
                      p.stock_status === 'low_stock' ? '<span class="badge badge-warning">Menipis</span>' :
                      '<span class="badge badge-success">Aman</span>'}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  } catch (error) {
    App.showToast('Gagal memuat laporan stok', 'error');
  }
}

async function loadCashiersReport(period = 'week') {
  const container = document.getElementById('cashiersReportContent');
  if (!container) return;
  
  try {
    const response = await App.api(`/reports/cashiers?period=${period}`);
    const data = await response.json();
    
    if (data.success) {
      if (data.data.length === 0) {
        App.showEmptyState(container, 'Belum ada data performa kasir');
        return;
      }
      
      container.innerHTML = `
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Nama</th>
                <th>Total Transaksi</th>
                <th>Total Omzet</th>
              </tr>
            </thead>
            <tbody>
              ${data.data.map(c => `
                <tr>
                  <td style="font-weight: 500;">${c.name}</td>
                  <td>${c.total_transactions}</td>
                  <td style="font-weight: 600;">${App.formatCurrency(c.total_revenue)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  } catch (error) {
    App.showToast('Gagal memuat laporan kasir', 'error');
  }
}

function setupReportListeners() {
  const periodButtons = document.querySelectorAll('.chart-filter-btn[data-period]');
  periodButtons.forEach(btn => {
    btn.addEventListener('click', async () => {
      periodButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      const period = btn.dataset.period;
      currentPeriod = period;
      
      await Promise.all([
        loadSalesReport(period),
        loadProductsReport(period),
        loadCashiersReport(period)
      ]);
    });
  });
  
  const exportCsv = document.getElementById('exportCsv');
  if (exportCsv) {
    exportCsv.addEventListener('click', async () => {
      try {
        const response = await App.api('/reports/export/csv?type=transactions');
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'transactions.csv';
        a.click();
        window.URL.revokeObjectURL(url);
        App.showToast('Data berhasil diexport', 'success');
      } catch (error) {
        App.showToast('Gagal mengexport data', 'error');
      }
    });
  }
}