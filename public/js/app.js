const API_BASE = '/api';

const App = {
  user: null,
  
  async init() {
    await this.loadUser();
    this.setupNavigation();
    this.setupLogout();
  },
  
  async loadUser() {
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        credentials: 'include',
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        this.user = data.data.user;
        return true;
      } else {
        this.user = null;
        return false;
      }
    } catch (error) {
      console.error('Failed to load user:', error);
      this.user = null;
      return false;
    }
  },
  
  async api(endpoint, options = {}) {
    const defaultOptions = {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    
    const mergedOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers
      }
    };
    
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, mergedOptions);
      
      if (response.status === 401) {
        this.user = null;
        const currentPath = window.location.pathname;
        if (currentPath !== '/login.html' && currentPath !== '/index.html' && currentPath !== '/') {
          window.location.href = '/login.html';
        }
        return null;
      }
      
      if (response.status === 403) {
        throw new Error('Forbidden');
      }
      
      return response;
    } catch (error) {
      if (error.message === 'Forbidden') {
        throw error;
      }
      console.error('API Error:', error);
      return null;
    }
  },
  
  setupNavigation() {
    const hamburger = document.querySelector('.hamburger');
    const sidebar = document.querySelector('.sidebar');
    
    if (hamburger && sidebar) {
      hamburger.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });
      
      document.addEventListener('click', (e) => {
        if (!sidebar.contains(e.target) && !hamburger.contains(e.target)) {
          sidebar.classList.remove('open');
        }
      });
    }
  },
  
  setupLogout() {
    const logoutBtn = document.querySelector('.logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        try {
          await this.api('/auth/logout', { method: 'POST' });
        } catch (error) {
          console.error('Logout error:', error);
        }
        this.user = null;
        window.location.href = '/login.html';
      });
    }
  },
  
  formatCurrency(amount) {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  },
  
  formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  },
  
  formatDateShort(dateString) {
    return new Date(dateString).toLocaleDateString('id-ID', {
      month: 'short',
      day: 'numeric'
    });
  },
  
  showToast(message, type = 'info') {
    let container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        ${type === 'success' ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' :
          type === 'error' ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' :
          '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>'}
      </svg>
      <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 300ms ease';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  },
  
  showModal(title, content, footer = '') {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-header">
          <h2 class="modal-title">${title}</h2>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">${content}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    const closeBtn = overlay.querySelector('.modal-close');
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    
    return overlay;
  },
  
  showSkeleton(container, type = 'card', count = 4) {
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      const skeleton = document.createElement('div');
      if (type === 'card') {
        skeleton.className = 'skeleton skeleton-card';
      } else if (type === 'text') {
        skeleton.className = 'skeleton skeleton-text';
      } else if (type === 'title') {
        skeleton.className = 'skeleton skeleton-title';
      }
      container.appendChild(skeleton);
    }
  },
  
  showEmptyState(container, message, submessage = '') {
    container.innerHTML = `
      <div class="empty-state">
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <line x1="3" y1="9" x2="21" y2="9"/>
          <line x1="9" y1="21" x2="9" y2="9"/>
        </svg>
        <h3>${message}</h3>
        ${submessage ? `<p>${submessage}</p>` : ''}
      </div>
    `;
  },
  
  isOwner() {
    return this.user && this.user.role === 'owner';
  },
  
  isCashier() {
    return this.user && this.user.role === 'cashier';
  },
  
  requireAuth() {
    if (!this.user) {
      const currentPath = window.location.pathname;
      if (currentPath !== '/login.html' && currentPath !== '/index.html' && currentPath !== '/') {
        window.location.href = '/login.html';
      }
      return false;
    }
    return true;
  },
  
  requireOwner() {
    if (!this.requireAuth()) return false;
    if (!this.isOwner()) {
      window.location.href = '/dashboard.html';
      return false;
    }
    return true;
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());