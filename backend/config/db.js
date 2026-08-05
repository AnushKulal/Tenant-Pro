const mysql = require('mysql2');
require('dotenv').config();
const { sslOption } = require('./dbOptions');

// Create a connection pool (better for performance than a single connection).
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,       // cloud MySQL often uses a custom port
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    // --- Stability on free/sleeping hosts (Render) + cloud DB (Aiven) ---
    // Keep-alive stops the DB from silently dropping "idle" sockets, and a
    // sane connect timeout means a cold DB fails fast instead of hanging.
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectTimeout: 20000,
    ...(sslOption() ? { ssl: sslOption() } : {})
});

// Test the connection at boot (non-fatal — the pool self-heals on demand).
pool.getConnection((err, connection) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
    } else {
        console.log('✅ Connected to the MySQL database successfully!');
        connection.release();
    }
});

const promisePool = pool.promise();

// Connection-level errors that mean "the socket is dead" rather than "your SQL
// is wrong". These happen when Render wakes from sleep and the pooled sockets
// to Aiven have already been closed. Retrying transparently gets a fresh one.
const RETRYABLE = new Set([
    'PROTOCOL_CONNECTION_LOST',
    'ECONNRESET',
    'ETIMEDOUT',
    'EPIPE',
    'ECONNREFUSED',
    'PROTOCOL_SEQUENCE_TIMEOUT',
    'ER_CON_COUNT_ERROR',
]);

const isRetryable = (err) =>
    err && (RETRYABLE.has(err.code) || err.fatal === true);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wrap query/execute so a dead-socket error after a cold start retries a couple
// of times with a short backoff instead of surfacing as "Server error".
const withRetry = (method) => async (...args) => {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            return await promisePool[method](...args);
        } catch (err) {
            lastErr = err;
            if (!isRetryable(err)) throw err;
            console.warn(`DB ${method} transient error (${err.code}); retry ${attempt + 1}/2`);
            await sleep(300 * (attempt + 1));
        }
    }
    throw lastErr;
};

// Export a thin facade that keeps the same API the controllers already use
// (db.query / db.execute return [rows, fields]; db.getConnection for transactions).
module.exports = {
    query: withRetry('query'),
    execute: withRetry('execute'),
    getConnection: (...args) => promisePool.getConnection(...args),
    pool: promisePool,
};
