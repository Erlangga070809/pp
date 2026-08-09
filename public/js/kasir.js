let cart = [];
let products = [];
let selectedCategory = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!App.requireAuth()) return;
  
  await loadCategories();
  await loadProducts();
  setupCartListeners();
  setupPaymentListeners();
});

async function loadCategories() {
  try {
    const response = await App.api('/products/categories');
    const data = await response.json();
    
    if (data.success) {
      renderCategories(data.data);
    }
  } catch (error) {
    console.error('Failed to load categories:', error);
  }
}

function renderCategories(categories) {
  const container = document.getElementById('categoryList');
  if (!container) return;
  
  container.innerHTML = `
    <button class="pos-category-btn active" data-category="">Semua</button>
    ${categories.map(c => `
      <button class="pos-category-btn" data-category="${c.id}">${c.name}</button>
    `).join('')}
  `;
  
  container.addEventListener('click', (e) => {
    if (e.target.classList.contains('pos-category-btn')) {
      container.querySelectorAll('.pos-category-btn').forEach(btn => btn.classList.remove('active'));
      e.target.classList.add('active');
      selectedCategory = e.target.dataset.category || null;
      renderProducts();
    }
  });
}

async function loadProducts() {
  const container = document.getElementById('productGrid');
  if (!container) return;
  
  try {
    App.showSkeleton(container, 'card', 8);
    
    const response = await App.api('/products?status=active&limit=100');
    const data = await response.json();
    
    if (data.success) {
      products = data.data.products;
      renderProducts();
    }
  } catch (error) {
    App.showToast('Gagal memuat produk', 'error');
  }
}

function renderProducts() {
  const container = document.getElementById('productGrid');
  if (!container) return;
  
  let filteredProducts = products;
  if (selectedCategory) {
    filteredProducts = products.filter(p => p.category_id === selectedCategory);
  }
  
  const searchInput = document.getElementById('productSearch');
  if (searchInput && searchInput.value) {
    const query = searchInput.value.toLowerCase();
    filteredProducts = filteredProducts.filter(p => 
      p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query)
    );
  }
  
  if (filteredProducts.length === 0) {
    App.showEmptyState(container, 'Produk tidak ditemukan');
    return;
  }
  
  container.innerHTML = filteredProducts.map(p => `
    <div class="pos-product-card" onclick="addToCart('${p.id}')">
      <h4>${p.name}</h4>
      <div class="price">${App.formatCurrency(p.selling_price)}</div>
      <div class="stock">Stok: ${p.stock}</div>
    </div>
  `).join('');
}

const searchInput = document.getElementById('productSearch');
if (searchInput) {
  searchInput.addEventListener('input', renderProducts);
}

function addToCart(productId) {
  const product = products.find(p => p.id === productId);
  if (!product) return;
  
  if (product.stock < 1) {
    App.showToast('Stok produk habis', 'error');
    return;
  }
  
  const existingItem = cart.find(item => item.product_id === productId);
  
  if (existingItem) {
    if (existingItem.quantity >= product.stock) {
      App.showToast('Stok tidak mencukupi', 'error');
      return;
    }
    existingItem.quantity += 1;
  } else {
    cart.push({
      product_id: product.id,
      name: product.name,
      sku: product.sku,
      price: product.selling_price,
      quantity: 1,
      max_stock: product.stock
    });
  }
  
  renderCart();
}

function removeFromCart(productId) {
  cart = cart.filter(item => item.product_id !== productId);
  renderCart();
}

function updateQuantity(productId, change) {
  const item = cart.find(i => i.product_id === productId);
  if (!item) return;
  
  item.quantity += change;
  
  if (item.quantity < 1) {
    removeFromCart(productId);
  } else if (item.quantity > item.max_stock) {
    item.quantity = item.max_stock;
    App.showToast('Stok tidak mencukupi', 'error');
  }
  
  renderCart();
}

