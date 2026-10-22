// File: backend/utils/secretBox.js
//
// Encrypting credentials that belong to somebody else.
//
// ── Why this exists ───────────────────────────────────────────────────────────
// A landlord who connects a payment gateway hands us an API secret for THEIR
// merchant account. That is not like a password: we cannot hash it, because we have
// to send the original to the gateway on every charge. It has to be stored in a form
// we can reverse — which means the only question is whether it is readable to anyone
// who gets a copy of the database.
//
// Stored in plain text, one leaked backup is every landlord's gateway account. The
// reset codes in password_resets were plain text for months for the same reason
// ("we have to compare it later"), and that was wrong too.
//
// ── What this is not ──────────────────────────────────────────────────────────
// This is encryption at rest, and it defends against exactly one thing: a copy of the
// database without a copy of the environment. Somebody who has the server has the key
// and can decrypt everything, by design — the application has to. Saying so plainly
// matters, because "encrypted" is often read as "safe from anyone", and it is not.
//
// AES-256-GCM, which authenticates as well as encrypts: a tampered ciphertext fails
// to open rather than decrypting to rubbish that then gets sent to a payment gateway.
const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
// 96 bits is the size GCM is specified for; longer nonces get hashed down and buy
// nothing.
const IV_BYTES = 12;
const TAG_BYTES = 16;

// The key comes from the environment and never from the database — the whole point is
// that the two are separable. A 64-character hex string is exactly 32 bytes.
//
// Generate one with:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
const rawKey = () => String(process.env.CREDENTIALS_KEY || '').trim();

const keyBuffer = () => {
    const k = rawKey();
    if (!k) return null;
    // Hex is the documented form. Anything else is a misconfiguration worth refusing
    // rather than silently deriving a key from, because a weak key that WORKS is the
    // failure nobody notices.
    if (!/^[0-9a-fA-F]{64}$/.test(k)) return null;
    return Buffer.from(k, 'hex');
};

// Whether credentials can be stored at all. Reported by /healthz beside mail and
// uploads, so "why can I not connect a gateway" has an answer that is not a guess.
const secretsReady = () => keyBuffer() !== null;

// Why not, in words, for the health line. Never the key.
const secretsProblem = () => {
    const k = rawKey();
    if (!k) return 'CREDENTIALS_KEY not set';
    if (!/^[0-9a-fA-F]{64}$/.test(k)) return 'CREDENTIALS_KEY must be 64 hex characters (32 bytes)';
    return '';
};

// iv:tag:ciphertext, all hex. One self-describing string so the column is a plain
// varchar and nothing else has to know the shape.
const seal = (plain) => {
    const key = keyBuffer();
    if (!key) throw new Error('CREDENTIALS_KEY is not configured, so credentials cannot be stored.');
    const text = String(plain == null ? '' : plain);
    if (!text) return '';
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGO, key, iv);
    const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
};

// Returns null rather than throwing on anything malformed.
//
// A credential that will not open is a configuration problem — a rotated key, a row
// copied between environments — and the caller's job is then to report "reconnect
// your gateway", not to crash a request a tenant is waiting on. Null is a state the
// callers already have to handle, because a landlord who has not connected one yet
// produces the same thing.
const open = (sealed) => {
    const key = keyBuffer();
    if (!key || !sealed) return null;
    try {
        const parts = String(sealed).split(':');
        if (parts.length !== 3) return null;
        const [ivHex, tagHex, dataHex] = parts;
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;
        const decipher = crypto.createDecipheriv(ALGO, key, iv);
        decipher.setAuthTag(tag);
        // Throws if the tag does not match, which is the authentication doing its job.
        return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
    } catch (e) {
        return null;
    }
};

// The last four characters, for showing a landlord WHICH key is connected without
// handing it back. The same trick the mail health line uses on an address: enough to
// recognise, not enough to use.
const hint = (plain) => {
    const s = String(plain || '');
    if (s.length < 4) return '';
    return `••••${s.slice(-4)}`;
};

module.exports = { seal, open, hint, secretsReady, secretsProblem };
