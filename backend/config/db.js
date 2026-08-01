const mysql = require('mysql2');
require('dotenv').config();
const { sslOption } = require('./dbOptions');

// Create a connection pool (better for performance than a single connection)
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,       // cloud MySQL often uses a custom port
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ...(sslOption() ? { ssl: sslOption() } : {})
});

// Test the connection
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
    } else {
        console.log('✅ Connected to the MySQL database successfully!');
        connection.release();
    }
});

// Export the pool with promise wrapper so we can use async/await in our controllers
const promisePool = pool.promise();
module.exports = promisePool;