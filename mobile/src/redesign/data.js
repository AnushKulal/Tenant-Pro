// Seed data + pure helpers ported verbatim from the design prototype's
// <script type="text/x-dc"> logic (TenantPro App.dc.html, lines 1813-1929).
//
// COLOUR RULE: wherever the prototype returned a CSS var string like
// 'var(--pos)', this port returns the TOKEN KEY as a plain string ('pos').
// Screens resolve these via useT()[key]. No theme colours are imported here.

export const F = {
  rahul: 'https://randomuser.me/api/portraits/men/45.jpg',
  priya: 'https://randomuser.me/api/portraits/women/44.jpg',
  amit: 'https://randomuser.me/api/portraits/men/68.jpg',
  sneha: 'https://randomuser.me/api/portraits/women/65.jpg',
  karthik: 'https://randomuser.me/api/portraits/men/12.jpg',
  neha: 'https://randomuser.me/api/portraits/women/28.jpg'
};

export const PROPS = [
  {
    id: 'sunrise', name: 'Sunrise PG', loc: 'KORAMANGALA, BENGALURU', short: 'Koramangala',
    img: 'https://picsum.photos/seed/tp-sunrise-pg/800/600',
    type: 'PG · 3 UNITS', address: '12, 5th Cross, Koramangala, Bengaluru 560034',
    code: 'TP-SUN-8412', policy: 'Boys only', policyIcon: 'man',
    lat: 12.9352, lon: 77.6245, rating: '4.5', reviews: '38 reviews',
    food: 'Veg + non-veg · 3 meals a day', foodNote: 'Breakfast 8:00 · Lunch 13:00 · Dinner 20:30',
    amenities: [['wifi', 'Wi-Fi'], ['flash', 'Power backup'], ['sparkles', 'Housekeeping'], ['shirt', 'Laundry'], ['car', 'Parking'], ['videocam', 'CCTV']]
  },
  {
    id: 'green', name: 'Green Meadows', loc: 'HSR LAYOUT, BENGALURU', short: 'HSR Layout',
    img: 'https://picsum.photos/seed/tp-green-meadows/800/600',
    type: 'APARTMENT · 2 UNITS', address: '45, Sector 2, HSR Layout, Bengaluru 560102',
    code: 'TP-GRN-2270', policy: 'Co-living', policyIcon: 'people',
    lat: 12.9116, lon: 77.6474, rating: '4.2', reviews: '21 reviews',
    food: 'Not provided', foodNote: 'Kitchen in every flat · mess 200m away',
    amenities: [['swap-vertical', 'Lift'], ['car', 'Parking'], ['shield-checkmark', 'Security'], ['flash', 'Power backup'], ['water', 'Water supply'], ['barbell', 'Clubhouse']]
  }
];

export const UNITS = [
  { no: '101', prop: 'sunrise', type: 'STANDARD SHARING', rent: '₹16,000', cap: 2 },
  { no: '102', prop: 'sunrise', type: 'DELUXE SINGLE', rent: '₹12,000', cap: 1 },
  { no: '103', prop: 'sunrise', type: 'STANDARD SHARING', rent: '₹16,000', cap: 2 },
  { no: 'A1', prop: 'green', type: '1 BHK', rent: '₹22,000', cap: 1 },
  { no: 'A2', prop: 'green', type: '2 BHK', rent: '₹30,000', cap: 1 }
];

export const PRIORITY = {
  Critical: { rank: 0, fg: 'crit', bg: 'critsoft' },
  High: { rank: 1, fg: 'coral', bg: 'csoft' },
  Medium: { rank: 2, fg: 'amber', bg: 'asoft' },
  Low: { rank: 3, fg: 'fg2', bg: 'ink3' }
};

