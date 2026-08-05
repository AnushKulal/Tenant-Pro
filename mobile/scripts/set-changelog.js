#!/usr/bin/env node
/**
 * File: mobile/scripts/set-changelog.js
 *
 * Writes the REAL changelog of the patch being published into app.json, so the
 * in-app "Update available" sheet describes what actually changed instead of a
 * hand-maintained string that goes stale.
 *
 * It reads commit subjects from git, turns them into short user-facing bullets,
 * and stores them at expo.extra.releaseNotes (array). That config is embedded in
 * the EAS Update manifest, so the app reads the notes for the INCOMING version.
 *
 * Usage:
 *   node scripts/set-changelog.js                  # commits since the last publish tag
 *   node scripts/set-changelog.js <gitRange>       # explicit range, e.g. abc123..HEAD
 *   node scripts/set-changelog.js --message "..."  # override with one literal note
 *
 * Run from the mobile/ directory (or anywhere — paths resolve off __dirname).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const APP_JSON = path.resolve(__dirname, '..', 'app.json');
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const MAX_NOTES = 6;

const git = (cmd) => {
    try {
        return execSync(`git ${cmd}`, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
            .toString()
            .trim();
    } catch (e) {
        return '';
    }
};

// Commit subjects that describe plumbing rather than user-visible change.
const NOISE = /^(chore|ci|build|docs|test|refactor|style|merge|revert|bump|wip)\b/i;
const NOISE_PHRASES = [
    /co-authored-by/i,
    /claude-session/i,
    /generated with/i,
    /^merge (branch|pull request|remote)/i,
    /^update readme/i
];

/** Turn a raw commit subject into a short, user-facing bullet. */
function humanize(subject) {
    let s = subject.trim();

    // Drop a conventional-commit prefix ("feat(login): x" → "x").
    s = s.replace(/^[a-z]+(\([^)]*\))?!?:\s*/i, '');

    // Cut trailing issue refs and PR numbers.
    s = s.replace(/\s*\(#\d+\)\s*$/, '').replace(/\s*#\d+\s*$/, '');

    // Collapse an arrow-style summary to its outcome ("fix X -> use Y" → "use Y").
    s = s.replace(/\s*-+>\s*/g, ' — ');

    s = s.replace(/\s+/g, ' ').trim();
    if (!s) return '';

    // Sentence case, preserving obvious acronyms/product names.
    if (!/^[A-Z0-9]{2,}/.test(s)) {
        s = s.charAt(0).toUpperCase() + s.slice(1);
    }

    // Keep bullets tight enough to read in a sheet.
    if (s.length > 96) s = s.slice(0, 93).trimEnd() + '…';
    return s;
}

function collectNotes(range) {
    // Prefer an explicit range; otherwise commits since the last publish tag;
    // otherwise the most recent commits that touched the mobile app.
    let raw = '';

    if (range) {
        raw = git(`log --no-merges --pretty=format:%s ${range} -- mobile`);
    }

    if (!raw) {
        const lastTag = git('describe --tags --abbrev=0 --match "ota-*"');
        if (lastTag) {
            raw = git(`log --no-merges --pretty=format:%s ${lastTag}..HEAD -- mobile`);
        }
    }

    if (!raw) {
        raw = git('log --no-merges --pretty=format:%s -n 12 -- mobile');
    }

    const seen = new Set();
    const notes = [];

    for (const line of raw.split('\n')) {
        const subject = line.trim();
        if (!subject) continue;
        if (NOISE.test(subject)) continue;
        if (NOISE_PHRASES.some((re) => re.test(subject))) continue;

        const bullet = humanize(subject);
        if (!bullet) continue;

        const key = bullet.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        notes.push(bullet);

        if (notes.length >= MAX_NOTES) break;
    }

    return notes;
}

function main() {
    const args = process.argv.slice(2);
    let notes;

    const msgIndex = args.indexOf('--message');
    if (msgIndex !== -1 && args[msgIndex + 1]) {
        notes = args[msgIndex + 1]
            .split('\n')
            .map((l) => humanize(l))
            .filter(Boolean)
            .slice(0, MAX_NOTES);
    } else {
        notes = collectNotes(args.find((a) => !a.startsWith('--')));
    }

    // Never ship an empty sheet — a generic line is better than a blank panel.
    if (!notes.length) {
        notes = ['Performance and stability improvements'];
    }

    const config = JSON.parse(fs.readFileSync(APP_JSON, 'utf8'));
    config.expo = config.expo || {};
    config.expo.extra = config.expo.extra || {};

    config.expo.extra.releaseNotes = notes;
    // Kept for older installed builds that still read the string form.
    config.expo.extra.whatsNew = notes.join('\n');
    config.expo.extra.releaseVersion = config.expo.version || null;

    fs.writeFileSync(APP_JSON, JSON.stringify(config, null, 2) + '\n');

    console.log(`Changelog written to app.json (${notes.length} note(s)):`);
    notes.forEach((n) => console.log('  • ' + n));
}

main();
