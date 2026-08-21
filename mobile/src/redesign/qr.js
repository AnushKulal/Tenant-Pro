// File: mobile/src/redesign/qr.js
// A QR code, computed here rather than drawn by a library.
//
// ── Why it is written rather than installed ────────────────────────────────────
// The usual answer is react-native-qrcode-svg, which needs react-native-svg — a
// NATIVE module, and one this app does not have compiled in. Adding it would mean a
// new APK and every landlord reinstalling before a single tenant could see a QR.
// That is the same trap that left "Use my current location" doing nothing for two
// days: JavaScript shipped over the air calling into native code that was not there.
//
// A QR code is arithmetic, though. Encode the bytes, add Reed-Solomon parity, lay
// the result on a grid by fixed rules, pick the mask that scores best. None of that
// needs a native module, so this ships as an over-the-air update like everything
// else — the same reasoning as maps.js drawing a map out of <Image>.
//
// ── Scope ─────────────────────────────────────────────────────────────────────
// Byte mode, error-correction levels L and M, versions 1 to 10 (up to 57x57
// modules). A UPI payment URI is around 110-150 ASCII characters, which lands
// comfortably inside that. Numeric and alphanumeric modes would compress a UPI URI
// hardly at all — it is full of ':', '/', '?', '&', '@' and mixed case — so byte
// mode is not a shortcut, it is the correct mode.
//
// Everything here is verified against an independent QR DECODER rather than by eye:
// a code that looks plausible and does not scan is worthless, and "looks right" is
// not a test a human can perform on a Reed-Solomon remainder.

// ── GF(256) ───────────────────────────────────────────────────────────────────
// Reed-Solomon works over a finite field. Multiplication becomes addition of
// logarithms, so both tables are built once from the primitive polynomial QR
// specifies (x^8 + x^4 + x^3 + x^2 + 1 = 0x11D).
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
    let x = 1;
    for (let i = 0; i < 255; i += 1) {
        EXP[i] = x;
        LOG[x] = i;
        x <<= 1;
        if (x & 0x100) x ^= 0x11D;
    }
    // The top half repeats the bottom, so a product's exponent never needs a modulo.
    for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

// The generator polynomial for `n` parity bytes: (x - a^0)(x - a^1)...(x - a^(n-1)).
const generatorPoly = (n) => {
    let poly = [1];
    for (let i = 0; i < n; i += 1) {
        const next = new Array(poly.length + 1).fill(0);
        for (let j = 0; j < poly.length; j += 1) {
            next[j] ^= poly[j];
            next[j + 1] ^= gfMul(poly[j], EXP[i]);
        }
        poly = next;
    }
    return poly;
};

// Polynomial long division; the remainder IS the error-correction block.
const rsParity = (data, ecLen) => {
    const gen = generatorPoly(ecLen);
    const rem = new Array(ecLen).fill(0);
    for (let i = 0; i < data.length; i += 1) {
        const factor = data[i] ^ rem[0];
        rem.shift();
        rem.push(0);
        if (factor !== 0) {
            for (let j = 0; j < ecLen; j += 1) rem[j] ^= gfMul(gen[j + 1], factor);
        }
    }
    return rem;
};

// ── Version tables ────────────────────────────────────────────────────────────
// Total codewords per version, then how those split into blocks per EC level.
// Each entry is [ecCodewordsPerBlock, [[blockCount, dataPerBlock], ...]]. These are
// from the QR specification and are the one part of this file that cannot be derived
// — which is why the test suite checks every row's arithmetic adds up to the total.
const TOTAL = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];

const BLOCKS = {
    L: [null,
        [7, [[1, 19]]], [10, [[1, 34]]], [15, [[1, 55]]], [20, [[1, 80]]], [26, [[1, 108]]],
        [18, [[2, 68]]], [20, [[2, 78]]], [24, [[2, 97]]], [30, [[2, 116]]], [18, [[2, 68], [2, 69]]]],
    M: [null,
        [10, [[1, 16]]], [16, [[1, 28]]], [26, [[1, 44]]], [18, [[2, 32]]], [24, [[2, 43]]],
        [16, [[4, 27]]], [18, [[4, 31]]], [22, [[2, 38], [2, 39]]], [22, [[3, 36], [2, 37]]],
        [26, [[4, 43], [1, 44]]]]
};

