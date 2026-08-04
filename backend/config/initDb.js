// Auto-creates the database schema on first boot.
//
// On startup we check whether the `owners` table exists. If it doesn't, we run
// schema.sql to create every table. This means a freshly-provisioned cloud
// database (Aiven, etc.) is set up automatically on the first deploy — no need
// to import the SQL manually with any external tool.
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { sslOption } = require('./dbOptions');

const initDb = async () => {
    const ssl = sslOption();
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        multipleStatements: true, // schema.sql contains many statements
        ...(ssl ? { ssl } : {})
    });

    try {
        // schema.sql is fully idempotent (CREATE TABLE IF NOT EXISTS), so we run
        // it every boot. New tables added to schema.sql get created on existing
        // databases automatically, while existing tables are left untouched.
        const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        await conn.query(sql);
        console.log('✅ Database schema is up to date.');
    } finally {
        await conn.end();
    }
};

module.exports = initDb;
