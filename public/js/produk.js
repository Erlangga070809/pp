let currentPage = 1;
let totalPages = 1;

document.addEventListener('DOMContentLoaded', async () => {
  if (!App.requireOwner()) return;
  
  await loadCategories();
  await loadProducts();
  setupProductListeners();
});

async function loadCategories() {
  try {
    const response = await App.api('/products/categories');
    const data = await response.json();
    
    if (data.success) {
      const categoryFilter = document.getElementById('filterCategory');
      if (categoryFilter) {
        categoryFilter.innerHTML = '<option value="">Semua Kategori</option>' +
          data.data.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      }
      
      const productCategory = document.getElementById('productCategory');
      if (productCategory) {
        productCategory.innerHTML = '<option value="">Pilih Kategori</option>' +
          data.data.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
      }
    }
  } catch (error) {
    console.error('Failed to load categories:', error);
  }
}

async function loadProducts(page = 1) {
  const container = document.getElementById('productsTableBody');
  if (!container) return;
  
  try {
    App.showSkeleton(container, 'text', 5);
    
    const search = document.getElementById('searchProduct')?.value || '';
    const category = document.getElementById('filterCategory')?.value || '';
    const status = document.getElementById('filterStatus')?.value || '';
    const sort = document.getElementById('sortBy')?.value || 'created_at';
    const order = document.getElementById('sortOrder')?.value || 'desc';
    
    const params = new URLSearchParams({
      search,
      category,
      status,
      sort,
      order,
      page,
      limit: 20
    });
    
    const response = await App.api(`/products?${params}`);
    const data = await response.json();
    
    if (data.success) {
      currentPage = data.data.page;
      totalPages = data.data.totalPages;
      renderProducts(data.data.products);
      renderPagination();
    }
  } catch (error) {
    App.showToast('Gagal memuat produk', 'error');
  }
}

function renderProducts(products) {
  const container = document.getElementById('productsTableBody');
  if (!container) return;
  
  if (products.length === 0) {
    App.showEmptyState(container.parentElement, 'Belum ada produk', 'Tambahkan produk pertama Anda');
    return;
  }
  
  container.innerHTML = products.map(p => `
    <tr>
      <td>
        <div style="font-weight: 500;">${p.name}</div>
        <div style="font-size: 0.75rem; color: var(--muted);">${p.sku}</div>
      </td>
      <td>${p.category_name || '-'}</td>
      <td>${App.formatCurrency(p.selling_price)}</td>
      <td>${App.formatCurrency(p.cost_price || 0)}</td>
      <td>
        <span style="font-weight: 600;">${p.stock}</span>
        ${p.stock <= p.min_stock && p.min_stock > 0 ? '<span class="badge badge-warning" style="margin-left: 0.5rem;">Menipis</span>' : ''}
      </td>
      <td>
        ${p.is_active 
          ? '<span class="badge badge-success">Aktif</span>' 
          : '<span class="badge badge-danger">Nonaktif</span>'}
      </td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="editProduct('${p.id}')">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
        <button class="btn btn-sm btn-outline" onclick="toggleProductStatus('${p.id}', ${p.is_active})" style="color: ${p.is_active ? 'var(--danger)' : 'var(--success)'}">
          ${p.is_active ? 'Nonaktifkan' : 'Aktifkan'}
        </button>
      </td>
    </tr>
  `).join('');
}

function renderPagination() {
  const container = document.getElementById('pagination');
  if (!container) return;
  
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  let html = '';
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-outline'}" onclick="loadProducts(${i})">${i}</button>`;
  }
  
  container.innerHTML = html;
}

function setupProductListeners() {
  const searchInput = document.getElementById('searchProduct');
  const filterCategory = document.getElementById('filterCategory');
  const filterStatus = document.getElementById('filterStatus');
  const sortBy = document.getElementById('sortBy');
  const sortOrder = document.getElementById('sortOrder');
  
  [searchInput, filterCategory, filterStatus, sortBy, sortOrder].forEach(el => {
    if (el) {
      el.addEventListener('change', () => loadProducts(1));
      if (el.tagName === 'INPUT') {
        el.addEventListener('input', () => loadProducts(1));
      }
    }
  });
  
  const addBtn = document.getElementById('addProductBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => showProductForm());
  }
}