// Centres of the alignment patterns. Version 1 has none.
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34],
    [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

const EC_BITS = { L: 1, M: 0, Q: 3, H: 2 };

const dataCapacity = (version, ec) => {
    const [ecLen, groups] = BLOCKS[ec][version];
    let blocks = 0;
    let data = 0;
    groups.forEach(([count, per]) => { blocks += count; data += count * per; });
    return { data, blocks, ecLen };
};

// ── Bit buffer ────────────────────────────────────────────────────────────────
const bits = () => {
    const out = [];
    return {
        push(value, len) {
            for (let i = len - 1; i >= 0; i -= 1) out.push((value >>> i) & 1);
        },
        get length() { return out.length; },
        bytes() {
            const bytes = [];
            for (let i = 0; i < out.length; i += 8) {
                let b = 0;
                for (let j = 0; j < 8; j += 1) b = (b << 1) | (out[i + j] || 0);
                bytes.push(b);
            }
            return bytes;
        }
    };
};

// The string as bytes. UPI URIs are ASCII once encodeURIComponent has run over the
// parts, but a stray multi-byte character must still not corrupt the length count,
// so this encodes UTF-8 properly rather than assuming one char is one byte.
const utf8 = (str) => {
    const out = [];
    for (let i = 0; i < str.length; i += 1) {
        let c = str.codePointAt(i);
        if (c > 0xFFFF) i += 1;
        if (c < 0x80) out.push(c);
        else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
        else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
};

// The smallest version that fits. Byte mode spends 4 bits on the mode and then the
// character count — 8 bits up to version 9, 16 bits from version 10.
const pickVersion = (byteLen, ec) => {
    for (let v = 1; v <= 10; v += 1) {
        const countBits = v < 10 ? 8 : 16;
        const needed = 4 + countBits + byteLen * 8;
        if (needed <= dataCapacity(v, ec).data * 8) return v;
    }
    return null;
};

// ── Encode to codewords ───────────────────────────────────────────────────────
const codewords = (text, version, ec) => {
    const data = utf8(text);
    const { data: capacity, blocks, ecLen } = dataCapacity(version, ec);
    const buf = bits();
    buf.push(0b0100, 4);                          // byte mode
    buf.push(data.length, version < 10 ? 8 : 16); // character count
    data.forEach((b) => buf.push(b, 8));

    // Terminator, then pad to a byte boundary, then the specified alternating pad
    // bytes. Anything else here is a decoder's problem, not a stylistic choice.
    const room = capacity * 8;
    buf.push(0, Math.min(4, room - buf.length));
    while (buf.length % 8 !== 0) buf.push(0, 1);
    const padded = buf.bytes();
    const PADS = [0xEC, 0x11];
    let p = 0;
    while (padded.length < capacity) { padded.push(PADS[p % 2]); p += 1; }

    // Split into blocks, parity each one separately, then INTERLEAVE. Interleaving is
    // what makes a QR survive a smudge: damage that would destroy one block's worth
    // of consecutive bytes is spread across every block instead.
    const groups = BLOCKS[ec][version][1];
    const dataBlocks = [];
    const ecBlocks = [];
    let at = 0;
    groups.forEach(([count, per]) => {
        for (let i = 0; i < count; i += 1) {
            const block = padded.slice(at, at + per);
            at += per;
            dataBlocks.push(block);
            ecBlocks.push(rsParity(block, ecLen));
        }
    });

    const out = [];
    const longest = Math.max(...dataBlocks.map((b) => b.length));
    for (let i = 0; i < longest; i += 1) {
        dataBlocks.forEach((b) => { if (i < b.length) out.push(b[i]); });
    }
    for (let i = 0; i < ecLen; i += 1) {
        ecBlocks.forEach((b) => out.push(b[i]));
    }
    if (blocks !== dataBlocks.length) throw new Error('qr: block table disagrees with itself');
    return out;
};

// ── Matrix ────────────────────────────────────────────────────────────────────
// `null` means "not yet written", which is how the data pass knows which cells are
// free. Function patterns are written first and reserved areas are stamped with a
// placeholder so data skips them.
const buildMatrix = (version) => {
    const size = version * 4 + 17;
    const m = [];
    for (let r = 0; r < size; r += 1) m.push(new Array(size).fill(null));

    const finder = (top, left) => {
        // The 7x7 pattern AND the light separator that rings it. The separator is not
        // decoration: without it a scanner cannot tell where the finder ends. The two
        // must be distinguished by whether the cell is inside the 7x7 at all —
        // testing "is this row or column 0 or 6" alone marks the separator's corners
        // dark, which puts a finder-shaped smear one row below the real one.
        for (let r = -1; r <= 7; r += 1) {
            for (let c = -1; c <= 7; c += 1) {
                const y = top + r;
                const x = left + c;
                if (y < 0 || x < 0 || y >= size || x >= size) continue;
                const inside = r >= 0 && r <= 6 && c >= 0 && c <= 6;
                if (!inside) { m[y][x] = 0; continue; }
                const ring = r === 0 || r === 6 || c === 0 || c === 6;
                const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
                m[y][x] = (ring || core) ? 1 : 0;
            }
        }
    };
    finder(0, 0);
    finder(0, size - 7);
    finder(size - 7, 0);

    // Timing patterns: the alternating row and column that tell a decoder the module
    // pitch.
    for (let i = 8; i < size - 8; i += 1) {
        const v = i % 2 === 0 ? 1 : 0;
        if (m[6][i] === null) m[6][i] = v;
        if (m[i][6] === null) m[i][6] = v;
    }

    // Alignment patterns sit at every combination of these coordinates EXCEPT the
    // three that would land on a finder. The exclusion is those three positions
    // specifically — not "wherever a cell is already written". Two of the centres
    // (6, last) and (last, 6) fall ON the timing pattern, and skipping those because
    // the centre was occupied dropped two whole patterns, leaving 40 modules free
    // that the specification reserves. The symbol then had more room than the data
    // filled and nothing decoded.
    const last = size - 7;
    ALIGN[version].forEach((cy) => {
        ALIGN[version].forEach((cx) => {
            const onFinder = (cy === 6 && cx === 6)
                || (cy === 6 && cx === last)
                || (cy === last && cx === 6);
            if (onFinder) return;
            for (let r = -2; r <= 2; r += 1) {
                for (let c = -2; c <= 2; c += 1) {
                    const ring = Math.abs(r) === 2 || Math.abs(c) === 2;
                    m[cy + r][cx + c] = (ring || (r === 0 && c === 0)) ? 1 : 0;
                }
            }
        });
    });

    // Reserve the format areas and, from version 7, the version areas. 2 is a
    // sentinel meaning "reserved, not data" — overwritten before the matrix is
    // returned to the caller.
    for (let i = 0; i < 9; i += 1) {
        if (m[8][i] === null) m[8][i] = 2;
        if (m[i][8] === null) m[i][8] = 2;
    }
    for (let i = 0; i < 8; i += 1) {
        if (m[8][size - 1 - i] === null) m[8][size - 1 - i] = 2;
        if (m[size - 1 - i][8] === null) m[size - 1 - i][8] = 2;
    }
    m[size - 8][8] = 1; // the always-dark module
    if (version >= 7) {
        for (let i = 0; i < 6; i += 1) {
            for (let j = 0; j < 3; j += 1) {
                if (m[size - 11 + j][i] === null) m[size - 11 + j][i] = 2;
                if (m[i][size - 11 + j] === null) m[i][size - 11 + j] = 2;
            }
        }
    }
    return { m, size };
};

// Data snakes up and down in two-module-wide columns, right to left, skipping the
// timing column and everything already written.
const placeData = (m, size, words) => {
    const bitAt = (i) => (i >> 3 < words.length ? (words[i >> 3] >> (7 - (i & 7))) & 1 : 0);
    let i = 0;
    let upward = true;
    // Right to left in two-module columns. Column 6 is the vertical timing pattern, so
    // the walk steps over it and every pair to its left shifts by one — which is why
    // `right` is reassigned rather than the pair simply being skipped. Getting this
    // wrong leaves the leftmost columns empty and nothing decodes at all.
    for (let right = size - 1; right >= 1; right -= 2) {
        if (right === 6) right = 5;
        for (let step = 0; step < size; step += 1) {
            const y = upward ? size - 1 - step : step;
            for (let d = 0; d < 2; d += 1) {
                const x = right - d;
                if (m[y][x] !== null) continue;
                m[y][x] = bitAt(i);
                i += 1;
            }
        }
        upward = !upward;
    }
};

const MASKS = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];

// The four penalties the specification defines. A decoder does not need these — the
// mask number is written into the format bits — but choosing badly produces large
// same-colour areas and patterns that look like finders, which real scanners
// genuinely struggle with.
const penalty = (grid, size) => {
    let score = 0;

    const run = (get) => {
        for (let a = 0; a < size; a += 1) {
            let len = 1;
            for (let b = 1; b < size; b += 1) {
                if (get(a, b) === get(a, b - 1)) {
                    len += 1;
                } else {
                    if (len >= 5) score += 3 + (len - 5);
                    len = 1;
                }
            }
            if (len >= 5) score += 3 + (len - 5);
        }
    };
    run((r, c) => grid[r][c]);
    run((c, r) => grid[r][c]);

    for (let r = 0; r < size - 1; r += 1) {
        for (let c = 0; c < size - 1; c += 1) {
            const v = grid[r][c];
            if (v === grid[r][c + 1] && v === grid[r + 1][c] && v === grid[r + 1][c + 1]) score += 3;
        }
    }

    // 1:1:3:1:1 with four light modules either side — the finder pattern's signature.
    const FIND = [1, 0, 1, 1, 1, 0, 1];
    const hasAt = (get, a, b) => {
        for (let k = 0; k < 7; k += 1) if (get(a, b + k) !== FIND[k]) return false;
        const before = [b - 4, b - 3, b - 2, b - 1].every((x) => x < 0 || get(a, x) === 0);
        const after = [b + 7, b + 8, b + 9, b + 10].every((x) => x >= size || get(a, x) === 0);
        return before || after;
    };
    for (let a = 0; a < size; a += 1) {
        for (let b = 0; b <= size - 7; b += 1) {
            if (hasAt((y, x) => grid[y][x], a, b)) score += 40;
            if (hasAt((y, x) => grid[x][y], a, b)) score += 40;
        }
    }

    let dark = 0;
    for (let r = 0; r < size; r += 1) for (let c = 0; c < size; c += 1) dark += grid[r][c];
    const pct = (dark * 100) / (size * size);
    score += Math.floor(Math.abs(pct - 50) / 5) * 10;
    return score;
};

// BCH(15,5) for the format bits, BCH(18,6) for the version bits. Both are the
// specification's generators divided out by hand — short enough that a helper would
// only hide which polynomial is which.
const formatBits = (ec, mask) => {
    const data = (EC_BITS[ec] << 3) | mask;
    let v = data << 10;
    while (v.toString(2).length >= 11) v ^= 0x537 << (v.toString(2).length - 11);
    return ((data << 10) | v) ^ 0x5412;
};

const versionBits = (version) => {
    let v = version << 12;
    while (v.toString(2).length >= 13) v ^= 0x1F25 << (v.toString(2).length - 13);
    return (version << 12) | v;
};

const writeFormat = (grid, size, ec, mask) => {
    const f = formatBits(ec, mask);
    // MSB first: bit index 0 is the HIGH bit of the 15. The computed value was right
    // all along — 101101101001011 for level M, mask 3, exactly the specification's
    // table — but writing it out least-significant-first reverses the whole string and
    // a scanner then reads a different EC level and mask than the data was built for.
    const bit = (n) => (f >> (14 - n)) & 1;
    // Copy one: around the top-left finder.
    for (let i = 0; i <= 5; i += 1) grid[8][i] = bit(i);
    grid[8][7] = bit(6);
    grid[8][8] = bit(7);
    grid[7][8] = bit(8);
    for (let i = 9; i <= 14; i += 1) grid[14 - i][8] = bit(i);
    // Copy two: split between the other two finders, so losing a corner is survivable.
    // Seven bits go up column 8 and eight go along row 8 — NOT eight and seven. The
    // extra vertical bit lands exactly on the always-dark module at [size-8][8] and
    // erases it, which no scanner tolerates.
    for (let i = 0; i <= 6; i += 1) grid[size - 1 - i][8] = bit(i);
    for (let i = 7; i <= 14; i += 1) grid[8][size - 15 + i] = bit(i);
};

const writeVersion = (grid, size, version) => {
    if (version < 7) return;
    const v = versionBits(version);
    for (let i = 0; i < 18; i += 1) {
        const b = (v >> i) & 1;
        grid[size - 11 + (i % 3)][Math.floor(i / 3)] = b;
        grid[Math.floor(i / 3)][size - 11 + (i % 3)] = b;
    }
};

// ── The one function callers need ─────────────────────────────────────────────
// Returns { size, modules } where modules[row][col] is 1 for dark. Throws when the
// text will not fit in version 10 at the requested level rather than silently
// producing something unscannable.
export function qrMatrix(text, options = {}) {
    const ec = options.ec === 'L' ? 'L' : 'M';
    const str = String(text == null ? '' : text);
    const version = pickVersion(utf8(str).length, ec);
    if (!version) {
        throw new Error(`qr: ${utf8(str).length} bytes does not fit version 10 at level ${ec}`);
    }

    const words = codewords(str, version, ec);
    const { m, size } = buildMatrix(version);
    const reserved = m.map((row) => row.map((v) => v !== null));
    placeData(m, size, words);

    // Every mask is scored and the best kept. The function patterns and reserved
    // areas are never masked, which is what `reserved` is for.
    let best = null;
    for (let mask = 0; mask < 8; mask += 1) {
        const grid = m.map((row, r) => row.map((v, c) => {
            const base = v === 2 ? 0 : v;
            return (!reserved[r][c] && MASKS[mask](r, c)) ? (base ^ 1) : base;
        }));
        writeFormat(grid, size, ec, mask);
        writeVersion(grid, size, version);
        const score = penalty(grid, size);
        if (!best || score < best.score) best = { score, grid, mask };
    }

    return { size, version, ec, mask: best.mask, modules: best.grid };
}

// ── UPI ───────────────────────────────────────────────────────────────────────
// The URI a UPI app understands, which is the same one openUpiPayment hands to
// Linking — built here too so the QR and the button can never describe different
// payments. `tr` is the reference the landlord matches against their bank statement.
export function upiUri({ payee, name, amount, reference, note }) {
    const parts = [`pa=${encodeURIComponent(String(payee || '').trim())}`];
    if (name) parts.push(`pn=${encodeURIComponent(String(name).trim())}`);
    // Two decimal places: some UPI apps reject an amount they cannot parse as money,
    // and "9000" versus "9000.00" is exactly the kind of difference that fails on one
    // bank's app and works on another.
    if (Number(amount) > 0) parts.push(`am=${Number(amount).toFixed(2)}`);
    parts.push('cu=INR');
    if (reference) parts.push(`tr=${encodeURIComponent(String(reference))}`);
    parts.push(`tn=${encodeURIComponent(String(note || `Rent ${reference || ''}`).trim())}`);
    return `upi://pay?${parts.join('&')}`;
}

export default qrMatrix;
