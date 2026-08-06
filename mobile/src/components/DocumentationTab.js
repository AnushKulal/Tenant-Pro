// File: mobile/src/components/DocumentationTab.js
// In-app documentation: what TenantPro is, and what every module in it does.
//
// It lives in the app rather than in a README because the people who need it are
// holding the phone, not reading the repository. Sections are collapsed by default
// so the page reads as a table of contents you drill into, instead of a wall of
// text you have to scroll past.
//
// Keep this honest. It is the only place that explains the product to its user, so
// a feature described here must actually exist, and one that does not exist yet
// belongs under "On the roadmap" — not in a module's body pretending to work.
import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useTheme, withAlpha } from '../theme';
import { GlassCard, GlassView } from '../ui';

// --- Content -----------------------------------------------------------------
// Data, not JSX, so the shape of the page can change without touching the copy.
const MODULES = [
    {
        key: 'dashboard',
        icon: 'home-outline',
        title: 'Dashboard',
        summary: 'The one screen that answers "how am I doing this month?"',
        body: [
            'Four metrics sit at the top: rent collected this month, pending dues, active tenants, and vacant units. Each responds to the property selector in the header — pick a single building and every number narrows to it.',
            'Pending dues counts rent whose due date has already passed, so it is money you should be chasing rather than money not yet owed.',
            'The revenue chart covers the last six months, drawn from recorded payments. Bars are scaled against the biggest month, so it shows shape and trend rather than absolute height.',
            'Recent payments lists the last five, each with the tenant\'s own photo so you recognise a payment at a glance, plus the unit, the method, and the date.',
            'Pull down anywhere on the dashboard to refresh.'
        ]
    },
    {
        key: 'properties',
        icon: 'business-outline',
        title: 'Properties',
        summary: 'Your buildings — PGs, apartments, anything with units inside it.',
        body: [
            'A property holds the address, locality, city, pincode, its type (PG, apartment, and so on) and an optional UPI id used for collections against that building specifically.',
            'Each property carries a photo, which is what makes the list scannable once you have more than two or three.',
            'The header\'s property selector is global: whatever you choose there filters the dashboard, rooms, and tenant views until you change it. "All Properties" gives the portfolio-wide view.'
        ]
    },
    {
        key: 'rooms',
        icon: 'key-outline',
        title: 'Rooms & Units',
        summary: 'The individual lettable spaces inside a property.',
        body: [
            'A unit has a number, a room type, a capacity, a base rent, and a status of Occupied or Vacant. Capacity is what allows a room to be shared by more than one tenant.',
            'Rent splitting is per-unit. An equal split divides the base rent across the tenants assigned to that unit, which is why two tenants in a ₹16,000 room each show ₹8,000.',
            'Opening a unit shows who lives there, what each of them pays, and the unit\'s own history.'
        ]
    },
    {
        key: 'tenants',
        icon: 'people-outline',
        title: 'Tenants',
        summary: 'Everyone renting from you, and everything owed.',
        body: [
            'A tenant record holds their name, phone, email, employer, deposit, rent share, move-in date, billing cycle, next rent due date, and a credit score that reflects payment history.',
            'Tenants are assigned to a unit. Anyone not yet assigned appears under the Unassigned filter, so nobody gets lost between onboarding and a room being ready.',
            'Search matches on name or phone. The filter chips narrow by assignment state.',
            'Opening a tenant gives their full profile: payment history, dues, documents and the actions for recording a payment or moving them to another room.'
        ]
    },
    {
        key: 'transactions',
        icon: 'wallet-outline',
        title: 'Transactions',
        summary: 'The ledger — rent in, expenses out.',
        body: [
            'Every payment recorded against a tenant lands here, with its method (UPI, cash, and so on), date, and reference.',
            'This is the source the dashboard\'s revenue chart and "rent collected" figure are computed from, so a payment recorded here is immediately reflected there.'
        ]
    },
    {
        key: 'payments',
        icon: 'qr-code-outline',
        title: 'Payment Setup',
        summary: 'How tenants actually pay you.',
        body: [
            'Holds your UPI id and the number attached to it. A property can override this with its own UPI id when collections for that building go somewhere else.',
            'These details are what a tenant sees when they are asked to pay, so an incorrect id here means money going nowhere.'
        ]
    },
    {
        key: 'profile',
        icon: 'person-outline',
        title: 'Profile & Settings',
        summary: 'Your account, and how the app looks and behaves.',
        body: [
            'Profile holds your name, contact details and photo. The photo is what appears in the header and in the menu.',
            'Settings carries appearance — Light, Dark, or System, which follows your phone — along with links to Help & Support and the terms of service.',
            'Appearance can also be flipped straight from the ⋯ menu, which keeps the menu open so you can see the change happen.'
        ]
    }
];

