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
// So the URL is configuration, not a constant. Set EXPO_PUBLIC_MAP_TILE_URL to a
// provider you have signed up with (MapTiler, Stadia, Geoapify and Thunderforest
// all have free tiers that cover an app this size) and nothing else changes. The
// OSM default below is for development only, and is flagged as such rather than
// left to look like a decision.
import React from 'react';
import { View, Image, PanResponder, Platform, Linking } from 'react-native';

export const TILE_SIZE = 256;
export const MIN_ZOOM = 3;
export const MAX_ZOOM = 19;

// Bengaluru — where this app's users are, and a far better default than 0,0 (which
// is in the Atlantic and looks like a bug).
export const DEFAULT_CENTER = { lat: 12.9716, lon: 77.5946 };

const OSM_DEV_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

// `{z}/{x}/{y}` in, a URL out. Anything with that shape works, so switching
// providers is one environment variable.
export const tileTemplate = () => process.env.EXPO_PUBLIC_MAP_TILE_URL || OSM_DEV_TILES;
export const usingDevTiles = () => tileTemplate() === OSM_DEV_TILES;

export const tileUrl = (z, x, y) => tileTemplate()
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y));

// Whoever serves the tiles, the data is OpenStreetMap's and saying so is a licence
// condition, not decoration.
export const ATTRIBUTION = '© OpenStreetMap contributors';

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
// which is when a reverse-geocode is worth spending a request on.
export function TileMap({
    lat,
    lon,
    zoom = 16,
    width,
    height,
    interactive = false,
    onChange,
    onSettle,
    style,
    children
}) {
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

    // Where the drag has moved us to, in lat/lon. Pixels → tiles → degrees.
    const centreNow = () => {
        const z = zoom;
        const cx = lonToTileX(centre.current.lon, z) - drag.current.x / TILE_SIZE;
        const cy = latToTileY(centre.current.lat, z) - drag.current.y / TILE_SIZE;
        return { lat: tileYToLat(cy, z), lon: tileXToLon(cx, z) };
    };

    const pan = React.useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => interactive,
            onMoveShouldSetPanResponder: (_e, g) => interactive && (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),
            onPanResponderGrant: () => { dragging.current = true; },
            onPanResponderMove: (_e, g) => {
                drag.current = { x: g.dx, y: g.dy };
                force((n) => n + 1);
                if (onChange) onChange(centreNow());
            },
            onPanResponderRelease: () => {
                // Fold the drag into the centre and zero it, so the next drag starts
                // from here rather than accumulating.
                const c = centreNow();
                centre.current = c;
                drag.current = { x: 0, y: 0 };
                dragging.current = false;
                force((n) => n + 1);
                if (onChange) onChange(c);
                if (onSettle) onSettle(c);
            },
            onPanResponderTerminate: () => { dragging.current = false; }
        })
    ).current;

    // Which tiles cover the viewport, and where each one goes.
    const z = Math.round(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)));
    const n = Math.pow(2, z);
    const cx = lonToTileX(centre.current.lon, z) - drag.current.x / TILE_SIZE;
    const cy = latToTileY(centre.current.lat, z) - drag.current.y / TILE_SIZE;
    // World-pixel coordinate of the viewport's top-left corner.
    const originX = cx * TILE_SIZE - width / 2;
    const originY = cy * TILE_SIZE - height / 2;
    const firstX = Math.floor(originX / TILE_SIZE);
    const firstY = Math.floor(originY / TILE_SIZE);
    const cols = Math.ceil(width / TILE_SIZE) + 2;
    const rows = Math.ceil(height / TILE_SIZE) + 2;

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
                key: `${z}/${wrappedX}/${ty}`,
                uri: tileUrl(z, wrappedX, ty),
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
            {tiles.map((t) => (
                <Image
                    key={t.key}
                    source={{ uri: t.uri }}
                    style={{ position: 'absolute', left: t.left, top: t.top, width: TILE_SIZE, height: TILE_SIZE }}
                    // The tiles are the map; fading them in makes a pan look broken.
                    fadeDuration={0}
                />
            ))}
            {children}
        </View>
    );
}

export default TileMap;
