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
import { Appearance, Linking } from 'react-native';
import {
  PRIORITY, MOVE_IN, MONTH_LABELS, creditOf, SEED
} from './data';
import {
  auth as apiAuth, owner as apiOwner, properties as apiProps,
  units as apiUnits, tenants as apiTenants, portal as apiPortal, payments as apiPayments,
  setToken, mediaUrl
} from './api';
import { mapOwnerData, mapPortalRequest } from './mapping';
import { loadSession, saveOwnerSession, saveTenantSession, clearSession, hasOnboarded, setOnboarded } from './session';

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

  // The QR scanner's manually-typed fallback code.
  scanCode: '',

  // ── Navigation history ──
  // Every route change pushes the route being left, so the phone's back gesture
  // can walk back through wherever the user actually went rather than guessing
  // from a fixed parent map. In memory only: it is where you have been this
  // session, which is not worth persisting across launches.
  history: [],

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
  req: null,            // index of the tenant request opened from Help

  // ── Data (Phase 3) ──
  // Starts as the seed so the very first paint is never empty; replaced by the
  // mapped live payload once loadOwnerData() returns. `live` says which one it is.
  data: SEED,
  live: false,
  dataLoading: false,
  dataError: '',
  refreshing: false,
  // True while an owner write is in flight, so buttons can show they are working
  // and cannot be double-fired.
  writing: false,

  // ── Tenant portal ──
  // The signed-in tenant's own bundle (/tenant-portal/me + /requests), kept apart
  // from `data` because it is a different account's view of the world, not a
  // subset of the landlord's. Null until a tenant signs in.
  tdata: null,

  // ── Maintenance-request conversation ──
  // The thread of whichever request is open, loaded on demand. `id` is what it
  // belongs to, so a stale response for a request the user has already closed can
  // be discarded instead of painted into the wrong sheet.
  thread: { id: null, messages: [], loading: false, error: '', sending: false },
  reply: '', // the draft in the thread's compose box

  // The "raise a request" form. `photo` is an expo-image-picker asset, uploaded as
  // `request_image` when present.
  nr: { category: 'Plumbing', title: '', body: '', priority: 'Medium', photo: null, busy: false, error: '' },

  // The payment-settings form, seeded from the saved values when the sheet opens.
  ps: { upiId: '', upiNumber: '', error: '' },

  // ── Creation forms ──
  // A brand-new landlord starts with nothing, so these three are what make the
  // app usable at all rather than a viewer for data entered elsewhere.
  np: { name: '', type: 'PG', address: '', locality: '', city: '', pincode: '', photo: null, busy: false, error: '' },
  nu: { propertyId: null, number: '', roomType: 'Standard', rent: '', capacity: '1', photo: null, busy: false, error: '' },
  nt: { name: '', phone: '', email: '', company: '', deposit: '', rent: '', unitId: null, photo: null, busy: false, error: '' },

  // ── Password recovery ──
  // Two requests over three panes: 'ask' emails a 6-digit code, 'reset' spends it,
  // 'done' confirms. `role` decides which account table the backend looks in —
  // owners and tenants are separate accounts, so a code issued for one can never
  // reset the other.
  fp: {
    step: 'ask', role: 'owner', id: '', code: '', pw: '', pw2: '',
    busy: false, error: '', sentTo: ''
  }
};

const PROPERTY_TYPES = ['PG', 'Apartment', 'Independent House', 'Hostel'];
const ROOM_TYPES = ['Standard', 'Single', 'Double', 'Triple', 'Studio', '1BHK', '2BHK'];
const BLANK_PROPERTY = { name: '', type: 'PG', address: '', locality: '', city: '', pincode: '', photo: null, busy: false, error: '' };
const BLANK_UNIT = { propertyId: null, number: '', roomType: 'Standard', rent: '', capacity: '1', photo: null, busy: false, error: '' };
const BLANK_TENANT = { name: '', phone: '', email: '', company: '', deposit: '', rent: '', unitId: null, photo: null, busy: false, error: '' };

const BLANK_FP = {
  step: 'ask', role: 'owner', id: '', code: '', pw: '', pw2: '',
  busy: false, error: '', sentTo: ''
};

