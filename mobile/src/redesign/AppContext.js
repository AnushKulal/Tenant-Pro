// AppContext — React port of the prototype's <script type="text/x-dc"> Component
// (TenantPro App.dc.html, lines 1931-2930). Reproduces: the initial `state`,
// the actions (set / go / flash + every inline action closure), and renderVals()
// as a pure deriveVm(state, api).
//
// COLOUR RULE: wherever the prototype returned 'var(--X)', deriveVm returns the
// TOKEN KEY 'X' (a plain string). Screens resolve it with useT()[key].
// The live theme (mode / accent / surface / edges) is owned by ThemeContext, so
// the source's colour-resolution block (ACCENTS/SURFACES/EDGES/vars) is dropped.

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState
} from 'react';
import {
  PRIORITY, MOVE_IN, MONTH_LABELS, creditOf, SEED
} from './data';
import {
  auth as apiAuth, owner as apiOwner, properties as apiProps,
  units as apiUnits, tenants as apiTenants, setToken
} from './api';
import { mapOwnerData } from './mapping';
import { loadSession, saveOwnerSession, saveTenantSession, clearSession } from './session';

// Indian-grouped rupee magnitude (e.g. 1234567 -> "12,34,567") WITHOUT
// Number.prototype.toLocaleString('en-IN'): that relies on Intl, which the
// native JS engine (Hermes) implements differently than a browser and can throw
// or mis-format. Callers add the ₹ glyph and any sign, exactly as before.
// Accept either a raw string (RN TextInput onChangeText) or a DOM-ish event
// ({target:{value}}), matching how the prototype's setQ/setPq were called.
// Pull a human-readable message out of an axios error, preferring the API's own
// { message } body over the generic network text.
const errText = (e, fallback) =>
  (e && e.response && e.response.data && (e.response.data.message || e.response.data.error))
  || (e && e.message === 'Network Error' ? 'Cannot reach the server. Check your connection.' : null)
  || fallback;

const evStr = (e) => (e && e.target && typeof e.target.value === 'string' ? e.target.value : (typeof e === 'string' ? e : ''));

const inr = (n) => {
  const s = String(Math.round(Math.abs(Number(n) || 0)));
  if (s.length <= 3) return s;
  return s.slice(0, -3).replace(/\B(?=(\d\d)+$)/g, ',') + ',' + s.slice(-3);
};

// ── Initial state (ported verbatim from Component.state) ──
const INITIAL_STATE = {
  route: 'boot', overlay: null, filter: 'all', who: 'amit', method: 'UPI', toast: '',
  theme: null, pref: 'dark', q: '', pq: '', place: 'sunrise', ticket: 1, tstatus: {},
  roster: {}, gone: [], mover: null, invite: 'sunrise', jq: '', rents: {}, draft: 0,
  idmode: 'email', adult: true, jfilter: 'all', paymethod: 'gpay', paid: false,
  unit: '101', fx: '0',
  scope: { home: 'all', units: 'all', people: 'all' },

  // ── Auth / session (Phase 2) ──
  // `route: 'boot'` holds the app on an ink field while the stored session is
  // resolved; resolveSession() then routes to home (owner), portal (tenant) or
  // role (signed out). Login/register form values live here so the screens stay
  // presentational and bind to vm keys like every other field.
  session: null,          // { role:'owner'|'tenant', token, user }
  authId: '',             // email or phone
  authPw: '',
  authName: '',           // register only
  authPhone: '',          // register only
  authBusy: false,
  authError: '',
  signupRole: 'owner',  // which login screen 'Create account' was tapped from

  // ── Data (Phase 3) ──
  // Starts as the seed so the very first paint is never empty; replaced by the
  // mapped live payload once loadOwnerData() returns. `live` says which one it is.
  data: SEED,
  live: false,
  dataLoading: false,
  dataError: '',
  refreshing: false
};

