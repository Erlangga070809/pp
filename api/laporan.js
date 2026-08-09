const express = require('express');
const router = express.Router();
const pool = require('../lib/db');
const { authMiddleware, roleMiddleware } = require('../lib/auth');

router.use(authMiddleware);
router.use(roleMiddleware('owner'));

router.get('/sales', async (req, res) => {
  try {
    const { period, start_date, end_date } = req.query;
    
    let dateFilter;
    const now = new Date();
    
    if (start_date && end_date) {
      dateFilter = `AND t.created_at >= '${start_date}' AND t.created_at <= '${end_date} 23:59:59'`;
    } else if (period === 'today') {
      dateFilter = `AND t.created_at >= CURRENT_DATE AND t.created_at < CURRENT_DATE + INTERVAL '1 day'`;
    } else if (period === 'week') {
      dateFilter = `AND t.created_at >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === 'month') {
      dateFilter = `AND t.created_at >= CURRENT_DATE - INTERVAL '30 days'`;
    } else if (period === '90days') {
      dateFilter = `AND t.created_at >= CURRENT_DATE - INTERVAL '90 days'`;
    } else {
      dateFilter = `AND t.created_at >= CURRENT_DATE`;
    }
    
    const summaryResult = await pool.query(`
      SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(total), 0) as total_revenue,
        COALESCE(AVG(total), 0) as average_transaction
      FROM transactions t
      WHERE t.business_id = $1 ${dateFilter}
    `, [req.user.business_id]);
    
    const chartResult = await pool.query(`
      SELECT 
        DATE(t.created_at) as date,
        COUNT(*) as transaction_count,
        COALESCE(SUM(total), 0) as total_sales
      FROM transactions t
      WHERE t.business_id = $1 ${dateFilter}
      GROUP BY DATE(t.created_at)
      ORDER BY date
    `, [req.user.business_id]);
    
    res.json({
      success: true,
      data: {
        summary: summaryResult.rows[0],
        chart: chartResult.rows
      }
    });
  } catch (error) {
    console.error('Get sales report error:', error);
    res.status(500).json({ success: false, message: 'Failed to get sales report' });
  }
});

router.get('/products', async (req, res) => {
  try {
    const { period, start_date, end_date } = req.query;
    
    let dateFilter;
    if (start_date && end_date) {
      dateFilter = `AND t.created_at >= '${start_date}' AND t.created_at <= '${end_date} 23:59:59'`;
    } else if (period === 'today') {
      dateFilter = `AND t.created_at >= CURRENT_DATE AND t.created_at < CURRENT_DATE + INTERVAL '1 day'`;
    } else if (period === 'week') {
      dateFilter = `AND t.created_at >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === 'month') {
      dateFilter = `AND t.created_at >= CURRENT_DATE - INTERVAL '30 days'`;
    } else if (period === '90days') {
      dateFilter = `AND t.created_at >= CURRENT_DATE - INTERVAL '90 days'`;
    } else {
      dateFilter = `AND t.created_at >= CURRENT_DATE`;
    }
    
    const result = await pool.query(`
      SELECT 
        ti.product_name,
        ti.product_sku,
        COUNT(ti.id) as times_sold,
        SUM(ti.quantity) as total_quantity,
        SUM(ti.subtotal) as total_revenue
      FROM transaction_items ti
      JOIN transactions t ON ti.transaction_id = t.id
      WHERE t.business_id = $1 ${dateFilter}
      GROUP BY ti.product_name, ti.product_sku
      ORDER BY total_quantity DESC
      LIMIT 50
    `, [req.user.business_id]);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get products report error:', error);
    res.status(500).json({ success: false, message: 'Failed to get products report' });
  }
});

