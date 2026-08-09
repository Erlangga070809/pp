const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { authMiddleware } = require('../lib/auth');
const { validateInteger } = require('../lib/security');

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { search, start_date, end_date, cashier_id, payment_method, page = 1, limit = 20 } = req.query;
    
    let query = `
      SELECT t.*, u.name as cashier_name
      FROM transactions t
      JOIN users u ON t.cashier_id = u.id
      WHERE t.business_id = $1
    `;
    const params = [req.user.business_id];
    let paramCount = 1;
    
    if (search) {
      paramCount++;
      query += ` AND t.transaction_number ILIKE $${paramCount}`;
      params.push(`%${search}%`);
    }
    
    if (start_date) {
      paramCount++;
      query += ` AND t.created_at >= $${paramCount}`;
      params.push(start_date);
    }
    
    if (end_date) {
      paramCount++;
      query += ` AND t.created_at <= $${paramCount}`;
      params.push(end_date);
    }
    
    if (cashier_id) {
      paramCount++;
      query += ` AND t.cashier_id = $${paramCount}`;
      params.push(cashier_id);
    }
    
    if (payment_method) {
      paramCount++;
      query += ` AND t.payment_method = $${paramCount}`;
      params.push(payment_method);
    }
    
    if (req.user.role === 'cashier') {
      paramCount++;
      query += ` AND t.cashier_id = $${paramCount}`;
      params.push(req.user.id);
    }
    
    query += ` ORDER BY t.created_at DESC`;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);
    
    let countQuery = `
      SELECT COUNT(*) 
      FROM transactions t 
      WHERE t.business_id = $1
    `;
    const countParams = [req.user.business_id];
    let countParamCount = 1;
    
    if (search) {
      countParamCount++;
      countQuery += ` AND t.transaction_number ILIKE $${countParamCount}`;
      countParams.push(`%${search}%`);
    }
    
    if (start_date) {
      countParamCount++;
      countQuery += ` AND t.created_at >= $${countParamCount}`;
      countParams.push(start_date);
    }
    
    if (end_date) {
      countParamCount++;
      countQuery += ` AND t.created_at <= $${countParamCount}`;
      countParams.push(end_date);
    }
    
    if (cashier_id) {
      countParamCount++;
      countQuery += ` AND t.cashier_id = $${countParamCount}`;
      countParams.push(cashier_id);
    }
    
    if (payment_method) {
      countParamCount++;
      countQuery += ` AND t.payment_method = $${countParamCount}`;
      countParams.push(payment_method);
    }
    
    if (req.user.role === 'cashier') {
      countParamCount++;
      countQuery += ` AND t.cashier_id = $${countParamCount}`;
      countParams.push(req.user.id);
    }
    
    const [transactions, count] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams)
    ]);
    
    res.json({
      success: true,
      data: {
        transactions: transactions.rows,
        total: parseInt(count.rows[0].count),
        page: parseInt(page),
        totalPages: Math.ceil(parseInt(count.rows[0].count) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to get transactions' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const transactionResult = await pool.query(
      `SELECT t.*, u.name as cashier_name
       FROM transactions t
       JOIN users u ON t.cashier_id = u.id
       WHERE t.id = $1 AND t.business_id = $2`,
      [req.params.id, req.user.business_id]
    );
    
    if (transactionResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }
    
    if (req.user.role === 'cashier' && transactionResult.rows[0].cashier_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    
    const itemsResult = await pool.query(
      'SELECT * FROM transaction_items WHERE transaction_id = $1',
      [req.params.id]
    );
    
    res.json({
      success: true,
      data: {
        ...transactionResult.rows[0],
        items: itemsResult.rows
      }
    });
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ success: false, message: 'Failed to get transaction' });
  }
});

router.post('/', async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { items, payment_amount, payment_method, notes } = req.body;
    
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Transaction items are required' });
    }
    
    if (!payment_amount || !validateInteger(payment_amount, 0)) {
      return res.status(400).json({ success: false, message: 'Valid payment amount is required' });
    }
    
    if (!payment_method || !['cash', 'debit', 'credit', 'qris', 'transfer'].includes(payment_method)) {
      return res.status(400).json({ success: false, message: 'Valid payment method is required' });
    }
    
    for (const item of items) {
      if (!item.product_id || !item.quantity || item.quantity < 1) {
        return res.status(400).json({ success: false, message: 'Each item must have a valid product_id and quantity' });
      }
    }
    
    await client.query('BEGIN');
    
    await client.query('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE');
    
    let subtotal = 0;
    const validatedItems = [];
    
    for (const item of items) {
      const productResult = await client.query(
        'SELECT id, name, sku, selling_price, stock FROM products WHERE id = $1 AND business_id = $2 AND is_active = true FOR UPDATE',
        [item.product_id, req.user.business_id]
      );
      
      if (productResult.rows.length === 0) {
        throw new Error(`Product ${item.product_id} not found or inactive`);
      }
      
      const product = productResult.rows[0];
      
      if (product.stock < item.quantity) {
        throw new Error(`Insufficient stock for product ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`);
      }
      
      const itemSubtotal = product.selling_price * item.quantity;
      subtotal += itemSubtotal;
      
      validatedItems.push({
        product_id: product.id,
        product_name: product.name,
        product_sku: product.sku,
        quantity: item.quantity,
        price_per_unit: product.selling_price,
        subtotal: itemSubtotal
      });
    }
    
    const total = subtotal;
    const paymentAmount = parseInt(payment_amount, 10);
    
    if (paymentAmount < total) {
      throw new Error('Payment amount is less than total');
    }
    
    const changeAmount = paymentAmount - total;
    
    const transactionNumber = `TRX-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
    
    const transactionResult = await client.query(
      `INSERT INTO transactions (business_id, cashier_id, transaction_number, subtotal, total, payment_amount, change_amount, payment_method, notes) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
       RETURNING *`,
      [req.user.business_id, req.user.id, transactionNumber, subtotal, total, paymentAmount, changeAmount, payment_method, notes || null]
    );
    
    const transactionId = transactionResult.rows[0].id;
    
    for (const item of validatedItems) {
      await client.query(
        `INSERT INTO transaction_items (transaction_id, product_id, product_name, product_sku, quantity, price_per_unit, subtotal) 
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [transactionId, item.product_id, item.product_name, item.product_sku, item.quantity, item.price_per_unit, item.subtotal]
      );
      
      await client.query(
        'UPDATE products SET stock = stock - $1, updated_at = NOW() WHERE id = $2 AND business_id = $3',
        [item.quantity, item.product_id, req.user.business_id]
      );
    }
    
    await client.query(
      'INSERT INTO activity_logs (business_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.business_id, req.user.id, 'create_transaction', JSON.stringify({ transaction_id: transactionId, transaction_number: transactionNumber, total })]
    );
    
    await client.query('COMMIT');
    
    const completeTransaction = await client.query(
      `SELECT t.*, u.name as cashier_name
       FROM transactions t
       JOIN users u ON t.cashier_id = u.id
       WHERE t.id = $1`,
      [transactionId]
    );
    
    res.status(201).json({ success: true, data: completeTransaction.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Create transaction error:', error);
    res.status(400).json({ success: false, message: error.message || 'Failed to create transaction' });
  } finally {
    client.release();
  }
});

module.exports = router;