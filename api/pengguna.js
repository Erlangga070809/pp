const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { authMiddleware, roleMiddleware, hashPassword } = require('../lib/auth');
const { validateEmail } = require('../lib/security');

router.use(authMiddleware);

router.get('/', roleMiddleware('owner'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, is_active, created_at FROM users WHERE business_id = $1 ORDER BY created_at DESC',
      [req.user.business_id]
    );
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Failed to get users' });
  }
});

router.post('/', roleMiddleware('owner'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { name, email, password, role } = req.body;
    
    if (!name || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'Name, email, password, and role are required' });
    }
    
    if (!validateEmail(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }
    
    if (!['owner', 'cashier'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }
    
    const existingUser = await client.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }
    
    const passwordHash = await hashPassword(password);
    
    const result = await client.query(
      'INSERT INTO users (business_id, name, email, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, is_active, created_at',
      [req.user.business_id, name, email.toLowerCase(), passwordHash, role]
    );
    
    await client.query(
      'INSERT INTO activity_logs (business_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.business_id, req.user.id, 'create_user', JSON.stringify({ created_user_id: result.rows[0].id, role })]
    );
    
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Failed to create user' });
  } finally {
    client.release();
  }
});

router.put('/:id', roleMiddleware('owner'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { name, email, role } = req.body;
    
    const existingUser = await client.query(
      'SELECT id FROM users WHERE id = $1 AND business_id = $2',
      [req.params.id, req.user.business_id]
    );
    
    if (existingUser.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    if (email) {
      const emailCheck = await client.query(
        'SELECT id FROM users WHERE email = $1 AND id != $2 AND business_id = $3',
        [email.toLowerCase(), req.params.id, req.user.business_id]
      );
      
      if (emailCheck.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'Email already exists' });
      }
    }
    
    const result = await client.query(
      `UPDATE users 
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           role = COALESCE($3, role),
           updated_at = NOW()
       WHERE id = $4 AND business_id = $5
       RETURNING id, name, email, role, is_active, created_at`,
      [name, email ? email.toLowerCase() : null, role, req.params.id, req.user.business_id]
    );
    
    await client.query(
      'INSERT INTO activity_logs (business_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.business_id, req.user.id, 'update_user', JSON.stringify({ updated_user_id: req.params.id })]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  } finally {
    client.release();
  }
});

router.patch('/:id/status', roleMiddleware('owner'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { is_active } = req.body;
    
    if (typeof is_active !== 'boolean') {
      return res.status(400).json({ success: false, message: 'is_active must be a boolean' });
    }
    
    const result = await client.query(
      'UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2 AND business_id = $3 RETURNING id, name, email, role, is_active, created_at',
      [is_active, req.params.id, req.user.business_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    await client.query(
      'INSERT INTO activity_logs (business_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.business_id, req.user.id, is_active ? 'activate_user' : 'deactivate_user', JSON.stringify({ updated_user_id: req.params.id })]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user status' });
  } finally {
    client.release();
  }
});

module.exports = router;