router.get('/stock', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        id, sku, name, stock, min_stock,
        CASE 
          WHEN stock = 0 THEN 'out_of_stock'
          WHEN stock <= min_stock THEN 'low_stock'
          ELSE 'adequate'
        END as stock_status
      FROM products
      WHERE business_id = $1 AND is_active = true
      ORDER BY stock ASC
    `, [req.user.business_id]);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get stock report error:', error);
    res.status(500).json({ success: false, message: 'Failed to get stock report' });
  }
});

router.get('/cashiers', async (req, res) => {
  try {
    const { period, start_date, end_date } = req.query;
    
    let dateFilter;
    if (start_date && end_date) {
      dateFilter = `AND t.created_at >= '${start_date}' AND t.created_at <= '${end_date} 23:59:59'`;
    } else if (period === 'today') {
      dateFilter = `AND t.created_at >= CURRENT_DATE AND t.created_at < CURRENT_DATE + INTERVAL '1 day'`;
    } else if (period === 'week') {
      dateFilter = `AND t.created_at >= CURRENT_DATE - INTERVAL '7 days'`;
    } else if (period === 'month') {
      dateFilter = `AND t.created_at >= CURRENT_DATE - INTERVAL '30 days'`;
    } else if (period === '90days') {
      dateFilter = `AND t.created_at >= CURRENT_DATE - INTERVAL '90 days'`;
    } else {
      dateFilter = `AND t.created_at >= CURRENT_DATE`;
    }
    
    const result = await pool.query(`
      SELECT 
        u.id,
        u.name,
        COUNT(t.id) as total_transactions,
        COALESCE(SUM(t.total), 0) as total_revenue
      FROM users u
      LEFT JOIN transactions t ON u.id = t.cashier_id ${dateFilter.replace('t.created_at', 't.created_at')}
      WHERE u.business_id = $1 AND u.role = 'cashier' AND u.is_active = true
      GROUP BY u.id, u.name
      ORDER BY total_revenue DESC
    `, [req.user.business_id]);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Get cashiers report error:', error);
    res.status(500).json({ success: false, message: 'Failed to get cashiers report' });
  }
});

router.get('/dashboard', async (req, res) => {
  try {
    const todayResult = await pool.query(`
      SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(total), 0) as total_revenue
      FROM transactions
      WHERE business_id = $1 
        AND created_at >= CURRENT_DATE 
        AND created_at < CURRENT_DATE + INTERVAL '1 day'
    `, [req.user.business_id]);
    
    const weekResult = await pool.query(`
      SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(total), 0) as total_revenue
      FROM transactions
      WHERE business_id = $1 
        AND created_at >= CURRENT_DATE - INTERVAL '7 days'
    `, [req.user.business_id]);
    
    const monthResult = await pool.query(`
      SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(total), 0) as total_revenue
      FROM transactions
      WHERE business_id = $1 
        AND created_at >= CURRENT_DATE - INTERVAL '30 days'
    `, [req.user.business_id]);
    
    const productsResult = await pool.query(
      'SELECT COUNT(*) as total_products, COALESCE(SUM(stock), 0) as total_stock FROM products WHERE business_id = $1 AND is_active = true',
      [req.user.business_id]
    );
    
    const lowStockResult = await pool.query(
      'SELECT COUNT(*) as low_stock_count FROM products WHERE business_id = $1 AND is_active = true AND stock <= min_stock AND min_stock > 0',
      [req.user.business_id]
    );
    
    const recentTransactions = await pool.query(`
      SELECT t.*, u.name as cashier_name
      FROM transactions t
      JOIN users u ON t.cashier_id = u.id
      WHERE t.business_id = $1
      ORDER BY t.created_at DESC
      LIMIT 5
    `, [req.user.business_id]);
    
    const recentActivities = await pool.query(`
      SELECT al.*, u.name as user_name
      FROM activity_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.business_id = $1
      ORDER BY al.created_at DESC
      LIMIT 10
    `, [req.user.business_id]);
    
    const chartResult = await pool.query(`
      SELECT 
        DATE(created_at) as date,
        COUNT(*) as transaction_count,
        COALESCE(SUM(total), 0) as total_sales
      FROM transactions
      WHERE business_id = $1 
        AND created_at >= CURRENT_DATE - INTERVAL '7 days'
      GROUP BY DATE(created_at)
      ORDER BY date
    `, [req.user.business_id]);
    
    res.json({
      success: true,
      data: {
        today: todayResult.rows[0],
        week: weekResult.rows[0],
        month: monthResult.rows[0],
        products: productsResult.rows[0],
        low_stock: lowStockResult.rows[0].low_stock_count,
        recent_transactions: recentTransactions.rows,
        recent_activities: recentActivities.rows,
        chart: chartResult.rows
      }
    });
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({ success: false, message: 'Failed to get dashboard data' });
  }
});

router.get('/export/csv', async (req, res) => {
  try {
    const { type, start_date, end_date } = req.query;
    
    let query;
    let filename;
    
    if (type === 'transactions') {
      query = `
        SELECT t.transaction_number, t.created_at, u.name as cashier_name, 
               t.subtotal, t.total, t.payment_amount, t.change_amount, t.payment_method
        FROM transactions t
        JOIN users u ON t.cashier_id = u.id
        WHERE t.business_id = $1
      `;
      filename = 'transactions.csv';
    } else if (type === 'products') {
      query = `
        SELECT p.sku, p.name, c.name as category, p.stock, p.selling_price, p.cost_price
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.business_id = $1
      `;
      filename = 'products.csv';
    } else {
      return res.status(400).json({ success: false, message: 'Invalid export type' });
    }
    
    const params = [req.user.business_id];
    
    if (start_date && end_date) {
      query += ` AND t.created_at >= $2 AND t.created_at <= $3`;
      params.push(start_date, `${end_date} 23:59:59`);
    }
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'No data to export' });
    }
    
    const headers = Object.keys(result.rows[0]).join(',');
    const rows = result.rows.map(row => Object.values(row).join(',')).join('\n');
    const csv = `${headers}\n${rows}`;
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.send(csv);
  } catch (error) {
    console.error('Export CSV error:', error);
    res.status(500).json({ success: false, message: 'Failed to export data' });
  }
});

module.exports = router;