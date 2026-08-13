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
import { Appearance, AppState, Linking } from 'react-native';
import {
  PRIORITY, MOVE_IN, MONTH_LABELS, creditOf, SEED
} from './data';
import {
  auth as apiAuth, owner as apiOwner, properties as apiProps,
  units as apiUnits, tenants as apiTenants, portal as apiPortal, payments as apiPayments, places as apiPlaces,
  setToken, mediaUrl
} from './api';
import { mapOwnerData, mapPortalRequest, mapDocument, mapMyPlace } from './mapping';
import { hasPin, roundCoord, DEFAULT_CENTER, openDirections, MIN_ZOOM, MAX_ZOOM } from './maps';
import { upiUri } from './qr';
import { readBuild } from './buildinfo';
import {
  loadSession, saveOwnerSession, saveTenantSession, clearSession,
  hasOnboarded, setOnboarded, hasSeenPermits, setPermitsSeen
} from './session';

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

// "1 Feb 2026" — how the design writes a date in prose.
const MON_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// Pull the property code out of whatever was scanned, typed or pasted: a bare code,
// a full join link, or a link with a query string on the end.
//
// Drop any query string or fragment FIRST, then take the last path segment:
// splitting on all three at once made "?ref=x" the last piece and read it as the
// code.
//
// At MODULE scope because both halves of this file need it — deriveVm for the
// scanner and the search box, and AppProvider for the guest join. It used to live
// inside deriveVm, which is the same trap `copyToClipboard` fell into below: a
// reference from AppProvider looks fine and throws the moment it runs.
const codeOf = (v) => {
  const text = String(v || '').trim().split('#')[0].split('?')[0];
  const tail = text.split('/').filter(Boolean).pop() || text;
  return tail.toUpperCase().replace(/[^A-Z0-9-]/g, '');
};

// Put text on the clipboard, reporting whether it worked. Uses RN core's Clipboard
// — deprecated in favour of expo-clipboard, but that is a native module and adding
// one cannot reach an already-installed build over the air, whereas this is already
// compiled in. Required lazily so the deprecation getter only fires on a real copy.
//
// At MODULE scope because both halves of this file need it. It used to live inside
// deriveVm, and openUpiPayment — which is in AppProvider — listed it in a useCallback
// dependency array. Dependency arrays are evaluated during render, so that threw
// "copyText is not defined" and took the entire app down to the error boundary on
// every launch. Splitting the clipboard write from the toast is what lets one
// implementation serve both scopes, since only deriveVm has `flash`.
const copyToClipboard = (text) => {
  if (!text) return false;
  try {
    // eslint-disable-next-line global-require
    require('react-native').Clipboard.setString(String(text));
    return true;
  } catch (e) {
    return false;
  }
};

