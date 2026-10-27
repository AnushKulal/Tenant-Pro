// The view-model halves of the gateway feature, driven through the REAL deriveVm.
//
// deriveVm is pure — state and an api object in, a plain tree out — so this needs no
// renderer. What it does need is for react-native and the handful of native modules
// AppContext imports to exist, which they do not meaningfully here: they are stubbed
// just enough to be imported, because none of them is what is under test.
//
// What IS under test is the thing a test can check and a screenshot cannot: that the
// new blocks derive at all, that a tenant whose landlord has no gateway is offered
// nothing, and — the one that matters — that no credential reaches the view-model.
const path = require('path');
const fs = require('fs');
const Module = require('module');
const MB = '/home/user/Tenant-Pro/mobile/';

// The app's source is ESM with JSX. Compiled to CommonJS through a require hook so
// the REAL file runs rather than a copy of it — a transpiled import is still the same
// deriveVm, and a copy would be a different thing that happens to agree today.
const babel = require(MB + 'node_modules/@babel/core');
const BABEL_OPTS = {
    configFile: false,
    babelrc: false,
    presets: [MB + 'node_modules/@babel/preset-react'],
    plugins: [MB + 'node_modules/@babel/plugin-transform-modules-commonjs']
};
const jsLoader = Module._extensions['.js'];
Module._extensions['.js'] = function (mod, filename) {
    // Only the app's own source. node_modules is left alone — compiling babel with
    // babel is a dependency cycle it refuses, rightly.
    if (!filename.startsWith(MB + 'src/')) {
        try { return jsLoader(mod, filename); }
        catch (e) {
            if (process.env.VMDEBUG) console.log('cannot load: ' + filename + ' :: ' + e.message.split('\n')[0]);
            throw e;
        }
    }
    const out = babel.transformFileSync(filename, BABEL_OPTS);
    return mod._compile(out.code, filename);
};

let ok = 0, bad = 0;
const chk = (n, c, got) => { if (c) { ok++; console.log('  ok   ' + n); } else { bad++; console.log('  FAIL ' + n + '  -> ' + JSON.stringify(got)); } };

// ── Stub the native world ─────────────────────────────────────────────────────
const stub = (id, exports) => {
    // Resolved from the APP's directory, not this test's: 'react-native' means the
    // copy AppContext would import, and resolving it from the scratchpad would stub a
    // module nothing ever asks for.
    let key = id;
    try { key = require.resolve(id, { paths: [MB] }); } catch (e) { /* virtual id */ }
    require.cache[key] = { id: key, exports, loaded: true, children: [], paths: [] };
};
const openedUrls = [];
const noop = () => {};
const Component = function () {};
const RN = {
    Platform: { OS: 'web', select: (o) => o.web || o.default },
    Linking: { openURL: async (u) => { openedUrls.push(u); }, addEventListener: () => ({ remove: noop }), getInitialURL: async () => null },
    Dimensions: { get: () => ({ width: 390, height: 844 }), addEventListener: () => ({ remove: noop }) },
    AppState: { addEventListener: () => ({ remove: noop }), currentState: 'active' },
    Appearance: { getColorScheme: () => 'dark', addChangeListener: () => ({ remove: noop }) },
    Animated: { View: Component, Text: Component, Value: function () { this.setValue = noop; this.interpolate = () => 0; }, timing: () => ({ start: noop }), spring: () => ({ start: noop }) },
    View: Component, Text: Component, Image: Component, ScrollView: Component, FlatList: Component,
    TextInput: Component, Pressable: Component, TouchableOpacity: Component, ActivityIndicator: Component,
    Modal: Component, Switch: Component, RefreshControl: Component, SafeAreaView: Component,
    StyleSheet: { create: (o) => o, flatten: (o) => o, hairlineWidth: 1, absoluteFill: {} },
    Keyboard: { addListener: () => ({ remove: noop }), dismiss: noop },
    InteractionManager: { runAfterInteractions: (f) => f() },
    Share: { share: async () => ({}) },
    Alert: { alert: noop },
    Clipboard: { setString: noop },
    NativeModules: {},
    useColorScheme: () => 'dark',
    PixelRatio: { get: () => 2, roundToNearestPixel: (n) => n },
    UIManager: {},
    LayoutAnimation: { configureNext: noop, Presets: {} }
};
stub('react-native', RN);

