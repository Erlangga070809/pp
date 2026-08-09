document.addEventListener('DOMContentLoaded', async () => {
  if (!App.requireOwner()) return;
  
  await loadUsers();
  setupUserListeners();
});

async function loadUsers() {
  const container = document.getElementById('usersTableBody');
  if (!container) return;
  
  try {
    App.showSkeleton(container, 'text', 5);
    
    const response = await App.api('/users');
    const data = await response.json();
    
    if (data.success) {
      renderUsers(data.data);
    }
  } catch (error) {
    App.showToast('Gagal memuat pengguna', 'error');
  }
}

function renderUsers(users) {
  const container = document.getElementById('usersTableBody');
  if (!container) return;
  
  if (users.length === 0) {
    App.showEmptyState(container.parentElement, 'Belum ada pengguna');
    return;
  }
  
  container.innerHTML = users.map(u => `
    <tr>
      <td>
        <div style="font-weight: 500;">${u.name}</div>
        <div style="font-size: 0.75rem; color: var(--muted);">${u.email}</div>
      </td>
      <td>
        <span class="badge ${u.role === 'owner' ? 'badge-primary' : 'badge-success'}">${u.role === 'owner' ? 'Pemilik' : 'Kasir'}</span>
      </td>
      <td>
        ${u.is_active 
          ? '<span class="badge badge-success">Aktif</span>' 
          : '<span class="badge badge-danger">Nonaktif</span>'}
      </td>
      <td>${App.formatDate(u.created_at)}</td>
      <td>
        ${u.role !== 'owner' ? `
          <button class="btn btn-sm btn-outline" onclick="editUser('${u.id}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button class="btn btn-sm btn-outline" onclick="toggleUserStatus('${u.id}', ${u.is_active})" style="color: ${u.is_active ? 'var(--danger)' : 'var(--success)'}">
            ${u.is_active ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
        ` : '<span style="color: var(--muted); font-size: 0.8125rem;">Pemilik</span>'}
      </td>
    </tr>
  `).join('');
}

function setupUserListeners() {
  const addBtn = document.getElementById('addUserBtn');
  if (addBtn) {
    addBtn.addEventListener('click', () => showUserForm());
  }
}

function showUserForm(user = null) {
  const isEdit = !!user;
  const title = isEdit ? 'Edit Pengguna' : 'Tambah Pengguna';
  
  const content = `
    <div class="form-group">
      <label class="label">Nama</label>
      <input type="text" id="userName" class="input" value="${user?.name || ''}" required>
    </div>
    <div class="form-group">
      <label class="label">Email</label>
      <input type="email" id="userEmail" class="input" value="${user?.email || ''}" required>
    </div>
    ${!isEdit ? `
      <div class="form-group">
        <label class="label">Password</label>
        <input type="password" id="userPassword" class="input" required minlength="8">
      </div>
    ` : ''}
    <div class="form-group">
      <label class="label">Role</label>
      <select id="userRole" class="select">
        <option value="cashier" ${user?.role === 'cashier' ? 'selected' : ''}>Kasir</option>
        <option value="owner" ${user?.role === 'owner' ? 'selected' : ''}>Pemilik</option>
      </select>
    </div>
  `;
  
  const footer = `
    <button class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Batal</button>
    <button class="btn btn-primary" id="saveUserBtn">${isEdit ? 'Simpan' : 'Tambah'}</button>
  `;
  
  const modal = App.showModal(title, content, footer);
  
  modal.querySelector('#saveUserBtn').addEventListener('click', async () => {
    await saveUser(user?.id);
  });
}

async function saveUser(userId = null) {
  const name = document.getElementById('userName').value;
  const email = document.getElementById('userEmail').value;
  const role = document.getElementById('userRole').value;
  const password = document.getElementById('userPassword')?.value;
  
  if (!name || !email || !role) {
    App.showToast('Semua field harus diisi', 'error');
    return;
  }
  
  if (!userId && (!password || password.length < 8)) {
    App.showToast('Password minimal 8 karakter', 'error');
    return;
  }
  
  const body = { name, email, role };
  if (password) body.password = password;
  
  try {
    const endpoint = userId ? `/users/${userId}` : '/users';
    const method = userId ? 'PUT' : 'POST';
    
    const response = await App.api(endpoint, {
      method,
      body: JSON.stringify(body)
    });
    
    const data = await response.json();
    
    if (data.success) {
      App.showToast(userId ? 'Pengguna berhasil diperbarui' : 'Pengguna berhasil ditambahkan', 'success');
      document.querySelector('.modal-overlay')?.remove();
      await loadUsers();
    } else {
      App.showToast(data.message || 'Gagal menyimpan pengguna', 'error');
    }
  } catch (error) {
    App.showToast('Terjadi kesalahan', 'error');
  }
}

async function editUser(userId) {
  try {
    const response = await App.api('/users');
    const data = await response.json();
    
    if (data.success) {
      const user = data.data.find(u => u.id === userId);
      if (user) {
        showUserForm(user);
      }
    }
  } catch (error) {
    App.showToast('Gagal memuat pengguna', 'error');
  }
}

async function toggleUserStatus(userId, currentStatus) {
  const confirmed = confirm(`Apakah Anda yakin ingin ${currentStatus ? 'menonaktifkan' : 'mengaktifkan'} pengguna ini?`);
  if (!confirmed) return;
  
  try {
    const response = await App.api(`/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !currentStatus })
    });
    
    const data = await response.json();
    
    if (data.success) {
      App.showToast(`Pengguna berhasil ${!currentStatus ? 'diaktifkan' : 'dinonaktifkan'}`, 'success');
      await loadUsers();
    } else {
      App.showToast(data.message || 'Gagal mengubah status', 'error');
    }
  } catch (error) {
    App.showToast('Terjadi kesalahan', 'error');
  }
}