// File: mobile/src/redesign/maps.js
// A map, built out of images.
//
// ── Why it is built rather than installed ──────────────────────────────────────
// The obvious answer is react-native-maps or a WebView. Neither can be used: both
// are native modules, and a native module cannot reach an already-installed app
// over the air — it needs a new APK from the Play Store. Everything in this file
// therefore uses only <Image>, PanResponder and Linking, all of which are already
// compiled into every build.
//
// That turns out to be enough. A slippy map is a grid of 256px PNG tiles laid out
// by a fixed piece of arithmetic (Web Mercator, below), so rendering one is a
// matter of working out which tiles cover the viewport and where to put them.
// Dragging is subtracting pixels from the centre.
//
// ── Where the tiles come from ──────────────────────────────────────────────────
// The map data is OpenStreetMap — open, and the same data Google licenses from
// nobody. The tile IMAGES have to be served by somebody, though, and that is a
// choice with terms attached: the OSM Foundation's own tile servers explicitly do
// not permit distributed apps to pull from them at any volume.
//
// So the provider is configuration, not a constant. Name one and give it a key —
// two environment variables — and the light URL, dark URL and attribution all
// follow. The OSM default is for development only and is flagged as such rather
// than left to look like a decision.
//
// ── PARKED: the native-map upgrade ─────────────────────────────────────────────
// Before the Play Store release, consider replacing this with react-native-maps
// (Google Maps on Android, Apple Maps on iOS). Both are free for map display on
// mobile — Google bills its WEB map, not its mobile SDKs — so the cost is not the
// obstacle. The obstacle is that it is a native module: every change would then
// need a new APK instead of an over-the-air update, which is why it is not here
// yet. It becomes worth it the moment the app wants something this cannot do:
// every property on ONE map, routes drawn in-app, or in-app turn-by-turn.
//
// If that day comes, the shape of the change is small: this file's TileMap is the
// only thing that renders a map, and PinPickScreen and PropertyScreen are its only
// callers. Nothing else knows how a map works. Directions already hand off to the
// phone's map app and would not change at all.
import React from 'react';
import { View, Image, PanResponder, Platform, Linking } from 'react-native';
import { useT } from './ThemeContext';

export const TILE_SIZE = 256;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 19;

// Bengaluru — where this app's users are, and a far better default than 0,0 (which
// is in the Atlantic and looks like a bug).
export const DEFAULT_CENTER = { lat: 12.9716, lon: 77.5946 };

const OSM_DEV_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// ── Providers ──────────────────────────────────────────────────────────────────
// Switching provider is one word, because the alternative — pasting three long
// URLs and getting one of them subtly wrong — is how a map ends up half working.
//
//   EXPO_PUBLIC_MAP_PROVIDER=maptiler
//   EXPO_PUBLIC_MAP_KEY=your_key
//
// and the light URL, the dark URL and the attribution line all follow. Each entry
// is that provider's documented raster-tile shape. They do change them occasionally,
// which is exactly why EXPO_PUBLIC_MAP_TILE_URL still exists and still wins: an
// unknown provider, a new style, or a shape that moved is a one-line override
// rather than a code change.
const PROVIDERS = {
    maptiler: {
        light: 'https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key={key}',
        dark: 'https://api.maptiler.com/maps/streets-v2-dark/{z}/{x}/{y}.png?key={key}',
        credit: '© MapTiler © OpenStreetMap contributors'
    },
    geoapify: {
        light: 'https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}.png?apiKey={key}',
        dark: 'https://maps.geoapify.com/v1/tile/dark-matter/{z}/{x}/{y}.png?apiKey={key}',
        credit: '© Geoapify © OpenStreetMap contributors'
    },
    stadia: {
        light: 'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}.png?api_key={key}',
        dark: 'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}.png?api_key={key}',
        credit: '© Stadia Maps © OpenStreetMap contributors'
    },
    thunderforest: {
        light: 'https://tile.thunderforest.com/atlas/{z}/{x}/{y}.png?apikey={key}',
        dark: 'https://tile.thunderforest.com/transport-dark/{z}/{x}/{y}.png?apikey={key}',
        credit: '© Thunderforest © OpenStreetMap contributors'
    }
};

