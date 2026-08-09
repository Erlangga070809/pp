const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { generateToken, hashPassword, comparePassword, authMiddleware } = require('../lib/auth');
const { validateEmail } = require('../lib/security');

router.post('/register', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { name, email, password, business_name } = req.body;
    
    if (!name || !email || !password || !business_name) {
      return res.status(400).json({ success: false, message: 'Name, email, password, and business name are required' });
    }
    
    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }
    
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already registered' });
    }
    
    await client.query('BEGIN');
    
    const businessResult = await client.query(
      'INSERT INTO businesses (name) VALUES ($1) RETURNING id',
      [business_name]
    );
    const businessId = businessResult.rows[0].id;
    
    const passwordHash = await hashPassword(password);
    
    const userResult = await client.query(
      'INSERT INTO users (business_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, business_id',
      [businessId, name, email.toLowerCase(), passwordHash, 'owner']
    );
    
    await client.query(
      'INSERT INTO activity_logs (business_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [businessId, userResult.rows[0].id, 'register', JSON.stringify({ action: 'Business and owner account created' })]
    );
    
    await client.query('COMMIT');
    
    const user = userResult.rows[0];
    const token = generateToken(user);
    
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });
    
    res.status(201).json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          business_id: user.business_id
        }
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Registration failed' });
  } finally {
    client.release();
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    
    const result = await pool.query(
      'SELECT id, name, email, password_hash, role, business_id, is_active FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    
    const user = result.rows[0];
    
    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'Account is deactivated' });
    }
    
    const isValidPassword = await comparePassword(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    
    await pool.query(
      'INSERT INTO activity_logs (business_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [user.business_id, user.id, 'login', JSON.stringify({ action: 'User logged in' })]
    );
    
    const token = generateToken({
      id: user.id,
      email: user.email,
      role: user.role,
      business_id: user.business_id
    });
    
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000
    });
    
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          business_id: user.business_id
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

router.post('/logout', authMiddleware, async (req, res) => {
  try {
    await pool.query(
      'INSERT INTO activity_logs (business_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.business_id, req.user.id, 'logout', JSON.stringify({ action: 'User logged out' })]
    );
    
    res.clearCookie('token');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'Logout failed' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, business_id, is_active FROM users WHERE id = $1 AND business_id = $2',
      [req.user.id, req.user.business_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    const user = result.rows[0];
    
    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          business_id: user.business_id
        }
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ success: false, message: 'Failed to get user data' });
  }
});

module.exports = router;