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

// Same problem one level along: schema.sql can widen an enum, but only for
// databases being created from scratch — an existing column keeps its old set of
// values and rejects the new one at INSERT time. MODIFY COLUMN is not idempotent
// in any useful sense (it rewrites the column definition on every boot, and on a
// large table that is a table copy), so the current COLUMN_TYPE is compared first
// and the ALTER is skipped when it already matches. `expectedType` must be spelled
// exactly as MySQL reports it: lowercase `enum(` and single-quoted values, no
// spaces after the commas.
const ensureColumnType = async (conn, table, column, expectedType, definition) => {
    const [rows] = await conn.query(
        `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    // No such column: this helper only widens what exists. Adding it is
    // ensureColumn's job, and schema.sql's job on a fresh database.
    if (rows.length === 0) return false;
    if (String(rows[0].COLUMN_TYPE).toLowerCase() === expectedType.toLowerCase()) return false;
    // Identifiers cannot be parameterised; both are hardcoded call sites below,
    // never user input.
    await conn.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${definition}`);
    console.log(`🔧 Migration: widened ${table}.${column}`);
    return true;
};

// MySQL has no `CREATE INDEX IF NOT EXISTS` either. information_schema.STATISTICS
// lists one row per indexed column, so DISTINCT on the name answers "does this
// index exist" without caring how many columns it spans.
const ensureIndex = async (conn, table, name, columns) => {
    const [rows] = await conn.query(
        `SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [table, name]
    );
    if (rows.length > 0) return false;
    await conn.query(`ALTER TABLE \`${table}\` ADD INDEX \`${name}\` ${columns}`);
    console.log(`🔧 Migration: indexed ${table}.${name}`);
    return true;
};

// Adds a constraint that schema.sql gives fresh databases, so a database created
// before the column existed ends up with the same shape as one created after.
// Leaving the constraint out of one of the two paths is how a bug comes to
// reproduce on one deploy and not another.
//
// A constraint cannot be added if existing rows already violate it, so the orphan
// check runs first and the ALTER is skipped (loudly) rather than crashing the boot:
// a server that will not start is a worse outcome than a missing constraint.
const ensureForeignKey = async (conn, table, name, definition, orphanCheck) => {
    const [rows] = await conn.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
           AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
        [table, name]
    );
    if (rows.length > 0) return false;
    if (orphanCheck) {
        const [bad] = await conn.query(orphanCheck);
        const count = bad[0] ? Number(Object.values(bad[0])[0]) : 0;
        if (count > 0) {
            console.warn(`⚠️  Skipping ${table}.${name}: ${count} row(s) would violate it.`);
            return false;
        }
    }
    await conn.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\` ${definition}`);
    console.log(`🔧 Migration: constrained ${table}.${name}`);
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

        // Maintenance requests gained an optional photo of the problem. The table
        // already exists on every deployed database, so CREATE TABLE IF NOT EXISTS
        // will not add the column — this will.
        await ensureColumn(conn, 'maintenance_requests', 'image_url', 'varchar(500) DEFAULT NULL');

        // maintenance_messages became the request's whole timeline rather than just
        // its chat. Existing rows are all real messages, so the 'message' default
        // backfills them correctly and the two status columns stay NULL for them.
        await ensureColumn(conn, 'maintenance_messages', 'kind', "enum('message','status') NOT NULL DEFAULT 'message'");
        await ensureColumn(conn, 'maintenance_messages', 'status_from', 'varchar(20) DEFAULT NULL');
        await ensureColumn(conn, 'maintenance_messages', 'status_to', 'varchar(20) DEFAULT NULL');
        // ...and its sender_role gained 'system'. Widening an enum never invalidates
        // a stored value, so this is safe on a table with data in it.
        await ensureColumnType(
            conn,
            'maintenance_messages',
            'sender_role',
            "enum('tenant','owner','system')",
            "enum('tenant','owner','system') NOT NULL"
        );

        // A payment used to be an unconditional fact, because only the landlord could
        // enter one. Now a tenant can claim one, so a payment carries the landlord's
        // verdict. Every existing row WAS the landlord's own entry, and the
        // 'Confirmed' default backfills them as exactly that -- which is why the
        // default is Confirmed and not Declared. Getting this backwards would zero
        // out every dashboard total on the deploy that added the column.
        await ensureColumn(conn, 'payments', 'status', "enum('Declared','Confirmed','Rejected') NOT NULL DEFAULT 'Confirmed'");
        await ensureColumn(conn, 'payments', 'declared_by', 'int(11) DEFAULT NULL');
        await ensureColumn(conn, 'payments', 'decided_at', 'timestamp NULL DEFAULT NULL');
        await ensureColumn(conn, 'payments', 'decision_note', 'varchar(300) DEFAULT NULL');
        // The queue of claims waiting on a landlord is read on every dashboard load.
        await ensureIndex(conn, 'payments', 'declared_by', '(`declared_by`)');
        await ensureIndex(conn, 'payments', 'status_tenant', '(`status`, `tenant_id`)');
        await ensureForeignKey(
            conn,
            'payments',
            'payments_ibfk_2',
            'FOREIGN KEY (`declared_by`) REFERENCES `tenant_users` (`id`) ON DELETE SET NULL',
            `SELECT COUNT(*) AS n FROM payments p
              WHERE p.declared_by IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM tenant_users tu WHERE tu.id = p.declared_by)`
        );

        console.log('✅ Database schema is up to date.');
    } finally {
        await conn.end();
    }
};

module.exports = initDb;