const providerName = () => String(process.env.EXPO_PUBLIC_MAP_PROVIDER || '').trim().toLowerCase();
const providerKey = () => String(process.env.EXPO_PUBLIC_MAP_KEY || '').trim();

// A provider counts as configured only when BOTH the name and the key are present.
// A name with no key would build a URL ending in "key=" and every tile would 401 —
// a blank map with no explanation, which is worse than falling back.
const configuredProvider = () => {
    const p = PROVIDERS[providerName()];
    return p && providerKey() ? p : null;
};

// Two templates, because this app has a light and a dark theme and a bright white
// map dropped into the dark theme looks like a bug. Set the dark one and the map
// follows the theme; leave it unset and both themes get the light map, which is
// merely plain rather than broken.
//
// Order of precedence, most specific first:
//   1. an explicit URL   (EXPO_PUBLIC_MAP_TILE_URL / …_DARK)  — the escape hatch
//   2. a named provider  (EXPO_PUBLIC_MAP_PROVIDER + …_KEY)   — the usual case
//   3. the OSM fallback  — development only
export const tileTemplate = (dark) => {
    const explicitLight = process.env.EXPO_PUBLIC_MAP_TILE_URL || '';
    const explicitDark = process.env.EXPO_PUBLIC_MAP_TILE_URL_DARK || '';
    if (dark && explicitDark) return explicitDark;
    if (explicitLight) return explicitLight;

    const p = configuredProvider();
    if (p) return (dark && p.dark) ? p.dark : p.light;

    return OSM_DEV_TILES;
};

// True when nothing has been configured and we are falling back to the OSM
// Foundation's own servers. That fallback is for DEVELOPMENT: their tile usage
// policy does not permit distributed apps to pull from them. Surfaced as a function
// rather than a comment so the app can say so out loud where a developer will see
// it, instead of it being discovered when the tiles start returning 418.
export const usingDevTiles = () => !process.env.EXPO_PUBLIC_MAP_TILE_URL && !configuredProvider();

// The names this build understands, for an error message worth reading.
export const KNOWN_PROVIDERS = Object.keys(PROVIDERS);

export const tileUrl = (z, x, y, dark) => tileTemplate(dark)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
    .replace('{key}', providerKey());

// Whoever serves the tiles, the data is OpenStreetMap's and saying so is a licence
// condition, not decoration. Most providers additionally require their own name, so
// a configured provider brings its own line; an explicit override can set
// EXPO_PUBLIC_MAP_ATTRIBUTION to whatever theirs asks for.
export const attribution = () => {
    if (process.env.EXPO_PUBLIC_MAP_ATTRIBUTION) return process.env.EXPO_PUBLIC_MAP_ATTRIBUTION;
    const p = configuredProvider();
    return (p && p.credit) || '© OpenStreetMap contributors';
};
// Kept as a value too: it is rendered in a few places and a function call at each
// one reads worse than a constant for something that cannot change at runtime.
export const ATTRIBUTION = attribution();

// ── Web Mercator ───────────────────────────────────────────────────────────────
// The projection every slippy map uses. lat/lon → fractional tile coordinates at a
// zoom level, and back. Latitude is clamped to ±85.0511°, the point where Mercator
// runs off to infinity; beyond it the arithmetic returns NaN and the map goes blank.
const MAX_LAT = 85.05112878;
const clampLat = (lat) => Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));

export const lonToTileX = (lon, z) => ((lon + 180) / 360) * Math.pow(2, z);
export const latToTileY = (lat, z) => {
    const rad = (clampLat(lat) * Math.PI) / 180;
    return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z);
};
export const tileXToLon = (x, z) => (x / Math.pow(2, z)) * 360 - 180;
export const tileYToLat = (y, z) => {
    const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
};

// A coordinate that is actually usable. Rejects null, undefined, NaN, strings that
// are not numbers, and — the one that matters — exact 0,0, which is what an empty
// form field becomes when it meets Number() and would drop a pin in the ocean off
// west Africa with total confidence.
export const hasPin = (lat, lon) => {
    const a = Number(lat);
    const b = Number(lon);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
    if (Math.abs(a) > 90 || Math.abs(b) > 180) return false;
    return !(a === 0 && b === 0);
};

