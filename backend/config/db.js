// config/db.js
// Creates a MySQL connection POOL using mysql2.
//
// A pool keeps several connections open and reuses them, so the app doesn't
// have to pay the cost of opening a new connection for every single request.
// mysql2/promise gives us async/await support out of the box.

const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306', 10),
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'tindatrack',
  waitForConnections: true,   // queue requests when all connections are busy
  connectionLimit:    10,     // max simultaneous connections in the pool
  queueLimit:         0,      // 0 = unlimited queue
  timezone:           '+00:00', // store/return dates in UTC; convert in the frontend
});

// Test the connection once at startup so we know immediately if the DB is down.
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅  MySQL connected — database:', process.env.DB_NAME);
    conn.release(); // return the connection to the pool
  } catch (err) {
    console.error('❌  MySQL connection failed:', err.message);
    console.error('    Check your .env DB_* variables and make sure MySQL is running.');
    process.exit(1); // crash early so you notice the problem right away
  }
})();

module.exports = pool;
