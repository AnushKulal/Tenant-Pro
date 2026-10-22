// File: backend/services/gatewayService.js
//
// Taking rent by card, netbanking or a UPI app that confirms itself.
//
// ── The one decision everything here follows from ─────────────────────────────
// Each landlord connects THEIR OWN merchant account. Money moves tenant → landlord
// and never through this application.
//
// That is not tidiness. Collecting other people's rent into one account and paying it
// out is operating as a payment aggregator, which in India requires RBI authorisation —
// a licence, a ₹15 crore net-worth floor, and an audit. The same arrangement also means
// the gateway's fee (Razorpay: about 2% + GST) is charged to the landlord who chose to
// switch it on, by their own gateway, on their own account. Nobody is billed for a
// feature they did not ask for, and this application never holds anybody's money.
//
// The existing UPI flow still costs ₹0 and is not going anywhere. This sits BESIDE it.
// What it buys is cards and netbanking, and confirmation that does not wait on a
// landlord noticing a claim in a queue.
//
// ── Payment Links, not a checkout SDK ────────────────────────────────────────
// Razorpay's React Native SDK is a native module. This app ships fixes over the air
// (expo-updates), and an OTA update cannot add native code — adding that SDK would mean
// every future change to payments waits for a store build. A Payment Link is plain
// REST: we create one, hand the tenant its https URL, and the gateway's own hosted page
// does the rest. It works on every phone, needs no native module, and ships like any
// other change here.
//
// ── How a payment becomes real ───────────────────────────────────────────────
// Unchanged, and deliberately so: a payment is real once something OTHER than the
// tenant vouches for it. Today that is the landlord tapping Confirm. Here it is the
// gateway, asked directly:
//
//   1. tenant taps Pay → we create a Declared payment row AND a payment link, and
//      store the link's id on the row (payments.gateway_ref),
//   2. tenant pays on the gateway's page,
//   3. the app asks us to check → we ask the GATEWAY what happened, using the
//      landlord's credentials, and settle only if the gateway says paid.
//
// Step 3 is a server-to-server read, which is why the client triggering it is harmless:
// the app can ask the question as often as it likes and never influence the answer. The
// webhook path in controllers/webhookController.js does the same thing from the other
// direction and remains supported — but polling is the primary route, because a webhook
// needs the landlord to configure a URL and a secret in a dashboard, and a feature that
// depends on that step is a feature most landlords will never finish switching on.
const { open } = require('../utils/secretBox');

// Ten seconds. Long enough for a gateway having a slow minute, short enough that a
// tenant staring at a spinner gets an answer rather than a hung request — and it bounds
// how long one of the ten pooled DB connections can be held by an outbound call.
const TIMEOUT_MS = 10000;

