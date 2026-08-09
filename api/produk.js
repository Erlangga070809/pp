const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { authMiddleware, roleMiddleware } = require('../lib/auth');
const { sanitizeInput, validateInteger } = require('../lib/security');

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const { search, category, status, sort, order, page = 1, limit = 20 } = req.query;
    let query = `
      SELECT p.*, c.name as category_name 
      FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.business_id = $1
    `;
    const params = [req.user.business_id];
    let paramCount = 1;
    
    if (search) {
      paramCount++;
      query += ` AND (p.name ILIKE $${paramCount} OR p.sku ILIKE $${paramCount})`;
      params.push(`%${search}%`);
    }
    
    if (category) {
      paramCount++;
      query += ` AND p.category_id = $${paramCount}`;
      params.push(category);
    }
    
    if (status === 'active') {
      query += ` AND p.is_active = true`;
    } else if (status === 'inactive') {
      query += ` AND p.is_active = false`;
    }
    
    const allowedSort = ['name', 'sku', 'stock', 'selling_price', 'created_at'];
    const sortBy = allowedSort.includes(sort) ? sort : 'created_at';
    const sortOrder = order === 'asc' ? 'ASC' : 'DESC';
    
    query += ` ORDER BY p.${sortBy} ${sortOrder}`;
    
    const offset = (parseInt(page) - 1) * parseInt(limit);
    paramCount++;
    query += ` LIMIT $${paramCount}`;
    params.push(parseInt(limit));
    paramCount++;
    query += ` OFFSET $${paramCount}`;
    params.push(offset);
    
    const countQuery = `
      SELECT COUNT(*) 
      FROM products p 
      WHERE p.business_id = $1
      ${search ? ` AND (p.name ILIKE $2 OR p.sku ILIKE $2)` : ''}
      ${category ? ` AND p.category_id = $${search ? 3 : 2}` : ''}
      ${status === 'active' ? ` AND p.is_active = true` : status === 'inactive' ? ` AND p.is_active = false` : ''}
    `;
    
    const countParams = [req.user.business_id];
    if (search) countParams.push(`%${search}%`);
    if (category) countParams.push(category);
    
    const [products, count] = await Promise.all([
      pool.query(query, params),
      pool.query(countQuery, countParams)
    ]);
    
    res.json({
      success: true,
      data: {
        products: products.rows,
        total: parseInt(count.rows[0].count),
        page: parseInt(page),
        totalPages: Math.ceil(parseInt(count.rows[0].count) / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ success: false, message: 'Failed to get products' });
  }
});

router.get('/categories', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name FROM categories WHERE business_id = $1 ORDER BY name',
      [req.user.business_id]
    );
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ success: false, message: 'Failed to get categories' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.name as category_name 
       FROM products p 
       LEFT JOIN categories c ON p.category_id = c.id 
       WHERE p.id = $1 AND p.business_id = $2`,
      [req.params.id, req.user.business_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ success: false, message: 'Failed to get product' });
  }
});

router.post('/', roleMiddleware('owner'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { sku, name, category_id, cost_price, selling_price, stock, min_stock } = req.body;
    
    if (!sku || !name || selling_price === undefined) {
      return res.status(400).json({ success: false, message: 'SKU, name, and selling price are required' });
    }
    
    if (!validateInteger(selling_price, 0)) {
      return res.status(400).json({ success: false, message: 'Selling price must be a valid positive number' });
    }
    
    if (cost_price !== undefined && !validateInteger(cost_price, 0)) {
      return res.status(400).json({ success: false, message: 'Cost price must be a valid positive number' });
    }
    
    if (stock !== undefined && !validateInteger(stock, 0)) {
      return res.status(400).json({ success: false, message: 'Stock must be a valid positive number' });
    }
    
    if (min_stock !== undefined && !validateInteger(min_stock, 0)) {
      return res.status(400).json({ success: false, message: 'Minimum stock must be a valid positive number' });
    }
    
    const existingSku = await client.query(
      'SELECT id FROM products WHERE business_id = $1 AND sku = $2',
      [req.user.business_id, sku]
    );
    
    if (existingSku.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'SKU already exists' });
    }
    
    const result = await client.query(
      `INSERT INTO products (business_id, sku, name, category_id, cost_price, selling_price, stock, min_stock) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
       RETURNING *`,
      [
        req.user.business_id,
        sku,
        name,
        category_id || null,
        cost_price || 0,
        selling_price,
        stock || 0,
        min_stock || 0
      ]
    );
    
    await client.query(
      'INSERT INTO activity_logs (business_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.business_id, req.user.id, 'create_product', JSON.stringify({ product_id: result.rows[0].id, product_name: name })]
    );
    
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ success: false, message: 'Failed to create product' });
  } finally {
    client.release();
  }
});

router.put('/:id', roleMiddleware('owner'), async (req, res) => {
  const client = await pool.connect();
  
  try {
    const { sku, name, category_id, cost_price, selling_price, stock, min_stock } = req.body;
    
    const existingProduct = await client.query(
      'SELECT id FROM products WHERE id = $1 AND business_id = $2',
      [req.params.id, req.user.business_id]
    );
    
    if (existingProduct.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    if (sku) {
      const skuCheck = await client.query(
        'SELECT id FROM products WHERE business_id = $1 AND sku = $2 AND id != $3',
        [req.user.business_id, sku, req.params.id]
      );
      
      if (skuCheck.rows.length > 0) {
        return res.status(409).json({ success: false, message: 'SKU already exists' });
      }
    }
    
    const result = await client.query(
      `UPDATE products 
       SET sku = COALESCE($1, sku),
           name = COALESCE($2, name),
           category_id = $3,
           cost_price = COALESCE($4, cost_price),
           selling_price = COALESCE($5, selling_price),
           stock = COALESCE($6, stock),
           min_stock = COALESCE($7, min_stock),
           updated_at = NOW()
       WHERE id = $8 AND business_id = $9
       RETURNING *`,
      [sku, name, category_id, cost_price, selling_price, stock, min_stock, req.params.id, req.user.business_id]
    );
    
    await client.query(
      'INSERT INTO activity_logs (business_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.business_id, req.user.id, 'update_product', JSON.stringify({ product_id: req.params.id })]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ success: false, message: 'Failed to update product' });
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
      'UPDATE products SET is_active = $1, updated_at = NOW() WHERE id = $2 AND business_id = $3 RETURNING *',
      [is_active, req.params.id, req.user.business_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    await client.query(
      'INSERT INTO activity_logs (business_id, user_id, action, details) VALUES ($1, $2, $3, $4)',
      [req.user.business_id, req.user.id, is_active ? 'activate_product' : 'deactivate_product', JSON.stringify({ product_id: req.params.id })]
    );
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Update product status error:', error);
    res.status(500).json({ success: false, message: 'Failed to update product status' });
  } finally {
    client.release();
  }
});

router.post('/categories', roleMiddleware('owner'), async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Category name is required' });
    }
    
    const result = await pool.query(
      'INSERT INTO categories (business_id, name) VALUES ($1, $2) ON CONFLICT (business_id, name) DO NOTHING RETURNING *',
      [req.user.business_id, name]
    );
    
    if (result.rows.length === 0) {
      return res.status(409).json({ success: false, message: 'Category already exists' });
    }
    
    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ success: false, message: 'Failed to create category' });
  }
});

module.exports = router;