// ── deriveVm: pure translation of renderVals(). `api` carries the state mutators
//    (setState / set / go / flash) and the fx timer ref. ──
function deriveVm(s, api) {
  const { setState, set, go, flash, fxRef } = api;

  // ── Data source (Phase 3) ─────────────────────────────────────────────────
  // Everything below reads its collections from state.data, which is EITHER the
  // seed bundle (demo account / before the first fetch) or the live payload
  // mapped from the backend by mapping.js. deriveVm itself is agnostic.
  const D = s.data || {};
  // A live account can legitimately have zero properties/tenants. deriveVm below
  // dereferences `place` and `who` unconditionally (e.g. place.lon for the map
  // bbox), so fall back to inert objects rather than undefined.
  const EMPTY_PLACE = {
    id: null, name: '', loc: '', short: '', img: null, type: '', address: '',
    code: '', policy: '', policyIcon: 'business-outline', lat: 0, lon: 0,
    rating: '', reviews: '', food: '', foodNote: '', amenities: []
  };
  const EMPTY_UNIT = { id: null, no: '', prop: null, type: '', rent: '₹0', cap: 1 };
  const EMPTY_TICKET = {
    id: null, who: null, unit: '', title: '', cat: '', priority: 'Low',
    status: 'Open', age: '', body: '', photos: []
  };
  const EMPTY_TENANT = {
    id: null, name: '', img: null, unit: null, type: '', rent: '₹0', rentFull: '₹0',
    co: '', state: 'paid', days: 0, credit: 0, deposit: '₹0', onTime: 0, late: 0, since: '0 mo'
  };
  const TENANTS = D.tenants || [];
  const PROPS = D.props || [];
  const UNITS = D.units || [];
  const TICKETS = D.tickets || [];
  const PAYMENTS_SRC = D.payments || [];
  const EXPENSES_SRC = D.expenses || [];
  const live = !!s.live;

  const mode = s.theme || 'dark';
  const dark = mode === 'dark';
  // NOTE: colour resolution (ACCENTS/SURFACES/EDGES/vars) is owned by
  // ThemeContext and intentionally dropped here — the vm carries token keys only.

  const whoBase = TENANTS.find((t) => t.id === s.who) || TENANTS[0] || EMPTY_TENANT;
  const who = {
    ...whoBase,
    rent: s.rents[whoBase.id] ? `₹${inr(s.rents[whoBase.id])}` : whoBase.rent,
    rentFull: s.rents[whoBase.id] ? `₹${inr(s.rents[whoBase.id])}` : whoBase.rentFull
  };
  const credit = creditOf(who);
  const owner = ['home', 'units', 'people', 'tenant', 'ledger', 'settings', 'profile', 'property'].includes(s.route);
  const place = PROPS.find((p) => p.id === s.place) || PROPS[0] || EMPTY_PLACE;
  const d = 0.008;
  const bbox = `${(place.lon - d).toFixed(4)},${(place.lat - d * 0.6).toFixed(4)},${(place.lon + d).toFixed(4)},${(place.lat + d * 0.6).toFixed(4)}`;

  // Each module keeps its OWN property filter.
  const MOD = { home: 'home', units: 'units' };
  const mod = MOD[s.route] || null;
  const curProp = mod ? (s.scope[mod] || 'all') : 'all';
  const setScope = (v) => setState({ scope: { ...s.scope, [mod || 'home']: v }, overlay: null, q: '' });
  const scoped = curProp !== 'all';
  const scopeProp = PROPS.find((p) => p.id === curProp);

  // Live roster: room moves and move-outs override the seeded unit; deleted
  // members leave the system entirely.
  const ROSTER = TENANTS
    .filter((t) => !s.gone.includes(t.id))
    .map((t) => ({
      ...t,
      unit: Object.prototype.hasOwnProperty.call(s.roster, t.id) ? s.roster[t.id] : t.unit,
      rent: s.rents[t.id] ? `₹${inr(s.rents[t.id])}` : t.rent,
      rentFull: s.rents[t.id] ? `₹${inr(s.rents[t.id])}` : t.rentFull
    }));
  const occupantsOf = (no) => ROSTER.filter((t) => t.unit === no);
  const unitList = UNITS.filter((u) => !scoped || u.prop === curProp)
    .map((u) => {
      const occ = occupantsOf(u.no);
      return {
        ...u,
        occ,
        vacant: occ.length === 0,
        late: occ.some((t) => t.state === 'overdue'),
        beds: `${occ.length} / ${u.cap} ${u.cap === 1 ? 'BED' : 'BEDS'}`,
        free: u.cap - occ.length
      };
    });
  const vacantList = unitList.filter((u) => u.vacant);
  const vacantCount = vacantList.length;
  const unitsLine = scoped
    ? `${unitList.length} units in ${scopeProp.name} · ${vacantCount || 'no'} vacant`
    : `${UNITS.length} units across ${PROPS.length} properties · ${vacantCount} vacant`;

  const unitProp = {}; UNITS.forEach((u) => { unitProp[u.no] = u.prop; });
  const propName = (id) => (PROPS.find((p) => p.id === id) || {}).name || '';
  const inScope = ROSTER.filter((t) => !scoped || unitProp[t.unit] === curProp);
  const unassignedList = ROSTER.filter((t) => !t.unit);
  const money = (n) => `₹${inr(n)}`;
  const num = (t) => Number(t.rent.replace(/[^0-9]/g, ''));
  const expectedCalc = inScope.reduce((a, t) => a + num(t), 0);
  const paidList = inScope.filter((t) => t.state === 'paid');
  const collectedCalc = paidList.reduce((a, t) => a + num(t), 0);

  // When the data is live, prefer the backend's own aggregates: rentCollected is
  // SUM(payments) for the month and pendingDues is SUM(rent_share) actually due,
  // which is more accurate than re-deriving them from tenant rows here. Scoped
  // views fall back to the computed figures (the API aggregates portfolio-wide).
  const useStats = live && D.stats && !scoped;
  const collected = useStats ? D.stats.rentCollected : collectedCalc;
  const pending = useStats ? D.stats.pendingDues : (expectedCalc - collectedCalc);
  const expected = useStats ? (collected + pending) : expectedCalc;
  const overdueList = inScope.filter((t) => t.state === 'overdue');
  const pct = expected ? Math.round((collected / expected) * 100) : 0;
  const firstVacant = unitList.find((u) => u.vacant);
  const occupancy = unitList.length
    ? Math.round(((unitList.length - vacantCount) / unitList.length) * 100) : 0;

  const kShort = (n) => (n >= 1000 ? `₹${Math.round(n / 1000)}K` : `₹${n}`);
  // A tenant contributes to a past month only if they had already moved in.
  const seriesCalc = [5, 4, 3, 2, 1, 0].map((back) => (back === 0
    ? collected
    : inScope.filter((t) => parseInt(t.since, 10) >= back).reduce((a, t) => a + num(t), 0)));
  // The backend already groups six months of payments — use that when live.
  const series = (live && D.chartValues && D.chartValues.length)
    ? D.chartValues
    : seriesCalc;
  const monthLabels = (live && D.chartLabels && D.chartLabels.length)
    ? D.chartLabels
    : MONTH_LABELS;
  const peak = Math.max(...series, 1);
  const firstIdx = series.findIndex((v) => v > 0);
  const lastFull = series[4];
  const base = firstIdx >= 0 ? series[firstIdx] : 0;
  const ratio = base ? lastFull / base : 0;
  const trendLabel = !base ? '▲ NEW'
    : ratio >= 1.15 ? `▲ ${ratio.toFixed(1)}× VS ${monthLabels[firstIdx]}`
    : `▲ STEADY ${5 - firstIdx} MO`;

  const statusOf = (t) => s.tstatus[t.id] || t.status;
  const STATUS_FG = { Open: 'fg2', 'In progress': 'amber', Resolved: 'pos' };
  const shownTickets = TICKETS
    .filter((t) => (!scoped || unitProp[t.unit] === curProp) && statusOf(t) !== 'Resolved')
    .sort((a, b) => PRIORITY[a.priority].rank - PRIORITY[b.priority].rank);
  const card = (t) => {
    const p = PRIORITY[t.priority];
    const person = TENANTS.find((x) => x.id === t.who) || {};
    const st = statusOf(t);
    return {
      title: t.title,
      img: person.img,
      who: person.name,
      meta: `UNIT ${t.unit} · ${t.cat} · ${t.age}`,
      priority: t.priority.toUpperCase(),
      fg: p.fg,
      bg: p.bg,
      status: st.toUpperCase(),
      statusFg: STATUS_FG[st],
      read: () => setState({ ticket: t.id, overlay: 'ticket' }),
      start: () => { setState({ tstatus: { ...s.tstatus, [t.id]: 'In progress' } }); flash(`Opened — ${t.title}`); },
      resolve: () => { setState({ tstatus: { ...s.tstatus, [t.id]: 'Resolved' }, overlay: null }); flash(`Resolved — ${t.title}`); },
      started: st !== 'Open',
      notStarted: st === 'Open'
    };
  };
  // The dashboard only ever carries the top of the pile.
  const urgent = shownTickets.filter((t) => t.priority === 'Critical' || t.priority === 'High').slice(0, 3);
  const preview = (urgent.length ? urgent : shownTickets.slice(0, 2)).map(card);
  const counts = ['Critical', 'High', 'Medium', 'Low'].map((k) => ({
    label: k.toUpperCase(),
    n: String(shownTickets.filter((t) => t.priority === k).length),
    fg: PRIORITY[k].fg,
    bg: PRIORITY[k].bg
  })).filter((c) => c.n !== '0');
  const openTicket = TICKETS.find((t) => t.id === s.ticket) || TICKETS[0] || EMPTY_TICKET;
  const openPerson = TENANTS.find((x) => x.id === openTicket.who) || {};

  const PAYMENTS = PAYMENTS_SRC.filter((p) => !scoped || unitProp[p.unit] === curProp);
  const EXPENSES = EXPENSES_SRC.filter((e) => !scoped || e.prop === curProp);

  const nameOf = (id) => (TENANTS.find((t) => t.id === id) || {}).name;
  const imgOf = (id) => (TENANTS.find((t) => t.id === id) || {}).img;
  const toNum = (str) => Number(str.replace(/,/g, ''));
  const inRow = (p) => ({
    name: nameOf(p.who), sub: `UNIT ${p.unit} · ${p.method} · DEMO-REF`,
    amt: `+₹${p.amt}`, date: p.date, fg: 'pos',
    icon: 'arrow-down', iconBg: 'lsoft', iconFg: 'pos'
  });
  const outRow = (e) => ({
    name: e.name, sub: e.sub, amt: `−₹${e.amt}`, date: e.date, fg: 'fg2',
    icon: 'arrow-up', iconBg: 'csoft', iconFg: 'coral'
  });
  const monthIn = (m) => PAYMENTS.filter((p) => p.month === m).reduce((a, p) => a + toNum(p.amt), 0);
  const monthOut = (m) => EXPENSES.filter((e) => e.month === m).reduce((a, e) => a + toNum(e.amt), 0);
  const ledger = [
    { title: 'AUGUST 2026', m: 0 },
    { title: 'JULY 2026', m: 1 }
  ].map((g) => ({
    title: g.title,
    total: `+${money(monthIn(g.m))}`,
    rows: [...PAYMENTS.filter((p) => p.month === g.m).map(inRow), ...EXPENSES.filter((e) => e.month === g.m).map(outRow)]
  })).filter((g) => g.rows.length);

  const pq = s.pq.trim().toLowerCase();
  const pool = s.filter === 'unassigned' ? unassignedList : inScope;
  const filtered = pool.filter((t) => {
    if (pq && !(`${t.name} ${propName(unitProp[t.unit]) || 'unassigned'} ${t.unit || ''} ${t.co}`.toLowerCase().includes(pq))) return false;
    if (s.filter === 'overdue') return t.state === 'overdue' && t.unit;
    if (s.filter === 'paid') return t.state === 'paid' && t.unit;
    return true;
  });
  const mover = ROSTER.find((t) => t.id === s.mover);
  // The tenant portal is the same roster seen from the other side.
  const me = ROSTER.find((t) => t.id === 'rahul') || ROSTER[0] || TENANTS[0] || EMPTY_TENANT;
  const myUnit = UNITS.find((u) => u.no === me.unit);
  const myProp = myUnit ? PROPS.find((p) => p.id === myUnit.prop) : null;
  const jqv = s.jq.trim().toLowerCase();
  const roomTypes = (pid) => UNITS.filter((u) => u.prop === pid).map((u) => u.type).join(' ').toLowerCase();
  const joinMatches = PROPS.filter((p) => {
    const hay = `${p.name} ${p.code} ${p.short} ${p.loc} ${p.policy} ${roomTypes(p.id)}`.toLowerCase();
    if (jqv && !hay.includes(jqv)) return false;
    if (s.jfilter === 'all') return true;
    if (s.jfilter === 'sharing') return roomTypes(p.id).includes('sharing');
    if (s.jfilter === 'single') return roomTypes(p.id).includes('single') || roomTypes(p.id).includes('bhk');
    return p.short.toLowerCase() === s.jfilter;
  });
  const invProp = PROPS.find((p) => p.id === s.invite) || PROPS[0] || EMPTY_PLACE;
  const inviteLink = `https://tenantpro.app/join/${invProp.code}`;

  const q = s.q.trim().toLowerCase();
  const hit = (str) => !q || String(str).toLowerCase().includes(q);
  const groups = [];
  const pRows = PROPS.filter((p) => hit(p.name) || hit(p.short)).map((p) => {
    const on = curProp === p.id;
    return {
      name: p.name, sub: `${p.short.toUpperCase()} · ${UNITS.filter((u) => u.prop === p.id).length} UNITS`,
      icon: 'business', check: on ? 'checkmark-circle' : 'ellipse-outline',
      checkFg: on ? 'accent' : 'line2',
      bg: on ? 'vsoft' : 'ink3', border: on ? 'accent' : 'line',
      go: () => setScope(on ? 'all' : p.id)
    };
  });
  if (!q) {
    pRows.unshift({
      name: 'All properties', sub: `PORTFOLIO · ${UNITS.length} UNITS · ${PROPS.length} PROPERTIES`,
      icon: 'grid', check: scoped ? 'ellipse-outline' : 'checkmark-circle',
      checkFg: scoped ? 'line2' : 'accent',
      bg: scoped ? 'ink3' : 'vsoft', border: scoped ? 'line' : 'accent',
      go: () => setScope('all')
    });
  }
  if (pRows.length) groups.push({ title: 'PROPERTIES', rows: pRows });
  const uRows = UNITS.filter((u) => hit(`unit ${u.no}`) || hit(u.type)).map((u) => ({
    name: `Unit ${u.no}`, sub: `${u.type} · ${u.rent}`, icon: 'grid', check: 'chevron-forward',
    checkFg: 'fg3', bg: 'ink3', border: 'line',
    go: () => setState({ scope: { ...s.scope, units: u.prop }, route: 'units', overlay: null, q: '' })
  }));
  if (uRows.length) groups.push({ title: 'UNITS', rows: uRows });
  const tRows = q ? TENANTS.filter((t) => hit(t.name) || hit(t.co) || hit(t.unit)).map((t) => ({
    name: t.name, sub: `UNIT ${t.unit} · ${t.co.toUpperCase()}`, icon: 'person', check: 'chevron-forward',
    checkFg: 'fg3', bg: 'ink3', border: 'line',
    go: () => setState({ who: t.id, route: 'tenant', overlay: null, q: '' })
  })) : [];
  if (tRows.length) groups.push({ title: 'PEOPLE', rows: tRows });

  return {
    fx: s.fx || '0',
    mode,
    statusDark: dark,
    isRole: s.route === 'role',
    isLogin: s.route === 'login',
    isHome: s.route === 'home',
    isUnits: s.route === 'units',
    isPeople: s.route === 'people',
    isTenant: s.route === 'tenant',
    isLedger: s.route === 'ledger',
    isSettings: s.route === 'settings',
    isPortal: s.route === 'portal',
    isOwner: owner,
    scoped,
    scopeHint: scoped ? scopeProp.name : 'Property, unit or tenant',
    scopeFg: scoped ? 'fg' : 'fg3',
    scopeBorder: scoped ? 'accent' : 'line',
    scopeIconFg: scoped ? 'accent' : 'fg3',
    clearScope: () => setScope('all'),
    unitsLine,
    q: s.q,
    hasQ: !!s.q,
    setQ: (e) => set('q', e && e.target ? e.target.value : e),
    clearQ: () => set('q', ''),
    searchGroups: groups,
    noResults: !groups.length,
    toast: s.toast,
    showSearch: !!mod,
    // Ledger owns its own search and title; People has its own search bar.
    showHeader: owner && s.route !== 'ledger' && s.route !== 'people',
    showBack: !mod,
    backTitle: { property: 'Properties & units', profile: 'My profile', settings: 'Settings', tenant: 'People' }[s.route] || '',
    goBack: () => go({ property: 'units', profile: 'settings', settings: 'home', tenant: 'people' }[s.route] || 'home'),
    addProperty: () => flash('Add property — not wired in this prototype'),
    addUnit: () => flash('Add unit — not wired in this prototype'),

    goRole: () => go('role'),
    goLogin: () => go('login'),
    goHome: () => go('home'),
    goUnits: () => go('units'),
    goPeople: () => { setState({ filter: 'all' }); go('people'); },
    goPeopleOverdue: () => { setState({ filter: 'overdue' }); go('people'); },
    goLedger: () => go('ledger'),
    goSettings: () => go('settings'),
    goProfile: () => go('profile'),
    goPortal: () => go('portal'),
    goTenantLogin: () => go('tlogin'),
    isTenantLogin: s.route === 'tlogin',
    tenantIdModes: [['EMAIL', 'email'], ['MOBILE', 'mobile']].map(([label, k]) => {
      const on = s.idmode === k;
      return {
        label,
        bg: on ? 'fg' : 'ink2',
        fg: on ? 'ink' : 'fg2',
        bd: on ? 'fg' : 'line',
        go: () => set('idmode', k)
      };
    }),
    tenantIdLabel: s.idmode === 'mobile' ? 'MOBILE NUMBER' : 'EMAIL',
    tenantIdValue: s.authId,
    // Both endpoints must be the SAME computed type or the transition never starts.
    idThumbX: s.idmode === 'mobile' ? 'calc(50% + 0px)' : 'calc(0% + 4px)',
    setEmailMode: () => set('idmode', 'email'),
    setMobileMode: () => set('idmode', 'mobile'),
    emailFg: s.idmode === 'email' ? 'ink' : 'fg2',
    mobileFg: s.idmode === 'mobile' ? 'ink' : 'fg2',
    socials: [
      { label: 'Google', icon: 'logo-google' },
      { label: 'Facebook', icon: 'logo-facebook' },
      { label: 'X', icon: 'logo-twitter' }
    ].map((x) => ({ ...x, go: () => flash(`${x.label} sign-in — not wired in this prototype`) })),

    // ── Auth form + submission (Phase 2) ──────────────────────────────────────
    // The login/register screens bind these instead of showing placeholder text.
    // setAuthId/setAuthPw accept a raw string (TextInput onChangeText) or an
    // event, matching the setQ/setPq convention already used by the search fields.
    authId: s.authId,
    authPw: s.authPw,
    authName: s.authName,
    authPhone: s.authPhone,
    authBusy: s.authBusy,
    authError: s.authError,
    hasAuthError: !!s.authError,
    setAuthId: (e) => set('authId', evStr(e)),
    setAuthPw: (e) => set('authPw', evStr(e)),
    setAuthName: (e) => set('authName', evStr(e)),
    setAuthPhone: (e) => set('authPhone', evStr(e)),
    // Signs in against the real backend; picks the owner or tenant endpoint from
    // the current route so one action serves both login screens.
    submitLogin: () => api.signIn(s.route === 'tlogin' ? 'tenant' : 'owner'),
    signInLabel: s.authBusy ? 'Signing in…' : 'Sign in',
    isBooting: s.route === 'boot',
    session: s.session,
    signedIn: !!s.session,

    // ── Data fetch state (Phase 3) ────────────────────────────────────────────
    // Screens use these for the first-load spinner, the error banner and
    // pull-to-refresh. `live` distinguishes real data from the seed/demo bundle.
    live,
    dataLoading: s.dataLoading,
    dataError: s.dataError,
    hasDataError: !!s.dataError,
    refreshing: s.refreshing,
    refresh: () => api.loadOwnerData({ refresh: true }),
    retryLoad: () => api.loadOwnerData(),
    // True when the account is real but genuinely has nothing yet — the cue for
    // an onboarding empty state rather than a spinner.
    isEmptyAccount: live && !s.dataLoading && (PROPS.length === 0 && TENANTS.length === 0),
    ownerName: (s.session && s.session.user && s.session.user.name) || '',
    ownerEmail: (s.session && s.session.user && s.session.user.email) || '',

    goSignup: () => setState({ signupRole: s.route === 'tlogin' ? 'tenant' : 'owner', route: 'signup', overlay: null }),
    isSignup: s.route === 'signup',
    adult: s.adult,
    minor: !s.adult,
    ageOptions: [['18 OR OVER', true], ['UNDER 18', false]].map(([label, v]) => {
      const on = s.adult === v;
      return {
        label,
        bg: on ? 'fg' : 'ink3',
        fg: on ? 'ink' : 'fg2',
        bd: on ? 'fg' : 'line',
        go: () => set('adult', v)
      };
    }),
    signupFields: [
      { label: 'FULL NAME', value: 'Rahul Sharma', icon: 'person-outline' },
      { label: 'EMAIL', value: 'rahul@example.com', icon: 'mail-outline' },
      { label: 'MOBILE', value: '+91 98123 45670', icon: 'call-outline' }
    ],
    guardianFields: [
      { label: 'GUARDIAN / WARDEN NAME', value: 'Required', icon: 'person-outline' },
      { label: 'RELATIONSHIP', value: 'Parent · Guardian · Warden', icon: 'people-outline' },
      { label: 'GUARDIAN MOBILE', value: 'Required', icon: 'call-outline' },
      { label: 'CONSENT LETTER', value: 'Upload a signed copy', icon: 'document-attach-outline' }
    ],
    signupCta: s.adult ? 'Create my account' : 'Send for guardian consent',
    signupNote: s.adult
      ? 'You can sign your own agreement and pay rent directly.'
      : 'A guardian or warden must confirm before the tenancy can start. We will text them a consent link.',
    submitSignup: () => api.register(),

    jfilters: [['ALL', 'all'], ['KORAMANGALA', 'koramangala'], ['HSR LAYOUT', 'hsr layout'], ['SHARING', 'sharing'], ['PRIVATE', 'single']].map(([label, k]) => {
      const on = s.jfilter === k;
      return {
        label,
        bg: on ? 'fg' : 'ink2',
        fg: on ? 'ink' : 'fg2',
        bd: on ? 'fg' : 'line',
        go: () => set('jfilter', k)
      };
    }),
    leaveProperty: () => {
      setState({ roster: { ...s.roster, rahul: null }, route: 'portal', overlay: null });
      flash('You have left this property');
    },
    noop: () => flash('Not wired in this prototype'),

    openSearch: () => setState({ overlay: 'search', q: '' }),
    openMenu: () => set('overlay', 'menu'),
    openRecord: () => set('overlay', 'record'),
    openPay: () => set('overlay', 'pay'),
    closeOverlay: () => set('overlay', null),
    overlayOpen: !!s.overlay,
    isSearch: s.overlay === 'search',
    isRecord: s.overlay === 'record',
    isPay: s.overlay === 'pay',
    isMenu: s.overlay === 'menu',
    confirmRecord: () => { setState({ overlay: null }); flash(`${who.rentFull} recorded for ${who.name}`); },

    dock: [
      ['OVERVIEW', 'flash-outline', 'home'],
      ['UNITS', 'grid-outline', 'units'],
      ['PEOPLE', 'people-outline', 'people'],
      ['LEDGER', 'swap-vertical-outline', 'ledger']
    ].map(([label, icon, r]) => {
      const on = r === 'people' ? (s.route === 'people' || s.route === 'tenant')
        : r === 'units' ? (s.route === 'units' || s.route === 'property')
        : s.route === r;
      return {
        label, icon,
        h: on ? '68px' : '52px',
        bg: on ? 'lime' : 'ink2',
        fg: on ? 'on' : 'fg2',
        stack: on ? 0 : 1,
        stackY: on ? '68px' : '52px',
        go: () => go(r)
      };
    }),

    todayTitle: scoped ? scopeProp.name : 'Overview',
    collectedStr: money(collected),
    expectedStr: `of ${money(expected)} expected`,
    pendingStr: money(pending),
    pendingSub: overdueList.length ? `OVERDUE · ${overdueList.length} ${overdueList.length === 1 ? 'PERSON' : 'PEOPLE'}` : 'NOTHING OVERDUE',
    pendingBg: overdueList.length ? 'csoft' : 'ink2',
    pendingIconBg: overdueList.length ? 'coral' : 'lsoft',
    pendingIcon: overdueList.length ? 'alert' : 'checkmark',
    pendingIconFg: overdueList.length ? '#fff' : 'pos',
    pendingSubFg: overdueList.length ? 'coral' : 'fg3',
    paidRatio: `${paidList.length} OF ${inScope.length} PAID`,
    pctStr: `${pct}%`,
    barWidth: `${pct}%`,
    occupancyStr: String(occupancy),
    vacantNo: String(vacantCount),
    vacantSub: vacantCount ? `${vacantCount === 1 ? 'ROOM' : 'ROOMS'} VACANT · ${kShort(vacantList.reduce((a, u) => a + Number(u.rent.replace(/[^0-9]/g, '')), 0))}/MO` : 'EVERY ROOM FILLED',
    vacantBg: vacantCount ? 'asoft' : 'ink2',
    vacantIconBg: vacantCount ? 'asoft' : 'lsoft',
    vacantIconFg: vacantCount ? 'amber' : 'pos',
    vacantSubFg: 'fg3',
    openOverdue: () => set('overlay', 'overdue'),
    isOverdueSheet: s.overlay === 'overdue',
    overdueTitle: overdueList.length ? `${overdueList.length} overdue · ${money(pending)}` : 'Nothing overdue',
    overdueScopeLine: scoped ? scopeProp.name : 'Across all properties',
    overdueRows: overdueList.map((t) => ({
      name: t.name, img: t.img, rent: t.rentFull,
      sub: `${propName(unitProp[t.unit]).toUpperCase()} · UNIT ${t.unit}`,
      late: `${t.days} ${t.days === 1 ? 'DAY' : 'DAYS'} LATE`,
      record: () => setState({ who: t.id, overlay: 'record' }),
      remind: () => { setState({ overlay: null }); flash(`Reminder sent to ${t.name}`); },
      open: () => setState({ who: t.id, route: 'tenant', overlay: null })
    })),
    openVacant: () => set('overlay', 'vacant'),
    isVacant: s.overlay === 'vacant',
    vacantTitle: vacantCount ? `${vacantCount} vacant ${vacantCount === 1 ? 'room' : 'rooms'}` : 'No vacant rooms',
    vacantScopeLine: scoped ? scopeProp.name : 'Across all properties',
    vacantRooms: vacantList.map((u) => ({
      no: u.no, type: u.type, rent: `${u.rent}/mo`,
      prop: propName(u.prop),
      go: () => setState({ scope: { ...s.scope, units: u.prop }, route: 'units', overlay: null })
    })),
    paidFaces: paidList.map((t) => t.img),
    bars: series.map((v, i) => {
      const now = i === 5;
      return {
        m: monthLabels[i] || '',
        h: peak ? `${Math.round((v / peak) * 100)}%` : '0%',
        fill: now ? 'lime' : 'line2',
        lab: now ? 'fg' : 'fg3',
        value: now ? kShort(v) : '',
        showValue: now
      };
    }),
    peakLabel: `PEAK ${kShort(peak)}`,
    trendLabel,

    tickets: preview,
    ticketCounts: counts,
    ticketTotal: `${shownTickets.length} OPEN`,
    ticketsEmpty: !shownTickets.length,
    ticketsEmptyLine: scoped ? `No open tickets in ${scopeProp.name}.` : 'No open tickets. Nothing to chase.',
    hasMoreTickets: shownTickets.length > preview.length,
    moreTicketsLabel: `View all ${shownTickets.length} tickets`,
    openAllTickets: () => set('overlay', 'tickets'),
    isTickets: s.overlay === 'tickets',
    allTickets: shownTickets.map(card),
    isTicket: s.overlay === 'ticket',
    ticket: {
      title: openTicket.title,
      who: openPerson.name,
      img: openPerson.img,
      meta: `UNIT ${openTicket.unit} · ${openTicket.cat} · ${openTicket.age}`,
      priority: openTicket.priority.toUpperCase(),
      fg: PRIORITY[openTicket.priority].fg,
      bg: PRIORITY[openTicket.priority].bg,
      status: statusOf(openTicket).toUpperCase(),
      statusFg: STATUS_FG[statusOf(openTicket)],
      body: openTicket.body,
      photos: openTicket.photos,
      hasPhotos: openTicket.photos.length > 0,
      photoCount: `${openTicket.photos.length} ${openTicket.photos.length === 1 ? 'PHOTO' : 'PHOTOS'} ATTACHED`,
      started: statusOf(openTicket) !== 'Open',
      notStarted: statusOf(openTicket) === 'Open',
      start: () => { setState({ tstatus: { ...s.tstatus, [openTicket.id]: 'In progress' } }); flash(`Opened — ${openTicket.title}`); },
      resolve: () => { setState({ tstatus: { ...s.tstatus, [openTicket.id]: 'Resolved' }, overlay: null }); flash(`Resolved — ${openTicket.title}`); },
      call: () => flash(`Calling ${openPerson.name}`)
    },

    recent: PAYMENTS.slice(0, 4).map((p) => ({
      name: nameOf(p.who), img: imgOf(p.who), sub: `UNIT ${p.unit} · ${p.method}`,
      amt: `+₹${p.amt}`, date: p.date
    })),

    properties: PROPS.map((p) => {
      const own = UNITS.filter((u) => u.prop === p.id);
      // Verbatim from the source: raw UNITS items carry no `vacant` field, so
      // `u.vacant` is undefined here (matches the prototype's rendered output).
      const free = own.filter((u) => u.vacant).length;
      return {
        name: p.name, loc: p.loc, img: p.img,
        stat: `${own.length - free} / ${own.length} FULL`,
        pips: own.map((u) => (u.vacant ? 'line2' : 'lime')),
        border: 'line',
        dim: 1,
        badge: p.rating,
        badgeIcon: 'star',
        badgeBg: 'rgba(8,8,10,.62)',
        badgeFg: '#F4F3F7',
        go: () => setState({ place: p.id, route: 'property' })
      };
    }),

    isProperty: s.route === 'property',
    place: {
      name: place.name, img: place.img, type: place.type, address: place.address,
      rating: place.rating, reviews: place.reviews,
      code: place.code, policy: place.policy.toUpperCase(), policyIcon: place.policyIcon,
      invite: () => setState({ invite: place.id, overlay: 'invite' }),
      food: place.food, foodNote: place.foodNote,
      amenities: place.amenities.map(([icon, label]) => ({ icon, label })),
      mapSrc: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${place.lat},${place.lon}`,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`,
      osmUrl: `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=17/${place.lat}/${place.lon}`,
      // Verbatim from the source: `u.vacant` is undefined on raw UNITS items.
      units: UNITS.filter((u) => u.prop === place.id).map((u) => ({
        no: u.no, type: u.type.replace(' · VACANT', ''), rent: u.rent,
        fg: u.vacant ? 'amber' : 'fg2',
        state: u.vacant ? 'VACANT' : 'OCCUPIED'
      })),
      viewUnits: () => setState({ scope: { ...s.scope, units: place.id }, route: 'units' })
    },

    isUnit: s.overlay === 'unit',
    unitSheet: (() => {
      const u = UNITS.find((x) => x.no === s.unit) || UNITS[0] || EMPTY_UNIT;
      const occ = occupantsOf(u.no);
      const free = u.cap - occ.length;
      return {
        no: u.no, type: u.type, rent: u.rent,
        prop: propName(u.prop),
        share: `₹${inr(Math.round(Number(u.rent.replace(/[^0-9]/g, '')) / u.cap))} per bed`,
        beds: `${occ.length} of ${u.cap} ${u.cap === 1 ? 'bed' : 'beds'} taken`,
        bedFg: free ? 'amber' : 'pos',
        hasFree: free > 0,
        isFull: free === 0,
        freeLine: free ? `${free} ${free === 1 ? 'bed' : 'beds'} free` : 'Room is full',
        occupants: occ.map((t) => ({
          name: t.name, img: t.img, rent: t.rent,
          sub: `${t.co.toUpperCase()} · ${t.state === 'overdue' ? `${t.days}D LATE` : `PAID · DUE IN ${t.days}D`}`,
          fg: t.state === 'overdue' ? 'coral' : 'fg3',
          open: () => setState({ who: t.id, route: 'tenant', overlay: null })
        })),
        addExisting: () => set('overlay', 'assign'),
        addNew: () => { setState({ overlay: null }); flash('Add tenant manually — not wired in this prototype'); }
      };
    })(),
    isAssign: s.overlay === 'assign',
    assignBack: () => set('overlay', 'unit'),
    assignEmpty: !unassignedList.length,
    assignList: unassignedList.map((t) => ({
      name: t.name, img: t.img,
      sub: `${t.co.toUpperCase()} · ${t.since} WITH YOU`,
      go: () => {
        setState({ roster: { ...s.roster, [t.id]: s.unit }, overlay: null });
        flash(`${t.name} assigned to Unit ${s.unit}`);
      }
    })),

    units: unitList.map((u) => ({
      no: u.no, rent: u.rent, beds: u.beds,
      open: () => setState({ unit: u.no, overlay: 'unit' }),
      type: u.vacant ? `${u.type} · VACANT` : u.type,
      bg: u.vacant ? 'asoft' : u.late ? 'csoft' : 'ink2',
      fg: 'fg',
      sub: u.vacant ? 'amber' : u.late ? 'coral' : 'fg3',
      dot: u.vacant ? 'amber' : u.late ? 'coral' : 'lime',
      faces: u.occ.map((t) => t.img)
    })),

    peopleLine: `${inScope.length} active ${inScope.length === 1 ? 'tenant' : 'tenants'}${overdueList.length ? ` · ${overdueList.length} need chasing` : ' · all paid up'}`,
    filters: [['ALL', 'all'], ['OVERDUE', 'overdue'], ['PAID', 'paid'], ['UNASSIGNED', 'unassigned']].map(([labelBase, k]) => {
      const on = s.filter === k;
      const n = k === 'all' ? inScope.length
        : k === 'overdue' ? overdueList.length
        : k === 'paid' ? paidList.length
        : unassignedList.length;
      const label = `${labelBase} ${n}`;
      return {
        label,
        bg: on ? 'fg' : 'ink2',
        fg: on ? 'ink' : 'fg2',
        bd: on ? 'fg' : 'line',
        go: () => set('filter', k)
      };
    }),

    pq: s.pq,
    hasPq: !!s.pq,
    setPq: (e) => set('pq', e && e.target ? e.target.value : e),
    clearPq: () => set('pq', ''),
    peopleEmpty: !filtered.length,
    peopleEmptyLine: s.pq ? `No one matches "${s.pq}".` : 'No tenants in this view.',
    people: filtered.map((t) => {
      const free = !t.unit;
      return {
        name: t.name,
        img: t.img,
        rent: free ? '—' : t.rent,
        sub: free ? 'NO ROOM ASSIGNED' : `${propName(unitProp[t.unit]).toUpperCase()} · UNIT ${t.unit}`,
        edge: free ? 'fg3' : t.state === 'overdue' ? 'coral' : 'lime',
        chip: free ? 'UNASSIGNED' : t.state === 'overdue' ? `${t.days}D LATE` : `IN ${t.days}D`,
        chipBg: free ? 'ink3' : t.state === 'overdue' ? 'csoft' : 'lsoft',
        chipFg: free ? 'fg2' : t.state === 'overdue' ? 'coral' : 'pos',
        open: () => setState({ who: t.id, route: 'tenant' })
      };
    }),

    openInvite: () => set('overlay', 'invite'),
    isInvite: s.overlay === 'invite',
    invite: {
      name: invProp.name,
      code: invProp.code,
      policy: invProp.policy,
      link: inviteLink,
      qr: `https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=8&data=${encodeURIComponent(inviteLink)}`,
      options: PROPS.map((p) => {
        const on = p.id === s.invite;
        return {
          name: p.name, code: p.code,
          bg: on ? 'fg' : 'ink3', fg: on ? 'ink' : 'fg2', bd: on ? 'fg' : 'line',
          go: () => set('invite', p.id)
        };
      }),
      share: () => flash('Invite link copied'),
      manual: () => { setState({ overlay: null }); flash('Add manually — not wired in this prototype'); }
    },

    isMove: s.overlay === 'move',
    openMove: () => setState({ mover: s.who, overlay: 'move' }),
    moveName: mover ? mover.name : '',
    moveFrom: mover && mover.unit ? `${propName(unitProp[mover.unit])} · Unit ${mover.unit}` : 'Currently unassigned',
    // Only rooms with a free bed are offered — a full room is not a move target.
    moveTargets: PROPS.map((p) => ({
      name: p.name,
      policy: p.policy,
      rooms: UNITS.filter((u) => u.prop === p.id)
        .filter((u) => occupantsOf(u.no).length < u.cap && !(mover && mover.unit === u.no))
        .map((u) => {
          const free = u.cap - occupantsOf(u.no).length;
          return {
            no: u.no, type: u.type,
            beds: `${free} OF ${u.cap} ${free === 1 ? 'BED' : 'BEDS'} FREE · ${u.rent}`,
            bg: 'ink3',
            bd: 'line',
            fg: 'fg',
            sub: 'pos',
            go: () => {
              setState({ roster: { ...s.roster, [s.mover]: u.no }, overlay: null });
              flash(`${mover.name} moved to ${p.name} · Unit ${u.no}`);
            }
          };
        })
    })).filter((p) => p.rooms.length),
    noMoveTargets: !UNITS.some((u) => occupantsOf(u.no).length < u.cap && !(mover && mover.unit === u.no)),
    moveOut: () => {
      setState({ roster: { ...s.roster, [s.who]: null }, overlay: null });
      flash(`${who.name} moved out — account kept, now unassigned`);
    },
    deleteMember: () => {
      setState({ gone: [...s.gone, s.who], overlay: null, route: 'people' });
      flash(`${who.name}'s account deleted`);
    },
    isRent: s.overlay === 'rent',
    openRent: () => setState({ overlay: 'rent', draft: Number(who.rent.replace(/[^0-9]/g, '')) }),
    rentDraft: `₹${inr(s.draft)}`,
    rentDelta: (() => {
      const rbase = Number(whoBase.rent.replace(/[^0-9]/g, ''));
      const rd = s.draft - rbase;
      return rd === 0 ? 'NO CHANGE' : `${rd > 0 ? '+' : '−'}₹${inr(Math.abs(rd))} VS NOW`;
    })(),
    rentDeltaFg: s.draft === Number(whoBase.rent.replace(/[^0-9]/g, '')) ? 'fg3' : s.draft > Number(whoBase.rent.replace(/[^0-9]/g, '')) ? 'pos' : 'coral',
    rentDown: () => set('draft', Math.max(0, s.draft - 500)),
    rentUp: () => set('draft', s.draft + 500),
    rentSteps: [-2000, -1000, 1000, 2000].map((n) => ({
      label: `${n > 0 ? '+' : '−'}${Math.abs(n) / 1000}K`,
      go: () => set('draft', Math.max(0, s.draft + n))
    })),
    saveRent: () => {
      setState({ rents: { ...s.rents, [s.who]: s.draft }, overlay: null });
      flash(`${who.name}'s rent set to ₹${inr(s.draft)}`);
    },
    isDanger: s.overlay === 'danger',
    openDanger: () => set('overlay', 'danger'),
    addTenant: () => set('overlay', 'invite'),

    who: {
      name: who.name,
      img: who.img,
      rentFull: who.rentFull,
      unitLine: `Unit ${who.unit}`,
      sub: (s.roster[who.id] !== undefined ? s.roster[who.id] : who.unit)
        ? `${propName(unitProp[s.roster[who.id] !== undefined ? s.roster[who.id] : who.unit]).toUpperCase()} · UNIT ${s.roster[who.id] !== undefined ? s.roster[who.id] : who.unit}`
        : 'UNASSIGNED · NO ROOM',
      halo: who.state === 'overdue' ? 'csoft' : 'lsoft',
      tenure: `${parseInt(who.since, 10)} months with you`,
      assigned: !!(s.roster[who.id] !== undefined ? s.roster[who.id] : who.unit),
      unassigned: !(s.roster[who.id] !== undefined ? s.roster[who.id] : who.unit),
      movedIn: who.movedIn || MOVE_IN[who.id] || '',
      stats: [
        { k: 'WITH YOU', v: who.since, fg: 'fg' },
        { k: 'RENT SHARE', v: who.rent, fg: 'fg' },
        { k: 'DEPOSIT', v: who.deposit, fg: 'fg' },
        { k: 'CREDIT', v: credit.label, fg: credit.fg }
      ],
      credit,
      timeline: ['Aug', 'Jul', 'Jun', 'May', 'Apr'].map((m, i) => {
        const missed = who.state === 'overdue' && i === 0;
        return {
          month: `${m} 2026`,
          method: missed ? 'PENDING' : ['UPI', 'CASH', 'UPI', 'BANK', 'UPI'][i],
          amt: missed ? who.rentFull : `+${who.rentFull}`,
          fg: missed ? 'coral' : 'pos',
          dot: missed ? 'coral' : 'lime'
        };
      }),
      docs: [
        { icon: 'card-outline', label: 'AADHAAR' },
        { icon: 'document-text-outline', label: 'AGREEMENT' }
      ]
    },

    methods: ['UPI', 'CASH', 'BANK'].map((m) => {
      const on = s.method === m;
      return {
        label: m,
        bg: on ? 'fg' : 'ink3',
        fg: on ? 'ink' : 'fg2',
        bd: on ? 'fg' : 'line',
        go: () => set('method', m)
      };
    }),

    ledger,
    ledgerScope: scoped ? scopeProp.name.toUpperCase() : 'ALL PROPERTIES',
    netStr: money(monthIn(0) - monthOut(0)),
    inStr: `IN ${money(monthIn(0))}`,
    outStr: `OUT ${money(monthOut(0))}`,

    menuRows: [
      { label: 'My profile', icon: 'person-outline', go: () => go('profile'), fg: 'fg', bg: 'vsoft', ifg: 'accent' },
      { label: 'Settings', icon: 'settings-outline', go: () => go('settings'), fg: 'fg', bg: 'vsoft', ifg: 'accent' },
      { label: 'Payment settings', icon: 'card-outline', go: () => go('settings'), fg: 'fg', bg: 'vsoft', ifg: 'accent' },
      { label: 'Sign out', icon: 'log-out-outline', go: () => set('overlay', 'signout'), fg: 'coral', bg: 'csoft', ifg: 'coral' }
    ],
    isSignOut: s.overlay === 'signout',
    askSignOut: () => set('overlay', 'signout'),
    confirmSignOut: () => api.signOut(),
    isProfile: s.route === 'profile',
    profileFields: [
      { label: 'FULL NAME', value: 'Demo Landlord' },
      { label: 'EMAIL', value: 'demo@gmail.com' },
      { label: 'MOBILE', value: '+91 90000 00000' },
      { label: 'PASSWORD', value: '••••••••••' }
    ],
    themeModes: [['Light', 'light', 'sunny-outline'], ['Dark', 'dark', 'moon-outline'], ['System', 'system', 'phone-portrait-outline']].map(([label, k, icon]) => {
      const on = s.pref === k;
      return {
        label, icon,
        bg: on ? 'fg' : 'ink3',
        fg: on ? 'ink' : 'fg2',
        bd: on ? 'fg' : 'line',
        go: () => {
          const next = k === 'system' ? 'dark' : k;
          if (next === mode) { setState({ pref: k }); return; }
          setState({ fx: '1' });
          clearTimeout(fxRef.current);
          // Let the transition arm on the current colours before swapping them.
          if (typeof requestAnimationFrame === 'function') {
            requestAnimationFrame(() => setState({ pref: k, theme: next }));
          } else {
            setState({ pref: k, theme: next });
          }
          fxRef.current = setTimeout(() => setState({ fx: '0' }), 520);
        }
      };
    }),

    settingsRows: [
      { label: 'Payment settings', icon: 'card-outline', meta: 'UPI' },
      { label: 'Notifications', icon: 'notifications-outline', meta: 'ON' },
      { label: 'Rent reminders', icon: 'alarm-outline', meta: '3 DAYS' },
      { label: 'Documentation', icon: 'book-outline', meta: '' },
      { label: 'Help & support', icon: 'help-buoy-outline', meta: '' },
      { label: 'Terms of service', icon: 'shield-checkmark-outline', meta: '' }
    ],

    isFind: s.route === 'tfind',
    isCheckout: s.route === 'tcheckout',
    goCheckout: () => setState({ route: 'tcheckout', paid: false }),
    payMethods: [
      { id: 'gpay', label: 'Google Pay', sub: 'UPI · rahul@okaxis', icon: 'logo-google' },
      { id: 'phonepe', label: 'PhonePe', sub: 'UPI · 98123 45670', icon: 'phone-portrait-outline' },
      { id: 'upi', label: 'Any UPI app', sub: 'Opens your default app', icon: 'at' },
      { id: 'card', label: 'Card', sub: 'Visa · Mastercard · RuPay', icon: 'card-outline' },
      { id: 'net', label: 'Net banking', sub: 'All major banks', icon: 'business-outline' }
    ].map((m) => {
      const on = s.paymethod === m.id;
      return {
        ...m,
        bg: on ? 'vsoft' : 'ink2',
        bd: on ? 'accent' : 'line',
        check: on ? 'checkmark-circle' : 'ellipse-outline',
        checkFg: on ? 'accent' : 'line2',
        go: () => set('paymethod', m.id)
      };
    }),
    payLabel: `Pay ${me.rentFull}`,
    paid: s.paid,
    unpaid: !s.paid,
    payNow: () => setState({ paid: true }),
    payDone: () => { setState({ route: 'portal', paid: false }); flash(`${me.rentFull} paid — awaiting confirmation`); },
    payBreakdown: [
      { k: 'Rent', v: me.rentFull },
      { k: 'Platform fee', v: '₹0' },
      { k: 'Late fee', v: me.state === 'overdue' ? '₹250' : '₹0' }
    ],
    goFind: () => go('tfind'),
    findLine: me.unit ? 'Scan, enter a code, or search by name or area.' : 'Scan an invite QR, enter a property ID, or search.',
    isHelp: s.route === 'thelp',
    isStay: s.route === 'tstay',
    isTMe: s.route === 'tme',
    tenantSide: ['portal', 'tfind', 'thelp', 'tstay', 'tme', 'tcheckout', 'tsettings'].includes(s.route),
    showTenantDock: ['portal', 'tfind', 'thelp', 'tstay', 'tme', 'tsettings'].includes(s.route),
    goTMe: () => go('tme'),
    goStay: () => go('tstay'),
    tmeOn: s.route === 'tme' ? '1' : '0',
    tmeBg: ['tme', 'tstay', 'tsettings'].includes(s.route) ? 'lime' : 'ink2',
    tmeFg: ['tme', 'tstay', 'tsettings'].includes(s.route) ? 'on' : 'fg2',
    // My place lives inside the profile now, so the ME card also owns it.
    tmeH: ['tme', 'tstay', 'tsettings'].includes(s.route) ? '68px' : '52px',
    backFromStay: () => go('tme'),
    myCredit: creditOf(me),
    myTimeline: ['Aug', 'Jul', 'Jun', 'May', 'Apr'].map((m, i) => {
      const missed = me.state === 'overdue' && i === 0;
      return {
        month: `${m} 2026`,
        method: missed ? 'PENDING' : ['UPI', 'CASH', 'UPI', 'BANK', 'UPI'][i],
        amt: missed ? me.rentFull : `+${me.rentFull}`,
        fg: missed ? 'coral' : 'pos',
        dot: missed ? 'coral' : 'lime'
      };
    }),
    myStats: [
      { k: 'WITH YOU', v: me.since, fg: 'fg' },
      { k: 'RENT SHARE', v: me.rentFull, fg: 'fg' },
      { k: 'DEPOSIT', v: me.deposit, fg: 'fg' },
      { k: 'CREDIT', v: creditOf(me).label, fg: creditOf(me).fg }
    ],
    myDocs: [
      { icon: 'card-outline', label: 'AADHAAR' },
      { icon: 'document-text-outline', label: 'AGREEMENT' }
    ],
    tenantDock: [
      ['HOME', 'home-outline', 'portal'],
      ['FIND', 'search-outline', 'tfind'],
      ['HELP', 'construct-outline', 'thelp']
    ].map(([label, icon, r]) => {
      const on = s.route === r;
      return {
        label, icon,
        h: on ? '68px' : '52px',
        bg: on ? 'lime' : 'ink2',
        fg: on ? 'on' : 'fg2',
        stack: on ? 0 : 1,
        stackY: on ? '68px' : '52px',
        go: () => go(r)
      };
    }),
    myTickets: TICKETS.filter((t) => t.who === 'rahul').map((t) => {
      const st = s.tstatus[t.id] || t.status;
      return {
        title: t.title, meta: `${t.cat} · ${t.age}`,
        priority: t.priority.toUpperCase(),
        fg: PRIORITY[t.priority].fg, bg: PRIORITY[t.priority].bg,
        status: st.toUpperCase(), statusFg: STATUS_FG[st],
        open: () => setState({ ticket: t.id, overlay: 'ticket' })
      };
    }),
    myPayments: PAYMENTS.filter((p) => p.who === 'rahul').map((p) => ({
      amt: `₹${p.amt}`, sub: `${p.method} · ${p.date} 2026`, ref: 'DEMO-REF'
    })),
    roommates: myUnit ? occupantsOf(myUnit.no).filter((t) => t.id !== me.id).map((t) => ({
      name: t.name, img: t.img, co: t.co.toUpperCase()
    })) : [],
    hasRoommates: myUnit ? occupantsOf(myUnit.no).length > 1 : false,
    myAmenities: myProp ? myProp.amenities.map(([icon, label]) => ({ icon, label })) : [],
    myFood: myProp ? myProp.food : '',
    myFoodNote: myProp ? myProp.foodNote : '',
    isTSettings: s.route === 'tsettings',
    goTSettings: () => go('tsettings'),
    payCards: [
      { label: 'Google Pay', sub: 'UPI · rahul@okaxis', icon: 'logo-google', tag: 'DEFAULT' },
      { label: 'HDFC · 4471', sub: 'Visa · expires 08/29', icon: 'card-outline', tag: '' },
      { label: 'PhonePe', sub: 'UPI · 98123 45670', icon: 'phone-portrait-outline', tag: '' }
    ],
    tenantSettingsRows: [
      { label: 'Rent reminders', icon: 'alarm-outline', meta: '3 DAYS' },
      { label: 'Notifications', icon: 'notifications-outline', meta: 'ON' },
      { label: 'Autopay', icon: 'repeat-outline', meta: 'OFF' },
      { label: 'Language', icon: 'globe-outline', meta: 'ENGLISH' },
      { label: 'Help & support', icon: 'help-buoy-outline', meta: '' },
      { label: 'Terms of service', icon: 'shield-checkmark-outline', meta: '' }
    ],
    myInvite: {
      qr: myProp ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=6&data=${encodeURIComponent(`https://tenantpro.app/join/${myProp.code}`)}` : '',
      beds: myProp ? (() => {
        const free = UNITS.filter((u) => u.prop === myProp.id).reduce((a, u) => a + (u.cap - occupantsOf(u.no).length), 0);
        return free ? `${free} ${free === 1 ? 'BED' : 'BEDS'} FREE RIGHT NOW` : 'NO BEDS FREE RIGHT NOW';
      })() : '',
      share: () => flash(`${myProp ? myProp.name : ''} invite copied — QR and code`)
    },
    houseRules: [
      { icon: 'moon-outline', label: 'Quiet hours', v: '11 pm – 7 am' },
      { icon: 'people-outline', label: 'Guests', v: 'Till 9 pm, sign in' },
      { icon: 'calendar-outline', label: 'Notice period', v: '30 days' },
      { icon: 'ban-outline', label: 'Smoking', v: 'Not allowed indoors' }
    ],
    portalLinked: !!me.unit,
    portalUnlinked: !me.unit,
    me: {
      name: me.name.split(' ')[0],
      img: me.img,
      rent: me.rentFull,
      deposit: me.deposit,
      since: me.since,
      movedIn: me.movedIn || MOVE_IN[me.id] || '',
      due: `${me.state === 'overdue' ? 'OVERDUE BY' : 'IN'} ${me.days} DAYS`,
      dueFg: me.state === 'overdue' ? 'coral' : 'on',
      home: myUnit ? `${propName(myUnit.prop)} · Unit ${myUnit.no} · due 30 Aug` : '',
      propName: myUnit ? propName(myUnit.prop) : '',
      propImg: myProp ? myProp.img : '',
      propCode: myProp ? myProp.code : '',
      policy: myProp ? myProp.policy : '',
      policyIcon: myProp ? myProp.policyIcon : 'people',
      address: myProp ? myProp.address : '',
      unitLine: myUnit ? `UNIT ${myUnit.no} · ${myUnit.type}` : ''
    },
    jq: s.jq,
    setJq: (e) => set('jq', e && e.target ? e.target.value : e),
    joinQuery: s.jq.trim(),
    scanQr: () => { set('jq', 'TP-SUN-8412'); flash('QR scanned — Sunrise PG found'); },
    joinResults: joinMatches.map((p) => {
      const free = UNITS.filter((u) => u.prop === p.id).reduce((a, u) => a + (u.cap - occupantsOf(u.no).length), 0);
      const spot = UNITS.find((u) => u.prop === p.id && occupantsOf(u.no).length < u.cap);
      const exact = s.jq.trim().toUpperCase() === p.code;
      return {
        name: p.name, code: p.code, loc: p.loc, img: p.img, policy: p.policy,
        policyIcon: p.policyIcon,
        beds: free ? `${free} ${free === 1 ? 'BED' : 'BEDS'} FREE` : 'NO BEDS FREE',
        bedFg: free ? 'pos' : 'coral',
        cta: exact ? 'Join now' : 'Request to join',
        bd: exact ? 'accent' : 'line',
        join: () => {
          if (!spot) { flash(`${p.name} has no free beds`); return; }
          setState({ roster: { ...s.roster, rahul: spot.no }, jq: '' });
          flash(`Joined ${p.name} · Unit ${spot.no}`);
        }
      };
    }),
    noJoinResults: !joinMatches.length,
    requests: [
      { title: 'Leaking tap in bathroom', sub: 'PLUMBING · 28 JUL', status: 'IN PROGRESS', dot: 'amber' },
      { title: 'Ceiling fan not working', sub: 'ELECTRICAL · 30 JUL', status: 'OPEN', dot: 'fg2' },
      { title: 'Geyser serviced', sub: 'APPLIANCE · 12 JUL', status: 'RESOLVED', dot: 'pos' }
    ]
  };
}

// ── React plumbing ──
const VmContext = createContext(null);
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, setStateRaw] = useState(INITIAL_STATE);
  const toastRef = useRef(null);
  const fxRef = useRef(null);

  // Partial-merge setState, mirroring the prototype's this.setState({ ... }).
  const setState = useCallback((partial) => {
    setStateRaw((prev) => ({ ...prev, ...partial }));
  }, []);

  const set = useCallback((k, v) => { setState({ [k]: v }); }, [setState]);
  const go = useCallback((route) => { setState({ route, overlay: null }); }, [setState]);
  const flash = useCallback((msg) => {
    setState({ toast: msg });
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setState({ toast: '' }), 2200);
  }, [setState]);

  // ── Auth (Phase 2) ─────────────────────────────────────────────────────────
  // These are the only async actions in the context. They own the network call,
  // token persistence and post-login routing; deriveVm just exposes them.
  // `stateRef` lets them read the latest form values without being re-created on
  // every keystroke (which would churn the whole view-model).
  const stateRef = useRef(state);
  stateRef.current = state;

  // Fetch the owner's real data and replace the seed bundle with it. Called after
  // an owner signs in, after restoring an owner session, and by pull-to-refresh.
  // The five endpoints are independent, so they go out together; a partial
  // failure surfaces as an error rather than a half-populated screen.
  const loadOwnerData = useCallback(async ({ refresh = false } = {}) => {
    setState(refresh ? { refreshing: true, dataError: '' } : { dataLoading: true, dataError: '' });
    try {
      const [dashboard, propsRes, unitsRes, tenantsRes, txRes] = await Promise.all([
        apiOwner.dashboard('all'),
        apiProps.list(),
        apiUnits.list('all'),
        apiTenants.list(),
        apiOwner.transactions('all')
      ]);
      const data = mapOwnerData({
        dashboard,
        properties: propsRes.properties,
        units: unitsRes.units,
        tenants: tenantsRes.tenants,
        transactions: txRes.transactions
      });
      setState({
        data,
        live: true,
        dataLoading: false,
        refreshing: false,
        dataError: '',
        // Keep the selected property/tenant valid against the new collections.
        place: (data.props[0] && data.props[0].id) || null,
        who: (data.tenants[0] && data.tenants[0].id) || null
      });
    } catch (e) {
      // Leave whatever data is already on screen in place; just report.
      setState({
        dataLoading: false,
        refreshing: false,
        dataError: errText(e, 'Could not load your data. Pull down to retry.')
      });
    }
  }, [setState]);

  // Restore a stored session on launch and route accordingly.
  const resolveSession = useCallback(async () => {
    try {
      const sess = await loadSession();
      if (sess.role) {
        setToken(sess.token);
        setState({ session: sess, route: sess.role === 'owner' ? 'home' : 'portal' });
        if (sess.role === 'owner') loadOwnerData();
      } else {
        setToken(null);
        setState({ session: null, route: 'role' });
      }
    } catch (e) {
      setToken(null);
      setState({ session: null, route: 'role' });
    }
  }, [setState, loadOwnerData]);

  const signIn = useCallback(async (role) => {
    const { authId, authPw } = stateRef.current;
    if (!authId.trim() || !authPw) {
      setState({ authError: 'Enter your email/phone and password.' });
      return;
    }
    setState({ authBusy: true, authError: '' });
    try {
      const res = role === 'tenant'
        ? await apiAuth.loginTenant(authId.trim(), authPw)
        : await apiAuth.loginOwner(authId.trim(), authPw);
      const user = res.owner || res.tenant || null;
      if (role === 'tenant') await saveTenantSession(res.token, user);
      else await saveOwnerSession(res.token, user);
      setToken(res.token);
      setState({
        session: { role, token: res.token, user },
        authBusy: false, authPw: '', authError: '',
        route: role === 'tenant' ? 'portal' : 'home'
      });
      flash(`Welcome back${user && user.name ? `, ${String(user.name).split(' ')[0]}` : ''}`);
      if (role === 'owner') loadOwnerData();
    } catch (e) {
      setState({ authBusy: false, authError: errText(e, 'Sign in failed. Check your details and try again.') });
    }
  }, [setState, flash, loadOwnerData]);

  const register = useCallback(async () => {
    const { authId, authPw, authName, authPhone, signupRole } = stateRef.current;
    const asTenant = signupRole === 'tenant';
    // The backend requires all four for both owner and tenant registration, and
    // enforces a 6-char minimum password — check here so the user gets a clear
    // message instead of a 400.
    if (!authName.trim() || !authId.trim() || !authPhone.trim() || !authPw) {
      setState({ authError: 'Name, email, mobile and password are all required.' });
      return;
    }
    if (authPw.length < 6) {
      setState({ authError: 'Password must be at least 6 characters.' });
      return;
    }
    setState({ authBusy: true, authError: '' });
    try {
      const payload = { name: authName.trim(), email: authId.trim(), phone: authPhone.trim(), password: authPw };
      const res = asTenant ? await apiAuth.registerTenant(payload) : await apiAuth.registerOwner(payload);
      const user = res.owner || res.tenant || null;
      if (res.token) {
        if (asTenant) await saveTenantSession(res.token, user);
        else await saveOwnerSession(res.token, user);
        setToken(res.token);
        setState({
          session: { role: asTenant ? 'tenant' : 'owner', token: res.token, user },
          authBusy: false, authPw: '', authError: '',
          route: asTenant ? 'portal' : 'home'
        });
        flash('Account created');
      } else {
        // Registered but no token returned — send them to sign in.
        setState({ authBusy: false, authPw: '', route: asTenant ? 'tlogin' : 'login' });
        flash('Account created — please sign in');
      }
    } catch (e) {
      setState({ authBusy: false, authError: errText(e, 'Could not create the account.') });
    }
  }, [setState, flash]);


  const signOut = useCallback(async () => {
    try { await clearSession(); } catch (e) { /* clearing is best-effort */ }
    setToken(null);
    setState({ ...INITIAL_STATE, route: 'role', session: null, data: SEED, live: false, theme: stateRef.current.theme });
  }, [setState]);

  // Resolve the stored session once, on mount.
  useEffect(() => { resolveSession(); }, [resolveSession]);

  const api = useMemo(
    () => ({ setState, set, go, flash, fxRef, signIn, register, signOut, resolveSession, loadOwnerData }),
    [setState, set, go, flash, signIn, register, signOut, resolveSession, loadOwnerData]
  );

  const vm = useMemo(() => deriveVm(state, api), [state, api]);
  const app = useMemo(() => ({ state, set, go, flash, setState }), [state, set, go, flash, setState]);

  return (
    <AppContext.Provider value={app}>
      <VmContext.Provider value={vm}>
        {children}
      </VmContext.Provider>
    </AppContext.Provider>
  );
}

export function useVm() {
  const vm = useContext(VmContext);
  if (!vm) throw new Error('useVm must be used within an AppProvider');
  return vm;
}

export function useApp() {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp must be used within an AppProvider');
  return app;
}

export { deriveVm, INITIAL_STATE };
