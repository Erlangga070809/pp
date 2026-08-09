const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { securityHeaders, createRateLimiter } = require('../lib/security');
const authRoutes = require('./auth');
const usahaRoutes = require('./usaha');
const produkRoutes = require('./produk');
const transaksiRoutes = require('./transaksi');
const laporanRoutes = require('./laporan');
const penggunaRoutes = require('./pengguna');

const app = express();

app.set('trust proxy', 1);

app.use(securityHeaders());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? process.env.ALLOWED_ORIGIN || '*' : '*',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

const globalLimiter = createRateLimiter(15 * 60 * 1000, 1000, 'Too many requests');
app.use('/api', globalLimiter);

const authLimiter = createRateLimiter(15 * 60 * 1000, 20, 'Too many authentication attempts');
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/business', usahaRoutes);
app.use('/api/products', produkRoutes);
app.use('/api/transactions', transaksiRoutes);
app.use('/api/reports', laporanRoutes);
app.use('/api/users', penggunaRoutes);

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Ladang Usaha API is running', timestamp: new Date().toISOString() });
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ success: false, message: 'API endpoint not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ 
    success: false, 
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message 
  });
});

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Ladang Usaha server running on port ${PORT}`);
  });
}

module.exports = app;