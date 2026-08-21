// File: mobile/src/redesign/screens/OnboardingScreen.js
// The v2 first-run intro: one full-bleed vertical pager where each page is exactly
// the viewport, so the whole story is a single upward scroll.
//
// ── Why this was redesigned ─────────────────────────────────────────────────────
// The first version centred a small icon, a headline, two paragraphs and a row of
// chips in the middle of the page. On a tall phone that left roughly 450px of empty
// black above and below the text, nothing on screen had a surface or an edge, and
// the app was describing itself in words without ever showing itself. It read as an
// unfinished page rather than a designed one.
//
// So each page now has THREE zones instead of one floating block:
//
//   a top rail   — the wordmark and where you are (02/04),
//   a hero       — a small working vignette of the thing the page is about, and
//   a text block — the eyebrow, headline, copy and chips, anchored to the bottom.
//
// The hero takes the vertical slack that used to be empty, which is what fixes the
// blankness; the rail and the text block give the page a top and a bottom, which is
// what fixes the layout.
//
// The vignettes are built from the same primitives and tokens as the real screens —
// a portfolio list, an occupancy grid, the collected card, a reminder and a receipt.
// Nothing is a screenshot and nothing is imported: they restyle themselves with the
// theme, they cost no image assets, and — the actual point — a landlord sees what
// the app looks like before being asked to sign up for it. The figures in them are
// obviously illustrative (they are the same demo names used elsewhere), and no page
// claims a feature the app does not have.
//
// LinearGradient is used for the hero bloom. It is safe over the air: v1 already
// imports it in a dozen components, so it is compiled into every existing build.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Animated, Dimensions, Easing, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, Monogram, Wordmark } from '../ui';

const TOTAL = 5;      // welcome + four content pages
const BAR_ROOM = 96;  // space the fixed control bar needs at the foot of a page
const PAD = 22;

// ── Shared pieces ─────────────────────────────────────────────────────────────

// A soft diagonal wash of the page's accent, laid under a hero panel's content so
// the panel reads as lit rather than as a flat rectangle. React Native has no radial
// gradient, and a real blur would mean a second native module, so this is a plain
// two-stop linear fade — which at this opacity is indistinguishable from a bloom.
function Bloom({ colors }) {
    return (
        <LinearGradient
            colors={colors}
            start={{ x: 0.05, y: 0 }}
            end={{ x: 0.95, y: 1 }}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
        />
    );
}

// The hero's shell: one rounded, bordered surface a step lighter than the page, with
// the bloom behind whatever the page puts inside it.
function Hero({ tint, children }) {
    const t = useT();
    return (
        <View
            style={{
                borderRadius: 26,
                borderWidth: 1,
                borderColor: t.line,
                backgroundColor: t.ink2,
                overflow: 'hidden'
            }}
        >
            <Bloom colors={[tint, 'transparent']} />
            <View style={{ padding: 16 }}>{children}</View>
        </View>
    );
}

// A row inside a vignette: leading chip, two lines of text, trailing note.
function MiniRow({ icon, iconBg, iconFg, title, sub, note, noteFg, last }) {
    const t = useT();
    return (
        <Row
            gap={11}
            style={{
                paddingVertical: 10,
                borderBottomWidth: last ? 0 : 1,
                borderBottomColor: t.line
            }}
        >
            <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: iconBg, alignItems: 'center', justifyContent: 'center' }}>
                <Glyph name={icon} size={14} color={iconFg} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
                <T w={600} s={12.5} lh={1.2} numberOfLines={1}>{title}</T>
                <T mono w={600} s={8} lh={1.5} ls={0.08} c={t.fg3} numberOfLines={1} style={{ marginTop: 2 }}>{sub}</T>
            </View>
            {note ? <T mono w={600} s={9} lh={1} ls={0.06} c={noteFg || t.fg2}>{note}</T> : null}
        </Row>
    );
}