function renderCart() {
  const container = document.getElementById('cartItems');
  const subtotalEl = document.getElementById('cartSubtotal');
  const totalEl = document.getElementById('cartTotal');
  
  if (!container) return;
  
  if (cart.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>Keranjang kosong</p></div>';
    subtotalEl.textContent = App.formatCurrency(0);
    totalEl.textContent = App.formatCurrency(0);
    return;
  }
  
  container.innerHTML = cart.map(item => `
    <div class="cart-item">
      <div class="cart-item-info">
        <h4>${item.name}</h4>
        <p>${App.formatCurrency(item.price)} x ${item.quantity}</p>
        <p style="font-weight: 600;">${App.formatCurrency(item.price * item.quantity)}</p>
      </div>
      <div class="cart-item-actions">
        <button class="cart-qty-btn" onclick="updateQuantity('${item.product_id}', -1)">-</button>
        <span class="cart-qty">${item.quantity}</span>
        <button class="cart-qty-btn" onclick="updateQuantity('${item.product_id}', 1)">+</button>
        <button class="cart-qty-btn" onclick="removeFromCart('${item.product_id}')" style="color: var(--danger);">×</button>
      </div>
    </div>
  `).join('');
  
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  subtotalEl.textContent = App.formatCurrency(total);
  totalEl.textContent = App.formatCurrency(total);
}

function setupCartListeners() {
  const clearBtn = document.getElementById('clearCart');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      cart = [];
      renderCart();
    });
  }
}

function setupPaymentListeners() {
  const paymentInput = document.getElementById('paymentAmount');
  const changeEl = document.getElementById('changeAmount');
  
  if (paymentInput && changeEl) {
    paymentInput.addEventListener('input', () => {
      const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const payment = parseInt(paymentInput.value) || 0;
      const change = payment - total;
      
      if (change >= 0) {
        changeEl.textContent = App.formatCurrency(change);
        changeEl.style.color = 'var(--success)';
      } else {
        changeEl.textContent = 'Pembayaran kurang';
        changeEl.style.color = 'var(--danger)';
      }
    });
  }
  
  const processBtn = document.getElementById('processPayment');
  if (processBtn) {
    processBtn.addEventListener('click', processTransaction);
  }
}

async function processTransaction() {
  if (cart.length === 0) {
    App.showToast('Keranjang masih kosong', 'error');
    return;
  }
  
  const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const paymentInput = document.getElementById('paymentAmount');
  const paymentMethod = document.getElementById('paymentMethod').value;
  
  if (!paymentInput.value) {
    App.showToast('Masukkan jumlah pembayaran', 'error');
    return;
  }
  
  const payment = parseInt(paymentInput.value);
  
  if (payment < total) {
    App.showToast('Pembayaran kurang', 'error');
    return;
  }
  
  const processBtn = document.getElementById('processPayment');
  processBtn.disabled = true;
  processBtn.textContent = 'Memproses...';
  
  try {
    const items = cart.map(item => ({
      product_id: item.product_id,
      quantity: item.quantity
    }));
    
    const response = await App.api('/transactions', {
      method: 'POST',
      body: JSON.stringify({
        items,
        payment_amount: payment,
        payment_method: paymentMethod
      })
    });
    
    const data = await response.json();
    
    if (data.success) {
      App.showToast('Transaksi berhasil', 'success');
      
      App.showModal(
        'Transaksi Berhasil',
        `
          <div style="text-align: center; margin-bottom: 1.5rem;">
            <div style="font-size: 3rem; color: var(--success); margin-bottom: 0.5rem;">✓</div>
            <h3 style="font-size: 1.25rem; font-weight: 600;">${App.formatCurrency(total)}</h3>
            <p style="color: var(--muted); margin-top: 0.25rem;">${data.data.transaction_number}</p>
          </div>
          <div style="background-color: var(--border-light); border-radius: var(--radius); padding: 1rem;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
              <span style="color: var(--muted);">Total</span>
              <span style="font-weight: 600;">${App.formatCurrency(total)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 0.5rem;">
              <span style="color: var(--muted);">Pembayaran</span>
              <span style="font-weight: 600;">${App.formatCurrency(payment)}</span>
            </div>
            <div style="display: flex; justify-content: space-between;">
              <span style="color: var(--muted);">Kembalian</span>
              <span style="font-weight: 600; color: var(--success);">${App.formatCurrency(payment - total)}</span>
            </div>
          </div>
        `,
        '<button class="btn btn-primary" onclick="location.reload()">Selesai</button>'
      );
      
      cart = [];
      renderCart();
      paymentInput.value = '';
      document.getElementById('changeAmount').textContent = App.formatCurrency(0);
      await loadProducts();
    } else {
      App.showToast(data.message || 'Transaksi gagal', 'error');
    }
  } catch (error) {
    App.showToast('Terjadi kesalahan', 'error');
  } finally {
    processBtn.disabled = false;
    processBtn.textContent = 'Proses Pembayaran';
  }
}