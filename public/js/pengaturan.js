document.addEventListener('DOMContentLoaded', async () => {
  if (!App.requireOwner()) return;
  
  await loadBusinessProfile();
  setupSettingsListeners();
});

async function loadBusinessProfile() {
  try {
    const response = await App.api('/business');
    const data = await response.json();
    
    if (data.success) {
      const business = data.data;
      
      document.getElementById('businessName').value = business.name || '';
      document.getElementById('businessAddress').value = business.address || '';
      document.getElementById('businessPhone').value = business.phone || '';
    }
  } catch (error) {
    App.showToast('Gagal memuat profil usaha', 'error');
  }
}

function setupSettingsListeners() {
  const saveBtn = document.getElementById('saveBusinessBtn');
  if (saveBtn) {
    saveBtn.addEventListener('click', saveBusinessProfile);
  }
}

async function saveBusinessProfile() {
  const name = document.getElementById('businessName').value;
  const address = document.getElementById('businessAddress').value;
  const phone = document.getElementById('businessPhone').value;
  
  if (!name) {
    App.showToast('Nama usaha harus diisi', 'error');
    return;
  }
  
  const saveBtn = document.getElementById('saveBusinessBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Menyimpan...';
  
  try {
    const response = await App.api('/business', {
      method: 'PUT',
      body: JSON.stringify({ name, address, phone })
    });
    
    const data = await response.json();
    
    if (data.success) {
      App.showToast('Profil usaha berhasil disimpan', 'success');
    } else {
      App.showToast(data.message || 'Gagal menyimpan', 'error');
    }
  } catch (error) {
    App.showToast('Terjadi kesalahan', 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Simpan Perubahan';
  }
}