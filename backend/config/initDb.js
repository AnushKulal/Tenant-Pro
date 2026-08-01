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
        const [rows] = await conn.query(
            `SELECT COUNT(*) AS c FROM information_schema.tables
             WHERE table_schema = ? AND table_name = 'owners'`,
            [process.env.DB_NAME]
        );

        if (rows[0].c > 0) {
            console.log('🗄️  Database tables already exist — skipping schema init.');
            return;
        }

        console.log('🗄️  No tables found — creating schema from schema.sql...');
        const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
        await conn.query(sql);
        console.log('✅ Database schema created successfully!');
    } finally {
        await conn.end();
    }
};

module.exports = initDb;