// Spelled out and upper-cased, for the ledger's month headings.
const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];
const fmtDay = (v) => {
  const d = v instanceof Date ? v : new Date(v);
  if (!v || isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MON_SHORT[d.getMonth()]} ${d.getFullYear()}`;
};
// "Three months from today", as both the date a server stores and the date a person
// reads. One helper because the guest's request form, the landlord's decide sheet and
// the accept call all have to mean the same day — computing it three times from three
// places is how a chip labelled 12 Nov ends up sending 11 Nov.
//
// setMonth overflows on its own (31 Jan + 1 month lands on 3 March), which would
// quietly hand out two extra days, so a month that is too short is clamped to its own
// last day. `null` months means open-ended, and there is no date to give.
const stayFromMonths = (months) => {
  if (months == null) return null;
  const now = new Date();
  const day = now.getDate();
  const d = new Date(now.getFullYear(), now.getMonth() + months, 1);
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, lastDay));
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return { iso: `${d.getFullYear()}-${mm}-${dd}`, label: fmtDay(d) };
};

const monthsLabel = (months) => (months == null ? 'Not sure yet' : `${months} month${months === 1 ? '' : 's'}`);

// The landlord's stay choice, resolved to a date. Three kinds of value, because
// "open-ended" and "not chosen yet" are different things and null can only be one of
// them: 'asked' means take the applicant's own answer, a number means that many
// months from today, and null means no expiry at all.
//
// 'asked' is also what the sheet resets to for each new request, so it has to survive
// an applicant who said nothing — six months is the fallback the sheet used before
// anybody was asked, and it stays the fallback now.
const ASKED_FALLBACK_MONTHS = 6;
const resolveJoinStay = (choice, request) => {
  if (choice === 'asked') {
    const asked = request && request.askedStay;
    const stale = !!(request && request.askedStayStale);
    if (asked && !stale) return { iso: asked, label: request.askedStayLabel || fmtDay(asked) };
    return stayFromMonths(ASKED_FALLBACK_MONTHS);
  }
  return stayFromMonths(choice);
};

// How long ago, in words, for the demo card's "last reset" line. Coarse on purpose:
// the answer to "is this demo stale" is days, never minutes, and "2 days ago" reads
// better than a date you have to compare against today yourself.
const agoWords = (v) => {
  const d = v instanceof Date ? v : new Date(v);
  if (!v || isNaN(d.getTime())) return '';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ${hrs === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return fmtDay(d);
};

// Whole months since a date, floored at 0 — the "6 mo with you" figure.
const monthsSince = (v) => {
  const d = v instanceof Date ? v : new Date(v);
  if (!v || isNaN(d.getTime())) return 0;
  const now = new Date();
  return Math.max(0, (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()));
};

const inr = (n) => {
  const s = String(Math.round(Math.abs(Number(n) || 0)));
  if (s.length <= 3) return s;
  return s.slice(0, -3).replace(/\B(?=(\d\d)+$)/g, ',') + ',' + s.slice(-3);
};

// ── Initial state (ported verbatim from Component.state) ──
// Editing an existing property carries its id; everything else matches the create
// form, so both use the same sheet body.
// `lat`/`lon` are null until the landlord pins the property on the map. Null, not
// 0: zero is a real coordinate in the Atlantic, and a form default that means "not
// set" must not be a place.
const BLANK_EDIT_PROPERTY = { id: null, name: '', type: 'PG', address: '', locality: '', city: '', pincode: '', lat: null, lon: null, photo: null, busy: false, error: '' };

// The ways a tenant can tell us they paid. Mirrors the server's own list in
// tenantPortalController.declarePayment — a value this does not offer would be
// silently coerced to 'UPI' there, so the two must stay in step.
const PAY_METHODS = ['UPI', 'Bank Transfer', 'Cash', 'Cheque', 'Card', 'Net Banking', 'Other'];

// The reference a tenant carries into their UPI app and back. It has to be unique
// enough not to collide within a month, short enough to survive a UPI note field, and
// readable enough that a landlord can match it against a line in their bank statement.
// YYMM plus four random characters does all three.
const refStamp = () => {
    const d = new Date();
    const ym = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const rand = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    return `${ym}-${rand.padEnd(4, 'X')}`;
};

// Declared BEFORE INITIAL_STATE because INITIAL_STATE spreads it. A const referenced
// by INITIAL_STATE and declared after it throws on module load — this file has been
// bitten by exactly that three times now (BLANK_EDIT_PROPERTY, holdJoinCode,
// checkPulse), so the ordering here is load-bearing, not stylistic.
const BLANK_PAY = {
    // Held so the reference survives the round trip out to the UPI app and back.
    reference: '',
    // True once we have handed off and are waiting to ask "did that work?".
    asked: false,
    // The "I paid another way" path.
    other: false,
    method: '',
    otherRef: '',
    busy: false,
    error: ''
};

// Which government IDs a guest may offer. The keys must match the server's
// DOC_TYPES exactly — it refuses anything else — and the order is the order Indian
// tenants actually reach for one.
const GUEST_DOC_TYPES = [
  { key: 'aadhaar', label: 'Aadhaar' },
  { key: 'pan', label: 'PAN' },
  { key: 'dl', label: 'Licence' },
  { key: 'voter', label: 'Voter ID' },
  { key: 'passport', label: 'Passport' }
];

// The guest join form's empty state. Declared BEFORE INITIAL_STATE, which spreads
// it, and before submitGuestJoin, which resets to it -- a const referenced by
// INITIAL_STATE but declared after it is a temporal-dead-zone crash at import, and
// this file has produced that one four times now.
const BLANK_GUEST_FORM = {
  // Which half of the form is on screen. 'code' asks which property; 'you' asks for
  // the phone number and the government ID.
  step: 'code',
  place: null,      // what the code resolved to, once it has
  phone: '',
  docType: 'aadhaar',
  docNumber: '',
  photo: null,      // { uri, name, type } from the camera or the library
  // How long they say they are staying, in months, or null for "not sure yet".
  // Undated is the honest default for somebody who genuinely does not know, but 3 is
  // the answer most PG guests give, and a preselected chip is what makes the question
  // read as answerable rather than as another required field.
  stayMonths: 3,
  busy: false,
  error: ''
};

const INITIAL_STATE = {
  route: 'boot', overlay: null, filter: 'all', who: 'amit', method: 'UPI', toast: '',
  // 'system' means follow the phone. RedesignRoot already reads useColorScheme for
  // this; the default was pinned to 'dark', so the app ignored a light phone.
  // `lq` is the ledger's own search box. It had a search bar drawn on it from the
  // very first prototype, but the bar was a plain label — nothing typed, nothing
  // filtered.
  theme: null, pref: 'system', q: '', pq: '', lq: '', place: 'sunrise', ticket: 1, tstatus: {},
  roster: {}, gone: [], mover: null, invite: 'sunrise', jq: '', rents: {}, draft: 0,
  // Which guest's code is currently revealed on the member screen. Held as an id
  // rather than a boolean so opening a different member never inherits the last
  // one's revealed state — a credential should not appear on screen because of
  // something you tapped two people ago.
  greveal: null,
  // Which declared payment the confirm sheet is deciding, and the optional note
  // that travels with a rejection.
  paydec: null, paynote: '',
  // Which priority the dashboard's ticket list is filtered to ('all' = every one).
  tprio: 'all',
  idmode: 'email', adult: true, jfilter: 'all', paymethod: 'gpay', paid: false,
  unit: '101', fx: '0',
  scope: { home: 'all', units: 'all', people: 'all' },

  // The QR scanner's manually-typed fallback code.
  scanCode: '',
  // True while a tenant's "request to join" is in flight.
  joining: false,
  // Which join request the landlord has opened from the inbox.
  join: null,
  // Months a guest's stay runs for when the landlord accepts them. null = open-ended.
  // 'asked' means "whatever this applicant asked for", which is what the decide sheet
  // should open on — see resolveJoinStay. It falls back to six months for an applicant
  // who did not say, which is what this used to be pinned to for everybody.
  joinStay: 'asked',

  // The property being edited (a copy of its current values, so cancelling leaves
  // the real one untouched).
  ep: { ...BLANK_EDIT_PROPERTY },

  // ── Finding a property by its invite code ──
  // The result of resolving a scanned QR or a typed code against the server. This
  // exists because the app used to look the code up in its own in-memory property
  // list, which on a real tenancy is the demo bundle — so a genuine landlord's code
  // matched nothing and the screen said "no property matches that code" about a
  // code that was perfectly valid.
  look: { code: '', loading: false, error: '', place: null },
  // The room the tenant has picked while looking at a property, as a unit id, or null
  // for "no preference". Kept out of `look` so re-running the lookup does not have to
  // remember to clear it, and so closing the sheet can reset it in one place.
  askRoom: null,

  // ── ID documents ──
  // `docs` is whichever person's documents the landlord currently has open; it is
  // fetched per view rather than bundled into the dashboard payload, because an ID
  // proof is the most sensitive row in the database and should not be shipped to a
  // client that has not asked to look at one.
  // `key` identifies the open view ('tenant:7' / 'join:3') so a late response for
  // a person the landlord has navigated away from is discarded, not rendered.
  docs: { key: '', from: null, list: [], summary: null, person: null, noAccount: false, loading: false, error: '', deciding: 0 },
  // The document currently open full-screen, or null. Deliberately NOT part of
  // `docs`: it sits above whichever sheet opened it — the landlord's list or the
  // tenant's own — and closing it must leave that sheet exactly as it was, with the
  // Verify and Reject buttons still there. Both sheets set this same key.
  docView: null,
  // The tenant's own documents, and the add form.
  myDocs: { list: [], summary: null, loading: false, error: '', loaded: false },
  docForm: { type: 'aadhaar', number: '', photo: null, error: '', busy: false },
  // True while the tenant is in the "you must add an ID" step of registration,
  // which is what makes the document mandatory rather than merely offered.
  docGate: false,

  // ── Device permissions (the one-time primer) ──
  // What the OS has told us about each thing the app can ask for. 'unknown' = we
  // have not asked in this session; 'missing' = the native module that owns the
  // permission is not in this build, so there is nothing to ask (an OTA update
  // cannot add native code). Kept in memory only: the OS is the real record, and
  // a cached "granted" would go stale the moment the user changes it in Settings.
  perms: { camera: 'unknown', photos: 'unknown' },
  permBusy: '',

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
  // The server's own error code alongside the message. A hint should key off a
  // fact ('NOT_REGISTERED'), never off matching the wording of a sentence that
  // someone will reword one day.
  authCode: '',
  // Consecutive failed sign-ins for this screen. Three wrong passwords is the
  // point at which "I have forgotten it" becomes likelier than a typo.
  authFails: 0,
  signupRole: 'owner',  // which login screen 'Create account' was tapped from
  // "Join as a guest": the code someone carries in from the sign-in screen before
  // they have an account. Held until registration finishes, then the join request
  // is sent for them — so the code they scanned is not lost on the way through
  // signing up, which is the whole point of letting them start without an account.
  pendingJoin: '',
  // The typed half of the guest chooser.
  guestCode: '',
  req: null,            // index of the tenant request opened from Help

  // ── Data (Phase 3) ──
  // Starts as the seed so the very first paint is never empty; replaced by the
  // mapped live payload once loadOwnerData() returns. `live` says which one it is.
  data: SEED,
  live: false,
  // The rent-payment form: the reference in flight, whether we have asked "did that
  // work?", and the "I paid another way" fields.
  pay: { ...BLANK_PAY },
  // The tenant's own receipts screen.
  receipts: { loading: false, error: '' },
  // ── Pinning a property on the map ───────────────────────────────────────────
  // A full screen rather than part of the property sheet, and not for cosmetic
  // reasons: dragging a map inside a bottom sheet inside a scroll view is three
  // pan gestures competing for the same finger, and the map always loses.
  //
  // `back` is which form sent us here, so "Use this location" returns to it with
  // the pin filled in rather than dumping the half-typed property.
  pin: {
    back: null,     // 'newproperty' | 'editproperty'
    lat: null,
    lon: null,
    zoom: 16,
    q: '',
    results: [],
    searching: false,
    address: null,  // what the pin reverse-geocoded to, if anything
    error: ''
  },
  // ── Joining as a guest ──────────────────────────────────────────────────────
  // The whole guest form, in one place. `step` is which half is on screen: 'code'
  // asks which property, 'you' asks for the phone number and the government ID.
  // Two steps rather than one long form because the first is often answered by
  // pointing a camera at a QR, and mixing that with typing is what made the old
  // screen feel like a wall.
  gform: { ...BLANK_GUEST_FORM },
  // Signing back in with a guest ID, for a guest on a new phone.
  gsignin: { code: '', phone: '', busy: false, error: '' },
  // The form that turns a guest into a full account.
  claim: { name: '', email: '', password: '', busy: false, error: '' },
  // The demo account's own status: null for every real landlord, so the reset control
  // in Settings is hidden by default and only appears once the server has said this
  // IS the demo. Never assumed from an email typed at the login screen.
  demo: null,
  demoBusy: false,
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
const BLANK_PROPERTY = { name: '', type: 'PG', address: '', locality: '', city: '', pincode: '', lat: null, lon: null, photo: null, busy: false, error: '' };
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
  // People asking to be let into one of this owner's properties.
  const JOINS = D.joins || [];
  const PENDING_JOINS = JOINS.filter((j) => j.pending);
  // Payments tenants say they have made, waiting on a yes or no. Every one of these
  // is a tenant who believes they have paid and a month that has not cleared, so
  // they are counted on the bell alongside people asking to join — both are "someone
  // is blocked until you decide".
  const DECLARED = D.declared || [];
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
  // "Anush Kulal" → AK, "Nihar Kulal" → NK. One name gets ONE letter rather than
  // two of its own ("Anush" → A, not AN): two letters from a single word reads like
  // initials that are not there.
  const initialsOf = (name) => {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '';
    if (parts.length === 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  // "9000000000" → "+91 90000 00000". Ten digits are assumed Indian; anything else
  // is shown as given rather than reshaped into a format it may not be in.
  const fmtPhone = (p) => {
    const d = String(p || '').replace(/[^0-9]/g, '');
    return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : String(p || '');
  };
  // Copy, and say so. The clipboard write itself is copyToClipboard at module scope
  // (see the note there); this only adds the toast, which needs `flash`.
  const copyText = (text, done) => {
    if (!text) return;
    flash(copyToClipboard(text) ? (done || 'Copied') : 'Could not copy that');
  };
  // Open the phone's messaging app with the number and an opening line filled in.
  // A join request has no tenancy behind it yet, so there is no in-app thread to
  // put a message in — SMS is the channel that actually exists at this point.
  const messageNumber = (phone, label, prefill) => {
    const n = String(phone).replace(/[^0-9+]/g, '');
    const url = `sms:${n}${prefill ? `?body=${encodeURIComponent(prefill)}` : ''}`;
    Linking.openURL(url).catch(() => copyText(phone, `Could not open messages — ${label}'s number copied`));
  };
  const callNumber = (phone, label) => {
    const url = `tel:${String(phone).replace(/[^0-9+]/g, '')}`;
    Linking.openURL(url).catch(() => flash(`Could not start a call to ${label}`));
  };
  // Hand a file to the phone. Used for ID documents, which are as often PDFs as
  // photos — the system viewer zooms, rotates and shares; an <Image> does none of
  // that and shows a PDF as a blank box.
  const openLink = (url) => {
    if (!url) { flash('That file is missing.'); return; }
    Linking.openURL(url).catch(() => copyText(url, 'Could not open the file — its link is copied'));
  };

  // Open a document in the app's own full-screen viewer. Takes the mapped row rather
  // than just a URL, because the viewer's header names the document and its verdict —
  // "Aadhaar card · PENDING" — and a landlord looking at a photograph of a card should
  // not have to remember which of three rows they tapped.
  //
  // openLink above is now reached only from here, for PDFs and for a failed image
  // load. It used to be what "Open" did for everything, which is why the app kept
  // disappearing into a browser.
  const viewDoc = (x) => {
    if (!x || !x.url) { flash('That file is missing.'); return; }
    setState({ docView: { url: x.url, label: x.label || 'ID document', status: String(x.status || '').toUpperCase(), isPdf: !!x.isPdf } });
  };

  // The landlord contact, resolved once: from /tenant-portal/me when the tenancy is
  // live, otherwise the seed's demo landlord so the walk-through still shows a
  // person. Both the Help screen's card and every request sheet read this, so they
  // can never name different people.
  // The tenant's OWN payment history, straight from /tenant-portal/payments. Every
  // state is here including Rejected, because a refused claim the tenant cannot see
  // is the version of this that generates a phone call.
  const MY_PAYMENTS = (TD && TD.payments) || [];
  // The single claim currently waiting on the landlord, if any. The server allows one
  // at a time, so the screen can block a second attempt before it is made rather than
  // after a 409.
  const myAwaiting = MY_PAYMENTS.find((p) => p.status === 'Declared') || null;

  // A tenant with no tenancy has NO landlord, and must not be shown one. This used
  // to fall back to the demo landlord's real name and number for everybody, so a
  // tenant who had left a property — or never joined one — kept a stranger's phone
  // number on their Help screen and could ring it. The seed values are only for the
  // pre-login walkthrough, which is the one place a person is not signed in as
  // anybody.
  const hasLandlord = !!(LANDLORD && LANDLORD.name);
  const landlordCard = {
    has: hasLandlord,
    name: hasLandlord ? LANDLORD.name : (TLIVE ? '' : 'Demo Landlord'),
    phone: hasLandlord ? LANDLORD.phone : (TLIVE ? '' : '9000000000'),
    phoneLabel: hasLandlord ? fmtPhone(LANDLORD.phone) : (TLIVE ? '' : fmtPhone('9000000000')),
    // /tenant-portal/me does not carry the landlord's photo, so on a real tenancy
    // there is none to show. Return null and let the card fall back to an initial
    // rather than putting a stranger's stock face next to their name.
    img: TLIVE ? null : 'https://randomuser.me/api/portraits/men/32.jpg',
    initials: initialsOf(hasLandlord ? LANDLORD.name : (TLIVE ? '' : 'Demo Landlord')),
    email: hasLandlord ? (LANDLORD.email || '') : (TLIVE ? '' : 'demo@gmail.com'),
    // Tapping their picture opens their details — it looked tappable and did
    // nothing, which is worse than not looking tappable at all.
    open: () => setState({ overlay: 'landlord' }),
    // Every one of these used to fall through to the demo landlord's real number and
    // email. A tenant with no tenancy could copy them, and ring them.
    copyPhone: () => (hasLandlord && LANDLORD.phone
      ? copyText(LANDLORD.phone, 'Number copied')
      : flash('You are not in a property yet')),
    copyEmail: () => (hasLandlord && LANDLORD.email
      ? copyText(LANDLORD.email, 'Email copied')
      : flash('You are not in a property yet')),
    call: () => (hasLandlord && LANDLORD.phone
      ? callNumber(LANDLORD.phone, LANDLORD.name || 'your landlord')
      : flash(TLIVE ? 'Join a property first — then your landlord appears here' : 'No number on file'))
  };


  const mode = s.theme || 'dark';
  const dark = mode === 'dark';
  // NOTE: colour resolution (ACCENTS/SURFACES/EDGES/vars) is owned by
  // ThemeContext and intentionally dropped here — the vm carries token keys only.

  // An invite QR carries the join link (https://tenantpro.app/join/TP-SUN-8412), but
  // a landlord might equally read the code out loud or paste the link into the
  // search box, so accept any of them and keep only the code itself.
  //
  // Drop any query string or fragment FIRST, then take the last path segment:
  // splitting on all three at once made "?ref=x" the last piece and read it as the
  // code. Shared by the scanner and the search box — two copies would drift.
  // (Implementation hoisted to module scope — see codeOf above.)

  // Does the typed identifier match the EMAIL/MOBILE switch? '' when it does.
  //
  // The switch used to be cosmetic: it changed the label and the keyboard while the
  // value went to an endpoint matching `email = ? OR phone = ?`, so choosing MOBILE
  // and typing an email address signed you straight in — on both the landlord and
  // the tenant screen.
  const idModeError = (() => {
    const id = String(s.authId || '').trim();
    if (!id) return '';
    if (s.idmode === 'mobile') {
      if (/^[0-9]{10}$/.test(id)) return '';
      return /@/.test(id)
        ? 'That is an email address. Switch to EMAIL to sign in with it.'
        : 'A mobile number is 10 digits.';
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id)) return '';
    return /^[0-9\s+-]+$/.test(id)
      ? 'That is a phone number. Switch to MOBILE to sign in with it.'
      : 'Enter a valid email address.';
  })();

  const whoBase = TENANTS.find((t) => t.id === s.who) || TENANTS[0] || EMPTY_TENANT;
  const who = {
    ...whoBase,
    rent: s.rents[whoBase.id] ? `₹${inr(s.rents[whoBase.id])}` : whoBase.rent,
    rentFull: s.rents[whoBase.id] ? `₹${inr(s.rents[whoBase.id])}` : whoBase.rentFull
  };
  const credit = creditOf(who);
  const owner = ['home', 'units', 'people', 'tenant', 'ledger', 'settings', 'profile', 'property', 'support', 'ticket'].includes(s.route);
  const place = PROPS.find((p) => p.id === s.place) || PROPS[0] || EMPTY_PLACE;

  // Open the map picker for whichever property form is asking. Needs `s` to read
  // the form's current pin, so it lives here rather than on `api`.
  const openPinFor = (which) => {
    const form = which === 'editproperty' ? (s.ep || BLANK_EDIT_PROPERTY) : (s.np || BLANK_PROPERTY);
    // Start where the property already is, if it has been pinned before.
    const start = hasPin(form.lat, form.lon)
      ? { lat: Number(form.lat), lon: Number(form.lon) }
      : DEFAULT_CENTER;
    setState({
      route: 'pinpick',
      overlay: null,
      pin: { back: which, lat: start.lat, lon: start.lon, zoom: hasPin(form.lat, form.lon) ? 17 : 13, q: '', results: [], searching: false, address: null, error: '' }
    });
    // Describe where the pin is STARTING, not only where it is dragged to. Dragging
    // was the sole trigger for a reverse-geocode, so opening the picker on a
    // property that is already pinned — exactly what "Move pin" does — and pressing
    // "Use this location" without dragging first left the address unknown, and the
    // form got a bare coordinate and nothing else. The picker also had no address to
    // print, so it sat there saying "Drag to place the pin" over a perfectly good
    // location.
    api.describePin(start.lat, start.lon);
  };


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
  // Describes whichever list the Properties tab is showing: the properties
  // themselves, or one property's rooms once you have picked one.
  const unitsLine = scoped
    ? `${unitList.length} ${unitList.length === 1 ? 'room' : 'rooms'} in ${scopeProp.name} · ${vacantCount || 'no'} vacant`
    : `${PROPS.length} ${PROPS.length === 1 ? 'property' : 'properties'} · ${UNITS.length} ${UNITS.length === 1 ? 'room' : 'rooms'} · ${vacantCount} vacant`;

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
  // Every open ticket in scope, before the priority filter — the counts have to be
  // computed from this, or filtering to HIGH would leave every other chip reading 0
  // and there would be no way back.
  const openTickets = TICKETS
    .filter((t) => (!scoped || unitProp[t.unit] === curProp) && statusOf(t) !== 'Resolved')
    .sort((a, b) => PRIORITY[a.priority].rank - PRIORITY[b.priority].rank);
  const prioFilter = s.tprio || 'all';
  const shownTickets = prioFilter === 'all'
    ? openTickets
    : openTickets.filter((t) => t.priority === prioFilter);
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
      // Onto the ticket's own page. This used to open a sheet, so a landlord read a
      // ticket in a modal, replied in a modal, and had a third place — Help &
      // support — showing the same thing again. One destination for a ticket.
      read: () => selectTicket(t.id),
      start: () => { api.setRequestStatus(t.id, 'In Progress'); flash(`Opened — ${t.title}`); },
      resolve: () => { api.setRequestStatus(t.id, 'Resolved'); setState({ overlay: null }); flash(`Resolved — ${t.title}`); },
      started: st !== 'Open',
      notStarted: st === 'Open'
    };
  };
  // The dashboard only ever carries the top of the pile.
  const urgent = shownTickets.filter((t) => t.priority === 'Critical' || t.priority === 'High').slice(0, 3);
  const preview = (urgent.length ? urgent : shownTickets.slice(0, 2)).map(card);
  // The priority chips are filters, not just a tally: tapping one narrows the list
  // below and tapping it again clears it. Counts come from `openTickets` so they
  // stay honest while a filter is on, and a chip with nothing in it is not offered
  // at all — a filter that empties the list teaches nothing.
  const counts = (() => {
    const bands = ['Critical', 'High', 'Medium', 'Low']
      .map((k) => ({
        key: k,
        label: k.toUpperCase(),
        n: String(openTickets.filter((t) => t.priority === k).length),
        fg: PRIORITY[k].fg,
        bg: PRIORITY[k].bg
      }))
      .filter((c) => c.n !== '0')
      .map((c) => ({
        ...c,
        on: prioFilter === c.key,
        go: () => set('tprio', prioFilter === c.key ? 'all' : c.key)
      }));
    // An explicit ALL chip, but only once there is more than one band to choose
    // between — otherwise it is a filter with a single option.
    if (bands.length > 1) {
      bands.unshift({
        key: 'all',
        label: 'ALL',
        n: String(openTickets.length),
        fg: 'fg',
        bg: 'ink3',
        on: prioFilter === 'all',
        go: () => set('tprio', 'all')
      });
    }
    return bands;
  })();
  // What actually needs the landlord's attention, built from data already on
  // hand: no new endpoint and no polling. Derived once so the bell's dot and the
  // sheet's contents are the same list.
  const ALERTS = (() => {
      const rows = [];
      // Someone is waiting on an answer from a person, not a system, so this leads.
      if (PENDING_JOINS.length) {
        const first = PENDING_JOINS[0];
        rows.push({
          icon: 'person-add',
          tone: 'accent',
          title: PENDING_JOINS.length === 1
            ? `${first.name} wants to join ${first.property}`
            : `${PENDING_JOINS.length} people want to join`,
          sub: PENDING_JOINS.length === 1
            ? `Asked ${String(first.age).toLowerCase()} · accept or decline`
            : `${PENDING_JOINS.map((j) => String(j.name).split(' ')[0]).slice(0, 3).join(', ')}${PENDING_JOINS.length > 3 ? ' and more' : ''}`,
          go: () => setState({ overlay: 'joins' })
        });
      }
      // Directly above overdue on purpose. A tenant in this queue may well be one of
      // the tenants listed as overdue — they have paid and are waiting to be believed
      // — so the landlord should see the claim before they see the accusation.
      if (DECLARED.length) {
        const oldest = DECLARED[0];
        const total = DECLARED.reduce((a, p) => a + p.amountRaw, 0);
        rows.push({
          icon: 'cash',
          tone: 'lime',
          title: DECLARED.length === 1
            ? `${oldest.name} says they paid ${oldest.amount}`
            : `${DECLARED.length} payments waiting on you`,
          sub: DECLARED.length === 1
            ? `${oldest.method} · claimed ${String(oldest.age).toLowerCase()} · confirm or reject`
            : `${money(total)} claimed · oldest ${String(oldest.age).toLowerCase()}`,
          go: () => setState({ overlay: 'declared' })
        });
      }
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
  // Open a ticket on its own page. Also pulls its conversation, so the landlord sees
  // the replies already on it rather than an empty box.
  //
  // This used to just select it, leaving the full ticket — the description, the
  // photos, the conversation and the reply box — appended UNDER the list on the
  // same screen. That meant tapping a ticket looked like nothing happened, and the
  // reply box you were being asked to type into was several screens down, below
  // however many other tickets there were. A ticket is a thing you work on, so it
  // gets a screen.
  const selectTicket = (id) => {
    setState({ ticket: id, reply: '', route: 'ticket', overlay: null });
    if (id != null) api.loadThread(id);
  };

  const PAYMENTS = PAYMENTS_SRC.filter((p) => !scoped || unitProp[p.unit] === curProp);
  const EXPENSES = EXPENSES_SRC.filter((e) => !scoped || e.prop === curProp);

  const nameOf = (id) => (TENANTS.find((t) => t.id === id) || {}).name;
  const imgOf = (id) => (TENANTS.find((t) => t.id === id) || {}).img;
  const toNum = (str) => Number(str.replace(/,/g, ''));
  // A ledger row's second line is what the search actually reads, so it carries the
  // real reference rather than the prototype's literal "DEMO-REF" — which was the
  // same on every row and told the landlord nothing about which transfer this was.
  // `nameOf` falls back to the name on the payment itself: a payment outlives the
  // tenant record when someone moves out, and "UNIT 101 · UPI" with no name above it
  // reads as a bug.
  const inRow = (p) => ({
    name: nameOf(p.who) || p.name || 'Payment',
    sub: [p.unit ? `UNIT ${p.unit}` : null, p.method || null, p.ref || null]
      .filter(Boolean).join(' · '),
    amt: `+₹${p.amt}`, date: p.date, fg: 'pos',
    icon: 'arrow-down', iconBg: 'lsoft', iconFg: 'pos'
  });
  const outRow = (e) => ({
    name: e.name, sub: e.sub, amt: `−₹${e.amt}`, date: e.date, fg: 'fg2',
    icon: 'arrow-up', iconBg: 'csoft', iconFg: 'coral'
  });
  const monthIn = (m) => PAYMENTS.filter((p) => p.month === m).reduce((a, p) => a + toNum(p.amt), 0);
  const monthOut = (m) => EXPENSES.filter((e) => e.month === m).reduce((a, e) => a + toNum(e.amt), 0);

  // ── The ledger search ──────────────────────────────────────────────────────
  // The bar was drawn from the first prototype but was a plain label: nothing could
  // be typed into it and nothing was filtered. It matches on everything the row
  // shows — the person, the room, the method, the reference, the amount and the date
  // — because a landlord looking for a payment has whichever of those their bank
  // statement happened to give them.
  const lq = s.lq.trim().toLowerCase();
  const rowMatches = (r) => !lq
    || `${r.name} ${r.sub} ${r.amt} ${r.date}`.toLowerCase().includes(lq);

  // Which months to show. This used to be two hardcoded titles, 'AUGUST 2026' and
  // 'JULY 2026' — so the headings were wrong in any other month, and a payment from
  // three months ago existed in the data but could never be seen or searched. Now
  // every month that actually has a transaction gets a group, most recent first.
  const monthTitle = (m) => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - m);
    return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
  };
  const ledgerMonths = Array.from(
    new Set([...PAYMENTS, ...EXPENSES].map((r) => Number(r.month) || 0))
  ).sort((a, b) => a - b);
  const ledger = ledgerMonths.map((m) => {
    const rows = [
      ...PAYMENTS.filter((p) => p.month === m).map(inRow),
      ...EXPENSES.filter((e) => e.month === m).map(outRow)
    ].filter(rowMatches);
    return {
      title: monthTitle(m),
      // The total belongs to the rows on screen. Showing the month's full total
      // beside a filtered list would read as an arithmetic error.
      total: `+${money(lq
        ? rows.reduce((a, r) => a + (r.fg === 'pos' ? toNum(r.amt.replace(/[^0-9,]/g, '')) : 0), 0)
        : monthIn(m))}`,
      rows
    };
  }).filter((g) => g.rows.length);

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
  // ── Who "me" is on the tenant side ─────────────────────────────────────────
  // On a live tenancy this MUST come from /tenant-portal/me. It used to be the demo
  // roster's Rahul, with the property found by matching his unit NUMBER against the
  // demo unit list — so a real tenant living in a room called "101" was shown the
  // demo property's name, photo, code, policy and address on their own home card,
  // and their rent, deposit and move-in date came from a stranger.
  const MINE = TLIVE ? mapMyPlace(TD.me) : { place: null, unit: null };
  const meLive = TLIVE ? (() => {
    const pro = (TD.me && TD.me.profile) || {};
    const rent = (TD.me && TD.me.rent) || {};
    const home = (TD.me && TD.me.home) || {};
    const days = rent.days_until_due;
    return {
      ...EMPTY_TENANT,
      id: 'me',
      name: pro.name || (u && u.name) || 'You',
      img: mediaUrl(pro.image_url),
      unit: home.unit_number != null ? String(home.unit_number) : null,
      type: home.room_type || '',
      rent: `₹${inr(rent.amount)}`,
      rentFull: `₹${inr(rent.amount)}`,
      rentRaw: Number(rent.amount) || 0,
      deposit: `₹${inr(home.deposit)}`,
      depositRaw: Number(home.deposit) || 0,
      credit: Number(pro.credit_score) || 0,
      // The same scored record their landlord is looking at, computed once on the
      // server. Two copies of the rules would eventually disagree, and a tenant shown
      // a different number from their landlord's cannot argue with either.
      score: pro.score || null,
      // The server already worked out whether rent is late and by how much; a
      // second opinion computed here could disagree with the tenant's own portal.
      state: rent.state === 'overdue' ? 'overdue' : 'paid',
      days: days == null ? 0 : Math.abs(days),
      movedIn: pro.move_in_date ? fmtDay(pro.move_in_date) : '',
      since: `${pro.move_in_date ? monthsSince(pro.move_in_date) : 0} mo`,
      phone: pro.phone || '',
      email: pro.email || '',
      co: pro.company || '',
      propertyId: home.property_id != null ? String(home.property_id) : null
    };
  })() : null;

  const me = meLive || ROSTER.find((t) => t.id === 'rahul') || ROSTER[0] || TENANTS[0] || EMPTY_TENANT;
  // When their rent is next due, in prose. Blank on the walk-through, where there is
  // no real date to show — better than the prototype's hard-coded "30 Aug", which
  // told every tenant the same wrong day.
  const myDue = TLIVE && TD.me && TD.me.rent ? fmtDay(TD.me.rent.next_due) : '';
  const myUnit = TLIVE ? MINE.unit : UNITS.find((u2) => u2.no === me.unit);
  const myProp = TLIVE ? MINE.place : (myUnit ? PROPS.find((p) => p.id === myUnit.prop) : null);
  const myPropId = (TD && TD.me && TD.me.home && TD.me.home.property_id) != null
    ? TD.me.home.property_id
    : null;
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
    showHeader: owner && !['ledger', 'people', 'support', 'ticket'].includes(s.route),
    showBack: !mod,
    backTitle: { property: 'Properties & units', profile: 'My profile', settings: 'Settings', tenant: 'People' }[s.route] || '',
    // The header's back chevron walks the same trail the phone's back gesture does,
    // so the two never disagree. The parent map is the fallback for a screen
    // arrived at without a trail (a deep link, or the first screen after login).
    goBack: () => {
      if (api.goBackOneStep()) return;
      go({ property: 'units', profile: 'settings', settings: 'home', tenant: 'people', ticket: 'support' }[s.route] || 'home');
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
    // ── Edit / delete a property ──────────────────────────────────────────────
    // A landlord could add a property and open it, but never correct the name, the
    // address or the photo, and never remove one — the endpoints existed, nothing
    // called them. Seeded from what is stored, because the update replaces every
    // text column and a blank field would erase it.
    openEditProperty: () => setState({
      overlay: 'editproperty',
      ep: {
        ...BLANK_EDIT_PROPERTY,
        id: place.id,
        name: place.name || '',
        type: place.propType || 'PG',
        address: place.addressRaw || '',
        locality: place.localityRaw || '',
        city: place.cityRaw || '',
        pincode: place.pincodeRaw || '',
        // Seeded from what is stored, so "Move pin" opens on the property rather
        // than in the middle of the city, and so saving an edit that never touched
        // the map writes the same pin back rather than dropping it.
        lat: place.lat != null ? place.lat : null,
        lon: place.lon != null ? place.lon : null
      }
    }),
    isEditProperty: s.overlay === 'editproperty',
    editProperty: (() => {
      const ep = s.ep || BLANK_EDIT_PROPERTY;
      const put = (patch) => setState({ ep: { ...ep, ...patch, error: '' } });
      return {
        title: 'Edit property',
        name: ep.name, setName: (e) => put({ name: evStr(e) }),
        address: ep.address, setAddress: (e) => put({ address: evStr(e) }),
        locality: ep.locality, setLocality: (e) => put({ locality: evStr(e) }),
        city: ep.city, setCity: (e) => put({ city: evStr(e) }),
        pincode: ep.pincode, setPincode: (e) => put({ pincode: evStr(e).replace(/[^0-9]/g, '') }),
        types: PROPERTY_TYPES.map((k) => ({ label: k, on: ep.type === k, go: () => put({ type: k }) })),
        // ── The pin ──
        // Opening the map leaves this sheet for a full screen (see PinPickScreen for
        // why), and comes back to it with the coordinates filled in. The form is
        // state, not a mounted component, so nothing typed here is lost meanwhile.
        pinned: hasPin(ep.lat, ep.lon),
        pinLine: hasPin(ep.lat, ep.lon)
          ? `${roundCoord(ep.lat)}, ${roundCoord(ep.lon)}`
          : 'Not pinned yet',
        pinLabel: hasPin(ep.lat, ep.lon) ? 'Move the pin' : 'Pin on the map',
        pinHint: 'So your tenants can get directions to the door.',
        openPin: () => openPinFor('editproperty'),
        clearPin: () => put({ lat: null, lon: null }),
        // The existing photo shows until a new one is picked, so it is obvious that
        // leaving it alone keeps it.
        photo: ep.photo ? ep.photo.uri : (place.img || null),
        hasPhoto: !!(ep.photo || place.img),
        photoNote: ep.photo ? 'New photo — save to replace the old one.' : 'Pick a new one to replace it.',
        pickPhoto: () => api.pickPhotoFor('ep', 'library'),
        takePhoto: () => api.pickPhotoFor('ep', 'camera'),
        clearPhoto: () => put({ photo: null }),
        error: ep.error, hasError: !!ep.error,
        busy: !!ep.busy,
        canSubmit: !!ep.name.trim() && !ep.busy,
        submit: () => {
          if (!ep.name.trim()) { setState({ ep: { ...ep, error: 'A property needs a name.' } }); return; }
          api.saveProperty();
        },
        cancel: () => setState({ overlay: null, ep: { ...BLANK_EDIT_PROPERTY } })
      };
    })(),

    // Deleting is behind a confirmation, and the confirmation says what it will take
    // with it — the rooms go too, which is not obvious from the word "delete".
    askDeleteProperty: () => setState({ overlay: 'delproperty' }),
    isDeleteProperty: s.overlay === 'delproperty',
    deleteProperty: (() => {
      const rooms = UNITS.filter((u) => u.prop === place.id);
      const living = rooms.reduce((a, u) => a + occupantsOf(u.no).length, 0);
      return {
        name: place.name || '',
        // The server refuses this outright; saying so first is kinder than a failed
        // request, and the count tells them what to do about it.
        blocked: living > 0,
        blockedLine: living
          ? `${living} ${living === 1 ? 'tenant is' : 'tenants are'} still living here. Move them out first — TenantPro will not delete a property with people in it.`
          : '',
        line: rooms.length
          ? `This also deletes ${rooms.length} ${rooms.length === 1 ? 'room' : 'rooms'}. Payment history stays in your ledger.`
          : 'This property has no rooms yet.',
        confirm: () => api.deleteProperty(place.id, place.name),
        cancel: () => setState({ overlay: null })
      };
    })(),

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
        // ── The pin ──
        // Opening the map leaves this sheet for a full screen (see PinPickScreen for
        // why), and comes back to it with the coordinates filled in. The form is
        // state, not a mounted component, so nothing typed here is lost meanwhile.
        pinned: hasPin(np.lat, np.lon),
        pinLine: hasPin(np.lat, np.lon)
          ? `${roundCoord(np.lat)}, ${roundCoord(np.lon)}`
          : 'Not pinned yet',
        pinLabel: hasPin(np.lat, np.lon) ? 'Move the pin' : 'Pin on the map',
        pinHint: 'So your tenants can get directions to the door.',
        openPin: () => openPinFor('newproperty'),
        clearPin: () => put({ lat: null, lon: null }),
        photo: np.photo ? np.photo.uri : null,
        hasPhoto: !!np.photo,
        // Two ways in: the phone's camera for something in front of you, the
        // gallery for a picture you already have.
        pickPhoto: () => api.pickPhotoFor('np', 'library'),
        takePhoto: () => api.pickPhotoFor('np', 'camera'),
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
        // Two ways in: the phone's camera for something in front of you, the
        // gallery for a picture you already have.
        pickPhoto: () => api.pickPhotoFor('nu', 'library'),
        takePhoto: () => api.pickPhotoFor('nu', 'camera'),
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
          // Room first: it is the thing being picked, so when a long property name
          // has to be truncated the number is still the part you can read.
          label: `${u.no} · ${propName(u.prop)}`,
          on: nt.unitId === u.id,
          // Tapping the chosen room again clears it, so "no room yet" stays reachable.
          go: () => put({ unitId: nt.unitId === u.id ? null : u.id, rent: nt.rent || String(Number(String(u.rent).replace(/[^0-9]/g, '')) || '') })
        })),
        hasRooms: openRooms.length > 0,
        unassigned: nt.unitId == null,
        photo: nt.photo ? nt.photo.uri : null,
        hasPhoto: !!nt.photo,
        // Two ways in: the phone's camera for something in front of you, the
        // gallery for a picture you already have.
        pickPhoto: () => api.pickPhotoFor('nt', 'library'),
        takePhoto: () => api.pickPhotoFor('nt', 'camera'),
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
    // Marks the intro as seen (persisted) and hands off to the permissions primer.
    finishOnboarding: () => { setOnboarded(); go('permits'); },

    // ── The permissions primer ────────────────────────────────────────────────
    // Shown once, between the intro and the role picker, and reachable again from
    // Settings. Two things it deliberately does NOT do: ask the OS for anything
    // on its own (each row is a button, because a prompt nobody expected is the
    // one people deny), and claim a permission for placing calls — `tel:` hands
    // the number to the dialer, which needs no permission at all. Saying so is
    // more use to the reader than a switch that does nothing.
    isPermits: s.route === 'permits',
    permits: (() => {
      const P = s.perms || {};
      const LABEL = { granted: 'ALLOWED', denied: 'NOT ALLOWED', missing: 'NOT IN THIS BUILD', unknown: '' };
      const FG = { granted: 'pos', denied: 'amber', missing: 'fg3', unknown: 'fg3' };
      const NOTE = {
        missing: 'Not in this build yet — it switches on by itself after the next app update.',
        denied: 'You can turn it on later in your phone’s settings, or ask again here.'
      };
      const rows = [
        {
          key: 'camera',
          icon: 'qr-code-outline',
          title: 'Camera',
          why: 'To scan a property’s invite QR when you join one. Typing the code by hand works too, so this is optional.'
        },
        {
          key: 'photos',
          icon: 'image-outline',
          title: 'Photos',
          why: 'To attach a picture to a maintenance request, and to set your profile photo.'
        },
        {
          key: 'location',
          icon: 'location-outline',
          title: 'Location',
          why: 'Only while you are placing a property on the map, so the pin can start where you are standing. Searching or dragging works without it, and TenantPro never follows you around.'
        }
      ].map((r) => {
        const st = P[r.key] || 'unknown';
        return {
          ...r,
          state: st,
          stateLabel: LABEL[st] || '',
          stateFg: FG[st] || 'fg3',
          // 'granted' and 'missing' are both terminal: there is nothing left to ask.
          settled: st === 'granted' || st === 'missing',
          busy: s.permBusy === r.key,
          cta: st === 'denied' ? 'Ask again' : 'Allow',
          note: NOTE[st] || '',
          ask: () => api.askPermission(r.key)
        };
      });
      const granted = rows.filter((r) => r.state === 'granted').length;
      return {
        rows,
        // No button: nothing to grant, only something to explain.
        info: [{
          key: 'calls',
          icon: 'call-outline',
          title: 'Calls & messages',
          why: 'Tapping a number opens your dialer or messages app with it filled in, and you send it. TenantPro never places the call or sends the message itself, and never reads your contacts — so there is no permission to give, and none is asked for.'
        }],
        granted,
        allSettled: rows.every((r) => r.settled),
        doneLabel: granted ? 'Continue' : 'Not now',
        done: () => api.finishPermits()
      };
    })(),
    goPermits: () => go('permits'),
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
    // Role-neutral version of the same thing: both sign-in screens use the
    // EMAIL/MOBILE switch now, and both endpoints accept either identifier, so the
    // field's label, hint and keyboard come from one place.
    idField: {
      label: s.idmode === 'mobile' ? 'MOBILE NUMBER' : 'EMAIL',
      placeholder: s.idmode === 'mobile' ? '98765 43210' : 'you@gmail.com',
      keyboard: s.idmode === 'mobile' ? 'phone-pad' : 'email-address'
    },
    tenantIdValue: s.authId,
    // Both endpoints must be the SAME computed type or the transition never starts.
    idThumbX: s.idmode === 'mobile' ? 'calc(50% + 0px)' : 'calc(0% + 4px)',
    // Switching the mode clears the box. The EMAIL/MOBILE switch used to be
    // cosmetic — it changed the label and the keyboard while the value still went
    // to an endpoint that matched either column, so choosing MOBILE and typing an
    // email address signed you in regardless. Leaving the old value behind after a
    // switch is the same class of confusion, and any verdict about the previous
    // identifier ("no account with these details") no longer applies to this one.
    setEmailMode: () => setState({ idmode: 'email', authId: '', authError: '', authCode: '', authFails: 0 }),
    setMobileMode: () => setState({ idmode: 'mobile', authId: '', authError: '', authCode: '', authFails: 0 }),
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
    // ── Hints that follow the failure ──
    // No account with these details. The error already says so in words, so this
    // only lights up the "Create account" link that is already at the foot of the
    // screen — a second card repeating the same sentence with its own button was
    // more furniture than help.
    authOfferSignup: s.authCode === 'NOT_REGISTERED',
    // Three wrong passwords in a row: stop letting them guess a fourth time.
    authOfferReset: s.authFails >= 3 && s.authCode !== 'NOT_REGISTERED',
    authResetLine: 'That is three attempts. Reset your password instead of guessing.',
    authFailCount: s.authFails,
    // Changing the identifier invalidates a verdict about the previous one — the
    // "no account with these details" hint must not outlive the details it judged.
    setAuthId: (e) => setState({
      // MOBILE mode keeps digits only, capped at ten: an email address simply
      // cannot be entered, which is a better answer than accepting it and then
      // explaining why it was wrong.
      authId: s.idmode === 'mobile' ? evStr(e).replace(/[^0-9]/g, '').slice(0, 10) : evStr(e),
      authError: '',
      authCode: '',
      authFails: 0
    }),
    setAuthPw: (e) => set('authPw', evStr(e)),
    setAuthName: (e) => set('authName', evStr(e)),
    setAuthPhone: (e) => set('authPhone', evStr(e)),
    // Signs in against the real backend; picks the owner or tenant endpoint from
    // the current route so one action serves both login screens.
    // The identifier has to match the EMAIL/MOBILE switch. Checked here so the
    // answer is instant and specific ("switch to EMAIL to sign in with that"), and
    // again inside signIn, which is the half that actually talks to the network.
    //
    // Why it matters: the switch used to be cosmetic. It changed the label and the
    // keyboard while the value went to an endpoint matching `email = ? OR phone = ?`
    // — so choosing MOBILE and typing an email address signed you straight in, on
    // both the landlord and the tenant screen.
    idModeError,
    submitLogin: () => {
      const id = String(s.authId || '').trim();
      if (!id || !s.authPw) { setState({ authError: 'Enter your email/phone and password.' }); return; }
      if (idModeError) { setState({ authError: idModeError }); return; }
      api.signIn(s.route === 'tlogin' ? 'tenant' : 'owner');
    },
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
    ownerInitials: initialsOf((s.session && s.session.user && s.session.user.name) || ''),
    ownerEmail: (s.session && s.session.user && s.session.user.email) || '',
    ownerImg: (s.session && s.session.user && s.session.user.profile_pic)
      ? mediaUrl(s.session.user.profile_pic) : null,

    goSignup: () => setState({ signupRole: s.route === 'tlogin' ? 'tenant' : 'owner', route: 'signup', overlay: null }),

    // ── Join as a guest ───────────────────────────────────────────────────────
    // ── Pinning a property on the map ──────────────────────────────────────────
    // Opened from either property form. The map is a grid of OpenStreetMap tiles
    // drawn as images (see maps.js) because a real map component is a native module
    // and native modules cannot arrive over the air.
    openPinFor,
    isPinPick: s.route === 'pinpick',
    pinPick: (() => {
      const p = s.pin || {};
      const put = (patch) => setState({ pin: { ...p, ...patch } });
      const lat = Number(p.lat);
      const lon = Number(p.lon);
      const editing = p.back === 'editproperty';
      return {
        lat: Number.isFinite(lat) ? lat : DEFAULT_CENTER.lat,
        lon: Number.isFinite(lon) ? lon : DEFAULT_CENTER.lon,
        zoom: p.zoom || 16,
        canZoomIn: (p.zoom || 16) < MAX_ZOOM,
        canZoomOut: (p.zoom || 16) > MIN_ZOOM,
        zoomIn: () => put({ zoom: Math.min(MAX_ZOOM, (p.zoom || 16) + 1) }),
        zoomOut: () => put({ zoom: Math.max(MIN_ZOOM, (p.zoom || 16) - 1) }),
        // Where a pinch lands. Clamped here as well as in the map, because this is
        // the value that gets stored and the map is not the only thing that reads it.
        setZoom: (v) => put({ zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(Number(v) || 16))) }),

        // While a finger is down. Cheap: state only, no network.
        move: (c) => put({ lat: c.lat, lon: c.lon }),
        // When it lifts. Worth one reverse-geocode to say what is under the pin.
        settle: (c) => { put({ lat: c.lat, lon: c.lon, address: null }); api.describePin(c.lat, c.lon); },

        // Start where the landlord is standing — usually the right answer, since
        // somebody adding a property is generally in it. Asks for location at the
        // moment it is used, with the reason on screen.
        useHere: () => api.useMyLocation(),
        hereLabel: 'Use my current location',

        q: p.q || '',
        setQ: (v) => api.searchPlaces(v),
        searching: !!p.searching,
        results: (p.results || []).map((r) => ({
          id: r.id,
          title: r.title,
          subtitle: r.subtitle,
          go: () => {
            // Jump the map there and keep the address, so "use this" can fill the
            // form's address fields from a proper result rather than a guess.
            setState({ pin: { ...s.pin, lat: r.lat, lon: r.lon, zoom: 17, results: [], q: r.title, address: r } });
          }
        })),
        hasResults: !!(p.results || []).length,
        error: p.error || '',
        hasError: !!p.error,

        // What is under the pin right now, in words.
        addressLine: p.address ? [p.address.title, p.address.subtitle].filter(Boolean).join(' · ') : '',
        hasAddress: !!p.address,
        coordLine: `${roundCoord(lat)}, ${roundCoord(lon)}`,

        title: editing ? 'Move the pin' : 'Pin the property',
        line: 'Drag the map so the pin sits on the building, and pinch to zoom. Search first if it is easier.',
        confirmLabel: 'Use this location',

        // Back to whichever form sent us, with the pin filled in. The form itself
        // was never unmounted — it lives in state — so nothing typed is lost.
        confirm: () => {
          const key = editing ? 'ep' : 'np';
          const form = editing ? (s.ep || BLANK_EDIT_PROPERTY) : (s.np || BLANK_PROPERTY);
          const a = p.address || null;
          // A pin on a road or a landmark has no house number, so `street` is empty
          // and the name is the only thing describing it. Preferring `street` keeps
          // "12 80 Feet Road" over "Sunrise Apartments" where both exist.
          const streetLine = (a && (a.street || a.label)) || '';
          const typedAddress = String(form.address || '').trim();
          // Did the pin land somewhere ELSE, or merely get nudged? Two different
          // intentions arrive through the same button, and the street line should be
          // treated differently for each.
          //
          // Only counts a difference when both sides actually say something. A blank
          // field is not evidence of a move, so a new property — where the geocoder
          // fills in everything and there is nothing to contradict — is never treated
          // as having moved.
          const differs = (x, y) => {
            const l = String(x || '').trim().toLowerCase();
            const r = String(y || '').trim().toLowerCase();
            return !!l && !!r && l !== r;
          };
          const movedElsewhere = !!a && (
            differs(a.locality, form.locality)
            || differs(a.city, form.city)
            || differs(a.postcode, form.pincode)
          );
          setState({
            route: editing ? 'property' : 'units',
            overlay: p.back,
            [key]: {
              ...form,
              lat: roundCoord(lat),
              lon: roundCoord(lon),
              // The street line is written when the box is empty, or when the pin has
              // moved to a different place — and left alone when the pin was only
              // nudged around where it already was.
              //
              // Both halves matter, and an earlier version of this only had one of
              // them. Keeping a typed line unconditionally protects "Flat 3B, Sunrise
              // Apartments" — a door number no geocoder can know — when the pin is
              // dragged a few metres to sit on the building properly. But it also left
              // "45, Sector 2, HSR Layout" in place after the pin was moved to
              // Jayanagar, so the address contradicted the locality, city and pincode
              // that had just been filled in around it. A record that disagrees with
              // itself is worse than a lost door number, and the door number was never
              // going to survive a move across the city anyway.
              //
              // The other three are the geocoder's to know and are a single token
              // each, so those always win — retyping a city costs nothing, and being
              // wrong about which pincode a building sits in is worth correcting.
              address: (!typedAddress || movedElsewhere) ? (streetLine || form.address) : form.address,
              locality: (a && a.locality) || form.locality,
              city: (a && a.city) || form.city,
              pincode: (a && a.postcode) || form.pincode,
              error: ''
            },
            pin: { ...p, back: null }
          });
        },
        cancel: () => setState({
          route: editing ? 'property' : 'units',
          overlay: p.back,
          pin: { ...p, back: null }
        })
      };
    })(),

    // "Join as a guest" was withdrawn — see the commit that removed it. Its two
    // routes, both screens and this view-model are gone; what remains elsewhere is
    // everything a guest who ALREADY exists still needs: vm.myGuest reports their
    // state, the landlord still sees their code on the roster, and claim-account still
    // turns them into an ordinary tenant. GUEST_ACCESS_ENABLED on the server is the
    // switch that would bring the flow back, and it defaults to off.

    // What the sign-up screen says when a code is waiting.
    joiningCode: s.pendingJoin,
    isJoiningWithCode: !!s.pendingJoin,
    isSignup: s.route === 'signup',

    // ── Password recovery ──
    // Opened from either login screen; the role is taken from whichever one you
    // came from, and the identifier already typed there is carried over.
    goForgot: () => setState({
      route: 'forgot',
      overlay: null,
      authError: '', authCode: '', authFails: 0,
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
    // {uri, name} rather than a bare URI: a tenant with no photo showed as an
    // empty gap in the stack instead of their initials.
    paidFaces: paidList.map((t) => ({ uri: t.img, name: t.name })),
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
    ticketTotal: prioFilter === 'all'
      ? `${shownTickets.length} OPEN`
      : `${shownTickets.length} ${prioFilter.toUpperCase()}`,
    ticketsFiltered: prioFilter !== 'all',
    ticketFilterLabel: prioFilter === 'all' ? '' : prioFilter.toUpperCase(),
    clearTicketFilter: () => set('tprio', 'all'),
    ticketsEmpty: !shownTickets.length,
    // Say which of the two reasons the list is empty, since one of them is
    // something the user just did and can undo.
    ticketsEmptyLine: prioFilter !== 'all'
      ? `No ${prioFilter.toLowerCase()}-priority tickets open right now.`
      : scoped ? `No open tickets in ${scopeProp.name}.` : 'No open tickets. Nothing to chase.',
    hasMoreTickets: shownTickets.length > preview.length,
    moreTicketsLabel: `View all ${shownTickets.length} tickets`,
    openAllTickets: () => set('overlay', 'tickets'),
    isTickets: s.overlay === 'tickets',
    // The whole priority-filtered list. The dashboard shows the top of the pile
    // only, and `hasMoreTickets` is measured against that, so this is what "View all
    // N tickets" is counting. Each row's `read` opens the ticket's own page.
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
      // Straight to the ticket's own page — where the description, the photos, the
      // conversation and the reply box are.
      readMore: () => setState({ route: 'ticket', overlay: null, ticket: openTicket.id }),
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

    // The Properties tab is a vertical list of PROPERTIES — one card each, with the
    // things a landlord scans for: where it is, how many rooms are free, and whether
    // anyone in it owes money. Rooms live inside a property, so they are one tap in
    // rather than a second horizontal strip of everything at once.
    //
    // The prototype computed occupancy from `u.vacant` on raw UNITS rows, where that
    // field does not exist — so every room read as occupied and the pips were always
    // lime. Occupancy is now counted from who actually lives there.
    properties: PROPS.map((p) => {
      const own = UNITS.filter((u) => u.prop === p.id);
      const rooms = own.map((u) => {
        const occ = occupantsOf(u.no);
        return {
          no: u.no,
          vacant: occ.length === 0,
          free: u.cap - occ.length,
          // Anyone in this room past their due date. This is what puts the red mark
          // on the room and on the property card.
          owing: occ.filter((x) => x.state === 'overdue')
        };
      });
      const free = rooms.filter((r) => r.vacant).length;
      const owingRooms = rooms.filter((r) => r.owing.length);
      const owed = rooms.reduce((a, r) => a + r.owing.reduce((b, x) => b + num(x), 0), 0);
      return {
        id: p.id,
        name: p.name,
        loc: p.loc,
        img: p.img,
        stat: `${own.length - free} / ${own.length} FULL`,
        // Vacancy, said as a fact rather than a fraction to decode.
        vacantLine: own.length === 0
          ? 'No rooms yet'
          : free
            ? `${free} ${free === 1 ? 'room' : 'rooms'} vacant`
            : 'Every room filled',
        vacantFg: own.length === 0 ? 'fg3' : free ? 'amber' : 'pos',
        // The red mark: money owed inside this property.
        dues: owingRooms.length > 0,
        duesLine: owingRooms.length
          ? `${money(owed)} due · ${owingRooms.map((r) => r.no).join(', ')}`
          : '',
        duesCount: String(owingRooms.length),
        pips: rooms.map((r) => (r.owing.length ? 'coral' : r.vacant ? 'amber' : 'lime')),
        roomCount: own.length ? `${own.length} ${own.length === 1 ? 'ROOM' : 'ROOMS'}` : 'NO ROOMS',
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
      // ── Where it is ────────────────────────────────────────────────────────
      // The prototype pointed an <Image> at OpenStreetMap's EMBED page — an HTML
      // page, not an image, so it rendered as a grey box; and both buttons under it
      // were vm.noop. For a real property it was worse than a grey box, because
      // `lat`/`lon` are null until the landlord pins it, so the URL contained the
      // literal string "null".
      //
      // Now: a real map when there is a pin, an honest prompt when there is not, and
      // DIRECTIONS rather than "open the map" — a route from where you are standing
      // is what someone looking at this actually wants.
      pinned: hasPin(place.lat, place.lon),
      lat: Number(place.lat),
      lon: Number(place.lon),
      coordLine: hasPin(place.lat, place.lon)
        ? `${roundCoord(place.lat)}, ${roundCoord(place.lon)}`
        : '',
      unpinnedLine: 'This property has no location pinned yet. Add one so your tenants can find their way here.',
      pinCta: 'Pin the location',
      pinIt: () => setState({
        overlay: 'editproperty',
        ep: {
          ...BLANK_EDIT_PROPERTY,
          id: place.id,
          name: place.name || '',
          type: place.propType || 'PG',
          address: place.addressRaw || '',
          locality: place.localityRaw || '',
          city: place.cityRaw || '',
          pincode: place.pincodeRaw || '',
          // Seeded from the property so the picker opens ON the building. These
          // were hardcoded to null, which made the button lie: "Move pin" dropped
          // the pin it was meant to move and opened the map at the default centre
          // of Bengaluru, leaving you to find the place again. Nothing was lost —
          // saving only sends a pin when there is one, so the stored coordinates
          // survived — but every correction to an existing pin started from
          // scratch.
          lat: hasPin(place.lat, place.lon) ? Number(place.lat) : null,
          lon: hasPin(place.lat, place.lon) ? Number(place.lon) : null
        }
      }),
      directionsLabel: 'Directions',
      directions: () => {
        if (!hasPin(place.lat, place.lon)) { flash('Pin this property first'); return; }
        openDirections(place.lat, place.lon, place.name).then((went) => {
          if (!went) flash('No maps app could open on this phone');
        });
      },
      // The prototype read `u.vacant` off raw UNITS rows, where that field does not
      // exist — so every room here claimed to be OCCUPIED regardless. Occupancy is
      // counted from who actually lives in it, and a room whose tenant owes rent
      // carries the red mark and the amount.
      units: UNITS.filter((u) => u.prop === place.id).map((u) => {
        const occ = occupantsOf(u.no);
        const owing = occ.filter((x) => x.state === 'overdue');
        const owed = owing.reduce((a, x) => a + num(x), 0);
        return {
          no: u.no,
          type: u.type.replace(' · VACANT', ''),
          rent: u.rent,
          vacant: occ.length === 0,
          fg: occ.length === 0 ? 'amber' : owing.length ? 'coral' : 'fg2',
          state: occ.length === 0 ? 'VACANT' : `${occ.length} OF ${u.cap}`,
          dues: owing.length > 0,
          duesLine: owing.length ? `${money(owed)} DUE` : '',
          faces: occ.map((x) => ({ uri: x.img, name: x.name })),
          open: () => setState({ unit: u.no, overlay: 'unit' })
        };
      }),
      roomsLine: (() => {
        const own = UNITS.filter((u) => u.prop === place.id);
        const free = own.filter((u) => occupantsOf(u.no).length === 0).length;
        return own.length
          ? `${own.length} ${own.length === 1 ? 'room' : 'rooms'} · ${free || 'no'} vacant`
          : 'No rooms yet';
      })(),
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

    // True once a property is chosen: the tab then lists that property's rooms
    // instead of the properties.
    showingRooms: scoped,
    units: unitList.map((u) => ({
      no: u.no, rent: u.rent, beds: u.beds,
      open: () => setState({ unit: u.no, overlay: 'unit' }),
      type: u.vacant ? `${u.type} · VACANT` : u.type,
      bg: u.vacant ? 'asoft' : u.late ? 'csoft' : 'ink2',
      fg: 'fg',
      sub: u.vacant ? 'amber' : u.late ? 'coral' : 'fg3',
      dot: u.vacant ? 'amber' : u.late ? 'coral' : 'lime',
      // The red mark, and what it is for: somebody in this room owes rent.
      dues: u.late,
      duesLine: u.late
        ? `${money(u.occ.filter((x) => x.state === 'overdue').reduce((a, x) => a + num(x), 0))} DUE`
        : '',
      faces: u.occ.map((t) => ({ uri: t.img, name: t.name }))
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
      // The payment record, on the row, because "who here pays on time" was a
      // question the list could not answer — you had to open each tenant in turn.
      // Omitted rather than zeroed when there is nothing to score: a grey "—" on
      // every row is noise, and a "0" would be a verdict nobody earned.
      const cr = creditOf(t);
      return {
        score: cr.known ? `SCORE ${cr.label} · ${String(cr.band).toUpperCase()}` : null,
        scoreFg: cr.fg,
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
    // Everything waiting on a decision, surfaced as a number on the bell itself, so
    // "how many things are blocked on me" is answerable without opening anything.
    //
    // Declared payments are counted here and not only in the alerts list, because a
    // payment nobody confirms is the one failure in this app that costs a tenant
    // money: they have paid, their month has not cleared, and every screen still
    // calls them overdue. Being one of two numbers on a bell is the cheapest way to
    // make sure it is not missed.
    bellCount: (PENDING_JOINS.length + DECLARED.length) ? String(PENDING_JOINS.length + DECLARED.length) : '',
    bellUrgent: (PENDING_JOINS.length + DECLARED.length) > 0,
    alertsEmptyLine: 'Nothing needs you right now. Rent is on track and no tickets are open.',

    // ── Help & support (owner) ────────────────────────────────────────────────
    // Where a ticket is actually worked: the whole timeline — every reply and every
    // status change, in the order they happened — plus the controls to move it
    // along. The dashboard card deliberately only previews, so the list of things
    // to do does not turn into a wall of conversation.
    goSupport: () => setState({ route: 'support', overlay: null }),
    isSupport: s.route === 'support',
    // The ticket's own page. Same `support` block feeds both — the list half on the
    // queue screen, the detail half here — so there is one description of a ticket
    // rather than two that can drift apart.
    isTicketPage: s.route === 'ticket',
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
        // Resolving from the ticket's own page returns to the queue: the thing you
        // came here to do is done, and staying on a resolved ticket with no controls
        // left is a dead end.
        resolve: () => {
          if (!sel) return;
          api.setRequestStatus(sel.id, 'Resolved');
          if (s.route === 'ticket') setState({ route: 'support', overlay: null });
        },
        call: () => (person.phone
          ? callNumber(person.phone, person.name || 'this tenant')
          : flash(`No number on file for ${person.name || 'this tenant'}`)),
        // Back to the queue, following the same trail the phone's back gesture does.
        backToList: () => { if (!api.goBackOneStep()) go('support'); },
        // How many are still waiting, for the queue screen's subtitle.
        openCount: all.filter((x) => statusOf(x) !== 'Resolved').length
      };
    })(),

    // ── Requests to join (owner inbox) ────────────────────────────────────────
    // Reached from the bell. Each row is a real person — a tenant_users account, not
    // a tenant record yet — so it shows who they are and how to reach them BEFORE
    // the decision, because "is this someone I know" is the actual question a
    // landlord is answering when a stranger asks to move in.
    openJoins: () => setState({ overlay: 'joins' }),
    isJoins: s.overlay === 'joins',
    joinCount: String(PENDING_JOINS.length),
    hasJoins: PENDING_JOINS.length > 0,
    joins: (() => {
      // Pending first, then most recent: decided ones stay visible as a short
      // history rather than vanishing, so a landlord can see what they did.
      const ordered = [...PENDING_JOINS, ...JOINS.filter((j) => !j.pending)];
      return {
        count: PENDING_JOINS.length,
        title: PENDING_JOINS.length
          ? `${PENDING_JOINS.length} ${PENDING_JOINS.length === 1 ? 'person wants' : 'people want'} to join`
          : 'No one is waiting',
        emptyLine: 'When someone enters one of your property codes, their request lands here for you to accept or decline.',
        empty: ordered.length === 0,
        rows: ordered.map((j) => ({
          id: j.id,
          name: j.name,
          initials: initialsOf(j.name),
          phone: j.phone,
          phoneLabel: fmtPhone(j.phone),
          email: j.email,
          property: j.property,
          note: j.note,
          hasNote: !!j.note,
          age: j.age,
          askedOn: j.askedOn,
          pending: j.pending,
          status: String(j.status).toUpperCase(),
          statusFg: j.pending ? 'amber' : j.status === 'Accepted' ? 'pos' : 'fg3',
          // Reach them before deciding. A message is an SMS rather than an in-app
          // thread: there is no tenancy to hang a conversation off yet.
          call: () => (j.phone ? callNumber(j.phone, j.name) : flash(`No number on file for ${j.name}`)),
          message: () => (j.phone
            ? messageNumber(j.phone, j.name, `Hi ${String(j.name).split(' ')[0]}, about your request to join ${j.property} on TenantPro — `)
            : flash(`No number on file for ${j.name}`)),
          // Open the decision sheet, where a room can be chosen.
          // 'asked' resets the stay choice to whatever THIS applicant asked for.
          // Without the reset the sheet kept the previous request's answer, so a
          // landlord who set 12 months for one person silently set 12 for the next.
          // `unit: null` matters as much as the stay reset: it is what lets the room
          // the applicant asked for be the default. Left set, the previous request's
          // room stayed selected for the next person.
          open: () => setState({ overlay: 'joindecide', join: j.id, joinStay: 'asked', unit: null }),
          decline: () => api.decideJoin({ id: j.id, decision: 'reject', name: j.name }),
          // Whether this stranger has put an ID up, and a way straight to it. The
          // whole point of showing it here is that it answers "should I accept
          // this?" before the decision, not after.
          idState: (j.idProof && j.idProof.state) || 'none',
          idLabel: (j.idProof && j.idProof.label) || 'NO ID ON FILE',
          idFg: (j.idProof && j.idProof.fg) || 'fg3',
          idIcon: (j.idProof && j.idProof.icon) || 'shield-outline',
          seeId: () => api.loadDocs('join', j.id)
        }))
      };
    })(),

    // The accept sheet: who they are, and which room to put them in (optional).
    isJoinDecide: s.overlay === 'joindecide',
    joinDecide: (() => {
      const j = JOINS.find((x) => x.id === s.join) || PENDING_JOINS[0] || null;
      if (!j) return null;
      // Only rooms in the property they asked about, and only ones with a free bed.
      const rooms = UNITS
        .filter((u) => (j.propertyId ? u.prop === j.propertyId : true))
        .filter((u) => occupantsOf(u.no).length < u.cap);
      return {
        id: j.id,
        name: j.name,
        initials: initialsOf(j.name),
        phone: j.phone,
        phoneLabel: fmtPhone(j.phone),
        email: j.email,
        property: j.property,
        note: j.note,
        hasNote: !!j.note,
        askedOn: j.askedOn,
        age: j.age,
        pending: j.pending,
        status: String(j.status).toUpperCase(),
        // Which room the applicant asked for, when they could see the rooms before
        // asking. Stated as a fact above the chips, and the matching chip is
        // preselected — same shape as the stay dates: they propose, the landlord
        // decides.
        askedUnit: j.askedUnit || null,
        askedUnitLabel: j.askedUnitLabel || '',
        hasAskedUnit: !!j.askedUnit && rooms.some((u) => String(u.id) === String(j.askedUnit)),
        askedRoomLine: !j.askedUnit
          ? 'They did not ask for a particular room.'
          : rooms.some((u) => String(u.id) === String(j.askedUnit))
            ? `They asked for room ${j.askedUnitLabel}.`
            : `They asked for room ${j.askedUnitLabel}, which has no free bed now. Pick another, or accept them and place them later.`,
        rooms: rooms.map((u) => ({
          label: `${u.no} · ${u.rent}`,
          // A room the applicant named is selected unless the landlord has moved off
          // it. `s.unit` is null until they touch a chip, which is what lets the ask
          // be the default without overwriting a real choice.
          on: s.unit != null ? s.unit === u.no : String(u.id) === String(j.askedUnit),
          go: () => set('unit', u.no)
        })),
        hasRooms: rooms.length > 0,
        // Accepting without a room is allowed: the person is admitted and placed
        // later, which is the same thing "add a tenant with no room" already does.
        //
        // Shaped explicitly rather than handed out as a raw unit: the sheet needs a
        // label and an id, and passing the internal unit object let a caller reach
        // for a `.label` that only the chip rows have — which crashed the sheet.
        chosen: (() => {
          // Falls back to the room they asked for, so Accept sends what the sheet shows
          // as selected. Without this the chip read as chosen while the accept posted
          // no room at all.
          const u = s.unit != null
            ? rooms.find((x) => x.no === s.unit)
            : rooms.find((x) => String(x.id) === String(j.askedUnit));
          return u ? { id: u.id, no: u.no, label: `${u.no} · ${u.rent}` } : null;
        })(),
        noRoomsLine: 'Every room in this property is full. You can still accept them and assign a room once one frees up.',

        // How long the guest ID lasts. Presets rather than a date picker because a
        // landlord admitting somebody thinks in months — "three months" — not in
        // calendar dates, and a picker inside a bottom sheet is a fiddly way to say
        // something simple. The resulting date is shown so the choice is not abstract.
        //
        // The applicant is asked the same question when they apply, and their answer
        // becomes the FIRST chip and the preselected one — they are the person who
        // knows. It stays a chip the landlord can move off, because the dates are a
        // commercial term and letting the applicant set their own expiry would be
        // letting them set it to never.
        //
        // Three kinds of value live in s.joinStay: 'asked' (use their date), a number
        // of months, or null for open-ended. null cannot double as "not chosen"
        // precisely because it is a real choice.
        askedStay: j.askedStay || null,
        askedStayLabel: j.askedStayLabel || '',
        // A request left long enough outlives the date it asked for. The chip is
        // dropped rather than shown greyed: the server refuses a past date, so the
        // honest move is not to offer it.
        hasAsked: !!j.askedStay && !j.askedStayStale,
        askedLine: !j.askedStay
          ? 'They did not say how long they are staying.'
          : j.askedStayStale
            ? `They asked to stay until ${j.askedStayLabel}, which has already passed. Pick the dates yourself.`
            : `They asked to stay until ${j.askedStayLabel}.`,

        stayMonths: s.joinStay,
        stayOptions: [
          ...(j.askedStay && !j.askedStayStale
            ? [{ label: `As asked · ${j.askedStayLabel}`, on: s.joinStay === 'asked', go: () => set('joinStay', 'asked') }]
            : []),
          ...[1, 3, 6, 12, null].map((months) => ({
            label: months === null ? 'Open-ended' : monthsLabel(months),
            on: s.joinStay === months,
            go: () => set('joinStay', months)
          }))
        ],
        stayLine: (() => {
          const until = resolveJoinStay(s.joinStay, j);
          if (!until) {
            return 'Their guest ID will not expire. They can still complete a profile at any time.';
          }
          return `Their guest ID works until ${until.label}. After that they complete a profile to keep access, or you extend the dates.`;
        })(),
        idState: (j.idProof && j.idProof.state) || 'none',
        idLabel: (j.idProof && j.idProof.label) || 'NO ID ON FILE',
        idFg: (j.idProof && j.idProof.fg) || 'fg3',
        idIcon: (j.idProof && j.idProof.icon) || 'shield-outline',
        idHint: (j.idProof && j.idProof.state) === 'none'
          ? 'They have not uploaded an ID yet. You can still accept them, or ask them to add one first.'
          : 'Look at what they uploaded before you decide.',
        seeId: () => api.loadDocs('join', j.id),
        call: () => (j.phone ? callNumber(j.phone, j.name) : flash(`No number on file for ${j.name}`)),
        message: () => (j.phone
          ? messageNumber(j.phone, j.name, `Hi ${String(j.name).split(' ')[0]}, about your request to join ${j.property} on TenantPro — `)
          : flash(`No number on file for ${j.name}`)),
        accept: () => {
          const room = (s.unit != null
            ? rooms.find((u) => u.no === s.unit)
            : rooms.find((u) => String(u.id) === String(j.askedUnit))) || null;
          setState({ overlay: null });
          api.decideJoin({
            id: j.id,
            decision: 'accept',
            unitId: room ? room.id : null,
            name: j.name,
            where: room ? `room ${room.no}` : '',
            // Turned into a date here rather than on the server: the landlord is
            // looking at the date this produces, so the app and the server must not
            // each compute "six months from now" from their own clocks. Same resolver
            // the line above the button uses, so the date sent is the date shown.
            stayUntil: (() => {
              const until = resolveJoinStay(s.joinStay, j);
              return until ? until.iso : null;
            })()
          });
        },
        decline: () => {
          setState({ overlay: null });
          api.decideJoin({ id: j.id, decision: 'reject', name: j.name });
        },
        busy: !!s.writing
      };
    })(),

    // ── Payments a tenant says they made ──────────────────────────────────────
    // The landlord's end of declarePayment, and the half that did not exist: the
    // tenant could say "I paid" and there was nowhere for anybody to answer, so the
    // claim sat in the payments table as 'Declared' for ever, counting toward
    // nothing, while the tenant's due date never moved and every screen went on
    // calling them overdue.
    //
    // Two levels, matching joins: a queue of everything waiting, and a sheet for the
    // one decision. The queue exists because these arrive in batches — rent week
    // produces six of them in a day — and deciding six things should not mean six
    // trips through the bell.
    // Reached from the bell's alert row, which is the only way into the joins queue
    // too — there is deliberately no second entry point to keep in sync.
    isDeclared: s.overlay === 'declared',
    declaredQueue: (() => {
      const total = DECLARED.reduce((a, p) => a + p.amountRaw, 0);
      return {
        count: DECLARED.length,
        title: DECLARED.length
          ? `${DECLARED.length} ${DECLARED.length === 1 ? 'payment needs' : 'payments need'} confirming`
          : 'Nothing to confirm',
        // The total is the reason to care: it is money the books do not yet show.
        totalLine: DECLARED.length ? `${money(total)} claimed and not yet counted` : '',
        empty: DECLARED.length === 0,
        emptyLine: 'When a tenant marks their rent as paid, it lands here for you to confirm. Nothing counts toward your totals until you do.',
        rows: DECLARED.map((p) => ({
          id: p.id,
          name: p.name,
          initials: initialsOf(p.name),
          img: p.img,
          amount: p.amount,
          method: p.method,
          paidOn: p.paidOn,
          age: p.age,
          where: `${String(p.unit)} · ${String(p.prop).toUpperCase()}`,
          // Flagged on the row, not just inside the sheet, so a short payment is
          // visible while skimming a batch of six.
          odd: p.matchesRent === false,
          oddLine: p.shortBy ? `${p.shortBy} short of ${p.rent}` : p.overBy ? `${p.overBy} over ${p.rent}` : '',
          open: () => setState({ overlay: 'paydecide', paydec: p.id, paynote: '' })
        })),
        close: () => setState({ overlay: null })
      };
    })(),

    isPayDecide: s.overlay === 'paydecide',
    payDecide: (() => {
      const p = DECLARED.find((x) => x.id === s.paydec) || DECLARED[0] || null;
      if (!p) return null;
      const note = s.paynote || '';
      return {
        id: p.id,
        name: p.name,
        initials: initialsOf(p.name),
        img: p.img,
        where: `${String(p.unit)} · ${String(p.prop).toUpperCase()}`,
        amount: p.amount,
        method: p.method,
        paidOn: p.paidOn,
        age: `Claimed ${String(p.age).toLowerCase()}`,
        // Only shown when there is one. A cash payment has no reference and a row
        // reading "REFERENCE —" is worse than no row.
        reference: p.reference,
        hasReference: !!p.reference,
        // The check a landlord would otherwise do by eye, done for them.
        rent: p.rent,
        matches: p.matchesRent,
        amountNote: p.matchesRent === true
          ? `Matches their rent of ${p.rent}.`
          : p.shortBy
            ? `${p.shortBy} less than their rent of ${p.rent}. Confirming credits only what they claim — the rest stays owed.`
            : p.overBy
              ? `${p.overBy} more than their rent of ${p.rent}.`
              : '',
        hasAmountNote: p.matchesRent !== null,
        // Said plainly because it is the only irreversible-feeling part: confirming
        // moves the due date, which is what actually clears the month.
        confirmLine: 'Confirming counts this toward your totals and moves their next rent date forward a month.',
        note,
        setNote: (e) => setState({ paynote: evStr(e) }),
        notePlaceholder: 'Why? (optional — the tenant sees this)',
        busy: !!s.writing,
        confirmLabel: s.writing ? 'Saving…' : 'Confirm payment',
        rejectLabel: 'Reject',
        confirm: () => {
          setState({ overlay: null });
          api.decidePayment({ id: p.id, decision: 'confirm', name: p.name, amount: p.amount });
        },
        // A rejection is a message to a person who believes they have paid, so the
        // note travels with it. Not required — a landlord who just needs it gone
        // should not be blocked on writing an essay.
        reject: () => {
          setState({ overlay: null });
          api.decidePayment({ id: p.id, decision: 'reject', name: p.name, amount: p.amount, note });
        },
        back: () => setState({ overlay: 'declared', paynote: '' }),
        close: () => setState({ overlay: null, paynote: '' })
      };
    })(),

    // ── ID documents (landlord's view) ────────────────────────────────────────
    // One sheet serves both entry points — a tenant's detail screen and an
    // applicant in the bell — because the landlord is doing the same thing either
    // way: looking at what was uploaded and recording whether it checks out.
    //
    // Files are handed to the phone rather than drawn in a viewer: an ID proof is
    // often a PDF, and the system viewer can zoom, rotate and share in ways a
    // hand-rolled <Image> cannot.
    isDocs: s.overlay === 'docs',
    docs: (() => {
      const d = s.docs || { list: [], loading: false, error: '' };
      const who = d.person || {};
      const sum = d.summary || { total: 0, verified: 0, pending: 0 };
      return {
        loading: !!d.loading,
        error: d.error || '',
        hasError: !!d.error,
        name: who.name || 'This person',
        initials: initialsOf(who.name),
        phone: who.phone || '',
        phoneLabel: fmtPhone(who.phone),
        // A tenant the landlord typed in themselves has no portal account, so there
        // is nowhere a document could have come from. Say that, rather than showing
        // an empty list that reads as "they ignored the request".
        noAccount: !!d.noAccount,
        // Phrased around the TENANCY, not around the app. The old line told a landlord
        // "they have not signed in to TenantPro yet" about a tenant sitting in room 101
        // — true, useless, and read as though the person were not really there. What the
        // landlord is asking is "who is in my building and have I checked them", so that
        // is what these answer; whether an app is installed only appears where it
        // changes what they can do next.
        noAccountLine: (() => {
            if (who.moved_out) {
                return `${(who.name || 'This tenant').split(' ')[0]} is no longer in your property, and no ID was ever uploaded. The record is kept so you can see who was checked.`;
            }
            const where = who.unit_number ? `room ${who.unit_number}` : 'your property';
            return `${(who.name || 'This tenant').split(' ')[0]} is in ${where}. No ID on file — they have not set up the app yet, so ask them to install it and add one, or add it yourself from their details.`;
        })(),
        empty: !d.loading && !d.error && !d.noAccount && d.list.length === 0,
        emptyLine: (() => {
            if (who.moved_out) {
                return 'This tenant has moved out and never uploaded an ID. The record is kept as a note of what was checked.';
            }
            const where = who.unit_number ? `room ${who.unit_number}` : 'your property';
            return `Nothing uploaded yet. They are in ${where} and can add a government ID from their own profile — Aadhaar, PAN, voter ID, licence or passport.`;
        })(),
        // So the sheet can label a former tenant rather than implying they are resident.
        movedOut: !!who.moved_out,
        tenancyLine: who.moved_out
            ? 'NO LONGER IN YOUR PROPERTY'
            : who.unit_number ? `IN ROOM ${String(who.unit_number).toUpperCase()}` : 'IN YOUR PROPERTY',
        summaryLine: sum.total
          ? `${sum.total} ${sum.total === 1 ? 'document' : 'documents'} · ${sum.verified} verified`
          : '',
        verified: sum.verified > 0,
        rows: d.list.map((x) => ({
          id: x.id,
          label: x.label,
          number: x.number,
          hasNumber: !!x.number,
          url: x.url,
          isPdf: x.isPdf,
          status: x.status.toUpperCase(),
          statusFg: x.statusFg,
          pending: x.pending,
          verified: x.verified,
          rejected: x.rejected,
          age: `ADDED ${x.age}`,
          by: x.by ? `${x.verified ? 'Verified' : 'Rejected'} by ${x.by} ${x.decidedAge}`.trim() : '',
          note: x.note,
          hasNote: !!x.note,
          busy: s.docs.deciding === x.id,
          // A thumbnail, so the ID is visibly THERE without tapping anything. The row
          // used to show a generic glyph, which looks identical whether the file
          // loaded or not — the landlord could not tell a missing upload from one they
          // had not opened yet.
          thumb: x.isPdf ? null : x.url,
          // Opens in the app now. It used to go out to Linking.openURL, which threw
          // the landlord into a browser — away from the Verify and Reject buttons they
          // were about to use, and into a cache this app does not control.
          open: () => (x.url ? viewDoc(x) : flash('That file is missing.')),
          verify: () => api.decideDoc(x.id, 'verified'),
          reject: () => api.decideDoc(x.id, 'rejected'),
          // Undo, for the landlord who tapped the wrong one.
          reopen: () => api.decideDoc(x.id, 'pending')
        })),
        close: () => setState({ overlay: d.from || null, docs: { ...INITIAL_STATE.docs } })
      };
    })(),

    // The full-screen document viewer, above every sheet. One key for both document
    // lists, because there is only ever one document being looked at and the viewer
    // does not care whose it is.
    docView: (() => {
      const v = s.docView;
      return {
        open: !!v,
        url: (v && v.url) || null,
        label: (v && v.label) || '',
        status: (v && v.status) || '',
        isPdf: !!(v && v.isPdf),
        close: () => setState({ docView: null }),
        // The escape hatch, for a PDF or an image that would not download. Closing
        // first matters: leaving a full-screen Modal mounted while the system viewer
        // comes up means returning to the app behind a black screen.
        openOutside: () => {
          const url = v && v.url;
          setState({ docView: null });
          openLink(url);
        }
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
      // The prototype listed two invented document tiles ("AADHAAR", "AGREEMENT")
      // that were the same for everyone. This is the real thing: what this tenant
      // has actually uploaded, and a way in to look at it and mark it verified.
      idProof: (() => {
        const b = who.idProof || null;
        const state = (b && b.state) || 'none';
        return {
          state,
          label: (b && b.label) || 'NO ID ON FILE',
          fg: (b && b.fg) || 'fg3',
          icon: (b && b.icon) || 'shield-outline',
          verified: state === 'verified',
          line: state === 'verified'
            ? 'You have checked their ID.'
            : state === 'pending'
              ? 'They have uploaded an ID. Open it to check it and mark it verified.'
              : 'Nothing uploaded yet. They add one from their own profile.',
          cta: state === 'none' ? 'Documents' : 'See documents',
          // Read from the server on open, rather than shipping every tenant's ID
          // proof out with the dashboard.
          go: () => api.loadDocs('tenant', who.id)
        };
      })(),

      // ── The landlord as the recovery path ────────────────────────────────────
      // A guest has no email, so there is no password to reset and no address to
      // send a reset to. What there IS, always, is a landlord who accepted them
      // and is holding the government ID they uploaded. So recovery is done in
      // person: check the face against the ID already on file, read the code back.
      // That is a stronger identity check than an emailed link, and it costs
      // nothing — the code is already in the row.
      //
      // Hidden until asked for. Nobody needs a working credential sitting on a
      // screen that gets opened to check somebody's rent.
      guestId: (() => {
        const code = who.guestCode || null;
        const shown = !!code && s.greveal === who.id;
        return {
          is: !!code,
          shown,
          code: code || '',
          // Masked to the same width, so revealing does not make the card jump.
          masked: code ? '•'.repeat(code.length) : '',
          title: 'Guest sign-in ID',
          line: shown
            ? 'Check their face against the ID on file before reading this out. It is the only thing they need to sign in.'
            : 'This person has no email or password. If they change phones, this code is the only way back into their tenancy — and you are the only one who can give it to them.',
          cta: shown ? 'Hide' : 'Show guest ID',
          toggle: () => setState({ greveal: shown ? null : who.id }),
          copy: () => copyText(code, 'Guest ID copied'),
          // Said plainly, because it is the answer to "why is this person still
          // called Guest 4417 in my list".
          foot: 'It stops working when they leave, and disappears once they complete their profile.'
        };
      })()
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
    // The net card always reports THIS month in full, filter or no filter — it is
    // the month's headline, not a summary of the list below it.
    netLabel: `NET — ${MONTH_NAMES[new Date().getMonth()]}`,
    netStr: money(monthIn(0) - monthOut(0)),
    inStr: `IN ${money(monthIn(0))}`,
    outStr: `OUT ${money(monthOut(0))}`,
    lq: s.lq,
    hasLq: !!s.lq,
    setLq: (e) => set('lq', evStr(e)),
    clearLq: () => set('lq', ''),
    ledgerEmpty: !ledger.length,
    ledgerEmptyLine: s.lq.trim()
      ? `Nothing matches "${s.lq.trim()}".`
      : 'No money has moved yet. Recorded rent and expenses appear here.',

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
    // ── The demo account's reset control ─────────────────────────────────────
    // Only rendered when the SERVER says this is the demo account. Never inferred
    // from the email on screen: a real landlord must never be shown a button whose
    // job is to delete their payments and history, and a typo'd login is not proof of
    // anything. `demo` is null for everybody else, so `isDemoAccount` is false and
    // Settings draws nothing.
    isDemoAccount: !!(s.demo && s.demo.is_demo),

    // What this install actually is. On both Settings screens, because the absence of
    // it hid a real failure for days: build 17 carried runtimeVersion "1.0.0" while
    // every update published afterwards was "1.3.0", so the app correctly received
    // nothing, silently, while every publish reported success. The runtime version is
    // the number that makes that visible, and an app that shows no version at all
    // turns a two-second check into an archaeology exercise.
    //
    // Read here rather than in the screens so both roles show the same thing, and so
    // it is a value the view-model can be tested against.
    build: readBuild(),
    demoCard: (() => {
      const d = s.demo || {};
      const c = d.counts || {};
      const ago = agoWords(d.last_reset_at);
      return {
        // What the account holds right now, so it is obvious whether there is
        // anything worth keeping before it gets wiped.
        line: `${c.properties || 0} ${c.properties === 1 ? 'property' : 'properties'} · ${c.tenants || 0} ${c.tenants === 1 ? 'tenant' : 'tenants'} · ${c.payments || 0} payments`,
        lastReset: ago ? `Last rebuilt ${ago}` : 'Never rebuilt',
        // The whole point of the change: say plainly that this account keeps what a
        // demo does to it, because the old behaviour trained the opposite expectation.
        note: 'Everything you do here sticks — a restart no longer wipes it. Rebuild before a client walkthrough to get a full, current-dated portfolio back.',
        stale: agoWords(d.last_reset_at).includes('day'),
        busy: !!s.demoBusy,
        label: s.demoBusy ? 'Rebuilding…' : 'Reset demo data',
        ask: () => set('overlay', 'demoreset')
      };
    })(),
    isDemoReset: s.overlay === 'demoreset',
    demoReset: (() => {
      const c = (s.demo && s.demo.counts) || {};
      const awaiting = c.payments_awaiting || 0;
      return {
        // A confirmation that names what goes, because "reset" understates it.
        line: 'This deletes the demo\u2019s payments, expenses, tickets and join decisions, puts every property, room and tenant back, and re-dates six months of history to today.',
        // Anything the landlord did that is about to be lost, counted rather than
        // described, so the warning is specific.
        holds: `Right now: ${c.properties || 0} properties, ${c.tenants || 0} tenants, ${c.payments || 0} payments`
          + (awaiting ? `, ${awaiting} awaiting confirmation` : ''),
        safe: 'Only the demo account is ever rebuilt. No other landlord is touched.',
        busy: !!s.demoBusy,
        confirm: () => api.resetDemo(),
        cancel: () => set('overlay', null)
      };
    })(),

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

    // What the Settings screen shows in its UPI card. The prototype printed a
    // literal demo handle here, which on a real account would tell the landlord
    // that rent is going somewhere it is not.
    upiCard: {
      value: PAY.upiId || PAY.upiNumber || 'Not set up yet',
      isSet: !!(PAY.upiId || PAY.upiNumber),
      hint: PAY.upiId || PAY.upiNumber
        ? 'This is what tenants see when they pay.'
        : 'Tenants have nothing to pay into until you add a UPI ID or number.'
    },

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
      {
        label: 'App permissions',
        icon: 'shield-checkmark-outline',
        meta: 'CAMERA · PHOTOS',
        go: () => setState({ route: 'permits', overlay: null })
      },
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
    goCheckout: () => setState({ route: 'tcheckout', paid: false, pay: { ...BLANK_PAY } }),

    // ── Paying rent ───────────────────────────────────────────────────────────
    // There is no payment gateway, and pretending otherwise was the old screen's
    // problem: it offered Card and Net banking, neither of which can reach a UPI ID.
    // A VPA can only receive from UPI, so those buttons could never have worked, and
    // once "Pay" actually recorded something they would have logged money that never
    // moved.
    //
    // So this screen does the only two honest things:
    //   1. hand off to the tenant's own UPI app with the landlord's real VPA, the
    //      exact amount and a reference already filled in, then ask whether it went
    //      through; and
    //   2. let them record a payment they made some other way — cash, a bank
    //      transfer, a card through some third-party app.
    //
    // Either way the result is a CLAIM the landlord confirms. The app never asserts
    // that money arrived, because it cannot see money.
    checkout: (() => {
      const pay = s.pay || BLANK_PAY;
      const put = (patch) => setState({ pay: { ...pay, ...patch, error: '' } });
      const upiId = (PAYINFO && PAYINFO.upi_id) || '';
      const upiNumber = (PAYINFO && PAYINFO.upi_number) || '';
      const payee = upiId || upiNumber;
      const amount = Number(me.rentRaw) || 0;

      // The reference the tenant carries into their UPI app and back out again. It is
      // what lets a landlord match a credit in their bank to a claim in here — and
      // what a gateway webhook would match on later — so it has to be unique enough
      // to not collide within a month, and short enough to survive a UPI note field.
      const reference = pay.reference || `TP${refStamp()}`;

      return {
        amount,
        amountLabel: me.rentFull,
        home: me.home,
        // What is owed and why. No invented late fee — the server does not charge one,
        // so the screen must not imply it does.
        breakdown: [
          { k: 'Rent', v: me.rentFull },
          { k: 'Platform fee', v: '₹0' }
        ],
        reference,

        // Can we even hand off? Without the landlord's UPI details there is nothing
        // to open, and saying so is more use than a button that does nothing.
        canUpi: !!payee && amount > 0,
        // The exact string the QR encodes, and the same one openUpiPayment opens.
        // Derived from the amount and reference rather than stored, so changing either
        // produces a new URI and therefore a new QR — there is no stale code to
        // invalidate because there is nothing cached to go stale.
        upiUri: (!!payee && amount > 0)
          ? upiUri({ payee, name: landlordCard.name, amount, reference })
          : '',
        payee,
        payeeLabel: upiId || (upiNumber ? `${upiNumber} (UPI number)` : ''),
        missingUpi: !payee,
        missingUpiLine: `${landlordCard.name} has not added a UPI ID yet. Ask them to set one up, or record a payment you made another way.`,

        // Step 1: open their UPI app. Nothing is recorded here — the tenant has not
        // paid yet, and an app cannot know whether they will.
        openUpi: () => api.openUpiPayment({ payee, amount, reference, name: landlordCard.name }),

        // Step 2, on their return: did it work? React Native cannot read the result of
        // a UPI intent, so asking is the honest option. Guessing would either invent
        // payments that failed or lose ones that succeeded.
        asked: !!pay.asked,
        confirmSent: () => api.declareMyPayment({ method: 'UPI', reference }),
        cancelSent: () => setState({ pay: { ...BLANK_PAY } }),

        // The other path, for money that moved outside UPI.
        isOther: !!pay.other,
        openOther: () => put({ other: true }),
        closeOther: () => put({ other: false }),
        methods: PAY_METHODS.map((m) => ({
          label: m,
          on: pay.method === m,
          go: () => put({ method: m })
        })),
        method: pay.method,
        otherRef: pay.otherRef,
        setOtherRef: (e) => put({ otherRef: evStr(e).slice(0, 100) }),
        submitOther: () => {
          if (!pay.method) { setState({ pay: { ...pay, error: 'Which way did you pay?' } }); return; }
          api.declareMyPayment({ method: pay.method, reference: pay.otherRef.trim() || reference });
        },

        busy: !!pay.busy,
        error: pay.error || '',
        hasError: !!pay.error,

        // Already waiting on the landlord: a second claim would leave them two
        // identical rows with no way to tell a double-tap from two real payments, and
        // the server refuses it anyway. Better to say so before they try.
        waiting: !!myAwaiting,
        waitingLine: myAwaiting
          ? `₹${inr(myAwaiting.amount_paid)} is already waiting for ${landlordCard.name} to confirm.`
          : '',
        goReceipts: () => api.goReceipts()
      };
    })(),

    // Kept for the success panel the screen shows after a claim is sent.
    paid: s.paid,
    unpaid: !s.paid,
    payDone: () => { setState({ route: 'portal', paid: false, pay: { ...BLANK_PAY } }); },
    // ── Receipts ──────────────────────────────────────────────────────────────
    // Every payment on this tenancy and where each one stands. A tenant could not see
    // their own history at all before this — the endpoint returned it and nothing
    // rendered it.
    isReceipts: s.route === 'treceipts',
    goReceipts: () => go('treceipts'),
    receipts: (() => {
      const chip = (st) => (
        st === 'Confirmed' ? { label: 'PAID', fg: 'pos', bg: 'lsoft' }
          : st === 'Declared' ? { label: 'AWAITING', fg: 'amber', bg: 'asoft' }
            : { label: 'REJECTED', fg: 'coral', bg: 'csoft' }
      );
      const rows = MY_PAYMENTS.map((p) => {
        const c = chip(p.status);
        return {
          id: p.id,
          amount: `₹${inr(p.amount_paid)}`,
          when: fmtDay(p.payment_date),
          method: p.payment_method || 'UPI',
          reference: p.reference_id || '',
          ...c,
          // Only a rejection carries a reason, and showing it is the whole point:
          // a claim that vanished silently is what makes a tenant phone you.
          note: p.status === 'Rejected' ? (p.decision_note || 'No reason given.') : '',
          // "Confirmed by" distinguishes a landlord's tap from a gateway's webhook
          // once one is connected. Until then every row says the same thing, which is
          // honest rather than decorative.
          by: p.status === 'Confirmed'
            ? (p.confirmation_source === 'gateway' ? 'Confirmed automatically' : 'Confirmed by your landlord')
            : ''
        };
      });
      const total = MY_PAYMENTS
        .filter((p) => p.status === 'Confirmed')
        .reduce((n, p) => n + Number(p.amount_paid || 0), 0);
      return {
        rows,
        empty: rows.length === 0,
        emptyLine: me.unit
          ? 'Nothing yet. Payments appear here the moment you record one.'
          : 'You will see payments here once you have joined a property.',
        // Paid and awaiting are deliberately separate figures. Adding them would imply
        // the landlord has acknowledged money they have not.
        paidTotal: `₹${inr(total)}`,
        paidCount: rows.filter((r) => r.label === 'PAID').length,
        awaiting: myAwaiting ? `₹${inr(myAwaiting.amount_paid)}` : '',
        hasAwaiting: !!myAwaiting,
        back: () => go('portal')
      };
    })(),

    goFind: () => go('tfind'),
    findLine: me.unit ? 'Scan, enter a code, or search by name or area.' : 'Scan an invite QR, enter a property ID, or search.',
    isHelp: s.route === 'thelp',
    isStay: s.route === 'tstay',
    // ── ID documents (the tenant's own) ───────────────────────────────────────
    // A government ID is required to hold a TenantPro tenant account: a landlord is
    // being asked to hand over a room, and "who is this person" is the first thing
    // they need answered. The requirement is enforced as a step of registration
    // (see `docGate`) rather than a field on the signup form, because the upload
    // needs the token that registering hands back — a file attached to the
    // registration call itself would be lost if the account was created and the
    // upload then failed.
    isTDocs: s.route === 'tdocs',
    goTDocs: () => { api.loadMyDocs(); go('tdocs'); },
    // For the screen's own mount effect: the registration gate routes straight to
    // 'tdocs' without going through goTDocs, so the list has to be able to fetch
    // itself. Guarded so a re-render cannot start a second request.
    loadMyDocsOnce: () => {
      if (!s.myDocs.loaded && !s.myDocs.loading) api.loadMyDocs();
    },
    tdocs: (() => {
      const md = s.myDocs || { list: [], loading: false, error: '', loaded: false };
      const f = s.docForm || { type: 'aadhaar', number: '', photo: null, error: '', busy: false };
      const sum = md.summary || { total: 0, verified: 0, pending: 0, has_any: false };
      const gate = !!s.docGate;
      return {
        loading: !!md.loading && !md.loaded,
        error: md.error || '',
        hasError: !!md.error,
        // In gate mode the screen is the last step of signing up, so it says so and
        // offers no way past until the server confirms a document is stored.
        gate,
        title: gate ? 'One last thing.' : 'My documents',
        blurb: gate
          ? 'Add a government ID so a landlord can confirm who you are before giving you a room. Aadhaar, PAN, voter ID, licence or passport — any one is enough.'
          : 'Your landlord can see these and mark them verified. Add another whenever you need to.',
        summaryLine: sum.total
          ? `${sum.total} ${sum.total === 1 ? 'document' : 'documents'} · ${sum.verified} verified`
          : 'Nothing added yet',
        // The gate lifts on the first stored document, verified or not: whether a
        // landlord has got round to checking it is not the tenant's to fix.
        canContinue: !gate || !!sum.has_any,
        continueLine: sum.has_any
          ? 'You are all set.'
          : 'Add one document to finish setting up your account.',
        continue: () => {
          if (s.docGate && !sum.has_any) { flash('Add a document to continue'); return; }
          setState({ docGate: false, route: 'portal' });
        },
        empty: md.loaded && !md.list.length,
        rows: md.list.map((x) => ({
          id: x.id,
          label: x.label,
          number: x.number,
          hasNumber: !!x.number,
          url: x.url,
          isPdf: x.isPdf,
          status: x.status.toUpperCase(),
          statusFg: x.statusFg,
          verified: x.verified,
          rejected: x.rejected,
          age: `ADDED ${x.age}`,
          note: x.note,
          hasNote: !!x.note,
          by: x.by ? `${x.verified ? 'Verified' : 'Rejected'} by ${x.by} ${x.decidedAge}`.trim() : '',
          // Same in-app viewer the landlord gets. A tenant who cannot see what they
          // uploaded cannot tell a blurry photograph from a clear one, which is the
          // most common reason an ID gets rejected.
          thumb: x.isPdf ? null : x.url,
          open: () => (x.url ? viewDoc(x) : flash('That file is missing.')),
          // A verified document cannot be withdrawn — the verdict is a record of
          // what was checked, and deleting the evidence would leave the badge
          // standing on nothing. The server refuses it too; this just does not
          // offer the button.
          canRemove: !x.verified,
          remove: () => api.removeMyDoc(x.id)
        })),
        // The add form.
        form: {
          types: Object.entries({
            aadhaar: 'Aadhaar',
            pan: 'PAN',
            voter: 'Voter ID',
            dl: 'Licence',
            passport: 'Passport',
            other: 'Other'
          }).map(([k, label]) => ({
            key: k,
            label,
            on: f.type === k,
            go: () => setState({ docForm: { ...f, type: k, error: '' } })
          })),
          number: f.number,
          // Optional on purpose: the photo of the card is the thing being checked,
          // and demanding the number as well is one more reason not to bother.
          numberLabel: 'DOCUMENT NUMBER (OPTIONAL)',
          setNumber: (e) => setState({ docForm: { ...f, number: evStr(e).toUpperCase().slice(0, 32), error: '' } }),
          photo: f.photo,
          hasPhoto: !!f.photo,
          photoUri: f.photo ? f.photo.uri : null,
          pick: () => api.pickDocPhoto('library'),
          // Most people are holding the card when they do this.
          capture: () => api.pickDocPhoto('camera'),
          pickLabel: f.photo ? 'Choose another' : 'Choose one',
          error: f.error || '',
          hasError: !!f.error,
          busy: !!f.busy,
          canSubmit: !!f.photo && !f.busy,
          submitLabel: f.busy ? 'Saving…' : 'Add this document',
          submit: () => api.addMyDoc()
        }
      };
    })(),
    // A nudge in the portal for accounts that predate the requirement. Not a block:
    // they are already someone's tenant, and locking them out of their own rent
    // details would punish them for our schema changing.
    idNag: (() => {
      const sum = (TD && TD.me && TD.me.id_proof) || null;
      if (!sum || sum.has_any) return null;
      return {
        line: 'Your landlord cannot verify who you are until you add a government ID.',
        cta: 'Add an ID',
        go: () => { api.loadMyDocs(); go('tdocs'); }
      };
    })(),

    isTMe: s.route === 'tme',
    tenantSide: ['portal', 'tfind', 'thelp', 'tstay', 'tme', 'tcheckout', 'tsettings', 'tdocs', 'tagreement'].includes(s.route),
    showTenantDock: ['portal', 'tfind', 'thelp', 'tstay', 'tme', 'tsettings'].includes(s.route)
      || (s.route === 'tdocs' && !s.docGate) || s.route === 'tagreement',
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
    // ── The tenant's document tiles ───────────────────────────────────────────
    // Both were decoration: fixed labels that did nothing and were identical for
    // everybody. The ID tile now reflects what they have actually uploaded, and the
    // agreement is LOCKED until there is a tenancy to write one about.
    //
    // Two conditions, both necessary:
    //   • a room — an agreement names the room, the rent and the deposit, so before
    //     a landlord has placed them there is nothing to put in it;
    //   • a payment — the tenancy has actually started rather than merely been
    //     offered. Generating a signed-looking document for somebody who has paid
    //     nothing would be a document that says something untrue.
    myDocs: (() => {
      const idSum = (TD && TD.me && TD.me.id_proof) || null;
      const paid = TLIVE ? ((TD.payments || []).length > 0) : true;
      const placed = !!(myUnit && myProp);
      const ready = placed && paid;
      return [
        {
          key: 'id',
          icon: 'card-outline',
          label: 'ID PROOF',
          state: idSum && idSum.verified ? 'VERIFIED' : idSum && idSum.has_any ? 'PENDING' : 'MISSING',
          fg: idSum && idSum.verified ? 'pos' : idSum && idSum.has_any ? 'amber' : 'fg3',
          locked: false,
          go: () => { api.loadMyDocs(); go('tdocs'); }
        },
        {
          key: 'agreement',
          icon: 'document-text-outline',
          label: 'AGREEMENT',
          state: ready ? 'READY' : 'LOCKED',
          fg: ready ? 'pos' : 'fg3',
          locked: !ready,
          lockLine: !placed
            ? 'Your agreement is written from the room you are given. Join a property and your landlord will place you in one.'
            : 'Your agreement unlocks once your first rent payment is recorded.',
          go: () => {
            if (!placed) { flash('Join a property first — the agreement is written from your room'); return; }
            if (!paid) { flash('Your agreement unlocks after your first rent payment'); return; }
            go('tagreement');
          }
        }
      ];
    })(),

    // ── The agreement itself ──────────────────────────────────────────────────
    // Generated from the tenancy rather than stored: every figure in it is already
    // a column somewhere, and a copy saved at signing time would drift the moment
    // the rent changed. Nothing here is invented — a clause the backend has no
    // answer for is left out rather than filled with a plausible number.
    isAgreement: s.route === 'tagreement',
    agreement: (() => {
      const landlord = LANDLORD || null;
      const start = me.movedIn || '';
      return {
        title: 'Rental agreement',
        subtitle: myProp ? `${myProp.name}${myUnit ? ` · Room ${myUnit.no}` : ''}` : '',
        // Said plainly: this is a summary of the tenancy, not a stamped legal deed.
        note: 'This is a summary of the terms recorded in TenantPro, generated from your tenancy. It is not a stamped or registered deed.',
        parties: [
          { k: 'LANDLORD', v: landlord ? landlord.name : '', sub: landlord && landlord.phone ? fmtPhone(landlord.phone) : '' },
          { k: 'TENANT', v: me.name || '', sub: me.phone ? fmtPhone(me.phone) : '' }
        ].filter((x) => x.v),
        terms: [
          { k: 'PROPERTY', v: myProp ? myProp.name : '' },
          { k: 'ADDRESS', v: myProp ? myProp.address : '' },
          { k: 'ROOM', v: myUnit ? `${myUnit.no}${myUnit.type ? ` · ${myUnit.type}` : ''}` : '' },
          { k: 'MONTHLY RENT', v: me.rentFull || '' },
          { k: 'DEPOSIT HELD', v: me.deposit || '' },
          { k: 'START DATE', v: start },
          { k: 'RENT DUE', v: myDue || '' }
        ].filter((x) => x.v),
        // Copied out so it can be pasted into a message or an email. Sharing a real
        // file would need a native print/PDF module, which cannot arrive over the air.
        copy: () => {
          const lines = [
            'RENTAL AGREEMENT — SUMMARY',
            myProp ? myProp.name : '',
            myUnit ? `Room ${myUnit.no}` : '',
            '',
            landlord ? `Landlord: ${landlord.name}${landlord.phone ? ` (${landlord.phone})` : ''}` : '',
            `Tenant: ${me.name || ''}${me.phone ? ` (${me.phone})` : ''}`,
            '',
            `Monthly rent: ${me.rentFull || ''}`,
            `Deposit held: ${me.deposit || ''}`,
            start ? `Start date: ${start}` : '',
            myDue ? `Next rent due: ${myDue}` : '',
            '',
            'Generated by TenantPro. Summary of recorded terms; not a stamped deed.'
          ].filter(Boolean).join('\n');
          copyText(lines, 'Agreement copied');
        },
        back: () => { if (!api.goBackOneStep()) go('tme'); }
      };
    })(),
    // ── Being a guest, once you are in ─────────────────────────────────────────
    // A guest has no name, no email and no password on file. Everything still works
    // — they can see their room, raise tickets and declare a payment — but the
    // account is tied to one stay and cannot be recovered if the phone is lost. So
    // the app says so, in the one place a tenant looks for their own details, and
    // says what finishing the profile actually buys rather than nagging.
    myGuest: (() => {
      const g = (TD && TD.me && TD.me.guest) || null;
      const isGuest = !!(g && g.is_guest);
      return {
        is: isGuest,
        code: (g && g.code) || '',
        codeLabel: g && g.code ? `GUEST ID · ${g.code}` : 'GUEST',
        title: 'You are here as a guest',
        // The reason comes from the server so the app and the API cannot drift into
        // promising different things.
        why: (g && g.why) || 'Add your name, email and a password so you can sign in from any phone and recover your account.',
        // What the landlord currently sees, which is usually the sentence that
        // actually persuades someone to finish.
        seenAs: g && g.code ? `Your landlord sees you as “Guest ${g.code}”.` : '',
        cta: 'Complete my profile',

        // When this guest ID stops working. The server decides, so the app cannot draw
        // a live-looking portal for an account the middleware is about to refuse.
        // Deliberately phrased as a fact and a way out rather than a warning: a guest
        // whose stay ends on Friday has not done anything wrong.
        stayLine: (() => {
          const st = (g && g.stay) || null;
          if (!isGuest || !st || st.open_ended) return '';
          if (st.expired) return `Your guest ID ended on ${fmtDay(st.ends_on)}.`;
          if (st.days_left === 0) return 'Your guest ID works until the end of today.';
          if (st.days_left === 1) return 'Your guest ID works until tomorrow.';
          return `Your guest ID works until ${fmtDay(st.ends_on)} — ${st.days_left} days.`;
        })(),
        // Amber while it is close, coral once it is gone. Anything further out is a
        // plain fact and gets no colour at all.
        stayTone: (() => {
          const st = (g && g.stay) || null;
          if (!isGuest || !st) return '';
          if (st.expired) return 'coral';
          if (st.ends_soon) return 'amber';
          return '';
        })(),
        stayEnded: !!(g && g.stay && g.stay.expired),
        // The one thing worth saying next to an ending date: finishing the profile is
        // what makes access survive it.
        stayFix: 'Add an email and password and your account keeps working after that date.',

        open: () => setState({ overlay: 'claim', claim: { name: '', email: '', password: '', busy: false, error: '' } })
      };
    })(),
    isClaim: s.overlay === 'claim',
    claim: (() => {
      const c = s.claim || { name: '', email: '', password: '', busy: false, error: '' };
      const put = (patch) => setState({ claim: { ...c, ...patch, error: '' } });
      return {
        title: 'Finish your profile',
        line: 'Your guest ID stops working when you leave this property. An email and a password stay with you.',
        name: c.name, setName: (e) => put({ name: evStr(e) }),
        email: c.email, setEmail: (e) => put({ email: evStr(e).trim() }),
        password: c.password, setPassword: (e) => put({ password: evStr(e) }),
        busy: !!c.busy,
        error: c.error || '',
        hasError: !!c.error,
        canSubmit: !!c.name.trim() && !!c.email.trim() && c.password.length >= 6 && !c.busy,
        submit: () => api.submitClaim(),
        submitLabel: c.busy ? 'Saving…' : 'Save and finish',
        close: () => setState({ overlay: null })
      };
    })(),

    // ── Getting home ───────────────────────────────────────────────────────────
    // The landlord pins the property; this is the other half — a tenant tapping
    // Directions and being routed to their own front door. Nothing is shown until
    // the landlord has actually pinned it, because a guess is worse than a blank.
    myWay: (() => {
      const home = (TD && TD.me && TD.me.home) || {};
      const lat = home.latitude != null ? Number(home.latitude) : null;
      const lon = home.longitude != null ? Number(home.longitude) : null;
      const pinned = hasPin(lat, lon);
      return {
        pinned,
        lat: pinned ? lat : 0,
        lon: pinned ? lon : 0,
        name: home.property_name || 'my place',
        label: 'Directions',
        line: 'Open a route to your building.',
        // Said plainly rather than hidden, so a tenant who wonders why there is no
        // map knows it is their landlord's to add.
        missingLine: 'Your landlord has not pinned this property on the map yet.',
        go: () => {
          if (!pinned) { flash('Your landlord has not pinned this property yet'); return; }
          openDirections(lat, lon, home.property_name).then((went) => {
            if (!went) flash('No maps app could open on this phone');
          });
        }
      };
    })(),

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
      {
        label: 'App permissions',
        icon: 'shield-checkmark-outline',
        meta: 'CAMERA · PHOTOS',
        go: () => setState({ route: 'permits', overlay: null })
      },
      { label: 'Language', icon: 'globe-outline', meta: 'ENGLISH' },
      { label: 'Help & support', icon: 'help-buoy-outline', meta: '' },
      { label: 'Terms of service', icon: 'shield-checkmark-outline', meta: '' }
      // Same treatment as the owner's list: a row that is not built yet says so
      // when tapped instead of silently doing nothing.
    ].map((r) => ({ ...r, go: r.go || (() => flash(`${r.label} — not built yet`)) })),
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
    meFullName: me.name || '',
    meInitials: initialsOf(me.name),
    me: {
      name: me.name.split(' ')[0],
      img: me.img,
      rent: me.rentFull,
      deposit: me.deposit,
      since: me.since,
      movedIn: me.movedIn || MOVE_IN[me.id] || '',
      due: `${me.state === 'overdue' ? 'OVERDUE BY' : 'IN'} ${me.days} DAYS`,
      dueFg: me.state === 'overdue' ? 'coral' : 'on',
      // The property NAME comes from myProp, not a lookup in the landlord's
      // collection — a live tenant never loads that, so the lookup returned ''.
      // And the due date is the tenant's own, not the prototype's "30 Aug".
      home: myUnit
        ? [myProp ? myProp.name : '', `Unit ${myUnit.no}`, myDue ? `due ${myDue}` : '']
          .filter(Boolean).join(' · ')
        : '',
      propName: myProp ? myProp.name : '',
      propImg: myProp ? myProp.img : '',
      propCode: myProp ? myProp.code : '',
      policy: myProp ? myProp.policy : '',
      policyIcon: myProp ? myProp.policyIcon : 'people',
      address: myProp ? myProp.address : '',
      unitLine: myUnit ? `UNIT ${myUnit.no} · ${myUnit.type}` : ''
    },
    jq: s.jq,
    setJq: (e) => set('jq', e && e.target ? e.target.value : e),
    // On a live tenancy the box is a code lookup, so it needs an explicit submit —
    // the demo catalogue filters as you type and needs none.
    submitJq: () => {
      const code = codeOf(s.jq);
      if (!TLIVE || !code) return;
      api.lookupProperty(code);
    },
    jqLabel: TLIVE ? 'Property code (TP-…)' : 'Property ID (TP-…) or name',
    canSubmitJq: !!codeOf(s.jq),
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
      // A scanned or typed code is resolved against the server. The old version set
      // `jq` and let the find screen filter its OWN property list, which for a real
      // tenant is the demo bundle — so every genuine invite code came back "no
      // property matches", which is what "the invite QR doesn't work" was.
      const find = (code) => {
        if (!code) return;
        // Signed out, holdJoinCode carries it into sign-up instead of showing a find
        // screen that can only search the walk-through catalogue. Signed in, it
        // resolves the code on the server as before.
        api.holdJoinCode(code);
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
        // The QR usually arrives as a WhatsApp image, not as a code held up in
        // front of you. Reading it out of the gallery is the same code path from
        // `find` onwards — only the way the string was obtained differs.
        fromGallery: () => api.scanQrFromImage(),
        close: () => api.goBackOneStep() || go('guest')
      };
    })(),
    scanQr: () => setState({ route: 'scan', overlay: null, scanCode: '' }),
    // Live tenancy: exactly what the code resolved to (nought or one property), from
    // the server. Walk-through: the demo catalogue, filterable as before.
    // There is deliberately no browse-all for real accounts — that would let anyone
    // with a tenant login enumerate every landlord's portfolio.
    lookup: (() => {
      const l = s.look || { code: '', loading: false, error: '', place: null };
      return {
        live: TLIVE,
        code: l.code,
        loading: !!l.loading,
        error: l.error || '',
        hasError: !!l.error,
        found: !!l.place,
        // Only says "nothing found" once a code has actually been looked for.
        searched: !!l.code && !l.loading,
        idleLine: 'Scan the QR your landlord shared, or type the property code they gave you.',
        retry: () => api.lookupProperty(l.code)
      };
    })(),
    joinResults: (TLIVE ? (s.look && s.look.place ? [(() => {
      const pl = s.look.place;
      const free = Number(pl.free_beds) || 0;
      return {
        id: pl.id,
        code: pl.code,
        name: pl.name,
        // The same one-line place string the demo rows use, from whichever of the
        // two location columns the landlord actually filled in.
        loc: [pl.locality, pl.city].filter(Boolean).join(', ').toUpperCase(),
        img: mediaUrl(pl.image_url),
        policy: String(pl.property_type || 'PROPERTY').toUpperCase(),
        policyIcon: 'business',
        short: '',
        free,
        landlord: pl.owner_first_name || '',
        rooms: Number(pl.unit_count) || 0,
        // The real rooms, straight from the lookup. Only a LIVE result has these — a
        // demo row has no server behind it — which is why `roomList` is read with a
        // fallback everywhere below rather than assumed.
        roomList: Array.isArray(pl.rooms) ? pl.rooms : [],
        address: pl.address || '',
        ownerName: pl.owner_name || pl.owner_first_name || '',
        ownerPhone: pl.owner_phone || ''
      };
    })()] : []) : joinMatches).map((p) => {
      // A looked-up property carries its own free-bed count from the server; a demo
      // one is counted from the local unit list. Reading the local list for a live
      // result would always say zero, because a tenant never loads anybody's units.
      const free = p.free != null
        ? p.free
        : UNITS.filter((u) => u.prop === p.id).reduce((a, u) => a + (u.cap - occupantsOf(u.no).length), 0);
      const exact = s.jq.trim().toUpperCase() === p.code;
      // The property this tenant already lives in. Offering to "join" the place you
      // are already in made no sense — and acting on it would have moved you out of
      // your own room.
      // Where they already live.
      //
      // On a live tenancy this MUST come from the portal payload, not from `myProp`:
      // that is resolved out of the DEMO unit list by unit number, so a real tenant
      // in a room called "101" silently resolved to the demo Sunrise PG — which then
      // claimed an unrelated property was "your current property" and refused to let
      // them ask to join it. /me now carries the real property id.
      const isCurrent = TLIVE
        ? (myPropId != null && String(myPropId) === String(p.id))
        : !!(myProp && myProp.id === p.id);
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
        // Asking is a real request now: it goes to the landlord's inbox and they
        // decide. The prototype moved you in on the spot, which is not a thing a
        // tenant gets to do to somebody else's property.
        //
        // Straight-to-request is kept for the demo rows, which have no server behind
        // them and therefore no rooms to look at. A live result opens the property
        // first — see `view` below.
        join: () => {
          if (isCurrent) { flash(`You already live at ${p.name}`); return; }
          if (!TLIVE) { flash('Sign in to your tenancy to ask to join'); return; }
          api.requestToJoin({ code: p.code, name: p.name });
        },
        // Look at the place before asking to live in it. Only a live result has
        // anything to show, so a demo row reports that rather than opening an empty
        // sheet. Resets the room choice on the way in: the previous property's room
        // ids mean nothing here.
        hasView: TLIVE && !!(p.roomList || p.address || p.ownerPhone),
        view: () => {
          if (!TLIVE) { flash('Sign in to your tenancy to see a property'); return; }
          setState({ overlay: 'propview', askRoom: null });
        },
        joining: !!s.joining
      };
    }),

    // ── Looking at a property before asking to join it ────────────────────────
    // Asking used to be blind: a name, a locality, and the landlord's first name.
    // Somebody was being asked to photograph their government ID for a property whose
    // rooms, prices and landlord they could not see. This is that screen.
    //
    // Built off the lookup payload rather than the local unit list, because a tenant
    // never loads anybody's units — reading UNITS here would show every property as
    // having no rooms.
    isPropView: s.overlay === 'propview',
    propView: (() => {
      const pl = (s.look && s.look.place) || null;
      const rooms = (pl && Array.isArray(pl.rooms) ? pl.rooms : []);
      const chosen = rooms.find((r) => String(r.id) === String(s.askRoom)) || null;
      const phone = (pl && pl.owner_phone) || '';
      const ownerName = (pl && (pl.owner_name || pl.owner_first_name)) || '';
      return {
        has: !!pl,
        name: (pl && pl.name) || '',
        code: (pl && pl.code) || '',
        type: String((pl && pl.property_type) || 'PROPERTY').toUpperCase(),
        img: pl ? mediaUrl(pl.image_url) : null,
        // The full address when the landlord filled one in, falling back to the
        // locality line rather than showing an empty row.
        where: (pl && (pl.address || [pl.locality, pl.city].filter(Boolean).join(', '))) || '',
        locLine: pl ? [pl.locality, pl.city].filter(Boolean).join(', ').toUpperCase() : '',

        // ── The landlord ──
        ownerName,
        ownerLabel: ownerName || 'Your landlord',
        phone,
        phoneLabel: fmtPhone(phone),
        hasPhone: !!phone,
        call: () => (phone ? callNumber(phone, ownerName || 'the landlord') : flash('No number on file for this landlord')),
        message: () => (phone
          ? messageNumber(phone, ownerName, `Hi, I saw ${(pl && pl.name) || 'your property'} on TenantPro and would like to ask about a room — `)
          : flash('No number on file for this landlord')),

        // ── The rooms ──
        hasRooms: rooms.length > 0,
        noRoomsLine: 'This landlord has not added any rooms yet. You can still ask to join, and they will place you.',
        rooms: rooms.map((r) => ({
          id: r.id,
          label: String(r.unit_number || ''),
          type: String(r.room_type || '').toUpperCase(),
          // Per BED, which is what the server sends and what they will be charged.
          price: `₹${inr(r.rent)}`,
          priceNote: 'per bed / month',
          free: Number(r.free) || 0,
          freeLine: Number(r.free) > 0
            ? `${r.free} of ${r.capacity} free`
            : 'Full right now',
          full: Number(r.free) <= 0,
          on: String(r.id) === String(s.askRoom),
          // A full room can still be asked for — the landlord may be about to free a
          // bed, and they decide either way. It is labelled full rather than disabled
          // so the choice is informed instead of removed.
          go: () => set('askRoom', r.id)
        })),
        chosenLabel: chosen ? String(chosen.unit_number) : '',
        hasChosen: !!chosen,
        clearRoom: () => set('askRoom', null),

        // What the request will say, in words, before it is sent.
        askLine: chosen
          ? `You will ask for room ${chosen.unit_number} at ₹${inr(chosen.rent)} per bed. Your landlord confirms the room when they accept.`
          : 'You have not picked a room. Your landlord will place you when they accept — or pick one above to ask for it.',
        cta: chosen ? `Request room ${chosen.unit_number}` : 'Send a request',
        busy: !!s.joining,
        send: () => {
          if (!pl) return;
          setState({ overlay: null });
          api.requestToJoin({ code: pl.code, propertyId: pl.id, name: pl.name, requestedUnitId: s.askRoom });
        },
        close: () => setState({ overlay: null, askRoom: null })
      };
    })(),
    // On a live tenancy "nothing found" must not be claimed before a code has been
    // looked up, or the screen accuses a perfectly good code of not existing while
    // the request is still in flight.
    noJoinResults: TLIVE
      ? (!!(s.look && s.look.code) && !(s.look && s.look.loading) && !(s.look && s.look.place) && !(s.look && s.look.error))
      : !joinMatches.length,
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
        pickPhoto: () => api.pickRequestPhoto('library'),
        // A tenant reporting a leak is standing in front of it.
        takePhoto: () => api.pickRequestPhoto('camera'),
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
  // ── Live refresh ────────────────────────────────────────────────────────────
  // The app had no automatic refresh at all: data arrived at sign-in and then only
  // when the user pulled the screen down. So a landlord never saw a join request
  // land, and a tenant never saw a payment confirmed, without thinking to pull.
  //
  // The fix is a poll, but a poll of something tiny. `/pulse` is ~94 bytes of counts
  // against 1.4kB for the dashboard, and it carries a `stamp` — every number that
  // should redraw a screen, in one string. We keep the last one we saw here and only
  // fetch the real data when it differs, so a quiet app makes one small request every
  // 25 seconds and nothing else.
  //
  // A ref rather than state on purpose: changing it must never itself cause a render.
  const pulseRef = useRef({ stamp: null, busy: false });

  const loadOwnerData = useCallback(async ({ refresh = false, silent = false } = {}) => {
    if (!silent) setState(refresh ? { refreshing: true, dataError: '' } : { dataLoading: true, dataError: '' });
    try {
      const [dashboard, propsRes, unitsRes, tenantsRes, txRes, reqRes, payRes, joinRes, declRes, demoRes, pulseRes] = await Promise.all([
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
        apiPayments.getSettings().catch(() => ({ settings: null })),
        // Newer than the rest again — a backend without this route must not take
        // the dashboard down, so an empty inbox stands in.
        apiOwner.joinRequests('all').catch(() => ({ requests: [] })),
        // Payments tenants say they have made. Fetched with the dashboard rather
        // than when the queue is opened, because the count has to be on the bell
        // before anybody thinks to look — an unconfirmed payment the landlord never
        // noticed is the failure this whole flow exists to prevent. Tolerant of a
        // backend without the route, like the others.
        apiPayments.declared().catch(() => ({ payments: [] })),
        // Is this the demo account? Fetched with the dashboard rather than when
        // Settings opens, so the reset control is already correct the first time that
        // screen is drawn instead of appearing a moment later. A backend without the
        // route answers "not the demo", which hides the control — the safe direction.
        apiOwner.demoStatus().catch(() => ({ is_demo: false })),
        // Pulled alongside the real data so `pulseRef` matches what is now on screen.
        // Without this, the poll 25 seconds after any write would see a changed stamp
        // and reload data that is already current.
        apiOwner.pulse().catch(() => null)
      ]);
      const data = mapOwnerData({
        dashboard,
        properties: propsRes.properties,
        units: unitsRes.units,
        tenants: tenantsRes.tenants,
        transactions: txRes.transactions,
        requests: reqRes.requests,
        paySettings: payRes.settings,
        joinRequests: joinRes.requests,
        declaredPayments: declRes.payments
      });
      if (pulseRes && pulseRes.stamp) pulseRef.current.stamp = pulseRes.stamp;
      setState({
        data,
        live: true,
        dataLoading: false,
        refreshing: false,
        dataError: '',
        // Kept out of `data` because it describes the ACCOUNT, not its contents, and
        // mapOwnerData is about mapping rows.
        demo: demoRes && demoRes.is_demo ? demoRes : null,
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
  const loadTenantData = useCallback(async ({ refresh = false, silent = false } = {}) => {
    // `silent` is for the background poll: swap the data in when it arrives and show
    // no spinner at all. A refresh indicator the user did not ask for reads as a
    // glitch, not as helpfulness.
    if (!silent) setState(refresh ? { refreshing: true, dataError: '' } : { dataLoading: true, dataError: '' });
    try {
      // Payments come along too: "has this tenant ever paid" is what unlocks the
      // agreement, and it is the same call the payment history will read.
      const [meRes, reqRes, payRes, pulseRes] = await Promise.all([
        apiPortal.me(),
        apiPortal.requests().catch(() => ({ requests: [] })),
        apiPortal.payments().catch(() => ({ payments: [] })),
        // Same reason as the owner side: keep the stamp level with the data.
        apiPortal.pulse().catch(() => null)
      ]);
      if (pulseRes && pulseRes.stamp) pulseRef.current.stamp = pulseRes.stamp;
      setState({
        tdata: { me: meRes, requests: reqRes.requests || [], payments: payRes.payments || [] },
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

  // ── Paying rent ─────────────────────────────────────────────────────────────
  // Hand off to whatever UPI app the tenant uses. This records NOTHING: they have not
  // paid yet, and the app has no way to learn whether they will. All it does is
  // pre-fill the payee, amount and reference so the tenant types nothing and the
  // reference in their bank statement matches the one in here.
  //
  // `upi://pay` is the NPCI-standard intent every UPI app registers. If none is
  // installed the openURL rejects, and saying so beats a dead button.
  const openUpiPayment = useCallback(async ({ payee, amount, reference, name }) => {
    if (!payee || !(amount > 0)) { flash('Your landlord has not added a UPI ID yet'); return; }
    // Built by upiUri, the same function the QR is drawn from. It used to be assembled
    // here by hand, which meant the button and the QR could describe different
    // payments — and the hand-built one was already missing the `tr` reference field
    // and sent the amount unrounded.
    const url = upiUri({ payee, name: name || 'Landlord', amount, reference });
    setState({ pay: { ...stateRef.current.pay, reference, asked: true } });
    try {
      await Linking.openURL(url);
    } catch (e) {
      setState({ pay: { ...stateRef.current.pay, asked: false } });
      flash(copyToClipboard(payee)
        ? `No UPI app found — ${payee} copied instead`
        : 'No UPI app found on this phone');
    }
  }, [setState, flash]);

  // "Yes, I paid." Records the CLAIM. The landlord confirms it, and only that clears
  // the month — see the backend's settlePayment for why that separation exists.
  const declareMyPayment = useCallback(async ({ method, reference }) => {
    const st = stateRef.current;
    if (st.pay.busy) return;
    const amount = Number((st.tdata && st.tdata.me && st.tdata.me.rent && st.tdata.me.rent.amount) || 0);
    if (!(amount > 0)) { flash('No rent amount on your tenancy yet'); return; }
    setState({ pay: { ...st.pay, busy: true, error: '' } });
    try {
      const res = await apiPortal.declarePayment({ amount, method, reference });
      // Reload so the receipts screen and the portal's due state both reflect it, and
      // so the pulse stamp moves with them.
      await loadTenantData({ silent: true });
      setState({ pay: { ...BLANK_PAY }, paid: true });
      flash((res && res.message) || 'Sent to your landlord');
    } catch (e) {
      // 409 means they already have one waiting. That is not a failure to hide — it is
      // the answer to "why can I not send another".
      setState({ pay: { ...stateRef.current.pay, busy: false, error: errText(e, 'Could not send that to your landlord.') } });
    }
  }, [setState, flash, loadTenantData]);

  // How often to ask "anything new?" while the app is in front of the user. Long
  // enough that a quiet app is genuinely idle, short enough that a landlord watching
  // for a join request does not think the app is asleep.
  const PULSE_MS = 25000;

  // One tick. Cheap, silent, and happy to do nothing — which is the common case.
  const checkPulse = useCallback(async () => {
    const st = stateRef.current;

    // Signed out, or the pre-login walkthrough on seed data: nothing to poll, and the
    // stamp is dropped so the next person to sign in on this phone starts clean.
    if (!st.session || !st.token && !st.session.token) { pulseRef.current.stamp = null; return; }
    // A load already in flight would either race this or make it redundant.
    if (st.writing || st.refreshing || st.dataLoading || pulseRef.current.busy) return;

    const isTenant = st.session.role === 'tenant';
    if (!isTenant && !st.live) return; // owner data has not arrived yet

    pulseRef.current.busy = true;
    try {
      const res = isTenant ? await apiPortal.pulse() : await apiOwner.pulse();
      const stamp = res && res.stamp;
      if (!stamp) return;

      // First sighting: record it, do not reload. Otherwise every sign-in would
      // trigger a second, pointless fetch of data we just loaded.
      if (pulseRef.current.stamp === null) { pulseRef.current.stamp = stamp; return; }
      if (stamp === pulseRef.current.stamp) return;

      // Something changed. Store it BEFORE reloading so a slow reload cannot let the
      // next tick fire on the same news.
      pulseRef.current.stamp = stamp;
      if (isTenant) await loadTenantData({ silent: true });
      else await loadOwnerData({ silent: true });
    } catch (e) {
      // Deliberately silent. This runs on a timer; a failed poll is not an event the
      // user needs told about, and the next tick tries again. Surfacing it would mean
      // a red banner every time a lift loses signal.
    } finally {
      pulseRef.current.busy = false;
    }
  }, [loadOwnerData, loadTenantData]);

  // Poll only while the app is actually on screen. A timer that keeps running in the
  // background would drain the battery and keep a sleeping free-tier server awake for
  // a screen nobody is looking at.
  useEffect(() => {
    let timer = null;
    const start = () => { if (!timer) timer = setInterval(checkPulse, PULSE_MS); };
    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    const onChange = (next) => {
      if (next === 'active') {
        // Check immediately rather than waiting out the interval: coming back to the
        // app is exactly the moment someone expects to see what they missed.
        checkPulse();
        start();
      } else {
        stop();
      }
    };

    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', onChange);
    return () => { stop(); sub.remove(); };
  }, [checkPulse]);

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

  // Accept or reject a request to join a property. Accepting creates the tenant
  // record and links their login, which changes the roster, the occupancy and the
  // dues — hence the full refresh ownerWrite does rather than patching one row.
  const decideJoin = useCallback(({ id, decision, unitId, name, where, stayUntil = null }) => ownerWrite(
    () => apiOwner.decideJoinRequest(id, decision, unitId, stayUntil),
    {
      done: decision === 'accept'
        ? `${name} accepted${where ? ` into ${where}` : ''}`
        : `${name}'s request declined`,
      failed: decision === 'accept' ? 'Could not accept that request.' : 'Could not decline that request.'
    }
  ), [ownerWrite]);

  // Confirm or reject a payment a tenant says they made.
  //
  // Goes through ownerWrite like every other landlord write, which matters more here
  // than elsewhere: confirming advances next_rent_due on the server, so the due
  // countdown on the dashboard, the overdue list, the tenant's own card and the
  // collected total all change as a result of this one call. Nothing local is
  // patched — the reload is what makes every one of those agree.
  const decidePayment = useCallback(({ id, decision, name, amount, note }) => ownerWrite(
    () => apiPayments.decide(id, decision, note),
    {
      done: decision === 'confirm'
        ? `${amount} from ${name} confirmed`
        : `Payment from ${name} rejected`,
      failed: decision === 'confirm'
        ? 'Could not confirm that payment.'
        : 'Could not reject that payment.'
    }
  ), [ownerWrite]);

  // Ask a landlord to be let into a property. The tenant side of the same table.
  const requestToJoin = useCallback(async ({ code, propertyId, name, requestedUnitId = null }) => {
    setState({ joining: true });
    try {
      // requested_unit_id is omitted rather than sent as null when no room was picked.
      // The server treats an absent room as "no preference" and an invalid one as an
      // error, so sending an empty value would turn "I don't mind" into a 400.
      await apiPortal.requestJoin({
        ...(code ? { code } : {}),
        ...(propertyId ? { property_id: propertyId } : {}),
        ...(requestedUnitId != null ? { requested_unit_id: requestedUnitId } : {})
      });
      // Re-read so the tenant sees their own request listed as Pending rather than
      // having to trust a toast.
      await loadTenantData({ refresh: true });
      setState({ joining: false });
      flash(`Request sent to ${name || 'the landlord'}`);
      return true;
    } catch (e) {
      setState({ joining: false });
      flash(errText(e, 'Could not send that request.'));
      return false;
    }
  }, [setState, flash, loadTenantData]);

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

  // ── Getting a picture: camera OR gallery ───────────────────────────────────
  // Every image in the app went straight to the photo library, which is wrong for
  // the common case — a landlord standing in the room they are adding, or a tenant
  // holding the ID card they need to upload, wants to point the phone at it.
  //
  // This uses expo-image-picker's camera, not expo-camera: the picker hands off to
  // the phone's own camera app and is ALREADY in every installed build, so taking a
  // photo works over the air. expo-camera (the live QR scanner) is a separate native
  // module and needs a new APK.
  //
  // Returns the picked asset, or null when the user cancelled or said no — callers
  // treat both the same, because in both cases nothing should change.
  const captureOrPick = useCallback(async (source) => {
    const camera = source === 'camera';
    try {
      const picker = require('expo-image-picker');
      const perm = camera
        ? await picker.requestCameraPermissionsAsync()
        : await picker.requestMediaLibraryPermissionsAsync();
      if (!perm || !perm.granted) {
        flash(camera
          ? 'Camera access is needed to take a photo'
          : 'Photo access is needed to add a picture');
        return null;
      }
      const res = camera
        ? await picker.launchCameraAsync({ quality: 0.8 })
        : await picker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
      if (res.canceled || !res.assets || !res.assets[0]) return null;
      return res.assets[0];
    } catch (e) {
      flash(camera ? 'Could not open the camera' : 'Could not open your photos');
      return null;
    }
  }, [flash]);

  // ── Finding a property by its invite code ──────────────────────────────────
  // Resolves a code against the server so a tenant can SEE what they are about to
  // ask to join. The response is checked against the code still being looked for,
  // so a slow answer for one code cannot paint under another.
  const lookupProperty = useCallback(async (code) => {
    const wanted = String(code || '').trim().toUpperCase();
    if (!wanted) return;
    setState({ look: { code: wanted, loading: true, error: '', place: null } });
    try {
      const res = await apiPortal.lookupProperty(wanted);
      if (stateRef.current.look.code !== wanted) return;
      setState({ look: { code: wanted, loading: false, error: '', place: res.property || null } });
    } catch (e) {
      if (stateRef.current.look.code !== wanted) return;
      // A 404 is not a failure — it is the answer. Reporting it as an error put a
      // "Try again" button under a code that will never resolve however many times
      // it is retried; the screen's own not-found copy says the useful thing
      // instead ("check it with your landlord").
      const notFound = e && e.response && e.response.status === 404;
      setState({
        look: {
          code: wanted,
          loading: false,
          error: notFound ? '' : errText(e, 'Could not look up that code.'),
          place: null
        }
      });
    }
  }, [setState]);

  // Carry a code into sign-up. Signed IN, there is no reason to detour through
  // registration — resolve it and show the property as usual.
  const holdJoinCode = useCallback((code) => {
    const wanted = String(code || '').trim().toUpperCase();
    if (!wanted) return;
    const st = stateRef.current;
    const signedInTenant = !!(st.session && st.session.role === 'tenant');
    if (signedInTenant) {
      setState({ jq: wanted, route: 'tfind', scanCode: '', guestCode: '' });
      lookupProperty(wanted);
      return;
    }
    setState({
      pendingJoin: wanted,
      guestCode: '',
      scanCode: '',
      signupRole: 'tenant',
      route: 'signup',
      authError: ''
    });
    flash(`We will ask to join ${wanted} once your account is ready`);
  }, [setState, flash, lookupProperty]);

  // ── Reading an invite QR out of a saved picture ────────────────────────────
  // A landlord shows the QR from their own phone, which works only if both people
  // are in the same room. In practice they send it on WhatsApp, and the tenant then
  // has a PICTURE of a QR — which the live scanner cannot help with: pointing one
  // phone's camera at another phone's screen is a glare-and-focus fight, and the
  // image may have arrived on the only phone there is.
  //
  // expo-camera can decode a still image. It is the same native module the live
  // scanner uses, so this needs no new permission and no new dependency — but it IS
  // native, so it is required lazily and its absence is a state to report rather
  // than a crash, exactly as ScanQrScreen does with the viewfinder.
  //
  // Every failure gets its OWN message. "Could not read that" covers four different
  // situations — no scanner in this build, no QR in the picture, a QR that belongs
  // to something else, or a cancelled pick — and a tenant who cannot tell them apart
  // cannot fix any of them.
  const scanQrFromImage = useCallback(async () => {
    // Resolve the decoder BEFORE opening the picker. Sending somebody through a
    // gallery to choose a photo and only then admitting the app cannot read it is a
    // worse experience than saying so up front.
    const decode = (() => {
      try {
        // eslint-disable-next-line global-require
        const mod = require('expo-camera');
        if (!mod) return null;
        // Both shapes, because the module has moved this once already: a top-level
        // export in current SDKs, a static on CameraView in others.
        if (typeof mod.scanFromURLAsync === 'function') return mod.scanFromURLAsync;
        if (mod.CameraView && typeof mod.CameraView.scanFromURLAsync === 'function') {
          return mod.CameraView.scanFromURLAsync.bind(mod.CameraView);
        }
        return null;
      } catch (e) {
        return null;
      }
    })();

    if (!decode) {
      flash('Reading a QR from a picture needs a newer version of the app. Type the code instead.');
      return;
    }

    const asset = await captureOrPick('library');
    // Cancelled, or permission refused — captureOrPick has already said which.
    if (!asset || !asset.uri) return;

    let results = null;
    try {
      results = await decode(asset.uri, ['qr']);
    } catch (e) {
      flash('Could not open that picture');
      return;
    }

    const first = (results || []).find((r) => r && (r.data || r.raw));
    if (!first) {
      flash('No QR code in that picture. Try a clearer screenshot of the whole code.');
      return;
    }

    const code = codeOf(first.data || first.raw);
    if (!code) {
      flash('That QR is not a TenantPro invite');
      return;
    }
    holdJoinCode(code);
  }, [captureOrPick, flash, holdJoinCode]);

  // ── ID documents ───────────────────────────────────────────────────────────
  // Read on demand, never bundled into the dashboard: a government ID is the most
  // sensitive thing here, so it travels only when somebody has opened the screen
  // that shows it. Every response is checked against the view that is still open,
  // so a slow reply for one person can never paint under another's name.
  const loadDocs = useCallback(async (kind, id) => {
    if (id == null) return;
    const key = `${kind}:${id}`;
    // Where we came from, so closing returns there. Opening documents from the join
    // inbox replaced that sheet, and closing dumped the landlord on the dashboard
    // mid-way through triaging a queue of applicants.
    const from = stateRef.current.overlay === 'docs' ? stateRef.current.docs.from : stateRef.current.overlay;
    setState({
      overlay: 'docs',
      docs: { key, from: from || null, list: [], summary: null, person: null, noAccount: false, loading: true, error: '', deciding: 0 }
    });
    try {
      const res = kind === 'join'
        ? await apiOwner.applicantDocuments(id)
        : await apiOwner.tenantDocuments(id);
      if (stateRef.current.docs.key !== key) return;
      const now = new Date();
      setState({
        docs: {
          key,
          from,
          list: (res.documents || []).map((d) => mapDocument(d, now)),
          summary: res.summary || null,
          person: res.person || null,
          noAccount: !!res.no_account,
          loading: false,
          error: '',
          deciding: 0
        }
      });
    } catch (e) {
      if (stateRef.current.docs.key !== key) return;
      setState({
        docs: {
          key,
          from,
          list: [],
          summary: null,
          person: null,
          noAccount: false,
          loading: false,
          error: errText(e, 'Could not load the documents.'),
          deciding: 0
        }
      });
    }
  }, [setState]);

  // The landlord's manual check. Refreshes the open list from the response, then
  // reloads the portfolio so the ID badge on the tenant list agrees with it — the
  // badge is derived from these same rows, so leaving it stale would show
  // "NO ID ON FILE" beside a document that was just verified.
  const decideDoc = useCallback(async (docId, decision) => {
    if (docId == null) return;
    const key = stateRef.current.docs.key;
    setState({ docs: { ...stateRef.current.docs, deciding: docId, error: '' } });
    try {
      const res = await apiOwner.decideDocument(docId, decision);
      const now = new Date();
      if (stateRef.current.docs.key === key) {
        setState({
          docs: {
            ...stateRef.current.docs,
            list: (res.documents || []).map((d) => mapDocument(d, now)),
            summary: res.summary || null,
            deciding: 0
          }
        });
      }
      flash(res.message || 'Saved');
      loadOwnerData({ refresh: true });
    } catch (e) {
      if (stateRef.current.docs.key !== key) return;
      setState({
        docs: {
          ...stateRef.current.docs,
          deciding: 0,
          error: errText(e, 'Could not save that decision.')
        }
      });
    }
  }, [setState, flash, loadOwnerData]);

  // ── The tenant's own documents ─────────────────────────────────────────────
  const loadMyDocs = useCallback(async () => {
    setState({ myDocs: { ...stateRef.current.myDocs, loading: true, error: '' } });
    try {
      const res = await apiPortal.documents();
      const now = new Date();
      setState({
        myDocs: {
          list: (res.documents || []).map((d) => mapDocument(d, now)),
          summary: res.summary || null,
          loading: false,
          error: '',
          loaded: true
        }
      });
    } catch (e) {
      setState({
        myDocs: {
          ...stateRef.current.myDocs,
          loading: false,
          loaded: true,
          error: errText(e, 'Could not load your documents.')
        }
      });
    }
  }, [setState]);

  // Pick the file to upload. Camera first would be the nicer default, but the
  // library also covers "I already have a scan of my PAN card", which is how most
  // people actually hold their ID.
  const pickDocPhoto = useCallback(async (source) => {
    const asset = await captureOrPick(source);
    if (!asset) return;
    setState({ docForm: { ...stateRef.current.docForm, photo: asset, error: '' } });
  }, [setState, captureOrPick]);

  const addMyDoc = useCallback(async () => {
    const f = stateRef.current.docForm;
    if (!f.photo) {
      setState({ docForm: { ...f, error: 'Attach a photo of the document first.' } });
      return;
    }
    setState({ docForm: { ...f, busy: true, error: '' } });
    try {
      const form = new FormData();
      form.append('doc_type', f.type);
      form.append('doc_number', f.number || '');
      form.append('document', filePart(f.photo, `id-${Date.now()}.jpg`));
      const res = await apiPortal.addDocument(form);
      const now = new Date();
      setState({
        docForm: { type: 'aadhaar', number: '', photo: null, error: '', busy: false },
        myDocs: {
          list: (res.documents || []).map((d) => mapDocument(d, now)),
          summary: res.summary || null,
          loading: false,
          error: '',
          loaded: true
        },
        // One document satisfies the registration requirement, so the gate lifts as
        // soon as the server confirms it stored one — not when we merely sent it.
        docGate: (res.summary && res.summary.has_any) ? false : stateRef.current.docGate
      });
      flash(res.message || 'Document added');
    } catch (e) {
      setState({
        docForm: { ...stateRef.current.docForm, busy: false, error: errText(e, 'Could not save the document.') }
      });
    }
  }, [setState, flash]);

  const removeMyDoc = useCallback(async (docId) => {
    if (docId == null) return;
    try {
      const res = await apiPortal.removeDocument(docId);
      const now = new Date();
      setState({
        myDocs: {
          list: (res.documents || []).map((d) => mapDocument(d, now)),
          summary: res.summary || null,
          loading: false,
          error: '',
          loaded: true
        }
      });
      flash(res.message || 'Removed');
    } catch (e) {
      flash(errText(e, 'Could not remove that document.'));
    }
  }, [setState, flash]);

  // ── Joining as a guest ──────────────────────────────────────────────────────
  // The point of this path is that nothing is asked for that a landlord does not
  // need to let someone in today: a number to ring, and an ID to check. No name, no
  // email, no password — the person doing this is standing in the building.
  //
  // One call does everything, which matters more than it looks: creating the
  // account, filing the ID and sending the request as three separate steps would
  // leave an account with no ID behind whenever the second one failed.

  // Photograph the ID, or choose an existing scan.
  const pickGuestPhoto = useCallback(async (source) => {
    const asset = await captureOrPick(source);
    if (!asset) return;
    setState({ gform: { ...stateRef.current.gform, photo: asset, error: '' } });
  }, [setState, captureOrPick]);

  // Resolve the property code before asking for anything personal, so a mistyped
  // code is caught while it is still the only thing on screen — and so the second
  // step can name the place they are about to hand their ID to.
  const guestCheckCode = useCallback(async () => {
    const g = stateRef.current.gform;
    const code = codeOf(stateRef.current.guestCode);
    if (!code) return;
    setState({ gform: { ...g, busy: true, error: '' } });
    try {
      const res = await apiPortal.lookupProperty(code);
      setState({ gform: { ...stateRef.current.gform, busy: false, step: 'you', place: res.property || null, error: '' } });
    } catch (e) {
      // The lookup is tenant-only on the server, so a signed-out guest gets a 401
      // here. That is not a reason to stop them: the join call resolves the code
      // again itself and will refuse a bad one with a clear message. Only a real
      // 404 — "no such property" — is worth blocking on.
      const status = e && e.response && e.response.status;
      if (status === 404) {
        setState({ gform: { ...stateRef.current.gform, busy: false, error: 'No property matches that code. Check it with your landlord.' } });
        return;
      }
      setState({ gform: { ...stateRef.current.gform, busy: false, step: 'you', place: null, error: '' } });
    }
  }, [setState]);

  const submitGuestJoin = useCallback(async () => {
    const g = stateRef.current.gform;
    if (g.busy) return;
    const code = codeOf(stateRef.current.guestCode);
    const phone = String(g.phone || '').replace(/[^0-9]/g, '').slice(-10);
    if (phone.length !== 10) {
      setState({ gform: { ...g, error: 'Enter the 10-digit mobile number your landlord can reach you on.' } });
      return;
    }
    if (!g.photo) {
      setState({ gform: { ...g, error: 'Add a photo of a government ID — this is what your landlord checks.' } });
      return;
    }
    setState({ gform: { ...g, busy: true, error: '' } });
    try {
      const form = new FormData();
      form.append('code', code);
      form.append('phone', phone);
      form.append('doc_type', g.docType);
      form.append('doc_number', g.docNumber || '');
      form.append('document', filePart(g.photo, `guest-id-${Date.now()}.jpg`));
      // Sent as the date rather than the month count, so the landlord sees exactly the
      // day this screen showed them — and so a request that sits in the inbox for a
      // week still means the day they asked for, not a week later. Omitted entirely
      // for "not sure yet": an empty string would be a date the server has to guess at.
      const wants = stayFromMonths(g.stayMonths);
      if (wants) form.append('stay_until', wants.iso);
      const res = await apiAuth.joinAsGuest(form);

      // From here a guest is an ordinary signed-in tenant. Same session storage,
      // same token header, same loader — which is exactly why no other screen needs
      // to know that guests exist.
      await saveTenantSession(res.token, res.tenant);
      setToken(res.token);
      setState({
        session: { role: 'tenant', token: res.token, user: res.tenant },
        gform: { ...BLANK_GUEST_FORM },
        guestCode: '',
        pendingJoin: '',
        route: 'portal'
      });
      await loadTenantData();
      flash(res.message || 'Request sent to the landlord');
    } catch (e) {
      // The server distinguishes "you already asked" and "that number has a real
      // account" from a plain failure, and both need saying rather than swallowing:
      // one tells them their guest ID, the other tells them to sign in instead.
      const data = (e && e.response && e.response.data) || {};
      setState({ gform: { ...stateRef.current.gform, busy: false, error: data.message || errText(e, 'Could not send that request.') } });
    }
  }, [setState, flash, loadTenantData]);

  // Signing back in with a guest ID, for a guest who reinstalled or changed phone.
  const submitGuestSignIn = useCallback(async () => {
    const g = stateRef.current.gsignin;
    if (g.busy) return;
    const code = String(g.code || '').trim().toUpperCase();
    const phone = String(g.phone || '').replace(/[^0-9]/g, '').slice(-10);
    if (code.length !== 6 || phone.length !== 10) {
      setState({ gsignin: { ...g, error: 'Enter your 6-character guest ID and the number you joined with.' } });
      return;
    }
    setState({ gsignin: { ...g, busy: true, error: '' } });
    try {
      const res = await apiAuth.guestLogin(code, phone);
      await saveTenantSession(res.token, res.tenant);
      setToken(res.token);
      setState({
        session: { role: 'tenant', token: res.token, user: res.tenant },
        gsignin: { code: '', phone: '', busy: false, error: '' },
        route: 'portal'
      });
      await loadTenantData();
      flash('Signed in');
    } catch (e) {
      const data = (e && e.response && e.response.data) || {};
      setState({ gsignin: { ...stateRef.current.gsignin, busy: false, error: data.message || errText(e, 'Could not sign you in.') } });
    }
  }, [setState, flash, loadTenantData]);

  // Turning a guest into a full account. The nudge that leads here is on the tenant
  // tab; this is what it buys.
  const submitClaim = useCallback(async () => {
    const c = stateRef.current.claim;
    if (c.busy) return;
    if (!c.name.trim() || !c.email.trim() || !c.password) {
      setState({ claim: { ...c, error: 'Name, email and a password are all needed.' } });
      return;
    }
    if (c.password.length < 6) {
      setState({ claim: { ...c, error: 'Password must be at least 6 characters.' } });
      return;
    }
    setState({ claim: { ...c, busy: true, error: '' } });
    try {
      const res = await apiPortal.claimAccount({ name: c.name.trim(), email: c.email.trim(), password: c.password });
      // A fresh token, because the guest one carried no email in its payload.
      if (res.token) {
        await saveTenantSession(res.token, res.tenant);
        setToken(res.token);
      }
      setState({
        session: { role: 'tenant', token: res.token || stateRef.current.session.token, user: res.tenant },
        claim: { name: '', email: '', password: '', busy: false, error: '' },
        overlay: null
      });
      await loadTenantData({ refresh: true });
      flash(res.message || 'Profile complete');
    } catch (e) {
      const data = (e && e.response && e.response.data) || {};
      setState({ claim: { ...stateRef.current.claim, busy: false, error: data.message || errText(e, 'Could not save that.') } });
    }
  }, [setState, flash, loadTenantData]);

  // ── Pinning a property ──────────────────────────────────────────────────────
  // Searching is debounced in the screen, not here: this fires the request it was
  // given. `seq` guards against an old, slower reply landing after a newer one and
  // replacing good results with stale ones — the same race the property lookup has.
  const pinSeq = useRef(0);

  const searchPlaces = useCallback(async (q) => {
    const mine = ++pinSeq.current;
    const text = String(q || '').trim();
    if (text.length < 3) {
      setState({ pin: { ...stateRef.current.pin, q, results: [], searching: false, error: '' } });
      return;
    }
    setState({ pin: { ...stateRef.current.pin, q, searching: true, error: '' } });
    try {
      const p = stateRef.current.pin;
      const near = hasPin(p.lat, p.lon) ? { lat: Number(p.lat), lon: Number(p.lon) } : DEFAULT_CENTER;
      const results = await apiPlaces.search(text, near);
      if (mine !== pinSeq.current) return;
      setState({ pin: { ...stateRef.current.pin, results, searching: false, error: results.length ? '' : 'Nothing found. Try a landmark, or drag the map instead.' } });
    } catch (e) {
      if (mine !== pinSeq.current) return;
      setState({ pin: { ...stateRef.current.pin, searching: false, results: [], error: 'Could not search just now. You can still drag the map.' } });
    }
  }, [setState]);

  // What the pin is currently over, in words. Best-effort: a failed lookup leaves
  // the pin exactly where it is, because the coordinate is the thing being chosen
  // and the address is only a confirmation of it.
  // Its OWN sequence counter, not the search box's. Sharing one meant the two
  // cancelled each other: searchPlaces bumps the counter before its "fewer than
  // three characters" early return, so a single keystroke in the search field — or
  // tapping the clear button — threw away an in-flight reverse-geocode and left the
  // address null, which is one of the ways the form ended up unfilled. The two
  // requests answer different questions and neither should silence the other.
  const descSeq = useRef(0);

  const describePin = useCallback(async (lat, lon) => {
    const mine = ++descSeq.current;
    try {
      const place = await apiPlaces.reverse(lat, lon);
      if (mine !== descSeq.current) return;
      setState({ pin: { ...stateRef.current.pin, address: place } });
    } catch (e) {
      if (mine !== descSeq.current) return;
      setState({ pin: { ...stateRef.current.pin, address: null } });
    }
  }, [setState]);

  // Start the pin where the landlord is standing. Almost always the right answer —
  // somebody adding a property is usually in it — and it saves a search.
  //
  // Asks for permission at the moment it is used rather than up front, because a
  // request that arrives with a reason attached is the one people grant. If the
  // module is not in this build, that is said plainly instead of a dead button.
  const useMyLocation = useCallback(async () => {
    setState({ pin: { ...stateRef.current.pin, searching: true, error: '' } });
    let loc = null;
    try {
      // eslint-disable-next-line global-require
      loc = require('expo-location');
    } catch (e) {
      setState({ pin: { ...stateRef.current.pin, searching: false, error: 'Current location arrives in the next app update. Search or drag the map for now.' } });
      return;
    }
    try {
      const perm = await loc.requestForegroundPermissionsAsync();
      if (!perm || !perm.granted) {
        setState({
          pin: {
            ...stateRef.current.pin,
            searching: false,
            error: 'Location is off for TenantPro. You can turn it on in your phone settings, or just drag the map.'
          },
          perms: { ...stateRef.current.perms, location: 'denied' }
        });
        return;
      }
      const pos = await loc.getCurrentPositionAsync({ accuracy: loc.Accuracy.Balanced });
      const lat = pos && pos.coords ? pos.coords.latitude : null;
      const lon = pos && pos.coords ? pos.coords.longitude : null;
      if (!hasPin(lat, lon)) {
        setState({ pin: { ...stateRef.current.pin, searching: false, error: 'Could not get a fix. Try again outdoors, or drag the map.' } });
        return;
      }
      setState({
        pin: { ...stateRef.current.pin, lat, lon, zoom: 18, results: [], searching: false, error: '', address: null },
        perms: { ...stateRef.current.perms, location: 'granted' }
      });
      // Name it, so the fields can be filled from a real result.
      describePin(lat, lon);
    } catch (e) {
      setState({ pin: { ...stateRef.current.pin, searching: false, error: 'Could not read your location just now. Drag the map instead.' } });
    }
  }, [setState, describePin]);

  // ── Device permissions ─────────────────────────────────────────────────────
  // Asked from the primer screen, one at a time, each right next to the sentence
  // that says what it is for — which is both what Android and iOS ask for and
  // what actually gets granted. Both modules are required lazily: expo-camera is
  // native and absent from any APK built before it was added, and a top-level
  // import would take the screen down there instead of degrading to "not in this
  // build".
  const askPermission = useCallback(async (kind) => {
    setState({ permBusy: kind });
    const done = (result) => setState({
      perms: { ...stateRef.current.perms, [kind]: result },
      permBusy: ''
    });
    try {
      if (kind === 'camera') {
        const cam = require('expo-camera');
        // expo-camera moved this: SDK <=50 had `Camera.requestCameraPermissionsAsync`,
        // and from SDK 51 it is a top-level export with `Camera` removed. Asking for
        // the old one found `undefined` and this reported "not in this build" for a
        // camera that was in the build all along — so the user could not grant it.
        const ask =
          (typeof cam.requestCameraPermissionsAsync === 'function' && cam.requestCameraPermissionsAsync) ||
          (cam.CameraView && typeof cam.CameraView.requestCameraPermissionsAsync === 'function' && cam.CameraView.requestCameraPermissionsAsync.bind(cam.CameraView)) ||
          (cam.Camera && typeof cam.Camera.requestCameraPermissionsAsync === 'function' && cam.Camera.requestCameraPermissionsAsync.bind(cam.Camera)) ||
          null;
        if (!ask) { done('missing'); return; }
        const res = await ask();
        done(res && res.granted ? 'granted' : 'denied');
        return;
      }
      if (kind === 'location') {
        // Native, and NOT in any build made before it was added — same lazy require
        // as the camera, so an older APK reports "not in this build" instead of
        // crashing the screen. Foreground only: the app has no reason to know where
        // anyone is when it is closed, and asking for background location is both a
        // Play Store review problem and a thing users are right to refuse.
        const loc = require('expo-location');
        const res = await loc.requestForegroundPermissionsAsync();
        done(res && res.granted ? 'granted' : 'denied');
        return;
      }
      const picker = require('expo-image-picker');
      const res = await picker.requestMediaLibraryPermissionsAsync();
      done(res && res.granted ? 'granted' : 'denied');
    } catch (e) {
      // A throw here means the native module is not in this build at all.
      done('missing');
    }
  }, [setState]);

  // Leaving the primer — whether every switch was flipped or none of them were.
  // The flag is written either way: nagging on every launch is what makes people
  // deny things outright, and each permission is asked for again in context at
  // the moment it is needed.
  const finishPermits = useCallback(() => {
    setPermitsSeen();
    // Reached from the first-run flow this leads to the role picker; reached from
    // Settings by somebody already signed in it must not dump them back at a
    // sign-in screen, so it retraces the step they came from instead.
    const sess = stateRef.current.session;
    if (sess && sess.role) {
      if (goBackOneStep()) return;
      setState({ route: sess.role === 'owner' ? 'settings' : 'tsettings' });
      return;
    }
    setState({ route: 'role' });
  }, [setState, goBackOneStep]);

  // ── Creating things ────────────────────────────────────────────────────────
  // All three go out as multipart because each endpoint also accepts a photo.
  // A blank string is appended rather than omitted for optional text so the
  // column is written as empty instead of the literal "undefined".
  const put = (form, k, v) => form.append(k, v == null ? '' : String(v));

  // Pick a photo for one of the creation forms. Same lazy require as the
  // request-photo picker; `slot` says which form's state to drop it into.
  const pickPhotoFor = useCallback(async (slot, source) => {
    const asset = await captureOrPick(source);
    if (!asset) return;
    setState({ [slot]: { ...stateRef.current[slot], photo: asset, error: '' } });
  }, [setState, captureOrPick]);

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
    // The pin, if one was placed. Sent as two plain fields; the server refuses
    // anything out of range and treats an empty string as "not pinned".
    if (hasPin(np.lat, np.lon)) {
      form.append('latitude', String(np.lat));
      form.append('longitude', String(np.lon));
    }
    setState({ np: { ...np, busy: true, error: '' } });
    const ok = await ownerWrite(() => apiProps.add(form), {
      done: `${np.name.trim()} added`, failed: 'Could not add that property.'
    });
    setState(ok
      ? { np: { ...BLANK_PROPERTY }, overlay: null }
      : { np: { ...stateRef.current.np, busy: false } });
  }, [setState, ownerWrite]);

  // Edit a property in place. The endpoint replaces every text column, so the form
  // is seeded with what is already stored — sending a blank field would erase it.
  const saveProperty = useCallback(async () => {
    const ep = stateRef.current.ep;
    if (ep.busy || ep.id == null) return;
    const form = new FormData();
    put(form, 'name', ep.name.trim());
    put(form, 'property_type', ep.type);
    put(form, 'address', ep.address.trim());
    put(form, 'locality', ep.locality.trim());
    put(form, 'city', ep.city.trim());
    put(form, 'pincode', ep.pincode.trim());
    // Only sent when the map was actually opened during this edit. The update
    // endpoint leaves latitude/longitude alone when the fields are absent, which is
    // what stops correcting a property's NAME from wiping its pin.
    if (hasPin(ep.lat, ep.lon)) {
      form.append('latitude', String(ep.lat));
      form.append('longitude', String(ep.lon));
    }
    // Only sent when a NEW one was picked: the endpoint leaves image_url alone
    // otherwise, so not sending it is what keeps the existing photo.
    if (ep.photo) form.append('property_image', filePart(ep.photo, 'property.jpg'));
    setState({ ep: { ...ep, busy: true, error: '' } });
    const ok = await ownerWrite(() => apiProps.update(ep.id, form), {
      done: `${ep.name.trim()} updated`, failed: 'Could not save those changes.'
    });
    setState(ok
      ? { ep: { ...BLANK_EDIT_PROPERTY }, overlay: null }
      : { ep: { ...stateRef.current.ep, busy: false } });
  }, [setState, ownerWrite]);

  // Delete a property. The server refuses while it still has active tenants and
  // says so, which is the check that matters — this just reports what it said.
  const deleteProperty = useCallback(async (id, name) => {
    if (id == null) return;
    setState({ overlay: null });
    await ownerWrite(() => apiProps.remove(id), {
      done: `${name || 'Property'} deleted`, failed: 'Could not delete that property.'
    });
  }, [setState, ownerWrite]);

  // Rebuild the demo account's rich picture. Only ever reachable from the demo
  // account — the control is hidden otherwise and the server refuses anyone else — so
  // this does not need its own guard, but it DOES need to reload afterwards: a reset
  // deletes and recreates every row, which makes every id on screen stale.
  //
  // Goes through ownerWrite for that reload, and its own `demoBusy` flag drives the
  // button's spinner. Without the flag a slow rebuild looks like a dead button and
  // invites the second tap the server would answer with a 429.
  const resetDemo = useCallback(async () => {
    if (stateRef.current.demoBusy) return;
    setState({ demoBusy: true, overlay: null });
    let message = '';
    const ok = await ownerWrite(async () => { message = (await apiOwner.resetDemo()).message; }, {
      failed: 'Could not rebuild the demo data.'
    });
    // The status card's counts and "last reset" come from the same call the dashboard
    // makes, so refreshing it is what makes the card agree with what just happened.
    let demo = stateRef.current.demo;
    if (ok) {
      try { demo = await apiOwner.demoStatus(); } catch (e) { /* keep the old card */ }
    }
    setState({ demoBusy: false, demo: demo && demo.is_demo ? demo : stateRef.current.demo });
    if (ok) flash(message || 'Demo data rebuilt');
  }, [setState, ownerWrite, flash]);

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
  const pickRequestPhoto = useCallback(async (source) => {
    const asset = await captureOrPick(source);
    if (!asset) return;
    setState({ nr: { ...stateRef.current.nr, photo: asset, error: '' } });
  }, [setState, captureOrPick]);

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
        // Signed out: first-time users get the intro, then the one-time
        // permissions primer, then the role picker. The primer is checked
        // separately so an install that already finished the intro still sees it
        // once — otherwise the people most likely to hit the QR scanner (existing
        // users) would be the only ones never told what it needs.
        const [seen, permits] = await Promise.all([hasOnboarded(), hasSeenPermits()]);
        setState({ session: null, route: !seen ? 'onboarding' : (permits ? 'role' : 'permits') });
      }
    } catch (e) {
      setToken(null);
      setState({ session: null, route: 'role' });
    }
  }, [setState, loadOwnerData, loadTenantData]);

  const signIn = useCallback(async (role) => {
    const { authId, authPw, idmode } = stateRef.current;
    const id = String(authId || '').trim();
    if (!id || !authPw) {
      setState({ authError: 'Enter your email/phone and password.' });
      return;
    }
    // The EMAIL/MOBILE switch has to mean something. It used to change only the
    // label and the keyboard, while the value went to an endpoint that matched
    // either column — so choosing MOBILE and typing an email address signed you in,
    // which is what made the switch look broken. Checked here as well as on the
    // server, because this is the half that can explain itself.
    if (idmode === 'mobile' && !/^[0-9]{10}$/.test(id)) {
      setState({
        authError: /@/.test(id)
          ? 'That is an email address. Switch to EMAIL to sign in with it.'
          : 'A mobile number is 10 digits.'
      });
      return;
    }
    if (idmode !== 'mobile' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id)) {
      setState({
        authError: /^[0-9\s+-]+$/.test(id)
          ? 'That is a phone number. Switch to MOBILE to sign in with it.'
          : 'Enter a valid email address.'
      });
      return;
    }
    setState({ authBusy: true, authError: '' });
    try {
      // `idmode` goes with it so the server looks in that column only.
      const res = role === 'tenant'
        ? await apiAuth.loginTenant(id, authPw, idmode)
        : await apiAuth.loginOwner(id, authPw, idmode);
      const user = res.owner || res.tenant || null;
      if (role === 'tenant') await saveTenantSession(res.token, user);
      else await saveOwnerSession(res.token, user);
      setToken(res.token);
      setState({
        session: { role, token: res.token, user },
        authBusy: false, authPw: '', authError: '', authCode: '', authFails: 0,
        route: role === 'tenant' ? 'portal' : 'home'
      });
      flash(`Welcome back${user && user.name ? `, ${String(user.name).split(' ')[0]}` : ''}`);
      if (role === 'owner') loadOwnerData();
      else loadTenantData();
    } catch (e) {
      const code = (e && e.response && e.response.data && e.response.data.code) || '';
      setState({
        authBusy: false,
        authError: errText(e, 'Sign in failed. Check your details and try again.'),
        authCode: code,
        // Only a wrong password counts toward the forgot-password nudge. An
        // unregistered address is a different problem with a different answer, and
        // a network failure is nobody's fault.
        authFails: code === 'NOT_REGISTERED' ? 0 : stateRef.current.authFails + 1
      });
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
          // A new tenant goes to the ID step, not the portal. This is what makes the
          // document required: the account exists, but it is not finished until one
          // is on file, and `docGate` is what the screen reads to refuse a way past.
          // It has to happen here rather than as a field on the signup form because
          // uploading needs the token that registering just returned.
          docGate: asTenant,
          route: asTenant ? 'tdocs' : 'home'
        });
        flash('Account created');
        // A code carried in from "Join as a guest" is spent here, the moment there is
        // an account to attribute the request to. Sent BEFORE the ID step rather than
        // after: the landlord sees it straight away with a "NO ID ON FILE" badge,
        // which is the honest signal, and the tenant is not left thinking their scan
        // was thrown away while they photograph a card.
        const held = stateRef.current.pendingJoin;
        if (asTenant && held) {
          setState({ pendingJoin: '' });
          requestToJoin({ code: held, name: 'the landlord' });
        }
      } else {
        // Registered but no token returned — send them to sign in.
        setState({ authBusy: false, authPw: '', route: asTenant ? 'tlogin' : 'login' });
        flash('Account created — please sign in');
      }
    } catch (e) {
      setState({ authBusy: false, authError: errText(e, 'Could not create the account.') });
    }
  }, [setState, flash, requestToJoin]);


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
      pickPhotoFor, createProperty, saveProperty, deleteProperty, createUnit, createTenantRecord, goBackOneStep,
      decideJoin, decidePayment, requestToJoin, holdJoinCode, askPermission, finishPermits,
      loadDocs, decideDoc, loadMyDocs, pickDocPhoto, addMyDoc, removeMyDoc,
      lookupProperty, scanQrFromImage, resetDemo, openUpiPayment, declareMyPayment,
      pickGuestPhoto, guestCheckCode, submitGuestJoin, submitGuestSignIn, submitClaim,
      searchPlaces, describePin, useMyLocation
    }),
    [
      setState, set, go, flash, signIn, register, signOut, resolveSession,
      loadOwnerData, loadTenantData, loadThread, sendReply, setRequestStatus,
      pickRequestPhoto, createRequest, requestResetCode, submitNewPassword,
      recordPayment, saveTenantRent, assignTenant, moveTenantOut, deleteTenant, savePaymentSettings,
      pickPhotoFor, createProperty, saveProperty, deleteProperty, createUnit, createTenantRecord, goBackOneStep,
      decideJoin, decidePayment, requestToJoin, holdJoinCode, askPermission, finishPermits,
      loadDocs, decideDoc, loadMyDocs, pickDocPhoto, addMyDoc, removeMyDoc,
      lookupProperty, scanQrFromImage, resetDemo, openUpiPayment, declareMyPayment,
      pickGuestPhoto, guestCheckCode, submitGuestJoin, submitGuestSignIn, submitClaim,
      searchPlaces, describePin, useMyLocation
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
