document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const errorDiv = document.getElementById('loginError');
      
      if (!email || !password) {
        errorDiv.textContent = 'Email dan password harus diisi';
        errorDiv.style.display = 'block';
        return;
      }
      
      submitBtn.disabled = true;
      submitBtn.textContent = 'Memproses...';
      errorDiv.style.display = 'none';
      
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify({ email, password })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          window.location.href = data.data.user.role === 'cashier' ? '/kasir.html' : '/dashboard.html';
        } else {
          errorDiv.textContent = data.message || 'Login gagal';
          errorDiv.style.display = 'block';
        }
      } catch (error) {
        errorDiv.textContent = 'Terjadi kesalahan. Silakan coba lagi.';
        errorDiv.style.display = 'block';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Masuk';
      }
    });
  }
  
  const showPasswordBtn = document.getElementById('showPassword');
  if (showPasswordBtn) {
    showPasswordBtn.addEventListener('click', () => {
      const passwordInput = document.getElementById('password');
      const type = passwordInput.type === 'password' ? 'text' : 'password';
      passwordInput.type = type;
    });
  }
});