export const TICKETS = [
  { id: 1, who: 'amit', unit: '102', title: 'No water in the bathroom', cat: 'PLUMBING', priority: 'Critical', status: 'Open', age: '2H AGO',
    body: 'There has been no water in the bathroom since last night. The tap runs dry and the overhead tank line seems blocked. I have not been able to use the bathroom since morning — please send someone today.',
    photos: ['https://picsum.photos/seed/tp-tkt-1a/600/450', 'https://picsum.photos/seed/tp-tkt-1b/600/450'] },
  { id: 2, who: 'karthik', unit: '103', title: 'Ceiling fan not working', cat: 'ELECTRICAL', priority: 'High', status: 'Open', age: '1D AGO',
    body: 'The fan stopped right after yesterday’s power cut. The regulator clicks but the blades do not move. Other points in the room are working fine.',
    photos: ['https://picsum.photos/seed/tp-tkt-2a/600/450'] },
  { id: 3, who: 'rahul', unit: '101', title: 'Leaking tap in bathroom', cat: 'PLUMBING', priority: 'High', status: 'In progress', age: '3D AGO',
    body: 'The cold-water tap drips constantly, even when fully closed. It is wasting water and the sound carries at night.',
    photos: ['https://picsum.photos/seed/tp-tkt-3a/600/450'] },
  { id: 4, who: 'sneha', unit: 'A1', title: 'Lift making a grinding noise', cat: 'GENERAL', priority: 'Medium', status: 'Open', age: '4D AGO',
    body: 'The lift makes a loud grinding sound between the 2nd and 3rd floor. It still runs but it does not sound safe.',
    photos: [] },
  { id: 5, who: 'neha', unit: '103', title: 'Geyser needs a service', cat: 'APPLIANCE', priority: 'Low', status: 'In progress', age: '1W AGO',
    body: 'The water takes much longer to heat than it used to. Probably needs a descale and a service.',
    photos: [] },
  { id: 6, who: 'priya', unit: '101', title: 'Wi-Fi drops every evening', cat: 'GENERAL', priority: 'Medium', status: 'Open', age: '1W AGO',
    body: 'The connection drops for 10–15 minutes at a time between 8pm and 10pm. It has been happening all week.',
    photos: [] },
  { id: 7, who: 'sneha', unit: 'A1', title: 'Parking slot occupied by a visitor', cat: 'GENERAL', priority: 'Low', status: 'Open', age: '2W AGO',
    body: 'A visitor car has been parked in my allotted slot for three days. Please have it moved.',
    photos: [] }
];

// Credit is earned, not assigned: it is a signed score built from behaviour the
// app already records — payments made on time, payments missed, how long they
// have stayed, and how late they are right now.
export const CREDIT_RULES = [
  { key: 'onTime', label: 'Payments on time', unit: 11, fmt: (n) => `${n} paid on time` },
  { key: 'tenure', label: 'Length of stay', unit: 3, fmt: (n) => `${n} months with you` },
  { key: 'late', label: 'Payments missed', unit: -26, fmt: (n) => (n ? `${n} missed` : 'None missed') },
  { key: 'lateDays', label: 'Currently overdue', unit: -4, fmt: (n) => (n ? `${n} days late` : 'Nothing pending') }
];

export const creditOf = (t) => {
  const raw = {
    onTime: t.onTime, tenure: parseInt(t.since, 10),
    late: t.late, lateDays: t.state === 'overdue' ? t.days : 0
  };
  const factors = CREDIT_RULES.map((r) => {
    const pts = raw[r.key] * r.unit;
    return {
      label: r.label, detail: r.fmt(raw[r.key]),
      pts: `${pts > 0 ? '+' : ''}${pts}`,
      fg: pts > 0 ? 'pos' : pts < 0 ? 'coral' : 'fg3'
    };
  });
  const score = Math.max(-100, Math.min(100, CREDIT_RULES.reduce((a, r) => a + raw[r.key] * r.unit, 0)));
  const band = score >= 50 ? 'Positive' : score >= 0 ? 'Neutral' : 'Negative';
  return {
    score, band, factors,
    label: `${score > 0 ? '+' : ''}${score}`,
    fg: band === 'Positive' ? 'pos' : band === 'Neutral' ? 'amber' : 'coral',
    bg: band === 'Positive' ? 'lsoft' : band === 'Neutral' ? 'asoft' : 'csoft',
    // -100..100 mapped onto a 0..100% track, centred on zero
    marker: `${(score + 100) / 2}%`
  };
};

export const MOVE_IN = {
  amit: 'Moved in 1 Jan 2026', karthik: 'Moved in 1 May 2026', rahul: 'Moved in 1 Feb 2026',
  priya: 'Moved in 1 Mar 2026', sneha: 'Moved in 1 Apr 2026', neha: 'Moved in 1 Jun 2026'
};