// Six decimal places is ~11cm, which is more than enough for a building and stops a
// drag emitting sixteen meaningless digits.
export const roundCoord = (n) => Math.round(Number(n) * 1e6) / 1e6;

// ── Getting there ──────────────────────────────────────────────────────────────
// "Directions", not "open the map". The difference is what a tenant standing at a
// bus stop actually wants: a route from where they are, not a marker they then have
// to press directions on themselves.
//
// Android gets google.navigation:, which starts turn-by-turn in whichever app
// handles it. iOS gets Apple Maps' dirflg, since Google Maps may not be installed.
// Both fall back to the universal https:// URL, which opens the browser or whatever
// map app claims it — so this always leads somewhere.
export const directionsUrls = (lat, lon, label) => {
    const q = `${lat},${lon}`;
    const name = encodeURIComponent(label || 'Destination');
    const web = `https://www.google.com/maps/dir/?api=1&destination=${q}&travelmode=driving`;
    if (Platform.OS === 'ios') {
        return [`maps://?daddr=${q}&dirflg=d`, web];
    }
    return [`google.navigation:q=${q}`, `geo:${q}?q=${q}(${name})`, web];
};

// Try each in turn. canOpenURL is unreliable for custom schemes on Android without
// a manifest queries entry, so this simply attempts them and falls through on
// failure — which is the behaviour we want anyway.
export const openDirections = async (lat, lon, label) => {
    const urls = directionsUrls(lat, lon, label);
    for (const url of urls) {
        try {
            await Linking.openURL(url);
            return true;
        } catch (e) {
            // Next one.
        }
    }
    return false;
};