// Same list v1's tenant portal offers, so a request raised in either UI is filed
// under the same categories.
const REQUEST_CATEGORIES = ['Plumbing', 'Electrical', 'Appliance', 'Cleaning', 'General'];
const REQUEST_PRIORITIES = ['Low', 'Medium', 'High'];
const BLANK_REQUEST = { category: 'Plumbing', title: '', body: '', priority: 'Medium', photo: null, busy: false, error: '' };

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
    co: '', state: 'paid', days: 0, credit: 0, deposit: '₹0', onTime: 0, late: 0, since: '0 mo',
    rentRaw: 0, depositRaw: 0
  };
  const TENANTS = D.tenants || [];
  const PROPS = D.props || [];
  const UNITS = D.units || [];
  const TICKETS = D.tickets || [];
  // The owner's own UPI details (empty until they set them up).
  const PAY = D.pay || { upiId: '', upiNumber: '', qr: null };
  const PAYMENTS_SRC = D.payments || [];
  const EXPENSES_SRC = D.expenses || [];
  const live = !!s.live;
  const u = (s.session && s.session.user) || null;
  // ── Tenant portal's own data ───────────────────────────────────────────────
  // A signed-in tenant reads their tenancy from /tenant-portal/me and their own
  // maintenance requests from /tenant-portal/requests. Until that arrives (or for
  // the seed/demo walk-through) the shapes below stand in.
  const TD = s.tdata || null;
  const TLIVE = !!TD;
  // The landlord on the other end of this tenancy — the person the tenant needs to
  // reach about a request. /tenant-portal/me calls this block `landlord`.
  const LANDLORD = (TD && TD.me && TD.me.landlord) || null;
  // How to actually pay them: the owner's UPI details, joined into the same call.
  const PAYINFO = (TD && TD.me && TD.me.payment) || null;

  // Shape mirrors the tenant-portal /requests payload (category, title,
  // description, priority, status, created_at), mapped by mapping.js when live.
  const REQUESTS = TLIVE
    ? (TD.requests || []).map(mapPortalRequest)
    : (D.requests && D.requests.length) ? D.requests : [
    { title: 'Leaking tap in bathroom', sub: 'PLUMBING · 28 JUL', status: 'IN PROGRESS', dot: 'amber',
      category: 'Plumbing', priority: 'High', raised: '28 Jul 2026',
      body: 'The cold-water tap drips constantly, even when fully closed. It is wasting water and the sound carries at night.' },
    { title: 'Ceiling fan not working', sub: 'ELECTRICAL · 30 JUL', status: 'OPEN', dot: 'fg2',
      category: 'Electrical', priority: 'Medium', raised: '30 Jul 2026',
      body: 'The fan stopped right after a power cut. The regulator clicks but the blades do not move.' },
    { title: 'Geyser serviced', sub: 'APPLIANCE · 12 JUL', status: 'RESOLVED', dot: 'pos',
      category: 'Appliance', priority: 'Low', raised: '12 Jul 2026',
      body: 'The water took much longer to heat than it used to. Descaled and serviced.' }
  ];

  // ── Maintenance-request conversations ──────────────────────────────────────
  // Both sides of a request read the same thread, so the formatting lives once
  // here and the owner's ticket sheet and the tenant's request sheet share it.
  const MSG_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const msgTime = (iso) => {
    const d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '';
    const h = d.getHours();
    const min = String(d.getMinutes()).padStart(2, '0');
    const am = h < 12 ? 'AM' : 'PM';
    return `${d.getDate()} ${MSG_MON[d.getMonth()]} · ${((h + 11) % 12) + 1}:${min} ${am}`;
  };
  const myRole = s.session && s.session.role === 'tenant' ? 'tenant' : 'owner';
  // The thread only belongs to the sheet whose request id it was loaded for — a
  // response that arrives after the user moved on is ignored, not shown.
  const threadOf = (requestId) => {
    const th = s.thread || {};
    const mine = th.id != null && requestId != null && String(th.id) === String(requestId);
    const rows = mine ? (th.messages || []) : [];
    return {
      loading: mine && !!th.loading,
      error: mine ? (th.error || '') : '',
      sending: mine && !!th.sending,
      messages: rows.filter(Boolean).map((m) => {
        const own = m.sender_role === myRole;
        // A status change is an EVENT in the timeline, not somebody talking: it
        // renders as a centred marker rather than a bubble, so "when did this move
        // to In Progress" is answerable by reading down the thread.
        const isEvent = m.kind === 'status';
        return {
          id: m.id,
          body: m.body,
          own,
          event: isEvent,
          // Which way it moved, for the event's own wording.
          from: m.status_from || '',
          to: m.status_to || '',
          eventFg: m.status_to === 'Resolved' ? 'pos' : m.status_to === 'In Progress' ? 'amber' : 'fg2',
          who: m.sender_role === 'owner' ? 'LANDLORD' : m.sender_role === 'system' ? 'TENANTPRO' : 'TENANT',
          time: msgTime(m.created_at),
          bg: own ? 'lsoft' : 'ink3',
          fg: own ? 'fg' : 'fg2',
          align: own ? 'flex-end' : 'flex-start'
        };
      }),
      empty: mine && !th.loading && !th.error && rows.length === 0
    };
  };
  // The compose box. `send` is a no-op while a send is in flight or the box is
  // empty, so a double tap cannot post the same message twice.
  const reply = s.reply || '';
  const composer = {
    value: reply,
    set: (e) => set('reply', e && e.target ? e.target.value : e),
    send: () => api.sendReply(),
    canSend: !!reply.trim() && !(s.thread && s.thread.sending),
    sending: !!(s.thread && s.thread.sending)
  };
  // Opening a request detail: remember which one, then fetch its conversation.
  const openRequest = (index, requestId) => {
    setState({ req: index, overlay: 'request', reply: '' });
    if (requestId != null) api.loadThread(requestId);
  };
  // Place a real call. Falls back to a toast if the device has no dialler (a
  // tablet, the web preview) rather than failing silently.
  // A two-letter stand-in for a missing photo: the initial of the first name and of
  // the last. A single-word name gives its first two letters rather than one lonely
  // character in a big circle.
  const initialsOf = (name) => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // "9000000000" → "+91 90000 00000". Ten digits are assumed Indian; anything else
  // is shown as given rather than reshaped into a format it may not be in.
  const fmtPhone = (p) => {
    const d = String(p || '').replace(/[^0-9]/g, '');
    return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : String(p || '');
  };
  // Copy to the clipboard. Uses RN core's Clipboard — deprecated in favour of
  // expo-clipboard, but that is a native module and adding one cannot reach an
  // already-installed build over the air, whereas this is already compiled in.
  // Reached lazily so the deprecation getter only fires if a copy actually happens.
  const copyText = (text, done) => {
    if (!text) return;
    try {
      // eslint-disable-next-line global-require
      require('react-native').Clipboard.setString(String(text));
      flash(done || 'Copied');
    } catch (e) {
      flash('Could not copy that');
    }
  };
  const callNumber = (phone, label) => {
    const url = `tel:${String(phone).replace(/[^0-9+]/g, '')}`;
    Linking.openURL(url).catch(() => flash(`Could not start a call to ${label}`));
  };

  // The landlord contact, resolved once: from /tenant-portal/me when the tenancy is
  // live, otherwise the seed's demo landlord so the walk-through still shows a
  // person. Both the Help screen's card and every request sheet read this, so they
  // can never name different people.
  const landlordCard = {
    name: (LANDLORD && LANDLORD.name) || 'Demo Landlord',
    phone: (LANDLORD && LANDLORD.phone) || '9000000000',
    phoneLabel: fmtPhone((LANDLORD && LANDLORD.phone) || '9000000000'),
    // /tenant-portal/me does not carry the landlord's photo, so on a real tenancy
    // there is none to show. Return null and let the card fall back to an initial
    // rather than putting a stranger's stock face next to their name.
    img: TLIVE ? null : 'https://randomuser.me/api/portraits/men/32.jpg',
    initials: initialsOf((LANDLORD && LANDLORD.name) || 'Demo Landlord'),
    email: (LANDLORD && LANDLORD.email) || 'demo@gmail.com',
    // Tapping their picture opens their details — it looked tappable and did
    // nothing, which is worse than not looking tappable at all.
    open: () => setState({ overlay: 'landlord' }),
    copyPhone: () => copyText((LANDLORD && LANDLORD.phone) || '9000000000', 'Number copied'),
    copyEmail: () => copyText((LANDLORD && LANDLORD.email) || 'demo@gmail.com', 'Email copied'),
    call: () => {
      const n = (LANDLORD && LANDLORD.phone) || (TLIVE ? '' : '9000000000');
      return n ? callNumber(n, (LANDLORD && LANDLORD.name) || 'your landlord')
        : flash('No number on file for your landlord');
    }
  };


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
  const owner = ['home', 'units', 'people', 'tenant', 'ledger', 'settings', 'profile', 'property', 'support'].includes(s.route);
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
    // A live ticket carries the raiser's own name/photo, so it still reads as
    // coming from a person even if that tenant has since been moved out and no
    // longer appears in the roster.
    const person = TENANTS.find((x) => x.id === t.who) || { name: t.name, img: t.img };
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
      read: () => openTicketSheet(t.id),
      start: () => { api.setRequestStatus(t.id, 'In Progress'); flash(`Opened — ${t.title}`); },
      resolve: () => { api.setRequestStatus(t.id, 'Resolved'); setState({ overlay: null }); flash(`Resolved — ${t.title}`); },
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
  // What actually needs the landlord's attention, built from data already on
  // hand: no new endpoint and no polling. Derived once so the bell's dot and the
  // sheet's contents are the same list.
  const ALERTS = (() => {
      const rows = [];
      const late = inScope.filter((t) => t.state === 'overdue');
      if (late.length) {
        // Worst first — the longest overdue is the one to ring today.
        const worst = late.slice().sort((a, b) => b.days - a.days)[0];
        rows.push({
          icon: 'alert-circle',
          tone: 'coral',
          title: `${late.length} ${late.length === 1 ? 'tenant is' : 'tenants are'} overdue`,
          sub: `${money(late.reduce((a, t) => a + num(t), 0))} outstanding · ${worst.name} is ${worst.days}d late`,
          go: () => setState({ filter: 'overdue', route: 'people', overlay: null })
        });
      }
      const openTickets = shownTickets.length;
      if (openTickets) {
        const urgentCount = shownTickets.filter((x) => x.priority === 'High' || x.priority === 'Critical').length;
        rows.push({
          icon: 'construct',
          tone: urgentCount ? 'amber' : 'fg2',
          title: `${openTickets} open ${openTickets === 1 ? 'ticket' : 'tickets'}`,
          sub: urgentCount ? `${urgentCount} marked high priority` : 'Nothing urgent',
          go: () => setState({ overlay: 'tickets' })
        });
      }
      const unassignedCount = unassignedList.length;
      if (unassignedCount) {
        rows.push({
          icon: 'person',
          tone: 'amber',
          title: `${unassignedCount} ${unassignedCount === 1 ? 'tenant has' : 'tenants have'} no room`,
          sub: 'Assign them a room to start their rent cycle',
          go: () => setState({ filter: 'unassigned', route: 'people', overlay: null })
        });
      }
      if (vacantCount) {
        rows.push({
          icon: 'key',
          tone: 'amber',
          title: `${vacantCount} vacant ${vacantCount === 1 ? 'room' : 'rooms'}`,
          sub: `${kShort(vacantList.reduce((a, u) => a + Number(String(u.rent).replace(/[^0-9]/g, '')), 0))}/mo not being earned`,
          go: () => setState({ overlay: 'vacant' })
        });
      }
      // Without UPI details a tenant literally cannot pay through the app, which
      // is worth saying out loud rather than leaving them to discover it.
      if (live && !PAY.upiId && !PAY.upiNumber) {
        rows.push({
          icon: 'card',
          tone: 'coral',
          title: 'Your tenants cannot pay you yet',
          sub: 'Add your UPI details so rent can be paid in the app',
          go: () => setState({ overlay: 'paysettings', ps: { upiId: '', upiNumber: '', error: '' } })
        });
      }
    return rows;
  })();

  const openTicket = TICKETS.find((t) => t.id === s.ticket) || TICKETS[0] || EMPTY_TICKET;
  const openPerson = TENANTS.find((x) => x.id === openTicket.who)
    || { name: openTicket.name, img: openTicket.img, phone: openTicket.phone };
  // Opening a ticket also pulls its conversation, so the landlord sees the replies
  // already on it rather than an empty box.
  const openTicketSheet = (id) => {
    setState({ ticket: id, overlay: 'ticket', reply: '' });
    if (id != null) api.loadThread(id);
  };
  // Same, but staying on the Help & support screen rather than opening a sheet.
  const selectTicket = (id) => {
    setState({ ticket: id, reply: '' });
    if (id != null) api.loadThread(id);
  };

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
    // A signed-in tenant whose own data has not arrived yet. Without this the
    // portal silently rendered the SEED bundle — a stock landlord photo, invented
    // request dates, and no reply box — which looks like a working app showing
    // someone else's tenancy. Same gate the owner side already had.
    isTenantSession: !!(s.session && s.session.role === 'tenant'),
    tenantDataReady: !!s.tdata,
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
    showHeader: owner && !['ledger', 'people', 'support'].includes(s.route),
    showBack: !mod,
    backTitle: { property: 'Properties & units', profile: 'My profile', settings: 'Settings', tenant: 'People' }[s.route] || '',
    // The header's back chevron walks the same trail the phone's back gesture does,
    // so the two never disagree. The parent map is the fallback for a screen
    // arrived at without a trail (a deep link, or the first screen after login).
    goBack: () => {
      if (api.goBackOneStep()) return;
      go({ property: 'units', profile: 'settings', settings: 'home', tenant: 'people' }[s.route] || 'home');
    },
    canGoBack: (s.history || []).length > 0,
    // Handed to RedesignRoot's hardwareBackPress listener. Returns true when it
    // consumed the press; false lets Android close the app.
    goBackOneStep: () => api.goBackOneStep(),
    // ── Create a property / unit / tenant ─────────────────────────────────────
    // A new landlord lands on an empty app, so these are what make it usable
    // rather than a viewer for data entered somewhere else. Each is a sheet, each
    // validates the fields its endpoint actually requires, and each takes an
    // optional photo.
    addProperty: () => setState({ overlay: 'newproperty', np: { ...BLANK_PROPERTY } }),
    isNewProperty: s.overlay === 'newproperty',
    newProperty: (() => {
      const np = s.np || BLANK_PROPERTY;
      const put = (patch) => setState({ np: { ...np, ...patch, error: '' } });
      return {
        name: np.name, setName: (e) => put({ name: evStr(e) }),
        address: np.address, setAddress: (e) => put({ address: evStr(e) }),
        locality: np.locality, setLocality: (e) => put({ locality: evStr(e) }),
        city: np.city, setCity: (e) => put({ city: evStr(e) }),
        pincode: np.pincode, setPincode: (e) => put({ pincode: evStr(e).replace(/[^0-9]/g, '') }),
        types: PROPERTY_TYPES.map((k) => ({ label: k, on: np.type === k, go: () => put({ type: k }) })),
        photo: np.photo ? np.photo.uri : null,
        hasPhoto: !!np.photo,
        pickPhoto: () => api.pickPhotoFor('np'),
        clearPhoto: () => put({ photo: null }),
        busy: !!np.busy,
        error: np.error || '',
        hasError: !!np.error,
        canSubmit: !!np.name.trim() && !np.busy,
        submit: () => {
          // The columns the table declares NOT NULL, checked here so the failure
          // names the field instead of arriving as a 500.
          if (!np.name.trim()) { setState({ np: { ...np, error: 'Give the property a name.' } }); return; }
          if (!np.city.trim()) { setState({ np: { ...np, error: 'Which city is it in?' } }); return; }
          if (np.pincode && np.pincode.length !== 6) { setState({ np: { ...np, error: 'A pincode is 6 digits.' } }); return; }
          api.createProperty();
        }
      };
    })(),

    // Add a unit. Defaults to whichever property the user is looking at, so the
    // common case needs no choosing.
    addUnit: () => setState({
      overlay: 'newunit',
      nu: { ...BLANK_UNIT, propertyId: (scoped ? curProp : null) || (PROPS[0] && PROPS[0].id) || null }
    }),
    isNewUnit: s.overlay === 'newunit',
    newUnit: (() => {
      const nu = s.nu || BLANK_UNIT;
      const put = (patch) => setState({ nu: { ...nu, ...patch, error: '' } });
      const prop = PROPS.find((p) => p.id === nu.propertyId) || PROPS[0] || null;
      return {
        // Nothing to add a unit to yet — say so instead of offering an empty picker.
        noProperties: PROPS.length === 0,
        properties: PROPS.map((p) => ({
          label: p.name, on: nu.propertyId === p.id, go: () => put({ propertyId: p.id })
        })),
        propertyName: prop ? prop.name : '',
        number: nu.number, setNumber: (e) => put({ number: evStr(e) }),
        roomTypes: ROOM_TYPES.map((k) => ({ label: k, on: nu.roomType === k, go: () => put({ roomType: k }) })),
        rent: nu.rent, setRent: (e) => put({ rent: evStr(e).replace(/[^0-9]/g, '') }),
        capacity: nu.capacity, setCapacity: (e) => put({ capacity: evStr(e).replace(/[^0-9]/g, '') }),
        photo: nu.photo ? nu.photo.uri : null,
        hasPhoto: !!nu.photo,
        pickPhoto: () => api.pickPhotoFor('nu'),
        clearPhoto: () => put({ photo: null }),
        busy: !!nu.busy,
        error: nu.error || '',
        hasError: !!nu.error,
        canSubmit: !!nu.number.trim() && !!nu.propertyId && !nu.busy,
        submit: () => {
          if (!nu.propertyId) { setState({ nu: { ...nu, error: 'Pick which property this room is in.' } }); return; }
          if (!nu.number.trim()) { setState({ nu: { ...nu, error: 'Give the room a number or name.' } }); return; }
          if (!Number(nu.rent)) { setState({ nu: { ...nu, error: 'What is the monthly rent?' } }); return; }
          api.createUnit();
        }
      };
    })(),

    // Add a tenant. The room is optional — a person can be on the books before
    // they have somewhere to sleep, and assigned later.
    openAddTenant: () => setState({ overlay: 'newtenant', nt: { ...BLANK_TENANT } }),
    isNewTenant: s.overlay === 'newtenant',
    newTenant: (() => {
      const nt = s.nt || BLANK_TENANT;
      const put = (patch) => setState({ nt: { ...nt, ...patch, error: '' } });
      // Only rooms with a free bed can take someone new.
      const openRooms = UNITS.filter((u) => occupantsOf(u.no).length < u.cap);
      return {
        name: nt.name, setName: (e) => put({ name: evStr(e) }),
        phone: nt.phone, setPhone: (e) => put({ phone: evStr(e).replace(/[^0-9]/g, '') }),
        email: nt.email, setEmail: (e) => put({ email: evStr(e) }),
        company: nt.company, setCompany: (e) => put({ company: evStr(e) }),
        rent: nt.rent, setRent: (e) => put({ rent: evStr(e).replace(/[^0-9]/g, '') }),
        deposit: nt.deposit, setDeposit: (e) => put({ deposit: evStr(e).replace(/[^0-9]/g, '') }),
        rooms: openRooms.map((u) => ({
          label: `${propName(u.prop)} · ${u.no}`,
          on: nt.unitId === u.id,
          // Tapping the chosen room again clears it, so "no room yet" stays reachable.
          go: () => put({ unitId: nt.unitId === u.id ? null : u.id, rent: nt.rent || String(Number(String(u.rent).replace(/[^0-9]/g, '')) || '') })
        })),
        hasRooms: openRooms.length > 0,
        unassigned: nt.unitId == null,
        photo: nt.photo ? nt.photo.uri : null,
        hasPhoto: !!nt.photo,
        pickPhoto: () => api.pickPhotoFor('nt'),
        clearPhoto: () => put({ photo: null }),
        busy: !!nt.busy,
        error: nt.error || '',
        hasError: !!nt.error,
        canSubmit: !!nt.name.trim() && !!nt.phone.trim() && !nt.busy,
        submit: () => {
          // Name and phone are what the endpoint requires; the phone also has to
          // be unique, which only the server can tell us.
          if (!nt.name.trim()) { setState({ nt: { ...nt, error: 'What is their name?' } }); return; }
          if (nt.phone.trim().length !== 10) { setState({ nt: { ...nt, error: 'A mobile number is 10 digits.' } }); return; }
          api.createTenantRecord();
        }
      };
    })(),

    isOnboarding: s.route === 'onboarding',
    // Marks the intro as seen (persisted) and hands off to the role picker.
    finishOnboarding: () => { setOnboarded(); go('role'); },
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
    retryTenantLoad: () => api.loadTenantData(),
    // True when the account is real but genuinely has nothing yet — the cue for
    // an onboarding empty state rather than a spinner.
    isEmptyAccount: live && !s.dataLoading && (PROPS.length === 0 && TENANTS.length === 0),
    ownerName: (s.session && s.session.user && s.session.user.name) || '',
    ownerEmail: (s.session && s.session.user && s.session.user.email) || '',
    ownerImg: (s.session && s.session.user && s.session.user.profile_pic)
      ? mediaUrl(s.session.user.profile_pic) : null,

    goSignup: () => setState({ signupRole: s.route === 'tlogin' ? 'tenant' : 'owner', route: 'signup', overlay: null }),
    isSignup: s.route === 'signup',

    // ── Password recovery ──
    // Opened from either login screen; the role is taken from whichever one you
    // came from, and the identifier already typed there is carried over.
    goForgot: () => setState({
      route: 'forgot',
      overlay: null,
      fp: { ...BLANK_FP, role: s.route === 'tlogin' ? 'tenant' : 'owner', id: s.authId || '' }
    }),
    isForgot: s.route === 'forgot',
    forgot: (() => {
      const fp = s.fp || BLANK_FP;
      const put = (patch) => setState({ fp: { ...fp, ...patch, error: '' } });
      const isTenant = fp.role === 'tenant';
      return {
        step: fp.step,
        asking: fp.step === 'ask',
        resetting: fp.step === 'reset',
        done: fp.step === 'done',
        // Which account type is being recovered, said out loud — the two are
        // separate accounts and a code for one will not open the other.
        roleLabel: isTenant ? 'TENANT ACCOUNT' : 'LANDLORD ACCOUNT',
        stepLabel: fp.step === 'ask' ? 'STEP 1 OF 2 · YOUR ACCOUNT'
          : fp.step === 'reset' ? 'STEP 2 OF 2 · NEW PASSWORD'
            : 'DONE',
        progress: fp.step === 'ask' ? '50%' : '100%',
        id: fp.id,
        setId: (e) => put({ id: e && e.target ? e.target.value : e }),
        code: fp.code,
        setCode: (e) => put({ code: String(e && e.target ? e.target.value : e).replace(/[^0-9]/g, '') }),
        pw: fp.pw,
        setPw: (e) => put({ pw: e && e.target ? e.target.value : e }),
        pw2: fp.pw2,
        setPw2: (e) => put({ pw2: e && e.target ? e.target.value : e }),
        busy: !!fp.busy,
        error: fp.error || '',
        hasError: !!fp.error,
        // Where the code actually went, masked by the server.
        sentTo: fp.sentTo,
        sentLine: fp.sentTo
          ? `A 6-digit code is on its way to ${fp.sentTo}. It expires in 15 minutes.`
          : 'A 6-digit code is on its way to your registered email. It expires in 15 minutes.',
        send: () => api.requestResetCode(),
        resend: () => api.requestResetCode(),
        save: () => api.submitNewPassword(),
        // Step back to the identifier if the code went to the wrong account.
        editAccount: () => setState({ fp: { ...fp, step: 'ask', error: '', code: '', pw: '', pw2: '' } }),
        backToLogin: () => setState({ route: isTenant ? 'tlogin' : 'login', fp: { ...BLANK_FP }, authPw: '' })
      };
    })(),
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
    // Record a payment for real. `who.rentRaw` is the figure the sheet is showing,
    // so what is confirmed is exactly what is sent.
    confirmRecord: () => {
      setState({ overlay: null });
      api.recordPayment({
        tenantId: who.id, amount: who.rentRaw, method: s.method,
        name: who.name, label: who.rentFull
      });
    },

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
      start: () => { api.setRequestStatus(openTicket.id, 'In Progress'); flash(`Opened — ${openTicket.title}`); },
      resolve: () => { api.setRequestStatus(openTicket.id, 'Resolved'); setState({ overlay: null }); flash(`Resolved — ${openTicket.title}`); },
      // How long this has been waiting. The status says OPEN; the useful question
      // is how long it has said that.
      openFor: openTicket.age ? `OPEN ${openTicket.age}` : 'JUST RAISED',
      // The preview shows the description as raised. Anything longer than a glance
      // belongs in Help & support, along with the replies and the status history.
      preview: String(openTicket.body || '').length > 180
        ? `${String(openTicket.body).slice(0, 180).trimEnd()}…`
        : (openTicket.body || 'No description was added.'),
      isTruncated: String(openTicket.body || '').length > 180,
      readMore: () => setState({ route: 'support', overlay: null, ticket: openTicket.id }),
      // The landlord's half of the conversation, and a real call to the tenant who
      // raised it. Replying needs a live server-side row to hang messages off.
      thread: threadOf(openTicket.id),
      canReply: live && openTicket.id != null,
      call: () => (openPerson.phone
        ? callNumber(openPerson.phone, openPerson.name || 'this tenant')
        : flash(`No number on file for ${openPerson.name || 'this tenant'}`))
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
        addNew: () => setState({ overlay: 'newtenant', nt: { ...BLANK_TENANT, unitId: (UNITS.find((u) => u.no === s.unit) || {}).id || null } })
      };
    })(),
    isAssign: s.overlay === 'assign',
    assignBack: () => set('overlay', 'unit'),
    assignEmpty: !unassignedList.length,
    assignList: unassignedList.map((t) => ({
      name: t.name, img: t.img,
      sub: `${t.co.toUpperCase()} · ${t.since} WITH YOU`,
      go: () => {
        setState({ overlay: null });
        const target = UNITS.find((u) => u.no === s.unit);
        api.assignTenant({
          tenantId: t.id, unitId: target && target.id, name: t.name,
          where: `Unit ${s.unit}`
        });
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
        // Unassigned reads AMBER, the same tone a vacant room uses elsewhere —
        // it was grey, which made the one row actually needing attention the
        // faintest thing on the screen.
        edge: free ? 'amber' : t.state === 'overdue' ? 'coral' : 'lime',
        chip: free ? 'UNASSIGNED' : t.state === 'overdue' ? `${t.days}D LATE` : `IN ${t.days}D`,
        chipBg: free ? 'asoft' : t.state === 'overdue' ? 'csoft' : 'lsoft',
        chipFg: free ? 'amber' : t.state === 'overdue' ? 'coral' : 'pos',
        // Tints the whole card, so an unassigned tenant is findable in a long list
        // without reading every row.
        cardBg: free ? 'asoft' : 'ink2',
        subFg: free ? 'amber' : 'fg3',
        open: () => setState({ who: t.id, route: 'tenant' })
      };
    }),

    // ── Notifications ─────────────────────────────────────────────────────────
    // The bell opened the account menu, so it was indistinguishable from tapping
    // your own avatar, and its red dot was painted on unconditionally — it claimed
    // an alert even when there was nothing to report.
    //
    // It now shows what actually needs the landlord's attention, built from data
    // already on hand: no new endpoint, no polling, and every row taps through to
    // the screen where the thing can be dealt with.
    openAlerts: () => set('overlay', 'alerts'),
    isAlerts: s.overlay === 'alerts',
    alerts: ALERTS,
    // The bell's dot is the count, so it can never claim an alert the sheet does
    // not have — it used to be painted on unconditionally.
    hasAlerts: ALERTS.length > 0,
    alertCount: String(ALERTS.length),
    alertsEmptyLine: 'Nothing needs you right now. Rent is on track and no tickets are open.',

    // ── Help & support (owner) ────────────────────────────────────────────────
    // Where a ticket is actually worked: the whole timeline — every reply and every
    // status change, in the order they happened — plus the controls to move it
    // along. The dashboard card deliberately only previews, so the list of things
    // to do does not turn into a wall of conversation.
    goSupport: () => setState({ route: 'support', overlay: null }),
    isSupport: s.route === 'support',
    support: (() => {
      // Newest activity first, and unresolved before resolved: what needs doing.
      const all = TICKETS.slice().sort((a, b) => {
        const done = (x) => (statusOf(x) === 'Resolved' ? 1 : 0);
        return done(a) - done(b) || PRIORITY[a.priority].rank - PRIORITY[b.priority].rank;
      });
      const sel = all.find((x) => x.id === s.ticket) || all[0] || null;
      const person = sel ? (TENANTS.find((x) => x.id === sel.who) || { name: sel.name, img: sel.img, phone: sel.phone }) : {};
      return {
        empty: all.length === 0,
        emptyLine: 'No tickets have been raised yet. When a tenant reports something, it lands here.',
        list: all.map((x) => {
          const st = statusOf(x);
          const who = TENANTS.find((y) => y.id === x.who) || { name: x.name, img: x.img };
          return {
            id: x.id,
            title: x.title,
            who: who.name,
            img: who.img,
            initials: initialsOf(who.name),
            meta: `UNIT ${x.unit} · ${x.cat} · ${x.age}`,
            status: st.toUpperCase(),
            statusFg: STATUS_FG[st],
            priority: x.priority.toUpperCase(),
            fg: PRIORITY[x.priority].fg,
            bg: PRIORITY[x.priority].bg,
            on: !!sel && x.id === sel.id,
            go: () => selectTicket(x.id)
          };
        }),
        has: !!sel,
        title: sel ? sel.title : '',
        who: person.name || '',
        img: person.img || null,
        initials: initialsOf(person.name),
        meta: sel ? `UNIT ${sel.unit} · ${sel.cat}` : '',
        openFor: sel && sel.age ? `RAISED ${sel.age}` : '',
        status: sel ? statusOf(sel).toUpperCase() : '',
        statusFg: sel ? STATUS_FG[statusOf(sel)] : 'fg3',
        priority: sel ? sel.priority.toUpperCase() : '',
        pfg: sel ? PRIORITY[sel.priority].fg : 'fg3',
        pbg: sel ? PRIORITY[sel.priority].bg : 'ink3',
        body: sel ? (sel.body || 'No description was added.') : '',
        photos: sel ? (sel.photos || []) : [],
        hasPhotos: !!(sel && sel.photos && sel.photos.length),
        thread: threadOf(sel ? sel.id : null),
        canReply: live && !!sel && sel.id != null,
        started: sel ? statusOf(sel) !== 'Open' : false,
        resolved: sel ? statusOf(sel) === 'Resolved' : false,
        start: () => sel && api.setRequestStatus(sel.id, 'In Progress'),
        resolve: () => sel && api.setRequestStatus(sel.id, 'Resolved'),
        call: () => (person.phone
          ? callNumber(person.phone, person.name || 'this tenant')
          : flash(`No number on file for ${person.name || 'this tenant'}`))
      };
    })(),

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
      manual: () => setState({ overlay: 'newtenant', nt: { ...BLANK_TENANT } })
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
              setState({ overlay: null });
              api.assignTenant({
                tenantId: s.mover, unitId: u.id, name: mover.name,
                where: `${p.name} · Unit ${u.no}`
              });
            }
          };
        })
    })).filter((p) => p.rooms.length),
    noMoveTargets: !UNITS.some((u) => occupantsOf(u.no).length < u.cap && !(mover && mover.unit === u.no)),
    moveOut: () => {
      setState({ overlay: null });
      api.moveTenantOut({ tenantId: who.id, name: who.name });
    },
    deleteMember: () => {
      setState({ overlay: null, route: 'people' });
      api.deleteTenant({ tenantId: who.id, name: who.name });
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
      setState({ overlay: null });
      // The deposit rides along unchanged: the endpoint writes both money columns,
      // so leaving it out would silently zero it.
      api.saveTenantRent({
        tenantId: who.id, rent: s.draft, deposit: who.depositRaw,
        name: who.name, label: `₹${inr(s.draft)}`
      });
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
      // Straight to the sheet — this row used to just open the Settings screen,
      // which is not what it says it does.
      {
        label: 'Payment settings',
        icon: 'card-outline',
        go: () => setState({ overlay: 'paysettings', ps: { upiId: PAY.upiId, upiNumber: PAY.upiNumber, error: '' } }),
        fg: 'fg', bg: 'vsoft', ifg: 'accent'
      },
      { label: 'Help & support', icon: 'help-buoy-outline', go: () => setState({ route: 'support', overlay: null }), fg: 'fg', bg: 'vsoft', ifg: 'accent' },
      { label: 'Sign out', icon: 'log-out-outline', go: () => set('overlay', 'signout'), fg: 'coral', bg: 'csoft', ifg: 'coral' }
    ],
    isSignOut: s.overlay === 'signout',
    askSignOut: () => set('overlay', 'signout'),
    confirmSignOut: () => api.signOut(),
    isProfile: s.route === 'profile',
    // Real account details from the signed-in session (the prototype hard-coded
    // the demo landlord here).
    profileFields: [
      { label: 'FULL NAME', value: (u && u.name) || '—' },
      { label: 'EMAIL', value: (u && u.email) || '—' },
      { label: 'MOBILE', value: (u && u.phone) || '—' },
      { label: 'PASSWORD', value: '••••••••••' }
    ],
    // "OWNER · 2 PROPERTIES · 6 TENANTS" — counted from the live collections.
    profileSubtitle: `OWNER · ${PROPS.length} ${PROPS.length === 1 ? 'PROPERTY' : 'PROPERTIES'} · ${ROSTER.length} ${ROSTER.length === 1 ? 'TENANT' : 'TENANTS'}`,
    themeModes: [['Light', 'light', 'sunny-outline'], ['Dark', 'dark', 'moon-outline'], ['System', 'system', 'phone-portrait-outline']].map(([label, k, icon]) => {
      const on = s.pref === k;
      return {
        label, icon,
        bg: on ? 'fg' : 'ink3',
        fg: on ? 'ink' : 'fg2',
        bd: on ? 'fg' : 'line',
        go: () => {
          // "System" resolves to whatever the OS is set to right now; RedesignRoot
          // keeps it in step from then on. It used to hard-code dark, which is why
          // picking System on a light phone still gave you a dark app.
          const next = k === 'system'
            ? (Appearance.getColorScheme() === 'light' ? 'light' : 'dark')
            : k;
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
      // Only the first row does anything yet; the rest are named but unbuilt, and
      // say so when tapped rather than looking broken.
      {
        label: 'Payment settings',
        icon: 'card-outline',
        meta: PAY.upiId || PAY.upiNumber ? 'UPI SET' : 'NOT SET',
        go: () => setState({
          overlay: 'paysettings',
          ps: { upiId: PAY.upiId, upiNumber: PAY.upiNumber, error: '' }
        })
      },
      { label: 'Notifications', icon: 'notifications-outline', meta: 'ON' },
      { label: 'Rent reminders', icon: 'alarm-outline', meta: '3 DAYS' },
      { label: 'Documentation', icon: 'book-outline', meta: '' },
      { label: 'Help & support', icon: 'help-buoy-outline', meta: TICKETS.length ? `${shownTickets.length} OPEN` : '', go: () => setState({ route: 'support', overlay: null }) },
      { label: 'Terms of service', icon: 'shield-checkmark-outline', meta: '' }
    ].map((r) => ({ ...r, go: r.go || (() => flash(`${r.label} — not built yet`)) })),

    // ── Payment settings (owner) ──
    // What tenants are shown when they go to pay. Getting this wrong sends rent to
    // the wrong place, so both fields are validated the same way the server does
    // before the request goes out.
    isPaySettings: s.overlay === 'paysettings',
    paySettings: (() => {
      const ps = s.ps || { upiId: '', upiNumber: '', error: '' };
      const put = (patch) => setState({ ps: { ...ps, ...patch, error: '' } });
      return {
        upiId: ps.upiId,
        setUpiId: (e) => put({ upiId: String(e && e.target ? e.target.value : e).trim() }),
        upiNumber: ps.upiNumber,
        setUpiNumber: (e) => put({ upiNumber: String(e && e.target ? e.target.value : e).replace(/[^0-9]/g, '') }),
        error: ps.error || '',
        hasError: !!ps.error,
        busy: !!s.writing,
        current: PAY.upiId || PAY.upiNumber
          ? `Tenants currently see ${PAY.upiId || PAY.upiNumber}`
          : 'Your tenants cannot pay through the app until you add these.',
        save: () => {
          const id = String(ps.upiId || '').trim();
          const num = String(ps.upiNumber || '').trim();
          // Mirror the server's rules so a mistake is caught here, in the field
          // the user is looking at, rather than as a toast after a round trip.
          if (!id && !num) { setState({ ps: { ...ps, error: 'Add a UPI ID, a UPI number, or both.' } }); return; }
          if (id && !/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(id)) {
            setState({ ps: { ...ps, error: 'That UPI ID does not look right — it should read like name@bank.' } });
            return;
          }
          if (num && !/^\d{10}$/.test(num)) {
            setState({ ps: { ...ps, error: 'A UPI number must be exactly 10 digits.' } });
            return;
          }
          setState({ overlay: null });
          api.savePaymentSettings({ upiId: id, upiNumber: num });
        }
      };
    })(),

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
    // ── Scan an invite QR ─────────────────────────────────────────────────────
    // "Join with an invite QR" used to drop you straight into the portal without
    // scanning anything, and Find's scan button faked a result. Both now open the
    // camera.
    goScanQr: () => setState({ route: 'scan', overlay: null, scanCode: '' }),
    isScan: s.route === 'scan',
    scan: (() => {
      const raw = String(s.scanCode || '');
      // An invite QR carries the join link (https://tenantpro.app/join/TP-SUN-8412),
      // but a landlord might equally read the code out loud, so accept either and
      // keep only the code itself.
      const codeOf = (v) => {
        // Drop any query string or fragment FIRST, then take the last path
        // segment: splitting on all three at once made "?ref=x" the last piece and
        // read it as the code.
        const text = String(v || '').trim().split('#')[0].split('?')[0];
        const tail = text.split('/').filter(Boolean).pop() || text;
        return tail.toUpperCase().replace(/[^A-Z0-9-]/g, '');
      };
      const find = (code) => {
        if (!code) return;
        setState({ jq: code, route: 'tfind', scanCode: '', keepHistory: true });
        flash(`Looking for ${code}`);
      };
      return {
        code: raw,
        setCode: (e) => set('scanCode', evStr(e).toUpperCase()),
        canSubmit: !!codeOf(raw),
        submitCode: () => find(codeOf(raw)),
        // Called from the camera on every frame that sees a QR; the screen
        // de-duplicates so this only lands once.
        found: (value) => find(codeOf(value)),
        typeInstead: () => flash('Type the code in the box below the camera'),
        close: () => api.goBackOneStep() || go('tlogin')
      };
    })(),
    scanQr: () => setState({ route: 'scan', overlay: null, scanCode: '' }),
    joinResults: joinMatches.map((p) => {
      const free = UNITS.filter((u) => u.prop === p.id).reduce((a, u) => a + (u.cap - occupantsOf(u.no).length), 0);
      const spot = UNITS.find((u) => u.prop === p.id && occupantsOf(u.no).length < u.cap);
      const exact = s.jq.trim().toUpperCase() === p.code;
      // The property this tenant already lives in. Offering to "join" the place you
      // are already in made no sense — and acting on it would have moved you out of
      // your own room.
      const isCurrent = !!(myProp && myProp.id === p.id);
      return {
        name: p.name, code: p.code, loc: p.loc, img: p.img, policy: p.policy,
        policyIcon: p.policyIcon,
        isCurrent,
        beds: free ? `${free} ${free === 1 ? 'BED' : 'BEDS'} FREE` : 'NO BEDS FREE',
        bedFg: free ? 'pos' : 'coral',
        cta: isCurrent ? 'Current property' : exact ? 'Join now' : 'Request to join',
        // Reads as a state, not an action, when it is where you already live.
        ctaBg: isCurrent ? 'lsoft' : 'lime',
        ctaFg: isCurrent ? 'accent' : 'on',
        ctaDisabled: isCurrent,
        bd: isCurrent ? 'accent' : exact ? 'accent' : 'line',
        join: () => {
          if (isCurrent) { flash(`You already live at ${p.name}`); return; }
          if (!spot) { flash(`${p.name} has no free beds`); return; }
          setState({ roster: { ...s.roster, rahul: spot.no }, jq: '' });
          flash(`Joined ${p.name} · Unit ${spot.no}`);
        }
      };
    }),
    noJoinResults: !joinMatches.length,
    requests: REQUESTS.map((r, i) => ({
      ...r,
      // Tapping a request opens its detail sheet. This previously pointed at
      // openRecord — the record-a-payment overlay — so tapping a ticket showed a
      // payment sheet.
      open: () => openRequest(i, r.id)
    })),

    // The reply box, shared by the landlord's ticket sheet and the tenant's
    // request sheet — whichever is open posts into that request's thread.
    composer,

    // ── The landlord, as the tenant sees them ──
    landlord: landlordCard,
    isLandlordCard: s.overlay === 'landlord',

    // ── How to pay them ──
    // The owner's own UPI details, joined into /tenant-portal/me. The prototype
    // printed the demo landlord's here, which would have sent a real tenant's rent
    // to the wrong place — so when a live tenancy has none on file, this says so
    // rather than showing a plausible-looking default.
    payInfo: (() => {
      const upiId = (PAYINFO && PAYINFO.upi_id) || (TLIVE ? '' : 'demo@okhdfcbank');
      const upiNumber = (PAYINFO && PAYINFO.upi_number) || (TLIVE ? '' : '9000000000');
      const qr = PAYINFO && PAYINFO.qr_code_url ? mediaUrl(PAYINFO.qr_code_url) : null;
      // The figure the Pay sheet is showing, so the UPI hand-off pre-fills it.
      const amount = Number(me.rentRaw) || 0;
      return {
        upiId,
        upiNumber,
        hasUpiId: !!upiId,
        hasUpiNumber: !!upiNumber,
        qr,
        hasQr: !!qr,
        // Nothing to pay to — the landlord has not set their details up yet.
        missing: TLIVE && !upiId && !upiNumber,
        missingLine: 'Your landlord has not added their UPI details yet. Ask them to add them in Settings → Payment settings.',
        copyId: () => copyText(upiId, 'UPI ID copied'),
        copyNumber: () => copyText(upiNumber, 'UPI number copied'),
        // Hand off to whichever UPI app is installed, pre-filled. Falls back to a
        // copy if the device has no handler for the upi: scheme.
        open: () => {
          const target = upiId || upiNumber;
          if (!target) { flash('No UPI details to pay to yet'); return; }
          const url = `upi://pay?pa=${encodeURIComponent(target)}&pn=${encodeURIComponent(landlordCard.name)}`
            + (amount ? `&am=${amount}&cu=INR` : '');
          Linking.openURL(url).catch(() => copyText(target, 'No UPI app found — details copied'));
        }
      };
    })(),

    // ── Raise a request ──
    openNewRequest: () => setState({ overlay: 'newrequest', nr: { ...BLANK_REQUEST } }),
    isNewRequest: s.overlay === 'newrequest',
    newRequest: (() => {
      const nr = s.nr || BLANK_REQUEST;
      const put = (patch) => setState({ nr: { ...nr, ...patch, error: '' } });
      return {
        categories: REQUEST_CATEGORIES.map((c) => ({
          label: c,
          on: nr.category === c,
          go: () => put({ category: c })
        })),
        priorities: REQUEST_PRIORITIES.map((p) => ({
          label: p,
          on: nr.priority === p,
          go: () => put({ priority: p })
        })),
        title: nr.title,
        setTitle: (e) => put({ title: e && e.target ? e.target.value : e }),
        body: nr.body,
        setBody: (e) => put({ body: e && e.target ? e.target.value : e }),
        photo: nr.photo ? nr.photo.uri : null,
        hasPhoto: !!nr.photo,
        pickPhoto: () => api.pickRequestPhoto(),
        clearPhoto: () => put({ photo: null }),
        busy: !!nr.busy,
        error: nr.error || '',
        canSubmit: !!String(nr.title || '').trim() && !nr.busy,
        // Only a linked, live tenancy has a landlord to file this against.
        canSubmitAtAll: TLIVE,
        submit: () => api.createRequest()
      };
    })(),

    // ── Tenant request detail (opened from Help) ──
    isRequest: s.overlay === 'request',
    request: (() => {
      const r = REQUESTS[s.req] || REQUESTS[0] || null;
      if (!r) return null;
      // The status ladder the backend's enum defines, so the sheet can show where
      // this request currently sits.
      const STEPS = ['OPEN', 'IN PROGRESS', 'RESOLVED'];
      const at = Math.max(0, STEPS.indexOf(r.status));
      const photos = r.photos || [];
      return {
        ...r,
        steps: STEPS.map((label, i) => ({
          label,
          done: i <= at,
          current: i === at,
          fg: i <= at ? (i === at ? r.dot : 'pos') : 'fg3'
        })),
        photos,
        hasPhotos: photos.length > 0,
        // Replying needs a real server-side request to hang the message off, so
        // the compose box only appears on live rows — never on the walk-through.
        canReply: TLIVE && r.id != null,
        thread: threadOf(r.id),
        // The landlord, reachable from the request itself. Same resolution as the
        // Help screen's contact card, so the two never disagree about who to ring.
        landlord: landlordCard
      };
    })()
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
  // Routes that begin a session rather than continue one. Landing on one of these
  // is a fresh start, so the trail behind it is dropped — the phone's back gesture
  // must never walk a signed-out user back into somebody's dashboard.
  const ENTRY_ROUTES = ['boot', 'onboarding', 'role', 'login', 'tlogin', 'signup', 'forgot'];
  const HISTORY_CAP = 24; // a session's worth; bounded so it cannot grow forever

  // Partial-merge setState, mirroring the prototype's this.setState({ ... }).
  //
  // It also maintains the navigation history. Doing it here rather than in `go()`
  // is deliberate: plenty of navigation happens as `setState({ route, who })` — a
  // tenant row, a ticket, a property — and those must be walk-back-able too.
  // Pass `keepHistory: true` to move without recording (a back step itself).
  const setState = useCallback((partial) => {
    setStateRaw((prev) => {
      const next = { ...prev, ...partial };
      const moving = partial && partial.route != null && partial.route !== prev.route;
      if (moving && !partial.keepHistory && !partial.history) {
        next.history = ENTRY_ROUTES.includes(partial.route)
          ? []
          : [...prev.history, prev.route].filter((r) => r && r !== 'boot').slice(-HISTORY_CAP);
      }
      delete next.keepHistory;
      return next;
    });
  }, []);

  const set = useCallback((k, v) => { setState({ [k]: v }); }, [setState]);
  const go = useCallback((route) => { setState({ route, overlay: null }); }, [setState]);

  // One step back. Returns true if it handled the press, false to let the OS have
  // it (which on Android means leaving the app — correct only at the very top).
  //
  // Order matters: a sheet is the most recent thing the user opened, so it closes
  // first; only then does back mean "leave this screen".
  const goBackOneStep = useCallback(() => {
    const st = stateRef.current;
    if (st.overlay) { setState({ overlay: null }); return true; }
    if (st.history.length) {
      const history = st.history.slice(0, -1);
      const route = st.history[st.history.length - 1];
      setState({ route, overlay: null, history, keepHistory: true });
      return true;
    }
    return false;
  }, [setState]);
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
      const [dashboard, propsRes, unitsRes, tenantsRes, txRes, reqRes, payRes] = await Promise.all([
        apiOwner.dashboard('all'),
        apiProps.list(),
        apiUnits.list('all'),
        apiTenants.list(),
        apiOwner.transactions('all'),
        // The maintenance queue is newer than the rest of the API, so a backend
        // that predates it must not take the whole dashboard down with it — an
        // empty queue is a correct answer, a blank screen is not.
        apiOwner.requests('all').catch(() => ({ requests: [] })),
        // Likewise: an owner who has never set up UPI has no row, and that is a
        // state to render, not an error.
        apiPayments.getSettings().catch(() => ({ settings: null }))
      ]);
      const data = mapOwnerData({
        dashboard,
        properties: propsRes.properties,
        units: unitsRes.units,
        tenants: tenantsRes.tenants,
        transactions: txRes.transactions,
        requests: reqRes.requests,
        paySettings: payRes.settings
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

  // The tenant portal's own bundle. Kept deliberately forgiving: a tenant whose
  // landlord has not linked them to a unit yet gets `linked: false` from /me,
  // which the portal renders as its "ask your landlord" state — that is a valid
  // answer, not an error.
  const loadTenantData = useCallback(async ({ refresh = false } = {}) => {
    setState(refresh ? { refreshing: true, dataError: '' } : { dataLoading: true, dataError: '' });
    try {
      const [meRes, reqRes] = await Promise.all([
        apiPortal.me(),
        apiPortal.requests().catch(() => ({ requests: [] }))
      ]);
      setState({
        tdata: { me: meRes, requests: reqRes.requests || [] },
        dataLoading: false,
        refreshing: false,
        dataError: ''
      });
    } catch (e) {
      setState({
        dataLoading: false,
        refreshing: false,
        dataError: errText(e, 'Could not load your tenancy. Pull down to retry.')
      });
    }
  }, [setState]);

  // Load one request's conversation. Which endpoint serves it depends on which
  // side of the thread the caller is standing on; the rows are the same either way.
  const loadThread = useCallback(async (requestId) => {
    if (requestId == null) return;
    const role = (stateRef.current.session && stateRef.current.session.role) || 'owner';
    setState({ thread: { id: requestId, messages: [], loading: true, error: '', sending: false } });
    try {
      const res = role === 'tenant'
        ? await apiPortal.requestMessages(requestId)
        : await apiOwner.requestMessages(requestId);
      // Discard a late response for a request the user has already navigated away
      // from, so an old thread can never appear under a new title.
      if (stateRef.current.thread.id !== requestId) return;
      setState({ thread: { id: requestId, messages: res.messages || [], loading: false, error: '', sending: false } });
    } catch (e) {
      if (stateRef.current.thread.id !== requestId) return;
      setState({
        thread: {
          id: requestId,
          messages: [],
          loading: false,
          error: errText(e, 'Could not load the conversation.'),
          sending: false
        }
      });
    }
  }, [setState]);

  // Post the compose box's contents to the open thread and append what the server
  // stored (rather than what we typed), so the bubble carries the real timestamp.
  const sendReply = useCallback(async () => {
    const { reply, thread, session } = stateRef.current;
    const text = String(reply || '').trim();
    if (!text || thread.id == null || thread.sending) return;
    const role = (session && session.role) || 'owner';
    setState({ thread: { ...thread, sending: true, error: '' } });
    try {
      const res = role === 'tenant'
        ? await apiPortal.sendRequestMessage(thread.id, text)
        : await apiOwner.sendRequestMessage(thread.id, text);
      const cur = stateRef.current.thread;
      if (cur.id !== thread.id) return;
      setState({
        reply: '',
        thread: { ...cur, messages: [...cur.messages, res.item], sending: false, error: '' }
      });
    } catch (e) {
      const cur = stateRef.current.thread;
      if (cur.id !== thread.id) return;
      setState({ thread: { ...cur, sending: false, error: errText(e, 'Message not sent. Try again.') } });
    }
  }, [setState]);

  // ── Owner writes (Phase 4) ─────────────────────────────────────────────────
  // Every landlord action that changes something on the server goes through here,
  // so they all behave the same way: run the call, re-read the portfolio so the
  // screen shows what the server actually stored rather than what we hoped it
  // would, and report a failure instead of leaving a change on screen that never
  // landed. That last part is the whole point — the prototype's actions only ever
  // edited local state, so a "saved" toast meant nothing survived a relaunch.
  //
  // On the seed walk-through there is no server row to write to, so the action is
  // declined out loud rather than pretending.
  const ownerWrite = useCallback(async (fn, { done, failed }) => {
    if (!stateRef.current.live) {
      flash('Sign in to your own account to make changes');
      return false;
    }
    setState({ writing: true });
    try {
      await fn();
      // The prototype's local overrides (room moves, rent edits, deletions,
      // ticket statuses) exist only to fake persistence. Once the server is the
      // source of truth they would sit on top of the refreshed data and mask it,
      // so clear them as the real values arrive.
      await loadOwnerData({ refresh: true });
      setState({ writing: false, roster: {}, rents: {}, gone: [], tstatus: {} });
      if (done) flash(done);
      return true;
    } catch (e) {
      setState({ writing: false });
      flash(errText(e, failed || 'That did not save. Please try again.'));
      return false;
    }
  }, [setState, flash, loadOwnerData]);

  // ── Password recovery ──────────────────────────────────────────────────────
  // Ask the backend to email a code. It only sends to an address that is actually
  // registered — an unknown one comes back 404 and is reported as such rather than
  // pretending a mail went out, so you find out now instead of waiting on an inbox.
  const requestResetCode = useCallback(async () => {
    const fp = stateRef.current.fp;
    const id = String(fp.id || '').trim();
    if (!id) { setState({ fp: { ...fp, error: 'Enter your registered email or mobile number.' } }); return; }
    if (fp.busy) return;
    setState({ fp: { ...fp, busy: true, error: '' } });
    try {
      // `identifier` is what the current backend reads; `email` is sent too so an
      // older deployment still understands the request.
      const res = await apiAuth.forgotPassword({ identifier: id, email: id, role: fp.role });
      setState({
        fp: {
          ...stateRef.current.fp,
          busy: false,
          error: '',
          step: 'reset',
          // The server echoes a masked destination. Saying WHERE the code went
          // matters: one sent to an address you forgot you used is otherwise
          // indistinguishable from one that was never sent.
          sentTo: (res && res.sentTo) || ''
        }
      });
    } catch (e) {
      setState({
        fp: {
          ...stateRef.current.fp,
          busy: false,
          error: errText(e, 'Could not send the code. Please try again.')
        }
      });
    }
  }, [setState]);

  // Spend the code on a new password.
  const submitNewPassword = useCallback(async () => {
    const fp = stateRef.current.fp;
    const code = String(fp.code || '').trim();
    const bad = !code ? 'Enter the 6-digit code from your email.'
      : fp.pw.length < 6 ? 'Password must be at least 6 characters.'
        : fp.pw !== fp.pw2 ? 'Those passwords do not match.'
          : '';
    if (bad) { setState({ fp: { ...fp, error: bad } }); return; }
    if (fp.busy) return;
    setState({ fp: { ...fp, busy: true, error: '' } });
    try {
      const id = String(fp.id || '').trim();
      await apiAuth.resetPassword({ identifier: id, email: id, code, newPassword: fp.pw, role: fp.role });
      // Drop the new password from state the moment it is no longer needed.
      setState({ fp: { ...stateRef.current.fp, busy: false, error: '', step: 'done', pw: '', pw2: '', code: '' } });
    } catch (e) {
      setState({
        fp: {
          ...stateRef.current.fp,
          busy: false,
          error: errText(e, 'Could not reset your password. Please try again.')
        }
      });
    }
  }, [setState]);

  // Record a rent payment against a tenant. The backend also rolls their
  // next_rent_due forward a month, which is why the refresh matters: the due
  // countdown on every screen changes as a result of this one call.
  const recordPayment = useCallback(async ({ tenantId, amount, method, name, label }) => {
    if (tenantId == null) { flash('No tenant selected'); return false; }
    const d = new Date();
    const payment_date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return ownerWrite(
      () => apiPayments.record(tenantId, {
        amount,
        // The API's vocabulary, not the chip labels': 'BANK' is a bank transfer.
        payment_mode: method === 'BANK' ? 'Bank Transfer' : method === 'CASH' ? 'Cash' : 'UPI',
        reference_id: null,
        payment_date
      }),
      { done: `${label} recorded for ${name}`, failed: 'Could not record that payment.' }
    );
  }, [ownerWrite, flash]);

  // Change what a tenant pays. Deposit is sent unchanged — the endpoint writes
  // both columns, so omitting it would zero the deposit.
  const saveTenantRent = useCallback(({ tenantId, rent, deposit, name, label }) => ownerWrite(
    () => apiTenants.financials(tenantId, { rent_share: rent, deposit }),
    { done: `${name}'s rent set to ${label}`, failed: 'Could not update the rent.' }
  ), [ownerWrite]);

  // Move a tenant into a room. Also used for a first assignment — the endpoint
  // handles both, and frees the old room if it empties.
  const assignTenant = useCallback(({ tenantId, unitId, name, where }) => {
    if (unitId == null) { flash('That room is not on the server yet'); return Promise.resolve(false); }
    return ownerWrite(
      () => apiTenants.assignToRoom(tenantId, unitId),
      { done: `${name} moved to ${where}`, failed: 'Could not move that tenant.' }
    );
  }, [ownerWrite, flash]);

  // End a tenancy but keep the person's record — they become unassigned, and the
  // room is freed for someone else.
  const moveTenantOut = useCallback(({ tenantId, name }) => ownerWrite(
    () => apiTenants.moveOut(tenantId),
    { done: `${name} moved out — account kept, now unassigned`, failed: 'Could not move that tenant out.' }
  ), [ownerWrite]);

  // Delete the record outright. Destructive, and the sheet asks first.
  const deleteTenant = useCallback(({ tenantId, name }) => ownerWrite(
    () => apiTenants.remove(tenantId),
    { done: `${name}'s account deleted`, failed: 'Could not delete that account.' }
  ), [ownerWrite]);

  // The UPI details tenants are shown when they go to pay. Saved as multipart
  // because the same endpoint also accepts a QR image.
  const savePaymentSettings = useCallback(({ upiId, upiNumber }) => {
    const form = new FormData();
    form.append('upi_id', String(upiId || '').trim());
    form.append('upi_number', String(upiNumber || '').trim());
    return ownerWrite(
      () => apiPayments.saveSettings(form),
      { done: 'Payment details saved', failed: 'Could not save your payment details.' }
    );
  }, [ownerWrite]);

  // ── Creating things ────────────────────────────────────────────────────────
  // All three go out as multipart because each endpoint also accepts a photo.
  // A blank string is appended rather than omitted for optional text so the
  // column is written as empty instead of the literal "undefined".
  const put = (form, k, v) => form.append(k, v == null ? '' : String(v));

  // Pick a photo for one of the creation forms. Same lazy require as the
  // request-photo picker; `slot` says which form's state to drop it into.
  const pickPhotoFor = useCallback(async (slot) => {
    try {
      const picker = require('expo-image-picker');
      const perm = await picker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { flash('Photo access is needed to add a picture'); return; }
      const res = await picker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (res.canceled || !res.assets || !res.assets[0]) return;
      setState({ [slot]: { ...stateRef.current[slot], photo: res.assets[0], error: '' } });
    } catch (e) {
      flash('Could not open your photos');
    }
  }, [setState, flash]);

  // A picked asset as the multipart file part RN's fetch understands.
  const filePart = (asset, fallback) => ({
    uri: asset.uri,
    name: asset.fileName || fallback,
    type: asset.mimeType || 'image/jpeg'
  });

  const createProperty = useCallback(async () => {
    const np = stateRef.current.np;
    if (np.busy) return;
    const form = new FormData();
    put(form, 'name', np.name.trim());
    put(form, 'property_type', np.type);
    put(form, 'address', np.address.trim());
    put(form, 'locality', np.locality.trim());
    put(form, 'city', np.city.trim());
    put(form, 'pincode', np.pincode.trim());
    if (np.photo) form.append('property_image', filePart(np.photo, 'property.jpg'));
    setState({ np: { ...np, busy: true, error: '' } });
    const ok = await ownerWrite(() => apiProps.add(form), {
      done: `${np.name.trim()} added`, failed: 'Could not add that property.'
    });
    setState(ok
      ? { np: { ...BLANK_PROPERTY }, overlay: null }
      : { np: { ...stateRef.current.np, busy: false } });
  }, [setState, ownerWrite]);

  const createUnit = useCallback(async () => {
    const nu = stateRef.current.nu;
    if (nu.busy) return;
    const form = new FormData();
    put(form, 'property_id', nu.propertyId);
    put(form, 'unit_number', nu.number.trim());
    put(form, 'room_type', nu.roomType);
    put(form, 'base_rent', Number(nu.rent) || 0);
    put(form, 'capacity', Math.max(1, Number(nu.capacity) || 1));
    if (nu.photo) form.append('room_image', filePart(nu.photo, 'room.jpg'));
    setState({ nu: { ...nu, busy: true, error: '' } });
    const ok = await ownerWrite(() => apiUnits.add(form), {
      done: `Unit ${nu.number.trim()} added`, failed: 'Could not add that unit.'
    });
    setState(ok
      ? { nu: { ...BLANK_UNIT }, overlay: null }
      : { nu: { ...stateRef.current.nu, busy: false } });
  }, [setState, ownerWrite]);

  const createTenantRecord = useCallback(async () => {
    const nt = stateRef.current.nt;
    if (nt.busy) return;
    const d = new Date();
    const form = new FormData();
    put(form, 'name', nt.name.trim());
    put(form, 'phone', nt.phone.trim());
    put(form, 'email', nt.email.trim());
    put(form, 'company', nt.company.trim());
    put(form, 'deposit', Number(nt.deposit) || 0);
    put(form, 'rent_share', Number(nt.rent) || 0);
    // A room is optional — a tenant can exist unassigned and be placed later.
    if (nt.unitId != null) put(form, 'unit_id', nt.unitId);
    // Moving in today unless told otherwise; the backend derives the first rent
    // due date from this, so it must not be left blank when a room is given.
    put(form, 'move_in_date', `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    put(form, 'billing_cycle', 'Anniversary');
    if (nt.photo) form.append('tenant_image', filePart(nt.photo, 'tenant.jpg'));
    setState({ nt: { ...nt, busy: true, error: '' } });
    const ok = await ownerWrite(() => apiTenants.add(form), {
      done: `${nt.name.trim()} added`, failed: 'Could not add that tenant.'
    });
    setState(ok
      ? { nt: { ...BLANK_TENANT }, overlay: null }
      : { nt: { ...stateRef.current.nt, busy: false } });
  }, [setState, ownerWrite]);

  // Attach a photo of the problem. expo-image-picker is loaded lazily so the
  // module is only pulled in when a tenant actually reaches for the camera roll.
  const pickRequestPhoto = useCallback(async () => {
    try {
      const picker = require('expo-image-picker');
      const perm = await picker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) { flash('Photo access is needed to attach a picture'); return; }
      const res = await picker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (res.canceled || !res.assets || !res.assets[0]) return;
      const a = res.assets[0];
      setState({ nr: { ...stateRef.current.nr, photo: a, error: '' } });
    } catch (e) {
      flash('Could not open your photos');
    }
  }, [setState, flash]);

  // Raise a maintenance request. Sent as multipart only when a photo is attached,
  // so the common case stays a plain JSON post.
  const createRequest = useCallback(async () => {
    const nr = stateRef.current.nr || BLANK_REQUEST;
    const title = String(nr.title || '').trim();
    if (!title) { setState({ nr: { ...nr, error: 'Add a short title so your landlord knows what this is.' } }); return; }
    if (nr.busy) return;
    setState({ nr: { ...nr, busy: true, error: '' } });
    try {
      let payload;
      if (nr.photo) {
        payload = new FormData();
        payload.append('title', title);
        payload.append('description', String(nr.body || '').trim());
        payload.append('category', nr.category);
        payload.append('priority', nr.priority);
        payload.append('request_image', {
          uri: nr.photo.uri,
          name: nr.photo.fileName || 'request.jpg',
          type: nr.photo.mimeType || 'image/jpeg'
        });
      } else {
        payload = { title, description: String(nr.body || '').trim(), category: nr.category, priority: nr.priority };
      }
      const res = await apiPortal.createRequest(payload);
      // Put the new request straight at the top of the list rather than re-fetching
      // — the server already told us exactly what it stored.
      const cur = stateRef.current.tdata;
      setState({
        nr: { ...BLANK_REQUEST },
        overlay: null,
        tdata: cur ? { ...cur, requests: [res.request, ...(cur.requests || [])] } : cur
      });
      flash('Request raised — your landlord can see it now');
    } catch (e) {
      setState({
        nr: {
          ...stateRef.current.nr,
          busy: false,
          error: errText(e, 'Could not submit your request. Please try again.')
        }
      });
    }
  }, [setState, flash]);

  // Move a request along the queue. The local `tstatus` override paints instantly
  // and the API call makes it stick; if the call fails the override is rolled back
  // so the screen never claims a change the backend rejected.
  const setRequestStatus = useCallback(async (requestId, status) => {
    if (requestId == null) return;
    const label = status === 'In Progress' ? 'In progress' : status;
    const before = stateRef.current.tstatus;
    setState({ tstatus: { ...before, [requestId]: label } });
    if (!stateRef.current.live) return; // seed/demo data has no server row to update
    try {
      await apiOwner.setRequestStatus(requestId, status);
    } catch (e) {
      setState({ tstatus: before });
      flash(errText(e, 'Could not update the request.'));
    }
  }, [setState, flash]);

  // Restore a stored session on launch and route accordingly.
  const resolveSession = useCallback(async () => {
    try {
      const sess = await loadSession();
      if (sess.role) {
        setToken(sess.token);
        setState({ session: sess, route: sess.role === 'owner' ? 'home' : 'portal' });
        if (sess.role === 'owner') loadOwnerData();
        else loadTenantData();
      } else {
        setToken(null);
        // Signed out: first-time users get the intro; everyone else goes straight
        // to the role picker.
        const seen = await hasOnboarded();
        setState({ session: null, route: seen ? 'role' : 'onboarding' });
      }
    } catch (e) {
      setToken(null);
      setState({ session: null, route: 'role' });
    }
  }, [setState, loadOwnerData, loadTenantData]);

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
      else loadTenantData();
    } catch (e) {
      setState({ authBusy: false, authError: errText(e, 'Sign in failed. Check your details and try again.') });
    }
  }, [setState, flash, loadOwnerData, loadTenantData]);

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
    () => ({
      setState, set, go, flash, fxRef, signIn, register, signOut, resolveSession,
      loadOwnerData, loadTenantData, loadThread, sendReply, setRequestStatus,
      pickRequestPhoto, createRequest, requestResetCode, submitNewPassword,
      recordPayment, saveTenantRent, assignTenant, moveTenantOut, deleteTenant, savePaymentSettings,
      pickPhotoFor, createProperty, createUnit, createTenantRecord, goBackOneStep
    }),
    [
      setState, set, go, flash, signIn, register, signOut, resolveSession,
      loadOwnerData, loadTenantData, loadThread, sendReply, setRequestStatus,
      pickRequestPhoto, createRequest, requestResetCode, submitNewPassword,
      recordPayment, saveTenantRent, assignTenant, moveTenantOut, deleteTenant, savePaymentSettings,
      pickPhotoFor, createProperty, createUnit, createTenantRecord, goBackOneStep
    ]
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
