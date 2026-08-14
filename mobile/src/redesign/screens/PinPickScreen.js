// File: mobile/src/redesign/screens/PinPickScreen.js
// Putting a property on the map.
//
// A whole screen rather than a section of the property sheet, for a concrete
// reason: dragging a map inside a bottom sheet inside a scroll view is three pan
// gestures competing for one finger, and the map loses every time. The form it came
// from is not unmounted — it lives in app state — so nothing typed is lost, and
// "Use this location" returns to it with the pin filled in.
//
// The pin does not move. The map moves under it. That is how every map picker works
// and the reason is physical: dragging a marker means putting a fingertip over the
// exact spot you are trying to look at.
import React from 'react';
import { View, ActivityIndicator, Dimensions } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, SearchBar } from '../ui';
import { TileMap, ATTRIBUTION, usingDevTiles, tileConfigError } from '../maps';

export default function PinPickScreen() {
    const vm = useVm();
    const t = useT();
    const p = vm.pinPick;
    const [w, setW] = React.useState(() => Dimensions.get('window').width);
    const [h, setH] = React.useState(360);

    // Typing fires a geocode, so it is debounced here rather than in the view-model:
    // a request per keystroke would be both slow and rude to a free service.
    const [typed, setTyped] = React.useState(p.q);
    const timer = React.useRef(null);
    const onType = React.useCallback((v) => {
        setTyped(v);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => p.setQ(v), 450);
    }, [p]);
    React.useEffect(() => () => clearTimeout(timer.current), []);

    return (
        <View style={{ flex: 1, backgroundColor: t.ink }}>
            {/* Header */}
            <Row gap={11} align="flex-start" style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 10 }}>
                <Press
                    onPress={p.cancel}
                    style={{ width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}
                >
                    <Glyph name="close" size={18} color={t.fg} />
                </Press>
                <View style={{ flex: 1, minWidth: 0 }}>
                    <T w={700} s={21} lh={1.14} style={{ letterSpacing: -0.7 }}>{p.title}</T>
                    <T w={400} s={12.5} lh={1.45} c={t.fg2} style={{ marginTop: 4 }}>{p.line}</T>
                </View>
            </Row>

            {/* Search */}
            <View style={{ paddingHorizontal: 18, paddingBottom: 10 }}>
                <SearchBar
                    value={typed}
                    onChangeText={onType}
                    onClear={() => { setTyped(''); p.setQ(''); }}
                    placeholder="Search a landmark, street or area"
                    autoCapitalize="words"
                    right={p.searching ? <ActivityIndicator size="small" color={t.fg3} /> : undefined}
                />

                {/* Asking for location HERE rather than on the primer screen is the
                    point: the request arrives with the reason visible on screen,
                    which is the version people grant. On a build without the module
                    it says so instead of doing nothing. */}
                <Press onPress={p.useHere} style={{ marginTop: 8, alignSelf: 'flex-start' }}>
                    <Row gap={7} style={{ paddingVertical: 9, paddingHorizontal: 13, borderRadius: 999, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line }}>
                        <Glyph name="locate" size={14} color={t.accent} />
                        <T w={600} s={12} lh={1} c={t.fg}>{p.hereLabel}</T>
                    </Row>
                </Press>
            </View>

            {/* Results sit over the map rather than pushing it down, so choosing one
                does not make the map jump size under the pin. */}
            <View style={{ flex: 1 }} onLayout={(e) => { setW(Math.round(e.nativeEvent.layout.width)); setH(Math.round(e.nativeEvent.layout.height)); }}>
                <TileMap
                    lat={p.lat}
                    lon={p.lon}
                    zoom={p.zoom}
                    width={w}
                    height={h}
                    interactive
                    onChange={p.move}
                    onSettle={p.settle}
                    onZoom={p.setZoom}
                />

                {/* The pin. Fixed dead centre, and pointerEvents none so it never
                    swallows the drag it is sitting on top of. */}
                <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                    <View style={{ alignItems: 'center', marginTop: -22 }}>
                        <Glyph name="location" size={38} color={t.coral} />
                        {/* A dot at the tip, because the glyph's point is where the
                            coordinate actually is and the icon alone is ambiguous. */}
                        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: t.coral, marginTop: -4, borderWidth: 1, borderColor: '#FFFFFF' }} />
                    </View>
                </View>

                {/* Zoom */}
                <View style={{ position: 'absolute', right: 14, bottom: 58, rowGap: 8 }}>
                    <ZoomButton t={t} icon="add" onPress={p.zoomIn} disabled={!p.canZoomIn} />
                    <ZoomButton t={t} icon="remove" onPress={p.zoomOut} disabled={!p.canZoomOut} />
                </View>

                {/* Said on screen rather than only in a comment, because "we are
                    still on the development tile server" is the kind of thing that
                    ships. It costs a developer one glance and a real user never sees
                    it, since configuring a provider removes it. */}
                {/* A misconfigured tile URL takes priority over the development-tiles
                    note, because it is the difference between a plain map and no map at
                    all. An empty map otherwise looks identical to a slow one, which is
                    how a build once shipped fetching tiles from the literal text
                    "$EXPO_PUBLIC_MAP_TILE_URL" with nothing on screen to say so. The
                    pin, the search and the coordinates all still work. */}
                {tileConfigError() ? (
                    <View style={{ position: 'absolute', left: 12, right: 12, top: 12, paddingVertical: 8, paddingHorizontal: 11, borderRadius: 12, backgroundColor: 'rgba(4,4,6,0.78)', flexDirection: 'row', alignItems: 'flex-start', columnGap: 8 }}>
                        {/* A literal, not t.amber, and not the t.red this used to ask
                            for — there is no such token, so the warning triangle was
                            rendering in plain foreground and did not look like a
                            warning at all. This banner is deliberately fixed-dark in
                            both themes (see the hardcoded background and #FFFFFF text
                            beside it), and t.amber goes to a dark brown in light mode
                            that would disappear against it. */}
                        <Glyph name="warning-outline" size={13} color="#FFB020" />
                        <T w={500} s={10.5} lh={1.4} c="#FFFFFF" style={{ flex: 1, opacity: 0.9 }}>
                            {tileConfigError()}
                        </T>
                    </View>
                ) : usingDevTiles() ? (
                    <View style={{ position: 'absolute', left: 12, right: 12, top: 12, paddingVertical: 8, paddingHorizontal: 11, borderRadius: 12, backgroundColor: 'rgba(4,4,6,0.78)', flexDirection: 'row', alignItems: 'flex-start', columnGap: 8 }}>
                        <Glyph name="warning-outline" size={13} color={t.amber} />
                        <T w={500} s={10.5} lh={1.4} c="#FFFFFF" style={{ flex: 1, opacity: 0.9 }}>
                            Development tiles. Set EXPO_PUBLIC_MAP_TILE_URL before release — see mobile/.env.example.
                        </T>
                    </View>
                ) : null}

                {/* Attribution is a licence condition of using OpenStreetMap data,
                    not decoration. */}
                <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingVertical: 4, paddingHorizontal: 8, backgroundColor: 'rgba(4,4,6,0.55)' }}>
                    <T mono w={600} s={7.5} lh={1.4} ls={0.04} c="#FFFFFF" style={{ opacity: 0.85 }}>{ATTRIBUTION}</T>
                </View>

                {p.hasResults ? (
                    <View style={{ position: 'absolute', left: 18, right: 18, top: 0, borderRadius: 18, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, overflow: 'hidden' }}>
                        {p.results.map((r, i) => (
                            <Press key={r.id + i} onPress={r.go}>
                                <Row gap={11} style={{ paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: i === p.results.length - 1 ? 0 : 1, borderBottomColor: t.line }}>
                                    <Glyph name="location-outline" size={15} color={t.accent} />
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <T w={600} s={13} lh={1.25} numberOfLines={1}>{r.title}</T>
                                        {r.subtitle ? (
                                            <T w={400} s={11.5} lh={1.4} c={t.fg3} numberOfLines={1} style={{ marginTop: 2 }}>{r.subtitle}</T>
                                        ) : null}
                                    </View>
                                </Row>
                            </Press>
                        ))}
                    </View>
                ) : null}
            </View>

            {/* What is under the pin, and the commit */}
            <View style={{ paddingHorizontal: 18, paddingTop: 12, paddingBottom: 22, backgroundColor: t.ink, borderTopWidth: 1, borderTopColor: t.line }}>
                {p.hasError ? (
                    <Row gap={8} align="flex-start" style={{ marginBottom: 10 }}>
                        <Glyph name="information-circle-outline" size={14} color={t.amber} />
                        <T w={400} s={11.5} lh={1.4} c={t.fg3} style={{ flex: 1 }}>{p.error}</T>
                    </Row>
                ) : null}

                <Row gap={10} align="flex-start" style={{ marginBottom: 12 }}>
                    <Glyph name="pin-outline" size={15} color={t.fg3} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                        {p.hasAddress ? (
                            <T w={500} s={12.5} lh={1.4} c={t.fg} numberOfLines={2}>{p.addressLine}</T>
                        ) : (
                            <T w={400} s={12.5} lh={1.4} c={t.fg3}>Drag to place the pin</T>
                        )}
                        <T mono w={600} s={9} lh={1.5} ls={0.06} c={t.fg3} style={{ marginTop: 3 }}>{p.coordLine}</T>
                    </View>
                </Row>

                <Press
                    onPress={p.confirm}
                    style={{ paddingVertical: 16, borderRadius: 999, backgroundColor: t.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 8 }}
                >
                    <Glyph name="checkmark" size={17} color={t.on} />
                    <T w={700} s={15} c={t.on}>{p.confirmLabel}</T>
                </Press>
            </View>
        </View>
    );
}

function ZoomButton({ t, icon, onPress, disabled }) {
    return (
        <Press
            onPress={onPress}
            disabled={disabled}
            style={{
                width: 40,
                height: 40,
                borderRadius: 13,
                backgroundColor: t.ink2,
                borderWidth: 1,
                borderColor: t.line,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: disabled ? 0.4 : 1
            }}
        >
            <Glyph name={icon} size={19} color={t.fg} />
        </Press>
    );
}