// ── The map itself ─────────────────────────────────────────────────────────────
// `interactive` false gives a still preview (a property's stored pin); true gives
// the picker. In the picker the PIN DOES NOT MOVE — the map moves under it. That is
// how every map picker works, and the reason is that dragging a marker with a
// fingertip means covering the exact spot you are trying to see.
//
// `onChange` fires with the centre while dragging; `onSettle` once the finger lifts,
// which is when a reverse-geocode is worth spending a request on. `onZoom` fires
// when a pinch resolves to a new zoom level.
export function TileMap({
    lat,
    lon,
    zoom = 16,
    width,
    height,
    interactive = false,
    onChange,
    onSettle,
    onZoom,
    style,
    children
}) {
    // Tiles follow the app's theme, so the dark theme gets a dark map instead of a
    // white rectangle glowing in the middle of it.
    const t = useT();
    const dark = !!(t && t.isDark);

    // The drag offset in pixels, kept in a ref so a finger moving does not re-render
    // on every frame — the tiles are recomputed from it only when state changes.
    const drag = React.useRef({ x: 0, y: 0 });
    const [, force] = React.useState(0);
    const centre = React.useRef({ lat, lon });

    // Follow the prop when it changes from outside (a search result was chosen),
    // but not while the finger is down — that would fight the drag.
    const dragging = React.useRef(false);
    React.useEffect(() => {
        if (!dragging.current) {
            centre.current = { lat, lon };
            drag.current = { x: 0, y: 0 };
            force((n) => n + 1);
        }
    }, [lat, lon]);

    // The PanResponder below is built once and kept in a ref, which means its
    // handlers keep the props from the FIRST render for ever. That was already
    // wrong before pinch existed: `zoom` was read straight out of that stale
    // closure, so after changing zoom — with the buttons, or by choosing a search
    // result, which jumps to 17 — the next drag converted pixels to degrees at the
    // OLD zoom and moved the pin at the wrong speed. Worse, `onChange` was the
    // first render's copy of the callback, which rebuilds the whole pin object from
    // the first render's state: one drag after picking a search result threw away
    // the address and snapped the zoom back.
    //
    // Everything the handlers need is therefore read through this ref, refreshed on
    // every render, instead of being captured.
    const live = React.useRef({});
    live.current = { zoom, onChange, onSettle, onZoom };

    // Where the drag has moved us to, in lat/lon. Pixels → tiles → degrees.
    const centreNow = () => {
        const z = live.current.zoom;
        const cx = lonToTileX(centre.current.lon, z) - drag.current.x / TILE_SIZE;
        const cy = latToTileY(centre.current.lat, z) - drag.current.y / TILE_SIZE;
        return { lat: tileYToLat(cy, z), lon: tileXToLon(cx, z) };
    };

    // ── Pinch ─────────────────────────────────────────────────────────────────
    // Two fingers zoom, anchored on the CENTRE of the map rather than on the
    // midpoint between the fingers.
    //
    // That is the opposite of a general-purpose map, and deliberate here: the
    // centre of this map is the pin, and the pin is the thing being chosen. Zooming
    // about the fingers would slide the pin onto a different building mid-gesture
    // and invalidate the address already shown underneath it. Anchoring on the
    // centre means a pinch changes how much you can see and nothing else — the
    // chosen coordinate and its address survive the gesture untouched, so there is
    // also no reverse-geocode to re-run when it ends.
    //
    // Zoom levels are integers (a tile exists at 16 or 17, not 16.4), so the gesture
    // scales the tiles that are already on screen and commits to the nearest whole
    // level on release. Without that the map would jump a full level the instant a
    // pinch crossed a threshold, which reads as a glitch rather than as zooming.
    // `active` is "two fingers are down right now"; `was` is "this gesture was a
    // pinch at some point". The second flag is not redundant, and leaving it out
    // caused a bug that only showed up every other gesture.
    //
    // Whether the last touch event arrives as a move or as the release is up to the
    // browser. When it came through as a move, the pinch committed there and
    // `active` went false — so the release then took the DRAG path and called
    // onSettle. onSettle rebuilds the whole pin object from state captured before
    // the zoom was committed, so it put the old zoom straight back: the map visibly
    // zoomed and then snapped to where it started. When the release happened to
    // handle the pinch itself, it returned early and the zoom stuck. Same gesture,
    // two outcomes, decided by event ordering.
    //
    // `was` closes that: a gesture that pinched never falls through to the pan
    // handling, whichever event ends it.
    const pinch = React.useRef({ active: false, was: false, start: 0, scale: 1 });

    const twoFingerDistance = (touches) => {
        const dx = touches[0].pageX - touches[1].pageX;
        const dy = touches[0].pageY - touches[1].pageY;
        return Math.sqrt(dx * dx + dy * dy);
    };

    // Fold the live pinch scale into a whole zoom level. Doubling the distance is
    // one level in, halving is one level out — hence log base 2.
    const commitPinch = () => {
        if (!pinch.current.active) return;
        const z = live.current.zoom;
        const steps = Math.log(pinch.current.scale) / Math.LN2;
        const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.round(z + steps)));
        pinch.current = { active: false, was: true, start: 0, scale: 1 };
        if (next !== z && live.current.onZoom) live.current.onZoom(next);
    };

    const pan = React.useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => interactive,
            // A pinch can begin with almost no movement of the midpoint, so two
            // touches claim the responder on their own — the 2px threshold alone
            // would let a careful pinch through to whatever is underneath.
            onMoveShouldSetPanResponder: (e, g) => interactive && (
                e.nativeEvent.touches.length > 1 || Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2
            ),
            onPanResponderGrant: () => {
                dragging.current = true;
                pinch.current = { active: false, was: false, start: 0, scale: 1 };
            },
            onPanResponderMove: (e, g) => {
                const touches = e.nativeEvent.touches;

                if (touches.length > 1) {
                    const d = twoFingerDistance(touches);
                    if (!pinch.current.active) {
                        // A second finger landed mid-drag. Bank the pan so far into
                        // the centre first, otherwise it is replayed as a jump the
                        // moment the pinch ends and the drag baseline resets.
                        centre.current = centreNow();
                        drag.current = { x: 0, y: 0 };
                        pinch.current = { active: true, was: true, start: d, scale: 1 };
                    } else if (pinch.current.start > 0) {
                        pinch.current.scale = d / pinch.current.start;
                    }
                    force((n) => n + 1);
                    return;
                }

                // Back to one finger: settle the zoom before panning again, so the
                // leftover finger does not drag the map at a stale scale.
                if (pinch.current.active) {
                    commitPinch();
                    force((n) => n + 1);
                    return;
                }

                drag.current = { x: g.dx, y: g.dy };
                force((n) => n + 1);
                if (live.current.onChange) live.current.onChange(centreNow());
            },
            onPanResponderRelease: () => {
                // `was` as well as `active`: if the pinch already committed on a
                // final move event, this gesture must still not be treated as a pan.
                if (pinch.current.active || pinch.current.was) {
                    // A pinch does not move the centre, so there is nothing new to
                    // geocode — only the zoom to apply.
                    commitPinch();
                    pinch.current.was = false;
                    dragging.current = false;
                    force((n) => n + 1);
                    return;
                }
                // Fold the drag into the centre and zero it, so the next drag starts
                // from here rather than accumulating.
                const c = centreNow();
                centre.current = c;
                drag.current = { x: 0, y: 0 };
                dragging.current = false;
                force((n) => n + 1);
                if (live.current.onChange) live.current.onChange(c);
                if (live.current.onSettle) live.current.onSettle(c);
            },
            onPanResponderTerminate: () => {
                pinch.current = { active: false, was: false, start: 0, scale: 1 };
                dragging.current = false;
            }
        })
    ).current;

    // Which tiles cover the viewport, and where each one goes.
    const z = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)));
    const n = Math.pow(2, z);
    const cx = lonToTileX(centre.current.lon, z) - drag.current.x / TILE_SIZE;
    const cy = latToTileY(centre.current.lat, z) - drag.current.y / TILE_SIZE;

    // While a pinch is in progress the tiles on screen are scaled to follow the
    // fingers. Pinching OUT (scale below 1) shrinks them, which uncovers ground
    // beyond the edges of the viewport, so the tile grid has to be built for the
    // larger area that becomes visible — otherwise the map appears to shrink into
    // the middle of a black frame. Pinching in never needs extra tiles: less is
    // visible, not more.
    const s = pinch.current.active ? pinch.current.scale : 1;
    const span = s < 1 ? 1 / s : 1;
    const vw = width * span;
    const vh = height * span;

    // World-pixel coordinate of the (possibly enlarged) grid's top-left corner.
    const originX = cx * TILE_SIZE - vw / 2;
    const originY = cy * TILE_SIZE - vh / 2;
    const firstX = Math.floor(originX / TILE_SIZE);
    const firstY = Math.floor(originY / TILE_SIZE);
    const cols = Math.ceil(vw / TILE_SIZE) + 2;
    const rows = Math.ceil(vh / TILE_SIZE) + 2;

    const tiles = [];
    for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
            const tx = firstX + c;
            const ty = firstY + r;
            // Wrap east-west so dragging past the date line shows map rather than
            // gaps; clamp north-south, where there is genuinely nothing.
            if (ty < 0 || ty >= n) continue;
            const wrappedX = ((tx % n) + n) % n;
            tiles.push({
                key: `${dark ? 'd' : 'l'}/${z}/${wrappedX}/${ty}`,
                uri: tileUrl(z, wrappedX, ty, dark),
                left: tx * TILE_SIZE - originX,
                top: ty * TILE_SIZE - originY
            });
        }
    }

    return (
        <View
            style={[{ width, height, overflow: 'hidden', position: 'relative' }, style]}
            {...(interactive ? pan.panHandlers : {})}
        >
            {/* The tiles live in their own layer so the pinch can scale THEM without
                touching anything drawn on top — the pin, the zoom buttons and the
                attribution must stay put and stay the size they are. The layer is
                centred in the viewport and a React Native transform scales about an
                element's own centre, which is what makes the zoom centre-anchored
                with no origin arithmetic. At rest span is 1, so this collapses to
                the plain full-size layer it was before. */}
            <View
                pointerEvents="none"
                style={{
                    position: 'absolute',
                    left: (width - vw) / 2,
                    top: (height - vh) / 2,
                    width: vw,
                    height: vh,
                    transform: [{ scale: s }]
                }}
            >
                {tiles.map((t) => (
                    <Image
                        key={t.key}
                        source={{ uri: t.uri }}
                        style={{ position: 'absolute', left: t.left, top: t.top, width: TILE_SIZE, height: TILE_SIZE }}
                        // The tiles are the map; fading them in makes a pan look broken.
                        fadeDuration={0}
                    />
                ))}
            </View>
            {children}
        </View>
    );
}

export default TileMap;