function VignetteHead({ label, right, rightFg }) {
    const t = useT();
    return (
        <Row justify="space-between" style={{ marginBottom: 4 }}>
            <Eyebrow s={8.5} ls={0.14} c={t.fg3}>{label}</Eyebrow>
            {right ? <T mono w={600} s={8.5} lh={1} ls={0.1} c={rightFg || t.fg3}>{right}</T> : null}
        </Row>
    );
}

// ── The four vignettes ────────────────────────────────────────────────────────

// 01 — everything in one place. A portfolio, listed.
function PortfolioVignette() {
    const t = useT();
    return (
        <Hero tint={t.lsoft}>
            <VignetteHead label="YOUR PORTFOLIO" right="4 PROPERTIES" />
            <MiniRow icon="business-outline" iconBg={t.lsoft} iconFg={t.accent} title="Sunrise PG" sub="KORAMANGALA · 3 ROOMS" note="₹48,000" />
            <MiniRow icon="business-outline" iconBg={t.lsoft} iconFg={t.accent} title="Green Meadows" sub="HSR LAYOUT · 1 ROOM" note="₹22,000" />
            <MiniRow icon="business-outline" iconBg={t.ink3} iconFg={t.fg3} title="Lakeview Residency" sub="INDIRANAGAR · 4 ROOMS" note="₹64,000" last />
        </Hero>
    );
}

// 02 — rooms and who is in them. The occupancy grid, which is the actual screen.
function RoomsVignette() {
    const t = useT();
    const rooms = [
        { no: '101', filled: true }, { no: '102', filled: true },
        { no: '103', filled: true }, { no: '104', filled: false },
        { no: '201', filled: true }, { no: '202', filled: true },
        { no: '203', filled: false }, { no: '204', filled: true }
    ];
    return (
        <Hero tint={t.lsoft}>
            <VignetteHead label="SUNRISE PG · ROOMS" right="75% FULL" rightFg={t.accent} />
            {/* A filled room is the accent TINT with accent text, not solid lime. Six
                solid lime blocks shouted over the headline they were meant to support,
                and solid lime is this app's primary-button colour — on a grid of rooms
                it reads as six things to tap. */}
            <Row wrap gap={7} style={{ marginTop: 8 }}>
                {rooms.map((r) => (
                    <View
                        key={r.no}
                        style={{
                            width: '22.4%',
                            aspectRatio: 1.5,
                            borderRadius: 12,
                            alignItems: 'center',
                            justifyContent: 'center',
                            backgroundColor: r.filled ? t.lsoft : 'transparent',
                            borderWidth: 1,
                            borderStyle: r.filled ? 'solid' : 'dashed',
                            borderColor: r.filled ? t.line : t.line2
                        }}
                    >
                        <T mono w={600} s={9.5} lh={1} ls={0.04} c={r.filled ? t.accent : t.fg3}>{r.no}</T>
                        <T mono w={600} s={6.5} lh={1} ls={0.08} c={t.fg3} style={{ marginTop: 3 }}>
                            {r.filled ? 'FULL' : 'FREE'}
                        </T>
                    </View>
                ))}
            </Row>
            <Row gap={12} style={{ marginTop: 11 }}>
                <Row gap={5}>
                    <View style={{ width: 8, height: 8, borderRadius: 3, backgroundColor: t.lsoft, borderWidth: 1, borderColor: t.line }} />
                    <T mono w={600} s={8} lh={1} ls={0.08} c={t.fg2}>6 FILLED</T>
                </Row>
                <Row gap={5}>
                    <View style={{ width: 8, height: 8, borderRadius: 3, borderWidth: 1, borderStyle: 'dashed', borderColor: t.line2 }} />
                    <T mono w={600} s={8} lh={1} ls={0.08} c={t.fg3}>2 VACANT</T>
                </Row>
            </Row>
        </Hero>
    );
}