// Everything else AppContext's import graph reaches. None of it is under test: the
// subject is a pure function of state, and these exist only so the module loads.
const noopMod = (extra = {}) => ({ __esModule: true, default: Component, ...extra });
stub('expo-constants', noopMod({ default: { expoConfig: { version: '1.4.0', extra: {} }, manifest: {} } }));
stub('expo-font', noopMod({ useFonts: () => [true, null], loadAsync: async () => {} }));
stub('expo-linear-gradient', noopMod({ LinearGradient: Component }));
stub('expo-updates', noopMod({
    checkForUpdateAsync: async () => ({ isAvailable: false }),
    fetchUpdateAsync: async () => ({}),
    reloadAsync: async () => {},
    useUpdates: () => ({ isUpdateAvailable: false }),
    runtimeVersion: '1.4.0', updateId: null, isEmbeddedLaunch: true, channel: 'preview'
}));
stub('expo-image-picker', noopMod({
    launchImageLibraryAsync: async () => ({ canceled: true }),
    launchCameraAsync: async () => ({ canceled: true }),
    requestMediaLibraryPermissionsAsync: async () => ({ granted: true }),
    requestCameraPermissionsAsync: async () => ({ granted: true }),
    MediaTypeOptions: { Images: 'Images' }, getMediaLibraryPermissionsAsync: async () => ({ granted: true })
}));
stub('expo-notifications', noopMod({
    getPermissionsAsync: async () => ({ status: 'granted' }),
    requestPermissionsAsync: async () => ({ status: 'granted' }),
    getExpoPushTokenAsync: async () => ({ data: 'ExponentPushToken[x]' }),
    setNotificationHandler: noop, addNotificationResponseReceivedListener: () => ({ remove: noop }),
    addNotificationReceivedListener: () => ({ remove: noop }), setNotificationChannelAsync: async () => {},
    AndroidImportance: { MAX: 5 }
}));
stub('expo-screen-capture', noopMod({ preventScreenCaptureAsync: async () => {}, allowScreenCaptureAsync: async () => {} }));
stub('expo-camera', noopMod({ CameraView: Component, useCameraPermissions: () => [{ granted: true }, async () => {}] }));
stub('expo-location', noopMod({
    requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
    getCurrentPositionAsync: async () => ({ coords: { latitude: 12.9, longitude: 77.6 } })
}));
stub('@expo/vector-icons', noopMod({ Ionicons: Component, MaterialCommunityIcons: Component }));
stub('@expo-google-fonts/space-grotesk', noopMod({ useFonts: () => [true, null], SpaceGrotesk_400Regular: 1, SpaceGrotesk_500Medium: 1, SpaceGrotesk_600SemiBold: 1, SpaceGrotesk_700Bold: 1 }));
stub('@expo-google-fonts/martian-mono', noopMod({ useFonts: () => [true, null], MartianMono_400Regular: 1, MartianMono_600SemiBold: 1, MartianMono_700Bold: 1 }));
stub('react-native-safe-area-context', noopMod({
    SafeAreaProvider: Component, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }), SafeAreaView: Component
}));
stub('@react-native-async-storage/async-storage', noopMod({
    default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, multiRemove: async () => {} }
}));