const NAVIGATION = [
    {
        key: 'nav-bar',
        icon: 'grid-outline',
        title: 'Getting around',
        summary: 'Four tabs at the bottom, everything else behind ⋯.',
        body: [
            'The bottom bar holds the four places you go constantly: Dashboard, Rooms, Properties and Tenants. The highlighted capsule shows where you are.',
            'The ⋯ button at the top right opens everything else — your account, Transactions, Payment Setup, Settings, Help, this documentation, appearance, and sign out.',
            'Your photo in the header goes to your profile. It is not a menu.',
            'Tabs keep their state once visited, so switching away and back does not reload or lose your place. The hardware back button retraces your steps inside the app and asks twice before exiting.'
        ]
    },
    {
        key: 'updates',
        icon: 'cloud-download-outline',
        title: 'Updates',
        summary: 'The app updates itself, without the Play Store.',
        body: [
            'Improvements arrive over the air. When one is available a panel slides up from the bottom listing what actually changed, and you choose whether to install now or later.',
            'Updates carry the app\'s screens and behaviour. Anything that changes the app at a deeper level still needs a fresh install, and you would be told so.'
        ]
    },
    {
        key: 'data',
        icon: 'shield-checkmark-outline',
        title: 'Your data',
        summary: 'Where it lives and what leaves the phone.',
        body: [
            'Properties, units, tenants and payments live in a hosted database, not on the phone, so the same account shows the same data on any device you sign in from.',
            'The phone keeps your session and a few preferences — the signed-in token, your selected property, your appearance choice. Signing out clears all of it.',
            'Passwords are stored only as bcrypt hashes and are never recoverable, which is why a forgotten password is reset by emailed code rather than sent back to you.'
        ]
    }
];

const ROADMAP = [
    'Notifications for upcoming and overdue rent.',
    'Password recovery for tenant accounts (owners already have it).'
];

// --- A collapsible section ---------------------------------------------------
function Section({ item, isOpen, onToggle }) {
    const t = useTheme();
    // Only the chevron animates: the body is mounted/unmounted, so animating its
    // height would need the JS driver for no real gain on a page like this.
    const spin = useRef(new Animated.Value(isOpen ? 1 : 0)).current;

    React.useEffect(() => {
        Animated.timing(spin, {
            toValue: isOpen ? 1 : 0,
            duration: t.motion.fast,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true
        }).start();
    }, [isOpen, spin, t.motion.fast]);

    const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

    return (
        <View style={[styles.section, { borderBottomColor: t.colors.border }]}>
            <Pressable
                onPress={onToggle}
                style={({ pressed }) => [
                    styles.sectionHead,
                    { borderRadius: t.radii.md },
                    pressed && { backgroundColor: withAlpha(t.colors.primary, t.isDark ? 0.14 : 0.08) }
                ]}
                accessibilityRole="button"
                accessibilityLabel={item.title}
                accessibilityState={{ expanded: isOpen }}
            >
                <View style={[styles.sectionIcon, { backgroundColor: withAlpha(t.colors.primary, t.isDark ? 0.18 : 0.1) }]}>
                    <Ionicons name={item.icon} size={18} color={t.colors.primary} />
                </View>

                <View style={styles.sectionTitleWrap}>
                    <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{item.title}</Text>
                    <Text style={[t.typography.caption, { color: t.colors.textMuted }]} numberOfLines={isOpen ? 0 : 2}>
                        {item.summary}
                    </Text>
                </View>

                <Animated.View style={{ transform: [{ rotate }] }}>
                    <Ionicons name="chevron-down" size={18} color={t.colors.textMuted} />
                </Animated.View>
            </Pressable>

            {isOpen ? (
                <View style={styles.sectionBody}>
                    {item.body.map((para, i) => (
                        <Text
                            key={i}
                            style={[t.typography.body, styles.para, { color: t.colors.textMuted }]}
                        >
                            {para}
                        </Text>
                    ))}
                </View>
            ) : null}
        </View>
    );
}