// 03 — the money. The collected card, then what landed against it.
function MoneyVignette() {
    const t = useT();
    return (
        <Hero tint={t.lsoft}>
            <VignetteHead label="COLLECTED — AUGUST" right="69%" rightFg={t.accent} />
            <Row align="flex-end" justify="space-between" style={{ marginTop: 2 }}>
                <T w={700} s={30} lh={1} style={{ letterSpacing: -1.4 }}>₹54,000</T>
                <T w={400} s={11} lh={1.3} c={t.fg3} style={{ marginBottom: 3 }}>of ₹78,000</T>
            </Row>
            <View style={{ height: 6, borderRadius: 999, backgroundColor: t.ink3, marginTop: 11, marginBottom: 4, overflow: 'hidden' }}>
                <View style={{ width: '69%', height: '100%', borderRadius: 999, backgroundColor: t.lime }} />
            </View>
            <MiniRow icon="arrow-down" iconBg={t.lsoft} iconFg={t.pos} title="Amit Verma" sub="UNIT 102 · UPI · UTR9911" note="+₹24,000" noteFg={t.pos} />
            <MiniRow icon="arrow-down" iconBg={t.lsoft} iconFg={t.pos} title="Rahul Sharma" sub="UNIT 101 · CASH" note="+₹8,000" noteFg={t.pos} last />
        </Hero>
    );
}

// 04 — the loop that runs without you: a reminder goes out, a payment comes back.
function AutopilotVignette() {
    const t = useT();
    return (
        <Hero tint={t.asoft}>
            <VignetteHead label="ON THE 1ST, WITHOUT YOU" right="AUTOMATIC" rightFg={t.amber} />

            {/* Outgoing: what the tenant gets. */}
            <View style={{ alignSelf: 'flex-start', maxWidth: '88%', marginTop: 8, borderRadius: 16, borderTopLeftRadius: 6, backgroundColor: t.ink3, borderWidth: 1, borderColor: t.line, paddingVertical: 10, paddingHorizontal: 12 }}>
                <Row gap={7} style={{ marginBottom: 5 }}>
                    <Glyph name="notifications-outline" size={12} color={t.amber} />
                    <T mono w={600} s={8} lh={1} ls={0.1} c={t.fg3}>TO RAHUL · 1 AUG</T>
                </Row>
                <T w={400} s={12.5} lh={1.45} c={t.fg}>Rent for August is due in 3 days.</T>
            </View>

            {/* Incoming: what comes back, without a phone call. */}
            <View style={{ alignSelf: 'flex-end', maxWidth: '88%', marginTop: 8, borderRadius: 16, borderTopRightRadius: 6, backgroundColor: t.lsoft, borderWidth: 1, borderColor: t.line, paddingVertical: 10, paddingHorizontal: 12 }}>
                <Row gap={7} style={{ marginBottom: 5 }}>
                    <Glyph name="checkmark-circle" size={12} color={t.pos} />
                    <T mono w={600} s={8} lh={1} ls={0.1} c={t.fg3}>RAHUL PAID · 2 AUG</T>
                </Row>
                <T w={400} s={12.5} lh={1.45} c={t.fg}>₹8,000 by UPI. Waiting for you to confirm.</T>
            </View>
        </Hero>
    );
}

