// File: mobile/src/redesign/screens/OnboardingScreen.js
// The v2 first-run intro. Same pitch as v1's 4-page pager (identical copy and
// feature chips) retold in the redesign's voice: one full-bleed vertical pager
// where each page is exactly the viewport, so the whole story is a single
// upward scroll instead of a sideways swipe.
//
// Page 0 is the welcome lockup with a gentle "scroll up" cue; pages 1..4 are the
// four content pages. A fixed control bar (dots + lime pill + Skip) floats above
// the scroller and reads the current page from onMomentumScrollEnd.
//
// Everything reads tokens from useT() and actions from useVm(); no colour or
// font family is written literally.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Animated, Dimensions, Easing, ScrollView } from 'react-native';
import { useVm } from '../AppContext';
import { useT } from '../ThemeContext';
import { T, Eyebrow, Row, Press, Glyph, IconChip, Monogram } from '../ui';

// Copy is lifted verbatim from v1's OnboardingScreen — the product claims and the
// ionicon names must not drift between the two UIs. Only `step` is new: a short
// mono label for the redesign's eyebrow slot.
const PAGES = [
    {
        key: 'welcome',
        icon: 'sparkles-outline',
        step: '01 — ONE APP',
        headline: 'Every property, every tenant,',
        headlineAccent: 'one app.',
        body: [
            'Your buildings, rooms, tenants and rent live in one place instead of a notebook, a spreadsheet and three chat threads.',
            'Set it up once, then run the whole portfolio from your phone.'
        ],
        chips: [
            { icon: 'business-outline', label: 'Properties' },
            { icon: 'people-outline', label: 'Tenants' },
            { icon: 'cash-outline', label: 'Rent' }
        ]
    },
    {
        key: 'manage',
        icon: 'grid-outline',
        step: '02 — CORE MANAGEMENT',
        headline: 'Rooms, leases and records',
        headlineAccent: 'that stay in sync.',
        body: [
            'Add a property, split it into rooms, and assign a tenant with their lease dates, deposit and monthly rent in a few taps.',
            'Occupancy is always current — see what is filled, what is vacant and what is up for renewal at a glance.'
        ],
        chips: [
            { icon: 'bed-outline', label: 'Properties & rooms' },
            { icon: 'person-outline', label: 'Tenant records' },
            { icon: 'document-text-outline', label: 'Leases' }
        ]
    },
    {
        key: 'money',
        icon: 'wallet-outline',
        step: '03 — MONEY, HANDLED',
        headline: 'Invoice the rent,',
        headlineAccent: 'chase nothing.',
        body: [
            'Raise monthly rent invoices, record cash, UPI or bank payments against them, and watch outstanding dues update instantly.',
            'Every payment keeps a receipt, so your history is ready the moment anyone asks for it.'
        ],
        chips: [
            { icon: 'receipt-outline', label: 'Invoices & receipts' },
            { icon: 'alert-circle-outline', label: 'Dues tracking' },
            { icon: 'time-outline', label: 'Transaction history' }
        ]
    },
    {
        key: 'why',
        icon: 'rocket-outline',
        step: '04 — WHY TENANTPRO',
        headline: 'Built for landlords,',
        headlineAccent: 'not accountants.',
        body: [
            'Rent reminders go out automatically, and the tenant portal lets tenants check their dues and pay without calling you.',
            'Fast on a phone, forgiving on a weak signal, and free to start.'
        ],
        chips: [
            { icon: 'notifications-outline', label: 'Auto reminders' },
            { icon: 'cloud-offline-outline', label: 'Offline-friendly' },
            { icon: 'phone-portrait-outline', label: 'Tenant portal' },
            { icon: 'pricetag-outline', label: 'Free to start' }
        ]
    }
];

const TOTAL = PAGES.length + 1; // welcome + four content pages
const BAR_ROOM = 92; // space the fixed control bar needs at the foot of a page

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
            style={{ backgroundColor: t.ink2, borderWidth: 1, borderColor: t.line, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 }}
        >
            <Glyph name={icon} size={13} color={t.accent} />
            <Eyebrow s={9} ls={0.08} c={t.fg}>{label}</Eyebrow>
        </Row>
    );
}

function WelcomePage({ height }) {
    const t = useT();
    return (
        <View style={{ height, paddingHorizontal: 22, paddingBottom: BAR_ROOM, alignItems: 'center', justifyContent: 'center' }}>
            <Monogram size={72} />

            <T w={400} s={16} c={t.fg2} style={{ marginTop: 28 }}>Welcome to</T>
            <T w={700} s={40} lh={1.05} style={{ letterSpacing: -1.6, marginTop: 2 }}>
                Tenant<T w={700} s={40} c={t.accent}>Pro</T>
            </T>

            <View style={{ marginTop: 44 }}>
                <ScrollCue />
            </View>
        </View>
    );
}

function ContentPage({ page, height }) {
    const t = useT();
    return (
        <View style={{ height, paddingHorizontal: 22, paddingBottom: BAR_ROOM, justifyContent: 'center' }}>
            <IconChip name={page.icon} size={26} box={56} radius={18} bg={t.lsoft} color={t.accent} />

            <Eyebrow s={9} ls={0.14} c={t.fg3} style={{ marginTop: 26 }}>{page.step}</Eyebrow>

            <T w={700} s={32} lh={1.05} style={{ letterSpacing: -1.2, marginTop: 12 }}>
                {page.headline}{' '}
                <T w={700} s={32} c={t.accent}>{page.headlineAccent}</T>
            </T>

            {page.body.map((line) => (
                <T key={line} w={400} s={14} lh={1.55} c={t.fg2} style={{ marginTop: 12, maxWidth: 300 }}>
                    {line}
                </T>
            ))}

            <Row wrap gap={8} align="center" style={{ marginTop: 24 }}>
                {page.chips.map((chip) => (
                    <FeatureChip key={chip.label} icon={chip.icon} label={chip.label} />
                ))}
            </Row>
        </View>
    );
}

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
                {PAGES.map((p) => (
                    <ContentPage key={p.key} page={p} height={height} />
                ))}
            </ScrollView>

            <Row
                justify="space-between"
                style={{ position: 'absolute', left: 22, right: 22, bottom: 26 }}
            >
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
    );
}