export default function DocumentationTab() {
    const t = useTheme();
    // One open at a time: an accordion where everything can be open at once is just
    // a long page with extra taps.
    const [openKey, setOpenKey] = useState(null);
    const toggle = (key) => setOpenKey((k) => (k === key ? null : key));

    const renderGroup = (label, items) => (
        <>
            <Text style={[t.typography.micro, styles.groupLabel, { color: t.colors.textFaint }]}>
                {label}
            </Text>
            <GlassCard padding={8} radius={t.radii.xxl} style={styles.card}>
                {items.map((item) => (
                    <Section
                        key={item.key}
                        item={item}
                        isOpen={openKey === item.key}
                        onToggle={() => toggle(item.key)}
                    />
                ))}
            </GlassCard>
        </>
    );

    return (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            {/* What the product is, in the fewest words that are still true. */}
            <GlassView radius={t.radii.xxl} style={[styles.hero, t.shadows.sm]} edgeLight>
                <View style={[styles.heroIcon, { backgroundColor: withAlpha(t.colors.primary, t.isDark ? 0.2 : 0.12) }]}>
                    <Ionicons name="book" size={22} color={t.colors.primary} />
                </View>
                <Text style={[t.typography.heading, { color: t.colors.text, marginBottom: 6 }]}>
                    TenantPro
                </Text>
                <Text style={[t.typography.body, { color: t.colors.textMuted }]}>
                    Rental property management for landlords and PG owners — your buildings, the
                    rooms in them, who lives where, and what everyone owes. Every section below
                    explains one part of the app and how it connects to the rest.
                </Text>
            </GlassView>

            {renderGroup('MODULES', MODULES)}
            {renderGroup('USING THE APP', NAVIGATION)}

            <Text style={[t.typography.micro, styles.groupLabel, { color: t.colors.textFaint }]}>
                ON THE ROADMAP
            </Text>
            <GlassCard padding={18} radius={t.radii.xxl} style={styles.card}>
                <Text style={[t.typography.caption, { color: t.colors.textMuted, marginBottom: 12 }]}>
                    Not built yet — listed so this page never describes something that does not work.
                </Text>
                {ROADMAP.map((line, i) => (
                    <View key={i} style={styles.bulletRow}>
                        <View style={[styles.bullet, { backgroundColor: t.colors.textFaint }]} />
                        <Text style={[t.typography.body, styles.bulletText, { color: t.colors.textMuted }]}>
                            {line}
                        </Text>
                    </View>
                ))}
            </GlassCard>

            <View style={{ height: 130 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    scroll: { paddingHorizontal: 16, paddingTop: 4 },

    hero: { padding: 20, marginBottom: 22 },
    heroIcon: {
        width: 44, height: 44, borderRadius: 14,
        alignItems: 'center', justifyContent: 'center', marginBottom: 14
    },

    groupLabel: { textTransform: 'uppercase', marginBottom: 10, marginLeft: 4 },
    card: { marginBottom: 22 },

    section: { borderBottomWidth: 1 },
    sectionHead: { flexDirection: 'row', alignItems: 'center', padding: 10 },
    sectionIcon: {
        width: 34, height: 34, borderRadius: 11,
        alignItems: 'center', justifyContent: 'center', marginRight: 12
    },
    sectionTitleWrap: { flex: 1, marginRight: 8, gap: 2 },
    sectionBody: { paddingHorizontal: 12, paddingTop: 2, paddingBottom: 14 },
    para: { lineHeight: 21, marginBottom: 10 },

    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
    bullet: { width: 5, height: 5, borderRadius: 2.5, marginTop: 8, marginRight: 10 },
    bulletText: { flex: 1, lineHeight: 21 }
});
