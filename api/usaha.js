const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { authMiddleware, roleMiddleware } = require('../lib/auth');

router.use(authMiddleware);

router.get('/', roleMiddleware('owner'), async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, address, phone, created_at, updated_at FROM businesses WHERE id = $1',
      [req.user.business_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Business not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get business error:', error);
    res.status(500).json({ success: false, message: 'Failed to get business data' });
  }
});

router.put('/', roleMiddleware('owner'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { name, address, phone } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Business name is required' });
    }
    
    const result = await client.query(
      'UPDATE businesses SET name = $1, address = $2, phone = $3, updated_at = NOW() WHERE id = $4 RETURNING id, name, address, phone, created_at, updated_at',
      [name, address || null, phone || null, req.user.business_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Business not found' });
    }
    
    await client.query(
      'INSERT INTO activity_logs (business_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.business_id, req.user.id, 'update_business', JSON.stringify({ action: 'Business profile updated' })]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update business error:', error);
    res.status(500).json({ success: false, message: 'Failed to update business' });
  } finally {
    client.release();
  }
});

module.exports = router;