document.addEventListener('DOMContentLoaded', async () => {
  const isAuthenticated = await App.loadUser();
  
  if (!isAuthenticated) {
    window.location.href = '/login.html';
    return;
  }
  
  if (App.user.role === 'cashier') {
    window.location.href = '/kasir.html';
    return;
  }
  
  await loadDashboard();
  setupChartFilters();
});

async function loadDashboard() {
  const container = document.getElementById('dashboardContent');
  
  try {
    App.showSkeleton(container, 'card', 6);
    
    const response = await App.api('/reports/dashboard');
    if (!response) {
      throw new Error('Failed to load dashboard');
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.message);
    }
    
    renderDashboard(data.data);
  } catch (error) {
    container.innerHTML = '';
    App.showToast(error.message || 'Gagal memuat dashboard', 'error');
  }
}

function renderDashboard(dashboardData) {
  const container = document.getElementById('dashboardContent');
  container.innerHTML = '';
  
  const statsHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Omzet Hari Ini</div>
        <div class="stat-value">${App.formatCurrency(dashboardData.today.total_revenue)}</div>
        <div class="stat-change">${dashboardData.today.total_transactions} transaksi</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Omzet Minggu Ini</div>
        <div class="stat-value">${App.formatCurrency(dashboardData.week.total_revenue)}</div>
        <div class="stat-change">${dashboardData.week.total_transactions} transaksi</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Omzet Bulan Ini</div>
        <div class="stat-value">${App.formatCurrency(dashboardData.month.total_revenue)}</div>
        <div class="stat-change">${dashboardData.month.total_transactions} transaksi</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Produk</div>
        <div class="stat-value">${dashboardData.products.total_products}</div>
        <div class="stat-change">Total stok: ${dashboardData.products.total_stock}</div>
      </div>
    </div>
  `;
  
  container.innerHTML += statsHTML;
  
  if (dashboardData.low_stock > 0) {
    const warningHTML = `
      <div class="card" style="margin-bottom: 1.5rem; background-color: var(--warning-light); border-color: var(--warning);">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
          <span style="font-weight: 600; color: #92400E;">${dashboardData.low_stock} produk memiliki stok menipis</span>
        </div>
      </div>
    `;
    container.innerHTML += warningHTML;
  }
  
  const chartHTML = `
    <div class="chart-container">
      <div class="chart-header">
        <h3 class="chart-title">Grafik Penjualan</h3>
        <div class="chart-filters" id="chartFilters">
          <button class="chart-filter-btn active" data-period="today">Hari Ini</button>
          <button class="chart-filter-btn" data-period="week">7 Hari</button>
          <button class="chart-filter-btn" data-period="month">30 Hari</button>
          <button class="chart-filter-btn" data-period="90days">90 Hari</button>
        </div>
      </div>
      <canvas id="salesChart" class="chart-canvas"></canvas>
    </div>
  `;
  
  container.innerHTML += chartHTML;
  
  renderChart(dashboardData.chart);
  
  const twoColumns = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 1.5rem;">
      <div class="card">
        <h3 style="margin-bottom: 1rem; font-size: 1.125rem; font-weight: 600;">Transaksi Terbaru</h3>
        ${renderRecentTransactions(dashboardData.recent_transactions)}
      </div>
      <div class="card">
        <h3 style="margin-bottom: 1rem; font-size: 1.125rem; font-weight: 600;">Aktivitas Terbaru</h3>
        ${renderRecentActivities(dashboardData.recent_activities)}
      </div>
    </div>
  `;
  
  container.innerHTML += twoColumns;
}

function renderRecentTransactions(transactions) {
  if (!transactions || transactions.length === 0) {
    return '<div class="empty-state"><p>Belum ada transaksi</p></div>';
  }
  
  return `
    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
      ${transactions.map(t => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-light);">
          <div>
            <div style="font-weight: 500; font-size: 0.875rem;">${t.transaction_number}</div>
            <div style="font-size: 0.75rem; color: var(--muted);">${App.formatDateShort(t.created_at)} - ${t.cashier_name}</div>
          </div>
          <div style="font-weight: 600; font-size: 0.875rem;">${App.formatCurrency(t.total)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderRecentActivities(activities) {
  if (!activities || activities.length === 0) {
    return '<div class="empty-state"><p>Belum ada aktivitas</p></div>';
  }
  
  return `
    <div style="display: flex; flex-direction: column; gap: 0.75rem;">
      ${activities.map(a => `
        <div style="display: flex; gap: 0.75rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--border-light);">
          <div style="width: 2rem; height: 2rem; background-color: var(--primary-light); border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
            </svg>
          </div>
          <div style="flex: 1;">
            <div style="font-size: 0.8125rem; font-weight: 500;">${a.user_name}</div>
            <div style="font-size: 0.75rem; color: var(--muted);">${a.action.replace(/_/g, ' ')}</div>
          </div>
          <div style="font-size: 0.75rem; color: var(--muted);">${App.formatDateShort(a.created_at)}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderChart(chartData) {
  const canvas = document.getElementById('salesChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = 300;
  
  if (!chartData || chartData.length === 0) {
    ctx.fillStyle = '#64748B';
    ctx.font = '14px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Belum ada data penjualan', canvas.width / 2, canvas.height / 2);
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

async function setupChartFilters() {
  const filters = document.getElementById('chartFilters');
  if (!filters) return;
  
  filters.addEventListener('click', async (e) => {
    if (e.target.classList.contains('chart-filter-btn')) {
      filters.querySelectorAll('.chart-filter-btn').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      
      const period = e.target.dataset.period;
      await updateChart(period);
    }
  });
}

async function updateChart(period) {
  try {
    const response = await App.api(`/reports/sales?period=${period}`);
    if (!response) return;
    
    const data = await response.json();
    
    if (data.success) {
      renderChart(data.data.chart);
    }
  } catch (error) {
    console.error('Failed to update chart:', error);
  }
}