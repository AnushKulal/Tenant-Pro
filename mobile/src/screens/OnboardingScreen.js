// File: mobile/src/screens/OnboardingScreen.js
// First-run intro: a 4-page horizontal pager that describes what TenantPro does.
// It is a pitch, not a demo — nothing here touches the API.
//
// The signature motion is depth: each page is composed of four layers (orb,
// icon tile, copy, feature chips) that track the finger at different rates, so
// swiping reads as parallax rather than a slide. Every layer interpolates the
// same scrollX Animated.Value, which is driven natively.
import React, { useCallback, useRef, useState } from 'react';
import { View, Text, Animated, Dimensions, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Screen, GlassCard, GlassView, GlassButton, BrandMark, PageDots } from '../ui';
import { useTheme } from '../theme';
import { markOnboardingSeen } from '../navigation/flow';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PAGES = [
    {
        key: 'welcome',
        icon: 'sparkles-outline',
        eyebrow: 'WELCOME TO TENANTPRO',
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
        ],
        brand: true
    },
    {
        key: 'manage',
        icon: 'grid-outline',
        eyebrow: 'CORE MANAGEMENT',
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
        eyebrow: 'MONEY, HANDLED',
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
        eyebrow: 'WHY TENANTPRO',
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

function Page({ page, index, scrollX }) {
    const t = useTheme();

    // One page-width either side of centre is the whole life of this page.
    const inputRange = [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH];

    // Positive shift = the layer drags behind the page it sits on (parallax lag).
    const lag = (amount) =>
        scrollX.interpolate({
            inputRange,
            outputRange: [-SCREEN_WIDTH * amount, 0, SCREEN_WIDTH * amount],
            extrapolate: 'clamp'
        });

    // Tighter spread than a full page so copy is fully faded before the
    // neighbour's copy arrives — otherwise two headlines overlap mid-swipe.
    const fade = (spread = 0.62) =>
        scrollX.interpolate({
            inputRange: [(index - spread) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + spread) * SCREEN_WIDTH],
            outputRange: [0, 1, 0],
            extrapolate: 'clamp'
        });

    const tileScale = scrollX.interpolate({
        inputRange,
        outputRange: [0.7, 1, 0.7],
        extrapolate: 'clamp'
    });

    const orbOpacity = scrollX.interpolate({
        inputRange,
        outputRange: [0, t.isDark ? 0.55 : 0.4, 0],
        extrapolate: 'clamp'
    });

    return (
        <View style={styles.page}>
            {/* Deepest layer: an abstract gradient orb. No photography anywhere. */}
            <Animated.View
                pointerEvents="none"
                style={[
                    styles.orb,
                    index % 2 === 0 ? styles.orbRight : styles.orbLeft,
                    { opacity: orbOpacity, transform: [{ translateX: lag(0.62) }, { scale: tileScale }] }
                ]}
            >
                <LinearGradient
                    colors={index % 2 === 0 ? t.colors.blobA : t.colors.blobB}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.fill}
                />
            </Animated.View>

            <ScrollView
                showsVerticalScrollIndicator={false}
                bounces={false}
                contentContainerStyle={[
                    styles.pageContent,
                    { paddingHorizontal: t.spacing.xxl, paddingVertical: t.spacing.xl }
                ]}
            >
                {page.brand ? (
                    <Animated.View
                        style={[
                            styles.brandRow,
                            { marginBottom: t.spacing.xxxl, opacity: fade(0.75), transform: [{ translateX: lag(0.5) }] }
                        ]}
                    >
                        <BrandMark size={56} showWordmark={false} pulse />
                        <View style={{ marginLeft: t.spacing.lg }}>
                            <Text style={[styles.wordmark, { color: t.colors.text }]}>
                                Tenant<Text style={{ color: t.colors.primary }}>Pro</Text>
                            </Text>
                            <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>
                                Smart Property Management
                            </Text>
                        </View>
                    </Animated.View>
                ) : null}

                <Animated.View
                    style={{ opacity: fade(0.8), transform: [{ translateX: lag(0.42) }, { scale: tileScale }] }}
                >
                    <GlassView radius={t.radii.xxl} style={[styles.tile, t.shadows.glow]}>
                        <LinearGradient
                            colors={t.colors.primaryGradient}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[StyleSheet.absoluteFill, { opacity: t.isDark ? 0.22 : 0.16 }]}
                        />
                        <Ionicons name={page.icon} size={40} color={t.colors.primary} />
                    </GlassView>
                </Animated.View>

                <Animated.View
                    style={[
                        styles.copy,
                        { marginTop: t.spacing.xxl, opacity: fade(), transform: [{ translateX: lag(0.24) }] }
                    ]}
                >
                    <View style={styles.eyebrowRow}>
                        <Text style={[t.typography.micro, { color: t.colors.primary }]}>
                            {`0${index + 1} / 0${PAGES.length}`}
                        </Text>
                        <View style={[styles.eyebrowRule, { backgroundColor: t.colors.borderStrong }]} />
                        <Text style={[t.typography.micro, { color: t.colors.textMuted }]}>{page.eyebrow}</Text>
                    </View>

                    <Text
                        style={[
                            t.typography.title,
                            styles.headline,
                            { color: t.colors.text, marginTop: t.spacing.md }
                        ]}
                    >
                        {page.headline}{' '}
                        <Text style={{ color: t.colors.primary }}>{page.headlineAccent}</Text>
                    </Text>

                    {page.body.map((line) => (
                        <Text
                            key={line}
                            style={[
                                t.typography.body,
                                styles.bodyLine,
                                { color: t.colors.textMuted, marginTop: t.spacing.md }
                            ]}
                        >
                            {line}
                        </Text>
                    ))}
                </Animated.View>

                {/* Shallowest layer — chips settle last, which sells the depth. */}
                <Animated.View
                    style={[
                        styles.chips,
                        { marginTop: t.spacing.xl, opacity: fade(0.55), transform: [{ translateX: lag(0.1) }] }
                    ]}
                >
                    {page.chips.map((chip) => (
                        <GlassView
                            key={chip.label}
                            radius={t.radii.pill}
                            sheen={false}
                            style={[styles.chip, { paddingVertical: t.spacing.sm, paddingHorizontal: t.spacing.md }]}
                        >
                            <Ionicons name={chip.icon} size={14} color={t.colors.accent} />
                            <Text
                                style={[
                                    t.typography.caption,
                                    { color: t.colors.text, marginLeft: t.spacing.xs, fontWeight: '700' }
                                ]}
                            >
                                {chip.label}
                            </Text>
                        </GlassView>
                    ))}
                </Animated.View>
            </ScrollView>
        </View>
    );
}