function showProductForm(product = null) {
  const isEdit = !!product;
  const title = isEdit ? 'Edit Produk' : 'Tambah Produk';
  
  const categorySelect = document.getElementById('productCategory');
  const categoryOptions = categorySelect ? categorySelect.innerHTML : '';
  
  const content = `
    <div class="form-group">
      <label class="label">SKU</label>
      <input type="text" id="productSku" class="input" value="${product?.sku || ''}" required>
    </div>
    <div class="form-group">
      <label class="label">Nama Produk</label>
      <input type="text" id="productName" class="input" value="${product?.name || ''}" required>
    </div>
    <div class="form-group">
      <label class="label">Kategori</label>
      <select id="productCategorySelect" class="select">
        ${categoryOptions}
      </select>
    </div>
    <div class="form-group">
      <label class="label">Harga Beli</label>
      <input type="number" id="productCostPrice" class="input" value="${product?.cost_price || 0}" min="0">
    </div>
    <div class="form-group">
      <label class="label">Harga Jual</label>
      <input type="number" id="productSellingPrice" class="input" value="${product?.selling_price || ''}" min="0" required>
    </div>
    <div class="form-group">
      <label class="label">Stok</label>
      <input type="number" id="productStock" class="input" value="${product?.stock || 0}" min="0">
    </div>
    <div class="form-group">
      <label class="label">Stok Minimum</label>
      <input type="number" id="productMinStock" class="input" value="${product?.min_stock || 0}" min="0">
    </div>
  `;
  
  const footer = `
    <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Batal</button>
    <button class="btn btn-primary" id="saveProductBtn">${isEdit ? 'Simpan' : 'Tambah'}</button>
  `;
  
  const modal = App.showModal(title, content, footer);
  
  if (product) {
    const categorySelect = modal.querySelector('#productCategorySelect');
    if (categorySelect && product.category_id) {
      categorySelect.value = product.category_id;
    }
  }
  
  modal.querySelector('#saveProductBtn').addEventListener('click', async () => {
    await saveProduct(product?.id);
  });
}

async function saveProduct(productId = null) {
  const sku = document.getElementById('productSku').value;
  const name = document.getElementById('productName').value;
  const category_id = document.getElementById('productCategorySelect').value || null;
  const cost_price = parseInt(document.getElementById('productCostPrice').value) || 0;
  const selling_price = parseInt(document.getElementById('productSellingPrice').value);
  const stock = parseInt(document.getElementById('productStock').value) || 0;
  const min_stock = parseInt(document.getElementById('productMinStock').value) || 0;
  
  if (!sku || !name || isNaN(selling_price)) {
    App.showToast('SKU, nama, dan harga jual harus diisi', 'error');
    return;
  }
  
  if (selling_price < 0) {
    App.showToast('Harga jual tidak valid', 'error');
    return;
  }
  
  const body = { sku, name, category_id, cost_price, selling_price, stock, min_stock };
  
  try {
    const endpoint = productId ? `/products/${productId}` : '/products';
    const method = productId ? 'PUT' : 'POST';
    
    const response = await App.api(endpoint, {
      method,
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    
    if (data.success) {
      App.showToast(productId ? 'Produk berhasil diperbarui' : 'Produk berhasil ditambahkan', 'success');
      document.querySelector('.modal-overlay')?.remove();
      await loadProducts(currentPage);
    } else {
      App.showToast(data.message || 'Gagal menyimpan produk', 'error');
    }
  } catch (error) {
    App.showToast('Terjadi kesalahan', 'error');
  }
}

async function editProduct(productId) {
  try {
    const response = await App.api(`/products/${productId}`);
    const data = await response.json();
    
    if (data.success) {
      showProductForm(data.data);
    }
  } catch (error) {
    App.showToast('Gagal memuat produk', 'error');
  }
}

async function toggleProductStatus(productId, currentStatus) {
  const confirmed = confirm(`Apakah Anda yakin ingin ${currentStatus ? 'menonaktifkan' : 'mengaktifkan'} produk ini?`);
  if (!confirmed) return;
  
  try {
    const response = await App.api(`/products/${productId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !currentStatus })
    });
    
    const data = await response.json();
    
    if (data.success) {
      App.showToast(`Produk berhasil ${!currentStatus ? 'diaktifkan' : 'dinonaktifkan'}`, 'success');
      await loadProducts(currentPage);
    } else {
      App.showToast(data.message || 'Gagal mengubah status', 'error');
    }
  } catch (error) {
    App.showToast('Terjadi kesalahan', 'error');
  }
}