export const TENANTS = [
  { id: 'amit', name: 'Amit Verma', img: F.amit, unit: '102', type: 'Deluxe Single', rent: '₹12,000', rentFull: '₹12,000', co: 'TCS', state: 'overdue', days: 3, credit: 100, deposit: '₹24,000', onTime: 5, late: 2, since: '7 mo' },
  { id: 'karthik', name: 'Karthik Rao', img: F.karthik, unit: '103', type: 'Standard Sharing', rent: '₹8,000', rentFull: '₹8,000', co: 'Flipkart', state: 'overdue', days: 1, credit: 88, deposit: '₹16,000', onTime: 1, late: 2, since: '3 mo' },
  { id: 'rahul', name: 'Rahul Sharma', img: F.rahul, unit: '101', type: 'Standard Sharing', rent: '₹8,000', rentFull: '₹8,000', co: 'Infosys', state: 'paid', days: 24, credit: 100, deposit: '₹16,000', onTime: 6, late: 0, since: '6 mo' },
  { id: 'priya', name: 'Priya Nair', img: F.priya, unit: '101', type: 'Standard Sharing', rent: '₹8,000', rentFull: '₹8,000', co: 'Wipro', state: 'paid', days: 24, credit: 95, deposit: '₹16,000', onTime: 5, late: 0, since: '5 mo' },
  { id: 'sneha', name: 'Sneha Reddy', img: F.sneha, unit: 'A1', type: '1 BHK', rent: '₹22,000', rentFull: '₹22,000', co: 'Amazon', state: 'paid', days: 20, credit: 90, deposit: '₹44,000', onTime: 4, late: 0, since: '4 mo' },
  { id: 'neha', name: 'Neha Gupta', img: F.neha, unit: '103', type: 'Standard Sharing', rent: '₹8,000', rentFull: '₹8,000', co: 'Zomato', state: 'paid', days: 27, credit: 92, deposit: '₹16,000', onTime: 2, late: 0, since: '2 mo' }
];

// Month labels for the Overview collection bars (renderVals-local in the source).
export const MONTH_LABELS = ['MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG'];

// Ledger source rows. In the prototype these live inside renderVals and are
// filtered by the active property scope there; deriveVm applies the same filter.
export const PAYMENTS = [
  { who: 'neha', unit: '103', amt: '8,000', date: '7 AUG', method: 'UPI', month: 0 },
  { who: 'sneha', unit: 'A1', amt: '22,000', date: '5 AUG', method: 'UPI', month: 0 },
  { who: 'priya', unit: '101', amt: '8,000', date: '3 AUG', method: 'UPI', month: 0 },
  { who: 'rahul', unit: '101', amt: '8,000', date: '2 AUG', method: 'UPI', month: 0 },
  { who: 'karthik', unit: '103', amt: '8,000', date: '7 JUL', method: 'CASH', month: 1 },
  { who: 'neha', unit: '103', amt: '8,000', date: '6 JUL', method: 'UPI', month: 1 },
  { who: 'amit', unit: '102', amt: '12,000', date: '4 JUL', method: 'UPI', month: 1 },
  { who: 'sneha', unit: 'A1', amt: '22,000', date: '3 JUL', method: 'UPI', month: 1 },
  { who: 'priya', unit: '101', amt: '8,000', date: '3 JUL', method: 'CASH', month: 1 },
  { who: 'rahul', unit: '101', amt: '8,000', date: '2 JUL', method: 'UPI', month: 1 }
];

export const EXPENSES = [
  { name: 'Housekeeping', prop: 'sunrise', sub: 'SUNRISE PG · CLEANING', amt: '2,000', date: '12 AUG', month: 0 },
  { name: 'Common area power', prop: 'green', sub: 'GREEN MEADOWS · ELECTRICITY', amt: '2,600', date: '12 AUG', month: 0 },
  { name: 'Plumbing repair', prop: 'sunrise', sub: 'SUNRISE PG · 2ND FLOOR', amt: '3,500', date: '12 JUL', month: 1 },
  { name: 'Tanker top-up', prop: 'green', sub: 'GREEN MEADOWS · WATER', amt: '1,800', date: '9 JUL', month: 1 }
];
