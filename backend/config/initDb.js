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

// Relaxes a NOT NULL column to accept NULL. Neither ensureColumn (the column
// exists) nor ensureColumnType (it compares COLUMN_TYPE, which does not carry
// nullability) can do this, so the check reads IS_NULLABLE directly.
//
// Only ever used to LOOSEN a column. Tightening one would fail on any table that
// already holds a NULL, and would want a data migration first rather than a boot
// step. `definition` must therefore spell the column out without NOT NULL.
const ensureNullable = async (conn, table, column, definition) => {
    const [rows] = await conn.query(
        `SELECT IS_NULLABLE FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, column]
    );
    if (rows.length === 0) return false;
    if (String(rows[0].IS_NULLABLE).toUpperCase() === 'YES') return false;
    await conn.query(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${definition}`);
    console.log(`🔧 Migration: ${table}.${column} now accepts NULL`);
    return true;
};

// Same idea as ensureIndex, for a UNIQUE index. Kept separate because the ALTER
// differs and because a UNIQUE index can FAIL on existing data — duplicates make
// it impossible — so this reports rather than crashing the boot.
const ensureUniqueIndex = async (conn, table, name, columns) => {
    const [rows] = await conn.query(
        `SELECT DISTINCT INDEX_NAME FROM information_schema.STATISTICS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [table, name]
    );
    if (rows.length > 0) return false;
    try {
        await conn.query(`ALTER TABLE \`${table}\` ADD UNIQUE INDEX \`${name}\` ${columns}`);
        console.log(`🔧 Migration: unique index ${table}.${name}`);
        return true;
    } catch (e) {
        console.warn(`⚠️  Could not add unique index ${table}.${name}: ${e.message}`);
        return false;
    }
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

        // A payment now records WHO confirmed it, not just that it was confirmed.
        // Existing rows were all confirmed by a landlord (nothing else could), so the
        // 'landlord' default backfills them correctly.
        await ensureColumn(conn, 'payments', 'confirmation_source', "enum('landlord','gateway','bank') NOT NULL DEFAULT 'landlord'");

        // When a guest's access ends. NULL means open-ended, which is every full
        // account and any guest a landlord has not dated — so adding the column
        // changes nothing for anybody already in the table.
        await ensureColumn(conn, 'tenants', 'stay_until', 'date DEFAULT NULL');
        // ...and what the applicant asked for when they raised their hand. NULL on
        // every existing request, which is exactly right: nobody was ever asked.
        await ensureColumn(conn, 'join_requests', 'requested_stay_until', 'date DEFAULT NULL');
        // ...and which room they asked for, once the app could show them the rooms.
        // NULL on every existing request, which is correct: nobody was offered a choice.
        await ensureColumn(conn, 'join_requests', 'requested_unit_id', 'int(11) DEFAULT NULL');
        // ...and how the request came about. Every existing row is somebody who typed
        // in a property code, so the 'code' default backfills them correctly and the
        // landlord's inbox reads exactly as it did before.
        await ensureColumn(conn, 'join_requests', 'source', "enum('code','phone_match') NOT NULL DEFAULT 'code'");
        // Which rent a payment settled. NULL on every existing row, which is honest:
        // the information was never recorded, so those payments cannot be scored.
        await ensureColumn(conn, 'payments', 'due_date', 'date DEFAULT NULL');
        await ensureColumn(conn, 'payments', 'gateway_ref', 'varchar(120) DEFAULT NULL');
        await ensureIndex(conn, 'payments', 'gateway_ref', '(`gateway_ref`)');

        // ── Guest accounts ────────────────────────────────────────────────────
        // A guest joins with a phone number and a photograph of a government ID and
        // nothing else, so an account can now exist with no email and no password.
        // Both columns were declared NOT NULL, which made that impossible: the
        // INSERT failed outright. Loosening them is safe in the only direction that
        // matters — every existing row has both, and nothing here is being removed.
        await ensureNullable(conn, 'tenant_users', 'email', 'varchar(100) DEFAULT NULL');
        await ensureNullable(conn, 'tenant_users', 'password_hash', 'varchar(255) DEFAULT NULL');
        // Defaults to 0, which correctly describes every account that predates this:
        // they could only have been created by the full registration form.
        await ensureColumn(conn, 'tenant_users', 'is_guest', 'tinyint(1) NOT NULL DEFAULT 0');
        await ensureColumn(conn, 'tenant_users', 'guest_code', 'varchar(16) DEFAULT NULL');
        // UNIQUE because a guest code is looked up to sign in — two accounts sharing
        // one would be an authentication bug, not a display glitch.
        await ensureUniqueIndex(conn, 'tenant_users', 'guest_code', '(`guest_code`)');

        // Where a property is, as a pin. Null for everything that predates this and
        // for anything the landlord has not pinned yet -- an address is not a
        // coordinate, so there is nothing to backfill and guessing would be worse
        // than an honest blank.
        await ensureColumn(conn, 'properties', 'latitude', 'decimal(10,7) DEFAULT NULL');
        await ensureColumn(conn, 'properties', 'longitude', 'decimal(10,7) DEFAULT NULL');

        // ── Leaving a property ────────────────────────────────────────────────
        // Notice to vacate. Both NULL for a tenant who has given none, which is every
        // row that predates this — nothing to backfill, and guessing a leave date for
        // somebody who never asked to leave would be worse than a blank.
        //
        // The notice lives on `tenants` rather than on `leases` because NOTHING has
        // ever written a leases row: its status enum already contains 'Notice Period',
        // which was designed and never built. Hanging this off a table that is empty in
        // production would make the feature work in theory only.
        await ensureColumn(conn, 'tenants', 'notice_given_on', 'date DEFAULT NULL');
        await ensureColumn(conn, 'tenants', 'leave_on', 'date DEFAULT NULL');

        // ── Google sign-in ────────────────────────────────────────────────────
        // The Google account's `sub`, which is the ONLY stable identifier it has:
        // a person can change the email address on their Google account, and
        // matching on address alone would then either lock them out or, worse,
        // hand their TenantPro account to whoever picks up the freed address.
        // Bound once, on first sign-in, and matched on from then on.
        //
        // UNIQUE, because two accounts carrying one Google identity is an
        // authentication bug: signing in would resolve to whichever row came back
        // first.
        await ensureColumn(conn, 'owners', 'google_sub', 'varchar(64) DEFAULT NULL');
        await ensureColumn(conn, 'tenant_users', 'google_sub', 'varchar(64) DEFAULT NULL');

        // When this tenant last opened their alerts.
        //
        // The alert list itself is DERIVED from data the app already holds — rent due,
        // a pending join, a landlord's reply — so it needs no table of its own. What
        // derivation cannot know is whether the person has SEEN any of it: current
        // state says "your payment was confirmed", it cannot say "and that is news".
        // Without this column an unread dot would either never appear or never clear.
        //
        // NULL means "never opened", which correctly makes everything unread on the
        // first run rather than silently swallowing a tenant's first alerts.
        await ensureColumn(conn, 'tenant_users', 'alerts_seen_at', 'datetime DEFAULT NULL');
        await ensureUniqueIndex(conn, 'owners', 'google_sub', '(`google_sub`)');
        await ensureUniqueIndex(conn, 'tenant_users', 'google_sub', '(`google_sub`)');

        // An account created through Google has no password, so the column can no
        // longer be NOT NULL. Widening a constraint is safe on live data — every
        // existing row has a hash and nothing is being removed. The login paths
        // refuse a NULL hash explicitly rather than passing it to bcrypt, so this
        // does not become "any password works".
        await ensureNullable(conn, 'owners', 'password_hash', 'varchar(255) DEFAULT NULL');

        // The in-flight half of a sign-in. Rows live for ten minutes and are deleted
        // the moment they are used, so this table is normally empty or nearly so.
        //
        // `state` goes to Google and comes back in a browser URL, so it leaks into
        // history and logs. `claim` never leaves the app until it is sent straight
        // here over HTTPS, which is why collecting a session requires the claim and
        // not the state.
        await conn.query(`
            CREATE TABLE IF NOT EXISTS oauth_sessions (
                id int(11) NOT NULL AUTO_INCREMENT,
                state varchar(64) NOT NULL,
                claim varchar(64) NOT NULL,
                role varchar(10) NOT NULL DEFAULT 'owner',
                status enum('pending','ready','profile','failed') NOT NULL DEFAULT 'pending',
                -- The verified identity, written by the callback and read back by
                -- the poll. Kept server-side so /complete never has to trust an
                -- email address supplied by the client.
                identity text DEFAULT NULL,
                detail varchar(300) DEFAULT NULL,
                expires_at datetime NOT NULL,
                created_at timestamp NOT NULL DEFAULT current_timestamp(),
                PRIMARY KEY (id),
                UNIQUE KEY state (state),
                UNIQUE KEY claim (claim),
                KEY expires_at (expires_at)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci
        `);

        console.log('✅ Database schema is up to date.');
    } finally {
        await conn.end();
    }
};

module.exports = initDb;