// ── Providers ────────────────────────────────────────────────────────────────
// Shaped like config/mailProviders.js: one table, each entry owning its own HTTP. The
// callers below know only `createLink` / `readLink` / `verify`, so adding Cashfree later
// is an entry here and nothing else.
const PROVIDERS = {
    razorpay: {
        id: 'razorpay',
        label: 'Razorpay',
        // What the landlord is being asked for, in the words their dashboard uses.
        keyLabel: 'Key ID',
        secretLabel: 'Key Secret',
        // rzp_test_ keys work end to end against Razorpay's test mode and move no real
        // money, which is the only honest way to try this before trusting it with rent.
        keyHint: 'Starts with rzp_live_ (or rzp_test_ while you are trying it out)',
        where: 'Razorpay Dashboard → Account & Settings → API Keys → Generate Key',
        // Razorpay issues the secret ONCE, at generation, and never shows it again.
        // Worth saying out loud in the UI, because the recovery is "generate a new key",
        // not "look it up".
        secretNote: 'Razorpay shows the secret only once, when you generate the key.',
        base: 'https://api.razorpay.com/v1',
        // Basic auth, key_id as the user and key_secret as the password. No SDK, no
        // signing dance, nothing to go stale.
        auth: (keyId, secret) => `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`,

        // A link the tenant can open. Amount in paise, because Razorpay counts in the
        // smallest unit and a rupee-denominated amount here would silently charge a
        // hundredth of the rent.
        createLink: async (creds, { amount, description, reference, customer }) => {
            const body = {
                amount: Math.round(Number(amount) * 100),
                currency: 'INR',
                // Rent is not a tip jar. Partial payment through the gateway would
                // produce a confirmed payment for less than the claim, and the claim is
                // what clears the month.
                accept_partial: false,
                description,
                customer: {
                    name: customer?.name || undefined,
                    email: customer?.email || undefined,
                    contact: customer?.phone || undefined
                },
                // We already tell the tenant, in the app, with a notification they
                // asked for. Letting the gateway send its own SMS and email as well
                // means three messages for one payment, two of them from a brand the
                // tenant has never heard of.
                notify: { sms: false, email: false },
                reminder_enable: false,
                // OUR reference, carried by the gateway and handed back on the webhook.
                // This is what lets an event find the row it belongs to.
                notes: { reference: String(reference) }
            };
            const r = await fetch(`${PROVIDERS.razorpay.base}/payment_links`, {
                method: 'POST',
                headers: {
                    Authorization: PROVIDERS.razorpay.auth(creds.keyId, creds.secret),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(TIMEOUT_MS)
            });
            const json = await r.json().catch(() => ({}));
            if (!r.ok) {
                return { ok: false, status: r.status, reason: json?.error?.description || `HTTP ${r.status}` };
            }
            return { ok: true, ref: json.id, url: json.short_url };
        },

        // What the gateway says about a link we created. The only authority on whether
        // money arrived.
        readLink: async (creds, ref) => {
            const r = await fetch(`${PROVIDERS.razorpay.base}/payment_links/${encodeURIComponent(ref)}`, {
                headers: { Authorization: PROVIDERS.razorpay.auth(creds.keyId, creds.secret) },
                signal: AbortSignal.timeout(TIMEOUT_MS)
            });
            const json = await r.json().catch(() => ({}));
            if (!r.ok) {
                return { ok: false, status: r.status, reason: json?.error?.description || `HTTP ${r.status}` };
            }
            // Razorpay's link statuses: created, partially_paid, expired, cancelled,
            // paid. Only `paid` settles anything. `partially_paid` cannot happen — we
            // set accept_partial: false — but it is named here so that if it ever does,
            // it reads as not-paid rather than falling through a loose truthiness test.
            const status = String(json.status || '').toLowerCase();
            return {
                ok: true,
                paid: status === 'paid',
                status,
                // Returned so a tenant who abandoned a link can be handed the SAME one
                // again instead of a second one. Two live links for one month's rent is
                // how somebody pays twice.
                url: json.short_url || null,
                amountPaid: Number(json.amount_paid || 0) / 100,
                // The underlying payment id, which is more useful on the row than the
                // link id: it is what a landlord searches for in their dashboard.
                paymentId: json.payments?.find((p) => String(p.status).toLowerCase() === 'captured')?.payment_id || null
            };
        },

        // Are these credentials real? The cheapest authenticated read there is: one
        // payment link, which every account has the endpoint for whether or not it has
        // any links. 401 means the key or secret is wrong; anything else that is not ok
        // is the gateway having a bad minute and not the landlord's fault.
        verify: async (creds) => {
            const r = await fetch(`${PROVIDERS.razorpay.base}/payment_links?count=1`, {
                headers: { Authorization: PROVIDERS.razorpay.auth(creds.keyId, creds.secret) },
                signal: AbortSignal.timeout(TIMEOUT_MS)
            });
            if (r.status === 401 || r.status === 403) {
                return { ok: false, rejected: true, reason: 'Razorpay did not accept that Key ID and secret.' };
            }
            if (!r.ok) {
                const json = await r.json().catch(() => ({}));
                return { ok: false, rejected: false, reason: json?.error?.description || `Razorpay returned HTTP ${r.status}.` };
            }
            return { ok: true };
        }
    }
};

const providerIds = () => Object.keys(PROVIDERS);
const getProvider = (id) => PROVIDERS[String(id || '').toLowerCase()] || null;

// What a landlord is shown when choosing. No secrets, no HTTP — just the labels, so the
// app does not hard-code the name of somebody else's dashboard.
const providerCatalog = () => providerIds().map((id) => {
    const p = PROVIDERS[id];
    return {
        id: p.id,
        label: p.label,
        key_label: p.keyLabel,
        secret_label: p.secretLabel,
        key_hint: p.keyHint,
        where: p.where,
        secret_note: p.secretNote
    };
});

// Unseal a landlord's stored credentials from a payment_settings row.
//
// Returns a reason rather than throwing, because every outcome here is something a
// person needs told in words: not connected, switched off, or sealed with a key this
// server no longer has (a rotated CREDENTIALS_KEY, or a row copied between
// environments). The last one is why `open` returning null is handled as its own case:
// the honest message is "reconnect your gateway", and a crash would instead show a
// tenant "something went wrong" while their rent is due.
const credentialsFor = (row) => {
    if (!row || !row.gateway) return { ok: false, reason: 'no_gateway' };
    const provider = getProvider(row.gateway);
    if (!provider) return { ok: false, reason: 'unknown_provider' };
    if (!row.gateway_enabled) return { ok: false, reason: 'disabled' };
    if (!row.gateway_key_id || !row.gateway_secret) return { ok: false, reason: 'incomplete' };
    const secret = open(row.gateway_secret);
    if (!secret) return { ok: false, reason: 'unreadable' };
    return { ok: true, provider, creds: { keyId: row.gateway_key_id, secret } };
};

module.exports = { PROVIDERS, getProvider, providerIds, providerCatalog, credentialsFor, TIMEOUT_MS };