(async () => {
// ── Load the real thing ───────────────────────────────────────────────────────
let AppContext;
try {
    AppContext = require(MB + 'src/redesign/AppContext.js');
} catch (e) {
    console.log('Could not load AppContext with stubs: ' + e.message); console.log(e.stack.split('\n').slice(0,8).join('\n'));
    console.log('SKIPPED — the stub set would need widening; nothing asserted.');
    process.exit(2);
}
const { deriveVm, INITIAL_STATE } = AppContext;

// Everything deriveVm might reach for. Each records that it was called, so a button
// that is wired to the wrong action shows up as the wrong name in `fired`.
const fired = [];
const api = new Proxy({}, {
    get: (_, k) => (...args) => { fired.push([String(k), args[0]]); return Promise.resolve(true); }
});

// ── The landlord's side ───────────────────────────────────────────────────────
// Only what the gateway block reads; deriveVm tolerates the rest being absent
// because the pre-login walkthrough has no server data either.
const ownerState = (gateway) => ({
    ...INITIAL_STATE,
    session: { role: 'owner', token: 'x' },
    live: true,
    overlay: 'gateway',
    data: { ...(INITIAL_STATE.data || {}), pay: { upiId: 'anush@okaxis', upiNumber: '', qr: null, gateway } }
});

console.log('\nLANDLORD · NOT CONNECTED');
let vm = deriveVm(ownerState({
    connected: false, enabled: false, canConnect: true, providers: [{
        id: 'razorpay', label: 'Razorpay', key_label: 'Key ID', secret_label: 'Key Secret',
        key_placeholder: 'rzp_live_…', key_note: 'A live key starts with rzp_live_.', where: 'Razorpay Dashboard → API Keys', secret_note: 'Shown once.',
        onboarding: {
            needs: 'Razorpay will ask for your PAN, a bank account, and one business proof.',
            time: 'Live keys usually take 2–5 working days — KYC first, then a separate check of the website you give them.',
            meanwhile: 'Test keys work straight away. Your tenants can keep paying by UPI the whole time.',
            noGst: 'No GST? A free Udyam (MSME) registration at udyamregistration.gov.in counts as business proof and takes about ten minutes.'
        }
    }]
}), api);
chk('the sheet is open', vm.isGateway === true, vm.isGateway);
chk('...it knows nothing is connected', vm.gateway.connected === false, vm.gateway);
chk('...it is not blocked', vm.gateway.blocked === false, vm.gateway.blocked);
chk('...the provider comes from the SERVER\'s catalog', vm.gateway.providerLabel === 'Razorpay', vm.gateway.providerLabel);
chk('...the field labels do too', vm.gateway.keyLabel === 'KEY ID' && vm.gateway.secretLabel === 'KEY SECRET', [vm.gateway.keyLabel, vm.gateway.secretLabel]);
chk('...and where to find the keys', /Razorpay Dashboard/.test(vm.gateway.whereLine), vm.gateway.whereLine);
console.log('\nWHAT RAZORPAY WILL PUT THEM THROUGH, SAID FIRST');
chk('the block is drawn', vm.gateway.expect.show === true, vm.gateway.expect);
chk('...naming the documents', /PAN/.test(vm.gateway.expect.needs) && /bank account/.test(vm.gateway.expect.needs), vm.gateway.expect.needs);
chk('...and the real wait, both halves of it', /working days/.test(vm.gateway.expect.time) && /website/.test(vm.gateway.expect.time), vm.gateway.expect.time);
chk('...with the part that makes it survivable', /UPI/.test(vm.gateway.expect.meanwhile), vm.gateway.expect.meanwhile);
chk('...and the way past the business-proof wall', /Udyam/.test(vm.gateway.expect.noGst), vm.gateway.expect.noGst);

console.log('\nA PROVIDER WITH NO PAPERWORK DRAWS NO CARD');
const bare = deriveVm(ownerState({
    connected: false, canConnect: true,
    providers: [{ id: 'x', label: 'X', key_label: 'Key', secret_label: 'Secret' }]
}), api);
chk('nothing to show, so nothing is shown', bare.gateway.expect.show === false, bare.gateway.expect);
chk('...and it still derives the rest', bare.gateway.providerLabel === 'X', bare.gateway.providerLabel);

chk('the key placeholder is short enough to fit a field', vm.gateway.keyPlaceholder.length <= 20, vm.gateway.keyPlaceholder);
chk('...with the explanation as a separate line', /rzp_live_/.test(vm.gateway.keyNote), vm.gateway.keyNote);
chk('the form starts EMPTY', vm.gateway.keyId === '' && vm.gateway.keySecret === '', [vm.gateway.keyId, vm.gateway.keySecret]);
chk('...and Connect is refused until both are filled', vm.gateway.canSubmit === false, vm.gateway.canSubmit);

console.log('\nTHE PRICE IS ON THE SCREEN, NEXT TO THE PITCH');
chk('the fee is named and attributed to the landlord', /2%/.test(vm.gateway.cost) && /Razorpay takes/.test(vm.gateway.cost), vm.gateway.cost);
chk('...and that this app charges nothing', /charges you nothing/.test(vm.gateway.cost), vm.gateway.cost);
chk('...and that the tenant pays only the rent', /only the rent/.test(vm.gateway.cost), vm.gateway.cost);
chk('...and that UPI is NOT being replaced', /free UPI option/.test(vm.gateway.keepsUpi), vm.gateway.keepsUpi);

console.log('\nLANDLORD · CONNECTED');
vm = deriveVm(ownerState({
    connected: true, enabled: true, canConnect: true, provider: 'razorpay',
    providerLabel: 'Razorpay', keyHint: '••••c123', providers: []
}), api);
chk('it says connected', vm.gateway.connected === true && vm.gateway.enabled === true, vm.gateway);
chk('...naming WHICH key, by its last four', vm.gateway.keyHint === '••••c123', vm.gateway.keyHint);
chk('...with no provider catalog needed', vm.gateway.providerLabel === 'Razorpay', vm.gateway.providerLabel);
chk('the disconnect warning says the UPI details survive', /UPI details are untouched/.test(vm.gateway.disconnectLine), vm.gateway.disconnectLine);
fired.length = 0;
vm.gateway.pause();
chk('Pause calls setGatewayEnabled(false)', fired[0] && fired[0][0] === 'setGatewayEnabled' && fired[0][1] === false, fired);
fired.length = 0;
vm.gateway.disconnect();
chk('Disconnect calls disconnectGateway', fired[0] && fired[0][0] === 'disconnectGateway', fired);

console.log('\nLANDLORD · PAUSED');
vm = deriveVm(ownerState({ connected: true, enabled: false, canConnect: true, providerLabel: 'Razorpay', providers: [] }), api);
chk('connected but off', vm.gateway.connected === true && vm.gateway.enabled === false, vm.gateway);
fired.length = 0;
vm.gateway.resume();
chk('Resume calls setGatewayEnabled(true)', fired[0] && fired[0][1] === true, fired);

console.log('\nLANDLORD · THE SERVER CANNOT STORE A SECRET');
vm = deriveVm(ownerState({ connected: false, canConnect: false, blockedReason: 'CREDENTIALS_KEY not set', providers: [] }), api);
chk('blocked', vm.gateway.blocked === true, vm.gateway.blocked);
chk('...saying it is not the landlord\'s fault', /Nothing is wrong with your account/.test(vm.gateway.blockedLine), vm.gateway.blockedLine);

console.log('\nLANDLORD · NO PAYMENT SETTINGS ROW AT ALL');
// The person most in need of being told whether this is possible, and the state the
// old `settings ? ... : ...` mapping could not represent.
vm = deriveVm({ ...INITIAL_STATE, session: { role: 'owner', token: 'x' }, live: true, overlay: 'gateway' }, api);
chk('it derives without throwing', !!vm.gateway, typeof vm.gateway);
chk('...and reads as not connected', vm.gateway.connected === false, vm.gateway.connected);

console.log('\nTHE SETTINGS ROW REFLECTS THE STATE');
const metaFor = (gateway) => {
    const v = deriveVm({ ...ownerState(gateway), overlay: null, route: 'settings' }, api);
    const row = (v.settingsRows || []).find((r) => r.label === 'Online payments');
    return row && row.meta;
};
chk('ON when connected and enabled', metaFor({ connected: true, enabled: true, providers: [] }) === 'ON', metaFor({ connected: true, enabled: true, providers: [] }));
chk('PAUSED when connected and off', metaFor({ connected: true, enabled: false, providers: [] }) === 'PAUSED', metaFor({ connected: true, enabled: false, providers: [] }));
chk('OFF when not connected', metaFor({ connected: false, providers: [] }) === 'OFF', metaFor({ connected: false, providers: [] }));

// ── The tenant's side ─────────────────────────────────────────────────────────
const tenantState = (online, pay = {}) => ({
    ...INITIAL_STATE,
    session: { role: 'tenant', token: 'x' },
    tlive: true,
    route: 'tcheckout',
    pay: { ...(INITIAL_STATE.pay || {}), ...pay },
    tdata: {
        me: {
            linked: true,
            profile: { name: 'Rahul' },
            home: { unit_number: '4B', property_name: 'Sunrise Residency' },
            rent: { amount: 14500, next_due: '2026-11-05', days_until_due: 4, state: 'upcoming' },
            landlord: { name: 'Anush', phone: '9480000000' },
            payment: { upi_id: 'anush@okaxis', upi_number: null, qr_code_url: null, online }
        },
        payments: [],
        requests: [],
        documents: []
    }
});

console.log('\nTENANT · THE LANDLORD HAS NO GATEWAY');
vm = deriveVm(tenantState({ available: false, provider: null }), api);
chk('the online option is not offered', vm.checkout.online.available === false, vm.checkout.online);
chk('...and UPI still is', vm.checkout.canUpi === true, vm.checkout.canUpi);

console.log('\nTENANT · THE LANDLORD HAS ONE');
vm = deriveVm(tenantState({ available: true, provider: 'razorpay' }), api);
chk('the online option is offered', vm.checkout.online.available === true, vm.checkout.online);
chk('...with the amount on the button', /14,500/.test(vm.checkout.online.label), vm.checkout.online.label);
chk('...and the three methods named, so a tenant knows their card will work',
    /card/i.test(vm.checkout.online.label) && /netbanking/i.test(vm.checkout.online.label) && /UPI/.test(vm.checkout.online.label),
    vm.checkout.online.label);
chk('...promising automatic confirmation', /Confirmed automatically/i.test(vm.checkout.online.line), vm.checkout.online.line);
chk('...and UPI is STILL offered beside it', vm.checkout.canUpi === true, vm.checkout.canUpi);
chk('the breakdown still charges the tenant nothing extra',
    vm.checkout.breakdown.some((b) => b.k === 'Platform fee' && b.v === '₹0'), vm.checkout.breakdown);
fired.length = 0;
vm.checkout.online.start();
chk('the button calls startOnlinePayment', fired[0] && fired[0][0] === 'startOnlinePayment', fired);

console.log('\nTENANT · BACK FROM THE GATEWAY');
vm = deriveVm(tenantState({ available: true, provider: 'razorpay' }, { opened: true, onlineId: 101 }), api);
chk('the question is outstanding', vm.checkout.online.opened === true, vm.checkout.online);
fired.length = 0;
vm.checkout.online.check();
chk('...and Check calls checkOnlinePayment', fired[0] && fired[0][0] === 'checkOnlinePayment', fired);
vm = deriveVm(tenantState({ available: true }, { opened: true, onlineId: 101, onlineNote: 'No payment on that page yet.' }), api);
chk('a failed check SAYS so rather than spinning', vm.checkout.online.note === 'No payment on that page yet.', vm.checkout.online.note);

console.log('\nTENANT · A GATEWAY WITH NO RENT ON FILE');
// amount 0 would make a link the gateway refuses, so the option is withheld.
const noRent = tenantState({ available: true, provider: 'razorpay' });
noRent.tdata.me.rent.amount = 0;
vm = deriveVm(noRent, api);
chk('the option is withheld', vm.checkout.online.available === false, vm.checkout.online.available);

console.log('\nNO CREDENTIAL REACHES THE VIEW-MODEL');
// The real assurance: the server returns a key hint and nothing else, so even a
// view-model dumped whole — into a crash reporter, a log, a redux devtool — carries
// no secret. Asserted against a sealed-looking string as well as a plaintext one.
vm = deriveVm(ownerState({
    connected: true, enabled: true, providerLabel: 'Razorpay', keyHint: '••••c123', canConnect: true, providers: []
}), api);
const dump = JSON.stringify(vm, (k, v) => (typeof v === 'function' ? undefined : v));
chk('no "secret" key carries a value', !/"gateway_secret"|"key_secret"|"keySecret":"[^"]+"/.test(dump), (dump.match(/.{0,40}secret.{0,40}/i) || [])[0]);
chk('nothing shaped like a sealed credential', !/[0-9a-f]{24}:[0-9a-f]{32}:/.test(dump), 'ok');
chk('the key hint is the ONLY thing about the key', (dump.match(/c123/g) || []).length <= 2, (dump.match(/.{0,30}c123.{0,30}/g) || []));

console.log(`\n${ok} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('THREW:', e); process.exit(1); });