// ── Page copy ─────────────────────────────────────────────────────────────────
// The claims are unchanged from v1 apart from tightening: two long paragraphs per
// page did not fit alongside a hero, and the second was mostly restating the first.
// Nothing new is promised.
const PAGES = [
    {
        key: 'one',
        step: '01 — ONE APP',
        headline: 'Every property, every tenant,',
        accent: 'one app.',
        body: 'Your buildings, rooms, tenants and rent live in one place instead of a notebook, a spreadsheet and three chat threads.',
        Vignette: PortfolioVignette,
        chips: [
            { icon: 'business-outline', label: 'Properties' },
            { icon: 'people-outline', label: 'Tenants' },
            { icon: 'cash-outline', label: 'Rent' }
        ]
    },
    {
        key: 'rooms',
        step: '02 — CORE MANAGEMENT',
        headline: 'Rooms, leases and records',
        accent: 'that stay in sync.',
        body: 'Split a property into rooms and assign a tenant with their dates, deposit and rent. Occupancy is always current — filled, vacant, or up for renewal.',
        Vignette: RoomsVignette,
        chips: [
            { icon: 'bed-outline', label: 'Rooms' },
            { icon: 'person-outline', label: 'Tenant records' },
            { icon: 'document-text-outline', label: 'Leases' }
        ]
    },
    {
        key: 'money',
        step: '03 — MONEY, HANDLED',
        headline: 'Invoice the rent,',
        accent: 'chase nothing.',
        body: 'Record cash, UPI or bank payments and watch dues update instantly. Every payment keeps a receipt, so the history is ready the moment anyone asks.',
        Vignette: MoneyVignette,
        chips: [
            { icon: 'receipt-outline', label: 'Receipts' },
            { icon: 'alert-circle-outline', label: 'Dues' },
            { icon: 'time-outline', label: 'History' }
        ]
    },
    {
        key: 'why',
        step: '04 — WHY TENANTPRO',
        headline: 'Built for landlords,',
        accent: 'not accountants.',
        body: 'Rent reminders go out on their own, and the tenant portal lets tenants check dues, raise issues and pay without calling you.',
        Vignette: AutopilotVignette,
        chips: [
            { icon: 'notifications-outline', label: 'Auto reminders' },
            { icon: 'cloud-offline-outline', label: 'Offline-friendly' },
            { icon: 'phone-portrait-outline', label: 'Tenant portal' },
            { icon: 'pricetag-outline', label: 'Free to start' }
        ]
    }
];

// ── Chrome ────────────────────────────────────────────────────────────────────

