// File: backend/utils/guestCode.js
// The randomised ID a guest is known by.
//
// A guest has no name on file and no password. This code is therefore doing two
// jobs at once, and both of them shape the alphabet:
//
//   1. It is their DISPLAY NAME. The landlord sees "Guest 7K2QFH" in their roster
//      and reads it off a screen to talk about them, so it has to be short and
//      unambiguous out loud.
//   2. It is half their CREDENTIAL — with the phone number it is what signs them
//      back in — so it has to be unguessable and typed correctly first time.
//
// Hence the alphabet: no 0/O, no 1/I/L, no U (heard as V), no vowels that could
// spell something unfortunate by accident. 29 symbols over 6 places is about 594
// million codes, which is far too sparse to walk, and every character survives
// being read down a phone line.
const crypto = require('crypto');

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ'.replace(/[AEIOU]/g, '');
const LENGTH = 6;

// randomInt rather than Math.random: this is a credential, and Math.random is
// seeded predictably enough that two guests created in the same millisecond could
// share a code. The rejection-free form (randomInt with a bound) also avoids the
// modulo bias that `% ALPHABET.length` on a random byte would introduce.
const newGuestCode = () => {
    let out = '';
    for (let i = 0; i < LENGTH; i += 1) {
        out += ALPHABET[crypto.randomInt(0, ALPHABET.length)];
    }
    return out;
};

// How the code is shown and spoken. Kept here so the API, the landlord's roster
// and the guest's own screen cannot disagree about it.
const guestDisplayName = (code) => `Guest ${code}`;

// Is this a plausible code? Used before touching the database on a sign-in
// attempt, so a malformed guess costs nothing.
const looksLikeGuestCode = (v) => {
    const s = String(v || '').trim().toUpperCase();
    if (s.length !== LENGTH) return false;
    return s.split('').every((ch) => ALPHABET.includes(ch));
};

module.exports = { newGuestCode, guestDisplayName, looksLikeGuestCode, GUEST_CODE_LENGTH: LENGTH, GUEST_ALPHABET: ALPHABET };