export default function OnboardingScreen({ navigation }) {
    const t = useTheme();
    const scrollRef = useRef(null);
    const scrollX = useRef(new Animated.Value(0)).current;
    const [index, setIndex] = useState(0);
    const [leaving, setLeaving] = useState(false);
    // Ref, not state, so a double-tap can't slip through before the re-render.
    const leavingRef = useRef(false);

    const isLast = index === PAGES.length - 1;

    const dismiss = useCallback(async () => {
        if (leavingRef.current) return;
        leavingRef.current = true;
        setLeaving(true);
        // Persist before navigating, or a fast relaunch shows the intro again.
        await markOnboardingSeen();
        // replace (not reset): the intro must not be reachable by back once gone.
        navigation.replace('RoleSelection');
    }, [navigation]);

    const handlePrimary = useCallback(() => {
        if (isLast) {
            dismiss();
            return;
        }
        const next = index + 1;
        // Optimistic: programmatic scrolls don't always emit momentum-end.
        setIndex(next);
        scrollRef.current?.scrollTo({ x: next * SCREEN_WIDTH, animated: true });
    }, [dismiss, index, isLast]);

    const onMomentumEnd = useCallback(
        (e) => {
            const page = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
            setIndex((prev) => (page === prev ? prev : page));
        },
        []
    );

    return (
        <Screen padded={false} edges={['top', 'bottom']}>
            <View style={styles.root}>
                <Animated.ScrollView
                    ref={scrollRef}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    scrollEventThrottle={16}
                    onScroll={Animated.event(
                        [{ nativeEvent: { contentOffset: { x: scrollX } } }],
                        { useNativeDriver: true }
                    )}
                    onMomentumScrollEnd={onMomentumEnd}
                    style={styles.pager}
                >
                    {PAGES.map((page, i) => (
                        <Page key={page.key} page={page} index={i} scrollX={scrollX} />
                    ))}
                </Animated.ScrollView>

                <GlassCard
                    strong
                    elevation="lg"
                    delay={260}
                    padding={t.spacing.lg}
                    style={[styles.dock, { marginHorizontal: t.spacing.xl, marginBottom: t.spacing.md }]}
                >
                    <PageDots
                        count={PAGES.length}
                        index={index}
                        scrollX={scrollX}
                        width={SCREEN_WIDTH}
                        style={{ marginBottom: t.spacing.lg }}
                    />

                    <View style={styles.dockRow}>
                        <GlassButton
                            label="Skip"
                            variant="ghost"
                            fullWidth={false}
                            disabled={leaving}
                            onPress={dismiss}
                            style={styles.skip}
                        />
                        <GlassButton
                            label={isLast ? 'Get Started' : 'Next'}
                            icon="arrow-forward"
                            iconRight
                            variant="primary"
                            fullWidth={false}
                            loading={leaving}
                            loadingLabel="Getting ready…"
                            onPress={handlePrimary}
                            style={[styles.cta, { marginLeft: t.spacing.md }]}
                        />
                    </View>
                </GlassCard>
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1 },
    pager: { flex: 1 },
    fill: { flex: 1 },

    page: { width: SCREEN_WIDTH, flex: 1 },
    pageContent: { flexGrow: 1, justifyContent: 'center' },

    orb: { position: 'absolute', width: 300, height: 300, borderRadius: 150, overflow: 'hidden' },
    orbRight: { top: '6%', right: -110 },
    orbLeft: { bottom: '10%', left: -120 },

    brandRow: { flexDirection: 'row', alignItems: 'center' },
    wordmark: { fontSize: 26, fontWeight: '900', letterSpacing: -0.6 },

    tile: { width: 88, height: 88, alignItems: 'center', justifyContent: 'center' },

    copy: { alignItems: 'flex-start' },
    eyebrowRow: { flexDirection: 'row', alignItems: 'center' },
    eyebrowRule: { width: 22, height: 1, marginHorizontal: 8 },
    headline: { lineHeight: 34 },
    bodyLine: { lineHeight: 22 },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { flexDirection: 'row', alignItems: 'center' },

    dock: { alignSelf: 'stretch' },
    dockRow: { flexDirection: 'row', alignItems: 'center' },
    skip: { width: 84 },
    cta: { flex: 1 }
});
