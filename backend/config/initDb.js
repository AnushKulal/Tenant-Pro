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

// schema.sql only uses CREATE TABLE IF NOT EXISTS, which means a table ADDED to it
// appears on existing databases automatically but a COLUMN added to an existing
// table does not. MySQL 8 has no `ADD COLUMN IF NOT EXISTS`, so this checks
// information_schema first. Idempotent: safe to run on every boot.
const ensureColumn = async (conn, table, column, definition) => {
    const [rows] = await conn.query(
        `SELECT 1 FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    if (rows.length > 0) return false;
    // Identifiers cannot be parameterised; both are hardcoded call sites below,
    // never user input.
    await conn.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    console.log(`🔧 Migration: added ${table}.${column}`);
    return true;
};

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

        // --- Column migrations for databases created before a column existed ---
        // Reset codes are scoped to an account type; databases created before that
        // need the column added rather than the table recreated.
        await ensureColumn(conn, 'password_resets', 'role', "varchar(10) NOT NULL DEFAULT 'owner'");

        console.log('✅ Database schema is up to date.');
    } finally {
        await conn.end();
    }
};

module.exports = initDb;
