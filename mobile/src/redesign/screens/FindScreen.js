// File: mobile/src/redesign/screens/FindScreen.js
//
// Two ways to end up somewhere to live, in the order people actually need them.
//
// The screen used to be the invite-code flow and nothing else, which assumed the
// tenant already had a landlord. Somebody arriving with no code — which is most
// people opening an app called "find a place" — reached a screen whose only
// instruction was to go and ask for one.
//
// So the suggestions come first and the code box is still here, folded away under
// them. Neither replaced the other: a tenant whose landlord sent them a QR should
// not have to scroll past eight strangers' rooms to use it, which is why the code
// row stays one tap from the top rather than at the bottom of the results.
import React from 'react';
import { View, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Card, Row, Press, Glyph, SearchBar } from '../ui';
import { KeyboardScroll } from '../keyboard';
import { Stagger } from '../motion';
import { ScreenTitle, bodyPad } from '../layout';

export default function FindScreen() {
    const vm = useVm();
    const t = useT();
    const col = (v) => (v && (v[0] === '#' || v.startsWith('rgb')) ? v : t[v]);
    const d = vm.discover;

    // The code box starts folded. Opening it is remembered for as long as the
    // screen is mounted, so a tenant mid-way through typing a code does not lose
    // it to a re-render.
    // Folded by default, because the suggestions above it are what most people
    // came for. With discovery switched off they are not there, so this is the
    // only thing on the screen and starts open.
    const [codeOpen, setCodeOpen] = React.useState(!!d.off);
    React.useEffect(() => { if (d.off) setCodeOpen(true); }, [d.off]);

    const chip = (on) => ({
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: on ? t.lime : t.line,
        backgroundColor: on ? t.lime : t.ink2
    });

    return (
        <KeyboardScroll
            contentContainerStyle={bodyPad({ bottom: 26, was: { top: 14 } })}
            showsVerticalScrollIndicator={false}
        >
            {/* The title and its line of context, measured together so the header
                does not take over while the sentence explaining the screen is
                still on screen. */}
            <ScreenTitle
                sub={d.loaded && !d.hasError && !d.off ? `${d.countLine} listed near Bengaluru` : vm.findLine}
                subStyle={{ marginBottom: 14 }}
            >
                Find a place
            </ScreenTitle>

            {vm.portalLinked && (
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', columnGap: 11, padding: 14, borderRadius: 18, backgroundColor: t.asoft, borderWidth: 1, borderColor: t.line, marginBottom: 14 }}>
                    <Glyph name="information-circle" size={17} color={t.amber} />
                    <T w={400} s={12} lh={1.5} c={t.fg2} style={{ flex: 1 }}>
                        You are already in {vm.me.propName}. Joining somewhere else moves you out of your current room.
                    </T>
                </View>
            )}

            {/* ── Search + filters ─────────────────────────────────────────────
                Hidden entirely when the server has the feature off, rather than
                left showing a search that can only ever return nothing. */}
            {d.off ? null : (<>
            <SearchBar
                value={d.q}
                onChangeText={d.setQ}
                onSubmitEditing={d.submitQ}
                placeholder="Area, property or landmark"
                padV={13}
                style={{ backgroundColor: t.ink2 }}
                right={
                    d.q ? (
                        <Press onPress={d.clearQ} hitSlop={8}>
                            <Glyph name="close-circle" size={16} color={t.fg3} />
                        </Press>
                    ) : null
                }
            />

            <Row gap={8} style={{ marginTop: 10 }}>
                    <Press
                        onPress={d.openFilters}
                        style={{ flexDirection: 'row', alignItems: 'center', columnGap: 7, ...chip(d.activeCount > 0) }}
                    >
                        <Glyph name="options-outline" size={14} color={d.activeCount > 0 ? t.on : t.fg2} />
                        <T mono w={600} s={9} lh={1} ls={0.08} c={d.activeCount > 0 ? t.on : t.fg2}>
                            {d.filterLabel.toUpperCase()}
                        </T>
                    </Press>
                    <Press
                        onPress={() => d.useLocation(5)}
                        style={{ flexDirection: 'row', alignItems: 'center', columnGap: 7, ...chip(!!d.filters.within) }}
                    >
                        {d.locating
                            ? <ActivityIndicator size="small" color={t.fg2} />
                            : <Glyph name="navigate-outline" size={14} color={d.filters.within ? t.on : t.fg2} />}
                        <T mono w={600} s={9} lh={1} ls={0.08} c={d.filters.within ? t.on : t.fg2}>NEAR ME</T>
                    </Press>
            </Row>

            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -18, marginTop: 10, marginBottom: 4 }}
                contentContainerStyle={{ gap: 7, paddingHorizontal: 18, paddingBottom: 2 }}
            >
                {d.sorts.map((so) => (
                    <Press key={so.key} onPress={so.go} style={chip(so.on)}>
                        <T mono w={600} s={9} lh={1} ls={0.08} c={so.on ? t.on : t.fg2}>{so.label.toUpperCase()}</T>
                    </Press>
                ))}
            </ScrollView>

            {/* ── Results ────────────────────────────────────────────────────── */}
            {d.loading && !d.results.length ? (
                <View style={{ paddingVertical: 34, alignItems: 'center', rowGap: 12 }}>
                    <ActivityIndicator color={t.lime} />
                    <T mono w={600} s={9} ls={0.12} c={t.fg3}>LOOKING FOR PLACES</T>
                </View>
            ) : null}

            {d.hasError ? (
                <View style={{ paddingVertical: 15, paddingHorizontal: 15, borderRadius: 18, backgroundColor: t.csoft, marginTop: 10 }}>
                    <Row gap={9} align="flex-start">
                        <Glyph name="alert-circle" size={16} color={t.coral} />
                        <T w={500} s={12.5} lh={1.45} c={t.coral} style={{ flex: 1 }}>{d.error}</T>
                    </Row>
                    <Press onPress={d.submitQ} style={{ marginTop: 11, alignSelf: 'flex-start', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                        <T w={600} s={12} c={t.fg}>Try again</T>
                    </Press>
                </View>
            ) : null}

            {d.empty ? (
                <View style={{ paddingVertical: 26, paddingHorizontal: 18, borderRadius: 20, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, marginTop: 10, alignItems: 'center', rowGap: 10 }}>
                    <Glyph name="telescope-outline" size={24} color={t.fg3} />
                    <T w={500} s={13} lh={1.5} c={t.fg2} style={{ textAlign: 'center' }}>{d.emptyReason}</T>
                    {d.emptyCanClear ? (
                        <Press onPress={d.clear} style={{ marginTop: 2, paddingVertical: 10, paddingHorizontal: 17, borderRadius: 999, backgroundColor: t.lime }}>
                            <T w={700} s={12.5} c={t.on}>Clear filters</T>
                        </Press>
                    ) : null}
                </View>
            ) : null}

            {d.results.map((r, i) => (
                /* Staggered so the list assembles rather than appearing all at once.
                   Capped inside Stagger: past about the tenth card the delay is
                   longer than anybody waits before scrolling. */
                <Stagger key={r.id} index={i}>
                        <Press
                            onPress={r.open}
                            style={{ borderRadius: 22, overflow: 'hidden', backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, marginBottom: 10 }}
                        >
                            <Row gap={13} style={{ padding: 13 }} align="flex-start">
                                {/* Most listings have no photograph, because the
                                    landlord never uploaded one. An empty grey square
                                    reads as an image that failed to load; a tinted
                                    tile with the right icon reads as a place. */}
                                {r.img ? (
                                    <Image
                                        source={{ uri: r.img }}
                                        style={{ width: 76, height: 76, borderRadius: 18, backgroundColor: t.ink3 }}
                                        resizeMode="cover"
                                    />
                                ) : (
                                    <View style={{ width: 76, height: 76, borderRadius: 18, backgroundColor: t.lsoft, alignItems: 'center', justifyContent: 'center' }}>
                                        <Glyph name={r.icon} size={26} color={t.lime} />
                                    </View>
                                )}
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Row gap={8}>
                                        <T w={600} s={15} lh={1.2} c={t.fg} numberOfLines={1} style={{ flex: 1 }}>{r.property}</T>
                                        <T w={700} s={15} lh={1.2} c={t.lime}>{r.rent}</T>
                                    </Row>
                                    <T mono w={600} s={9} lh={1.5} ls={0.06} c={t.fg3} numberOfLines={1} style={{ marginTop: 3 }}>
                                        {[r.loc, r.type].filter(Boolean).join(' · ')}
                                    </T>
                                    <Row gap={6} style={{ marginTop: 8, flexWrap: 'wrap' }}>
                                        <T mono w={600} s={9} lh={1.3} ls={0.06} c={t.fg2}>{r.size.toUpperCase()}</T>
                                        <T mono w={600} s={9} lh={1.3} c={t.line}>·</T>
                                        <T mono w={600} s={9} lh={1.3} ls={0.06} c={r.tight ? t.coral : t.fg3}>{r.spots.toUpperCase()}</T>
                                        {r.near ? <T mono w={600} s={9} lh={1.3} c={t.line}>·</T> : null}
                                        {r.near ? <T mono w={600} s={9} lh={1.3} ls={0.06} c={t.accent}>{r.near.toUpperCase()}</T> : null}
                                    </Row>
                                </View>
                            </Row>

                            {/* Why this one is in front of you. The server supplies
                                these from the same comparisons the ranking used, so a
                                card cannot claim a reason that did not move it up. */}
                            {r.why.length ? (
                                <Row gap={6} style={{ paddingHorizontal: 13, paddingBottom: 13, flexWrap: 'wrap' }}>
                                    {r.why.map((w, k) => (
                                        <Row key={k} gap={5} style={{ paddingVertical: 5, paddingHorizontal: 9, borderRadius: 999, backgroundColor: t.lsoft }}>
                                            <Glyph name="sparkles" size={10} color={t.lime} />
                                            <T mono w={600} s={9} lh={1} ls={0.05} c={t.lime}>{w}</T>
                                        </Row>
                                    ))}
                                </Row>
                            ) : null}
                        </Press>
                </Stagger>
            ))}

            </>)}

            {/* ── The invite-code flow, folded ──────────────────────────────── */}
            <Press
                onPress={() => setCodeOpen((v) => !v)}
                style={{ marginTop: 6, flexDirection: 'row', alignItems: 'center', columnGap: 11, paddingVertical: 15, paddingHorizontal: 15, borderRadius: 20, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line }}
            >
                <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: t.vsoft }}>
                    <Glyph name="qr-code" size={16} color={t.accent} />
                </View>
                <View style={{ flex: 1 }}>
                    <T w={600} s={14} lh={1.2} c={t.fg}>Have an invite code?</T>
                    <T w={400} s={11.5} lh={1.4} c={t.fg3} style={{ marginTop: 3 }}>Scan the QR or type the code your landlord sent</T>
                </View>
                <Glyph name={codeOpen ? 'chevron-up' : 'chevron-down'} size={16} color={t.fg3} />
            </Press>

            {codeOpen ? (
                <Stagger index={0}>
                    <View style={{ borderRadius: 24, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, padding: 18, marginTop: 8 }}>
                        <Press
                            onPress={vm.scanQr}
                            style={{ paddingVertical: 15, borderRadius: 16, backgroundColor: t.lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 9 }}
                        >
                            <Glyph name="qr-code" size={18} color={t.on} />
                            <T w={700} s={14} lh={1} c={t.on}>Scan invite QR</T>
                        </Press>

                        {/* The QR almost always arrives as a WhatsApp image, and the live
                            scanner is no help then: pointing one phone at another phone's
                            screen is a glare fight, and often there is only one phone. */}
                        <Press
                            onPress={vm.scan.fromGallery}
                            style={{ marginTop: 9, paddingVertical: 14, borderRadius: 16, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', columnGap: 9 }}
                        >
                            <Glyph name="image-outline" size={17} color={t.accent} />
                            <T w={600} s={13.5} lh={1} c={t.fg}>Upload QR from photos</T>
                        </Press>

                        <Row gap={12} style={{ marginVertical: 14 }}>
                            <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
                            <T mono w={600} s={9} lh={1} ls={0.1} c={t.fg3}>OR ENTER MANUALLY</T>
                            <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
                        </Row>

                        <SearchBar
                            value={vm.jq}
                            onChangeText={vm.setJq}
                            onSubmitEditing={vm.submitJq}
                            autoCapitalize="characters"
                            placeholder={vm.jqLabel}
                            padV={13}
                            style={{ backgroundColor: t.ink3 }}
                            right={vm.lookup.live ? (
                                <Press onPress={vm.submitJq} disabled={!vm.canSubmitJq} hitSlop={8}>
                                    <T mono w={600} s={9} ls={0.1} c={vm.canSubmitJq ? t.accent : t.fg3}>FIND</T>
                                </Press>
                            ) : null}
                        />
                    </View>
                </Stagger>
            ) : null}

            {/* Area/room-type filters browse the walk-through catalogue. A real
                account searches the listings above instead. */}
            {!vm.lookup.live ? (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginHorizontal: -18, marginTop: 10, marginBottom: 10 }}
                    contentContainerStyle={{ gap: 7, paddingHorizontal: 18, paddingBottom: 2 }}
                >
                    {vm.jfilters.map((jf, i) => (
                        <Press
                            key={i}
                            onPress={jf.go}
                            style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: col(jf.bd), backgroundColor: col(jf.bg) }}
                        >
                            <T mono w={600} s={9} lh={1} ls={0.08} c={col(jf.fg)}>{jf.label}</T>
                        </Press>
                    ))}
                </ScrollView>
            ) : null}

            {/* Looking one up by code. */}
            {vm.lookup.loading ? (
                <View style={{ paddingVertical: 28, alignItems: 'center', rowGap: 12 }}>
                    <ActivityIndicator color={t.lime} />
                    <T mono w={600} s={9} ls={0.12} c={t.fg3}>{`LOOKING FOR ${vm.lookup.code}`}</T>
                </View>
            ) : null}

            {vm.lookup.hasError ? (
                <View style={{ paddingVertical: 15, paddingHorizontal: 15, borderRadius: 18, backgroundColor: t.csoft, marginTop: 8 }}>
                    <Row gap={9} align="flex-start">
                        <Glyph name="alert-circle" size={16} color={t.coral} />
                        <T w={500} s={12.5} lh={1.45} c={t.coral} style={{ flex: 1 }}>{vm.lookup.error}</T>
                    </Row>
                    <Press onPress={vm.lookup.retry} style={{ marginTop: 11, alignSelf: 'flex-start', paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line }}>
                        <T w={600} s={12} c={t.fg}>Try again</T>
                    </Press>
                </View>
            ) : null}

            {vm.noJoinResults && vm.lookup.searched && (
                <View style={{ paddingVertical: 24, alignItems: 'center' }}>
                    <T w={500} s={13} lh={1.5} c={t.fg2} style={{ textAlign: 'center' }}>
                        {vm.lookup.live
                            ? 'No property matches that code. Check it with your landlord.'
                            : 'No property matches that name or ID.'}
                    </T>
                </View>
            )}

            {vm.joinResults.map((jr, i) => (
                <View key={i} style={{ borderRadius: 22, overflow: 'hidden', backgroundColor: t.ink2, marginTop: 8, borderWidth: 1, borderColor: col(jr.bd) }}>
                    <Row gap={13} style={{ paddingVertical: 13, paddingHorizontal: 14 }}>
                        <Image source={jr.img ? { uri: jr.img } : undefined} style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: t.ink3 }} resizeMode="cover" />
                        <View style={{ flex: 1, minWidth: 0 }}>
                            <T w={600} s={15} lh={1.2} c={t.fg}>{jr.name}</T>
                            <T mono w={600} s={10} lh={1.4} ls={0.06} c={t.fg3} numberOfLines={1} style={{ marginTop: 4 }}>{jr.loc}</T>
                        </View>
                        <T mono w={600} s={10} lh={1} ls={0.06} c={col(jr.bedFg)}>{jr.beds}</T>
                    </Row>
                    <Row gap={8} style={{ paddingHorizontal: 14, paddingBottom: 13 }}>
                        <Row gap={5} style={{ paddingVertical: 5, paddingHorizontal: 9, borderRadius: 999, backgroundColor: t.vsoft }}>
                            <Glyph name={jr.policyIcon} size={12} color={t.accent} />
                            <T mono w={600} s={9} lh={1} ls={0.06} c={t.accent}>{jr.policy}</T>
                        </Row>
                        <T mono w={600} s={9} lh={1} ls={0.06} c={t.fg3}>{jr.code}</T>
                        <View style={{ flex: 1 }} />
                        {/* Look before you ask: a tenant used to send a request off a
                            name and a locality alone, having never seen the rooms. */}
                        {jr.hasView && !jr.isCurrent ? (
                            <Press
                                onPress={jr.view}
                                style={{ flexDirection: 'row', alignItems: 'center', columnGap: 5, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 999, borderWidth: 1, borderColor: t.line, backgroundColor: t.ink3 }}
                            >
                                <Glyph name="eye-outline" size={12} color={t.fg2} />
                                <T w={600} s={11} lh={1} c={t.fg}>View rooms</T>
                            </Press>
                        ) : null}
                        {/* Where you already live reads as a state, not a button. */}
                        <Press
                            onPress={jr.join}
                            disabled={jr.ctaDisabled}
                            style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                columnGap: 6,
                                paddingVertical: 9,
                                paddingHorizontal: 14,
                                borderRadius: 999,
                                backgroundColor: col(jr.ctaBg),
                                borderWidth: jr.ctaDisabled ? 1 : 0,
                                borderColor: t.accent
                            }}
                        >
                            {jr.isCurrent ? <Glyph name="checkmark-circle" size={12} color={t.accent} /> : null}
                            <T w={600} s={11} lh={1} c={col(jr.ctaFg)}>{jr.joining && !jr.isCurrent ? 'Sending…' : jr.cta}</T>
                        </Press>
                    </Row>
                </View>
            ))}
        </KeyboardScroll>
    );
}