// The one small motion on this screen: the scroll cue drifts 6px up and back,
// forever, so the first page reads as "there is more above" without shouting.
function ScrollCue() {
    const t = useT();
    const drift = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(drift, { toValue: -6, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
                Animated.timing(drift, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [drift]);

    return (
        <Animated.View style={{ alignItems: 'center', rowGap: 6, transform: [{ translateY: drift }] }}>
            <Glyph name="chevron-up" size={16} color={t.fg3} />
            <Eyebrow c={t.fg3}>SCROLL UP</Eyebrow>
        </Animated.View>
    );
}

function FeatureChip({ icon, label }) {
    const t = useT();
    return (
        <Row
            gap={6}
            style={{ backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 11 }}
        >
            <Glyph name={icon} size={12} color={t.accent} />
            <Eyebrow s={8.5} ls={0.06} c={t.fg}>{label}</Eyebrow>
        </Row>
    );
}

// Where you are in the story, in the top-right of every content page. The dots at
// the foot say the same thing, but they are 4px tall and easy to miss; a landlord
// deciding whether to keep scrolling wants to know how much is left.
function TopRail({ index }) {
    const t = useT();
    return (
        <Row justify="space-between" style={{ paddingHorizontal: PAD, paddingTop: 16 }}>
            <Wordmark mono={26} s={15} gap={8} />
            <Row gap={6}>
                <T mono w={700} s={11} lh={1} ls={0.06} c={t.fg}>{`0${index}`}</T>
                <T mono w={600} s={11} lh={1} ls={0.06} c={t.fg3}>{`/ 0${PAGES.length}`}</T>
            </Row>
        </Row>
    );
}

// ── Pages ─────────────────────────────────────────────────────────────────────

function WelcomePage({ height }) {
    const t = useT();
    // What the next four pages are about, in one line each. This page used to be a
    // monogram and a wordmark alone in the middle of the screen, which is a splash,
    // not a page — and the app already shows a splash before this.
    const inside = [
        'Every property and room in one place',
        'Rent, receipts and who still owes you',
        'Repairs your tenants report',
        'A portal your tenants use themselves'
    ];

    return (
        <View style={{ height, paddingBottom: BAR_ROOM }}>
            <View style={{ flex: 1, paddingHorizontal: PAD, justifyContent: 'center' }}>
                {/* Light behind the lockup, so the opening page feels lit from within
                    rather than framed. Getting here took three tries, and the reason is
                    worth recording: React Native has no radial gradient. Two stacked
                    translucent circles showed the step between them as a hard ring. A
                    gradient clipped to a circle fixed that but left the circle's own
                    outline visible, because a fade running top-to-bottom does nothing
                    about the left and right edges. A full-width BAND has no side edges
                    to give away — it runs off both sides of the screen — so fading it
                    at the top and bottom is all that is needed. */}
                <View style={{ alignItems: 'center' }}>
                    <View style={{ height: 190, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
                        <LinearGradient
                            colors={['transparent', t.lsoft, 'transparent']}
                            locations={[0, 0.5, 1]}
                            start={{ x: 0.5, y: 0 }}
                            end={{ x: 0.5, y: 1 }}
                            style={{ position: 'absolute', top: 0, bottom: 0, left: -PAD, right: -PAD }}
                            pointerEvents="none"
                        />
                        <Monogram size={76} />
                    </View>

                    <T w={400} s={14} lh={1} c={t.fg2} style={{ marginTop: 18 }}>Welcome to</T>
                    <T w={700} s={40} lh={1.05} style={{ letterSpacing: -1.8, marginTop: 4 }}>
                        Tenant<T w={700} s={40} c={t.accent}>Pro</T>
                    </T>
                    <T w={400} s={13.5} lh={1.5} c={t.fg2} style={{ marginTop: 12, textAlign: 'center', maxWidth: 290 }}>
                        Run your properties, rooms, tenants and rent from your phone.
                    </T>
                </View>

                <View style={{ marginTop: 30, borderRadius: 22, backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, paddingVertical: 14, paddingHorizontal: 16, rowGap: 11 }}>
                    <Eyebrow s={8.5} ls={0.14} c={t.fg3}>WHAT IS INSIDE</Eyebrow>
                    {inside.map((line) => (
                        <Row key={line} gap={10} align="flex-start">
                            <Glyph name="checkmark-circle" size={15} color={t.accent} />
                            <T w={400} s={12.5} lh={1.4} c={t.fg} style={{ flex: 1 }}>{line}</T>
                        </Row>
                    ))}
                </View>
            </View>

            <View style={{ alignItems: 'center', paddingBottom: 4 }}>
                <ScrollCue />
            </View>
        </View>
    );
}

function ContentPage({ page, index, height }) {
    const t = useT();
    const { Vignette } = page;

    return (
        <View style={{ height, paddingBottom: BAR_ROOM }}>
            <TopRail index={index} />

            {/* Hero and pitch are centred as ONE block, not two. Centring the hero in
                its own flex box and pinning the text to the foot left a void above the
                hero AND a second void below it — the same emptiness this redesign was
                meant to remove, just moved around. Together they very nearly fill the
                page, so whatever slack is left reads as margin. */}
            <View style={{ flex: 1, minHeight: 0, justifyContent: 'center', paddingHorizontal: PAD, rowGap: 22 }}>
                <Vignette />

                <View>
                    <Eyebrow s={9} ls={0.14} c={t.fg3}>{page.step}</Eyebrow>

                    <T w={700} s={27} lh={1.1} style={{ letterSpacing: -1.1, marginTop: 10 }}>
                        {page.headline}{' '}
                        <T w={700} s={27} c={t.accent}>{page.accent}</T>
                    </T>

                    <T w={400} s={13.5} lh={1.5} c={t.fg2} style={{ marginTop: 10 }}>
                        {page.body}
                    </T>

                    <Row wrap gap={7} align="center" style={{ marginTop: 16 }}>
                        {page.chips.map((chip) => (
                            <FeatureChip key={chip.label} icon={chip.icon} label={chip.label} />
                        ))}
                    </Row>
                </View>
            </View>
        </View>
    );
}

// ── The pager ─────────────────────────────────────────────────────────────────

export default function OnboardingScreen() {
    const vm = useVm();
    const t = useT();

    const scroller = useRef(null);
    // Dimensions gets the pager laid out on the very first frame; onLayout then
    // corrects it to the real box (which is what pagingEnabled actually snaps to).
    const [height, setHeight] = useState(() => Dimensions.get('window').height);
    const [page, setPage] = useState(0);

    const isLast = page === TOTAL - 1;

    const onLayout = useCallback((e) => {
        const h = Math.round(e.nativeEvent.layout.height);
        if (h > 0) setHeight((prev) => (prev === h ? prev : h));
    }, []);

    // Round rather than floor: a half-page drag should resolve to whichever page
    // the pager actually settled on.
    const onMomentumScrollEnd = useCallback(
        (e) => {
            const next = Math.round(e.nativeEvent.contentOffset.y / height);
            setPage((prev) => (prev === next ? prev : Math.max(0, Math.min(TOTAL - 1, next))));
        },
        [height]
    );

    const primary = useCallback(() => {
        if (isLast) {
            vm.finishOnboarding();
            return;
        }
        const next = page + 1;
        // Optimistic: a programmatic scroll doesn't reliably emit momentum-end.
        setPage(next);
        scroller.current?.scrollTo({ y: next * height, animated: true });
    }, [height, isLast, page, vm]);

    return (
        <View style={{ flex: 1, backgroundColor: t.ink }} onLayout={onLayout}>
            <ScrollView
                ref={scroller}
                pagingEnabled
                showsVerticalScrollIndicator={false}
                onMomentumScrollEnd={onMomentumScrollEnd}
                scrollEventThrottle={16}
                style={{ flex: 1 }}
            >
                <WelcomePage height={height} />
                {PAGES.map((p, i) => (
                    <ContentPage key={p.key} page={p} index={i + 1} height={height} />
                ))}
            </ScrollView>

            {/* The control bar floats over the pager. It sits on a fade rather than on
                bare ink, so a vignette scrolling past behind it does not collide with
                the dots. */}
            <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }} pointerEvents="box-none">
                <LinearGradient
                    colors={['transparent', t.ink]}
                    style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: BAR_ROOM + 24 }}
                    pointerEvents="none"
                />
                <Row justify="space-between" style={{ paddingHorizontal: PAD, paddingBottom: 26 }}>
                    <Row gap={6}>
                        {Array.from({ length: TOTAL }).map((_, i) => (
                            <View
                                key={i}
                                style={{
                                    height: 4,
                                    width: i === page ? 18 : 4,
                                    borderRadius: 999,
                                    backgroundColor: i === page ? t.lime : t.line2
                                }}
                            />
                        ))}
                    </Row>

                    <Row gap={14}>
                        {isLast ? null : (
                            <Press onPress={vm.finishOnboarding} hitSlop={10}>
                                <Eyebrow s={9} ls={0.12} c={t.fg3}>SKIP</Eyebrow>
                            </Press>
                        )}

                        <Press
                            onPress={primary}
                            style={{ borderRadius: 999, backgroundColor: t.lime, paddingVertical: 13, paddingHorizontal: 22 }}
                        >
                            <Row gap={8}>
                                <T w={700} s={14} c={t.on} style={{ letterSpacing: -0.2 }}>{isLast ? 'Get started' : 'Next'}</T>
                                <Glyph name={isLast ? 'arrow-forward' : 'arrow-up'} size={15} color={t.on} />
                            </Row>
                        </Press>
                    </Row>
                </Row>
            </View>
        </View>
    );
}
