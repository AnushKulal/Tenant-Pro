// File: mobile/src/screens/TenantHomeScreen.js
// The tenant portal. A logged-in tenant's home: what they owe and when, how to
// pay it, where they live, their payment history, and a way to raise maintenance
// requests — all fetched from /tenant-portal, scoped by the server to their own
// tenancy.
//
// It degrades honestly. Until a landlord links the account to a unit the server
// returns { linked: false }, and the portal shows a clear "ask your landlord to
// link you" state instead of empty cards pretending to hold data.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    View, Text, Animated, ScrollView, StyleSheet, RefreshControl,
    Pressable, Linking, Alert, ActivityIndicator, Platform, ToastAndroid
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Screen, GlassCard, GlassView, GlassButton, GlassInput, BottomSheet, Avatar, SegmentedTabs } from '../ui';
import { useTheme, withAlpha } from '../theme';
import { signOut } from '../navigation/flow';
import client from '../api/client';

const money = (n) => {
    const v = Number(n || 0);
    if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
    if (v >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
    return `₹${v.toLocaleString('en-IN')}`;
};
const moneyFull = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const shortDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const REQUEST_CATEGORIES = ['Plumbing', 'Electrical', 'Appliance', 'Cleaning', 'General'];

// The due state, expressed once so the hero card and its chip always agree.
const dueCopy = (rent, t) => {
    const days = rent?.days_until_due;
    if (rent?.state === 'overdue') {
        return { chip: `Overdue by ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'}`, tone: t.colors.danger, urgent: true };
    }
    if (rent?.state === 'due_today') return { chip: 'Due today', tone: t.colors.warning, urgent: true };
    if (rent?.state === 'upcoming') return { chip: `Due in ${days} day${days === 1 ? '' : 's'}`, tone: t.colors.success, urgent: false };
    return { chip: 'No dues on file', tone: t.colors.textMuted, urgent: false };
};

export default function TenantHomeScreen({ navigation }) {
    const t = useTheme();

    const [data, setData] = useState(null);        // /me payload
    const [payments, setPayments] = useState([]);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');

    const [payOpen, setPayOpen] = useState(false);
    const [reqOpen, setReqOpen] = useState(false);

    const header = useRef(new Animated.Value(0)).current;

    const authGet = useCallback(async (path) => {
        const token = await AsyncStorage.getItem('tenantToken');
        return client.get(path, { headers: { Authorization: `Bearer ${token}` } });
    }, []);

    const load = useCallback(async () => {
        try {
            setError('');
            const [me, pay, req] = await Promise.all([
                authGet('/tenant-portal/me'),
                authGet('/tenant-portal/payments'),
                authGet('/tenant-portal/requests')
            ]);
            setData(me.data);
            setPayments(pay.data.payments || []);
            setRequests(req.data.requests || []);
        } catch (e) {
            setError('Could not load your portal. Pull down to retry.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [authGet]);

    useEffect(() => {
        load();
        Animated.timing(header, { toValue: 1, duration: t.motion.entrance, useNativeDriver: true }).start();
    }, [load, header, t.motion.entrance]);

    const onRefresh = () => { setRefreshing(true); load(); };

    const handleLogout = () => {
        Alert.alert('Log out?', 'You will need to sign in again.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log Out', style: 'destructive', onPress: () => signOut(navigation) }
        ]);
    };

    const headerStyle = {
        opacity: header,
        transform: [{ translateY: header.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }]
    };

    if (loading) {
        return (
            <Screen center>
                <ActivityIndicator size="large" color={t.colors.primary} />
            </Screen>
        );
    }

    const linked = data?.linked;
    const profile = data?.profile;
    const home = data?.home;
    const rent = data?.rent;
    const landlord = data?.landlord;
    const payment = data?.payment;
    const due = dueCopy(rent, t);

    const openUpiApp = async () => {
        const pa = payment?.upi_id;
        if (!pa) {
            Alert.alert('No UPI ID', 'Your landlord has not set a UPI ID yet. Please contact them.');
            return;
        }
        // Built by hand rather than with URLSearchParams: RN's URLSearchParams
        // encodes spaces as "+", which UPI apps mis-read in the payee name — a deep
        // link needs %20. encodeURIComponent gives that.
        const q = [
            ['pa', pa],
            ['pn', landlord?.name || 'Landlord'],
            ['cu', 'INR'],
            ['tn', 'Rent payment'],
            ...(rent?.amount ? [['am', String(Number(rent.amount))]] : [])
        ].map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
        const url = `upi://pay?${q}`;
        try {
            const ok = await Linking.canOpenURL(url);
            if (!ok) throw new Error('no-upi');
            await Linking.openURL(url);
        } catch {
            Alert.alert('No UPI app found', `Pay to UPI ID:\n${pa}${payment?.upi_number ? `\nor number: ${payment.upi_number}` : ''}`);
        }
    };

    const copy = (label, value) => {
        // No clipboard dependency is bundled; surface the value so it can be read.
        if (Platform.OS === 'android') ToastAndroid.show(`${label}: ${value}`, ToastAndroid.LONG);
        else Alert.alert(label, value);
    };

    const callLandlord = () => {
        if (landlord?.phone) Linking.openURL(`tel:${landlord.phone}`).catch(() => {});
    };

    return (
        <Screen scroll edges={['top']}>
            <ScrollView
                contentContainerStyle={styles.scroll}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} />}
            >
                <Animated.View style={[styles.header, headerStyle]}>
                    <View style={styles.headerLeft}>
                        <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Welcome back</Text>
                        <Text style={[t.typography.title, { color: t.colors.text }]} numberOfLines={1}>
                            {(profile?.name || data?.account?.name || 'Tenant').split(' ')[0]}
                        </Text>
                    </View>
                    <View style={styles.headerActions}>
                        <Avatar name={profile?.name || data?.account?.name} uri={profile?.image_url} size={44} radius={22} />
                        <Pressable onPress={handleLogout} hitSlop={8} style={[styles.iconBtn, { backgroundColor: t.colors.glassHighlight, borderColor: t.colors.borderStrong }]} accessibilityRole="button" accessibilityLabel="Log out">
                            <Ionicons name="log-out-outline" size={20} color={t.colors.text} />
                        </Pressable>
                    </View>
                </Animated.View>

                {error ? (
                    <GlassView radius={t.radii.md} sheen={false} tintColor={withAlpha(t.colors.danger, 0.14)} style={[styles.banner, { borderColor: withAlpha(t.colors.danger, 0.4) }]}>
                        <Ionicons name="alert-circle" size={18} color={t.colors.danger} />
                        <Text style={[t.typography.caption, { color: t.colors.danger, marginLeft: 8, flex: 1 }]}>{error}</Text>
                    </GlassView>
                ) : null}

                {!linked ? (
                    <GlassCard padding={24} style={styles.card}>
                        <View style={[styles.centerIcon, { backgroundColor: withAlpha(t.colors.primary, 0.14) }]}>
                            <Ionicons name="link-outline" size={30} color={t.colors.primary} />
                        </View>
                        <Text style={[t.typography.heading, { color: t.colors.text, textAlign: 'center', marginTop: 14 }]}>Almost there</Text>
                        <Text style={[t.typography.body, { color: t.colors.textMuted, textAlign: 'center', marginTop: 8, lineHeight: 21 }]}>
                            Your account isn't linked to a unit yet. Ask your landlord to add you as a tenant using this email, and your rent, payments and home details will appear here.
                        </Text>
                    </GlassCard>
                ) : (
                    <>
                        <Animated.View style={headerStyle}>
                            <View style={[styles.heroWrap, t.shadows.lg]}>
                                <LinearGradient colors={t.colors.primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { borderRadius: t.radii.xxl }]}>
                                    <View style={styles.heroTop}>
                                        <Text style={[t.typography.caption, { color: withAlpha(t.colors.onPrimary, 0.85) }]}>Rent {due.urgent ? 'due' : 'amount'}</Text>
                                        <View style={[styles.chip, { backgroundColor: withAlpha('#000', 0.22) }]}>
                                            <View style={[styles.dot, { backgroundColor: due.urgent ? t.colors.warning : t.colors.onPrimary }]} />
                                            <Text style={[t.typography.micro, { color: t.colors.onPrimary }]}>{due.chip}</Text>
                                        </View>
                                    </View>
                                    <Text style={[styles.heroAmount, { color: t.colors.onPrimary }]}>{moneyFull(rent?.amount)}</Text>
                                    <Text style={[t.typography.caption, { color: withAlpha(t.colors.onPrimary, 0.85), marginTop: 2 }]}>
                                        {rent?.next_due ? `Next due ${shortDate(rent.next_due)}` : 'No due date set'}
                                    </Text>
                                    {/* Custom pill, not GlassButton: the primary
                                        variant paints its own gradient, which would be
                                        purple-on-purple here. A solid light pill with
                                        brand-coloured text stands out on the hero. */}
                                    <Pressable
                                        onPress={() => setPayOpen(true)}
                                        style={({ pressed }) => [styles.heroCta, { backgroundColor: t.colors.onPrimary, opacity: pressed ? 0.85 : 1 }]}
                                        accessibilityRole="button"
                                        accessibilityLabel="Pay rent"
                                    >
                                        <Text style={[t.typography.bodyStrong, { color: t.colors.primaryDeep }]}>Pay Rent</Text>
                                        <Ionicons name="arrow-forward" size={18} color={t.colors.primaryDeep} style={{ marginLeft: 6 }} />
                                    </Pressable>
                                </LinearGradient>
                            </View>
                        </Animated.View>

                        <GlassCard padding={18} style={styles.card}>
                            <SectionTitle icon="home-outline" title="My Home" />
                            <View style={styles.homeRow}>
                                <View style={[styles.homeThumb, { backgroundColor: t.colors.surfaceHigh, borderColor: t.colors.border }]}>
                                    {home?.property_image ? (
                                        <Avatar name={home.property_name} uri={home.property_image} size={56} radius={12} />
                                    ) : (
                                        <Ionicons name="business" size={24} color={t.colors.primary} />
                                    )}
                                </View>
                                <View style={{ flex: 1, marginLeft: 14 }}>
                                    <Text style={[t.typography.bodyStrong, { color: t.colors.text }]} numberOfLines={1}>{home?.property_name || 'Property'}</Text>
                                    <Text style={[t.typography.caption, { color: t.colors.textMuted }]} numberOfLines={1}>Unit {home?.unit_number} · {home?.room_type}</Text>
                                    <Text style={[t.typography.caption, { color: t.colors.textFaint, marginTop: 2 }]} numberOfLines={1}>{[home?.locality, home?.city].filter(Boolean).join(', ')}</Text>
                                </View>
                            </View>
                            <View style={[styles.statRow, { borderTopColor: t.colors.border }]}>
                                <Stat label="Deposit" value={money(home?.deposit)} />
                                <Stat label="Move-in" value={profile?.move_in_date ? shortDate(profile.move_in_date) : '—'} />
                                <Stat label="Billing" value={profile?.billing_cycle || '—'} />
                            </View>
                        </GlassCard>

                        <GlassCard padding={18} style={styles.card}>
                            <SectionTitle icon="receipt-outline" title="Payment history" />
                            {payments.length === 0 ? (
                                <Text style={[t.typography.caption, { color: t.colors.textMuted, paddingVertical: 8 }]}>No payments recorded yet.</Text>
                            ) : payments.slice(0, 5).map((p, i) => (
                                <View key={p.id} style={[styles.payRow, i !== Math.min(payments.length, 5) - 1 && { borderBottomWidth: 1, borderBottomColor: t.colors.border }]}>
                                    <View style={[styles.payIcon, { backgroundColor: withAlpha(t.colors.success, 0.15) }]}>
                                        <Ionicons name="checkmark" size={15} color={t.colors.success} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[t.typography.bodyStrong, { color: t.colors.text }]}>{moneyFull(p.amount_paid)}</Text>
                                        <Text style={[t.typography.micro, { color: t.colors.textMuted }]}>{p.payment_method} · {shortDate(p.payment_date)}</Text>
                                    </View>
                                    <Text style={[t.typography.micro, { color: t.colors.success }]}>PAID</Text>
                                </View>
                            ))}
                        </GlassCard>

                        <GlassCard padding={18} style={styles.card}>
                            <View style={styles.reqHead}>
                                <SectionTitle icon="construct-outline" title="Requests" noMargin />
                                <Pressable onPress={() => setReqOpen(true)} style={[styles.newReqBtn, { backgroundColor: withAlpha(t.colors.primary, 0.14) }]} accessibilityRole="button" accessibilityLabel="Raise a request">
                                    <Ionicons name="add" size={16} color={t.colors.primary} />
                                    <Text style={[t.typography.micro, { color: t.colors.primary, marginLeft: 2 }]}>NEW</Text>
                                </Pressable>
                            </View>
                            {requests.length === 0 ? (
                                <Text style={[t.typography.caption, { color: t.colors.textMuted, paddingVertical: 8 }]}>No requests yet. Tap NEW to report a maintenance issue.</Text>
                            ) : requests.slice(0, 4).map((r) => (
                                <View key={r.id} style={styles.reqRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[t.typography.bodyStrong, { color: t.colors.text }]} numberOfLines={1}>{r.title}</Text>
                                        <Text style={[t.typography.micro, { color: t.colors.textMuted }]}>{r.category} · {shortDate(r.created_at)}</Text>
                                    </View>
                                    <StatusChip status={r.status} />
                                </View>
                            ))}
                        </GlassCard>

                        <GlassCard padding={18} style={styles.card}>
                            <SectionTitle icon="call-outline" title="Your landlord" />
                            <View style={styles.homeRow}>
                                <Avatar name={landlord?.name} size={44} radius={22} />
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={[t.typography.bodyStrong, { color: t.colors.text }]} numberOfLines={1}>{landlord?.name || 'Landlord'}</Text>
                                    <Text style={[t.typography.caption, { color: t.colors.textMuted }]} numberOfLines={1}>{landlord?.phone || 'No number on file'}</Text>
                                </View>
                                {landlord?.phone ? (
                                    <Pressable onPress={callLandlord} style={[styles.callBtn, { backgroundColor: withAlpha(t.colors.success, 0.16) }]} accessibilityRole="button" accessibilityLabel="Call landlord">
                                        <Ionicons name="call" size={18} color={t.colors.success} />
                                    </Pressable>
                                ) : null}
                            </View>
                        </GlassCard>
                    </>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>

            <BottomSheet visible={payOpen} onClose={() => setPayOpen(false)} title="Pay your rent" subtitle="Pay directly to your landlord via UPI">
                <View style={{ paddingBottom: 8 }}>
                    <View style={[styles.payAmount, { backgroundColor: withAlpha(t.colors.primary, 0.1), borderColor: withAlpha(t.colors.primary, 0.25) }]}>
                        <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Amount due</Text>
                        <Text style={[t.typography.display, { color: t.colors.primary }]}>{moneyFull(rent?.amount)}</Text>
                    </View>

                    {payment?.qr_code_url ? (
                        <View style={styles.qrWrap}>
                            <Avatar name="QR" uri={payment.qr_code_url} size={180} radius={16} />
                        </View>
                    ) : null}

                    <PayField label="UPI ID" value={payment?.upi_id} onCopy={() => copy('UPI ID', payment?.upi_id)} t={t} />
                    <PayField label="UPI number" value={payment?.upi_number} onCopy={() => copy('UPI number', payment?.upi_number)} t={t} />

                    <GlassButton label="Open UPI app" icon="phone-portrait-outline" onPress={openUpiApp} style={{ marginTop: 16 }} />
                    <Text style={[t.typography.micro, { color: t.colors.textFaint, textAlign: 'center', marginTop: 12, lineHeight: 17 }]}>
                        After paying, your landlord confirms and records it. It will then appear in your payment history.
                    </Text>
                </View>
            </BottomSheet>

            <RequestSheet
                visible={reqOpen}
                onClose={() => setReqOpen(false)}
                onCreated={(r) => { setRequests((prev) => [r, ...prev]); setReqOpen(false); }}
                authPost={async (body) => {
                    const token = await AsyncStorage.getItem('tenantToken');
                    return client.post('/tenant-portal/requests', body, { headers: { Authorization: `Bearer ${token}` } });
                }}
                t={t}
            />
        </Screen>
    );
}

// --- Small pieces -------------------------------------------------------------
function SectionTitle({ icon, title, noMargin }) {
    const t = useTheme();
    return (
        <View style={[styles.sectionTitle, !noMargin && { marginBottom: 12 }]}>
            <Ionicons name={icon} size={16} color={t.colors.primary} />
            <Text style={[t.typography.bodyStrong, { color: t.colors.text, marginLeft: 8 }]}>{title}</Text>
        </View>
    );
}

function Stat({ label, value }) {
    const t = useTheme();
    return (
        <View style={styles.stat}>
            <Text style={[t.typography.bodyStrong, { color: t.colors.text }]} numberOfLines={1}>{value}</Text>
            <Text style={[t.typography.micro, { color: t.colors.textMuted, marginTop: 2 }]}>{label.toUpperCase()}</Text>
        </View>
    );
}

function StatusChip({ status }) {
    const t = useTheme();
    const tone = status === 'Resolved' || status === 'Closed' ? t.colors.success
        : status === 'In Progress' ? t.colors.warning : t.colors.info;
    return (
        <View style={[styles.statusChip, { backgroundColor: withAlpha(tone, 0.16) }]}>
            <Text style={[t.typography.micro, { color: tone }]}>{String(status || 'Open').toUpperCase()}</Text>
        </View>
    );
}

function PayField({ label, value, onCopy, t }) {
    if (!value) return null;
    return (
        <View style={[styles.payField, { borderColor: t.colors.border }]}>
            <View style={{ flex: 1 }}>
                <Text style={[t.typography.micro, { color: t.colors.textMuted }]}>{label.toUpperCase()}</Text>
                <Text style={[t.typography.bodyStrong, { color: t.colors.text }]} numberOfLines={1}>{value}</Text>
            </View>
            <Pressable onPress={onCopy} hitSlop={8} style={[styles.copyBtn, { backgroundColor: withAlpha(t.colors.primary, 0.14) }]} accessibilityRole="button" accessibilityLabel={`Show ${label}`}>
                <Ionicons name="copy-outline" size={16} color={t.colors.primary} />
            </Pressable>
        </View>
    );
}

function RequestSheet({ visible, onClose, onCreated, authPost, t }) {
    const [category, setCategory] = useState('Plumbing');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState('Medium');
    const [submitting, setSubmitting] = useState(false);
    const [err, setErr] = useState('');

    const reset = () => { setTitle(''); setDescription(''); setPriority('Medium'); setCategory('Plumbing'); setErr(''); };

    const submit = async () => {
        setErr('');
        if (!title.trim()) { setErr('Please add a short title.'); return; }
        setSubmitting(true);
        try {
            const res = await authPost({ title: title.trim(), description: description.trim(), category, priority });
            onCreated(res.data.request);
            reset();
        } catch (e) {
            setErr(e.response?.data?.message || 'Could not submit. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <BottomSheet visible={visible} onClose={onClose} title="Raise a request" subtitle="Report a maintenance issue to your landlord">
            <View style={{ paddingBottom: 8 }}>
                {err ? <Text style={[t.typography.caption, { color: t.colors.danger, marginBottom: 10 }]}>{err}</Text> : null}

                <Text style={[t.typography.micro, styles.fieldLabel, { color: t.colors.textMuted }]}>CATEGORY</Text>
                <View style={styles.chipsRow}>
                    {REQUEST_CATEGORIES.map((c) => {
                        const on = c === category;
                        return (
                            <Pressable key={c} onPress={() => setCategory(c)} style={[styles.catChip, { borderColor: on ? t.colors.primary : t.colors.border, backgroundColor: on ? withAlpha(t.colors.primary, 0.16) : 'transparent' }]}>
                                <Text style={[t.typography.caption, { color: on ? t.colors.primary : t.colors.textMuted }]}>{c}</Text>
                            </Pressable>
                        );
                    })}
                </View>

                <GlassInput value={title} onChangeText={setTitle} placeholder="Title (e.g. Leaking tap)" icon="pencil-outline" editable={!submitting} style={{ marginTop: 14 }} />
                <GlassInput value={description} onChangeText={setDescription} placeholder="Describe the issue (optional)" icon="document-text-outline" multiline editable={!submitting} style={{ marginTop: 12 }} />

                <Text style={[t.typography.micro, styles.fieldLabel, { color: t.colors.textMuted, marginTop: 14 }]}>PRIORITY</Text>
                <SegmentedTabs
                    options={[{ label: 'Low', value: 'Low' }, { label: 'Medium', value: 'Medium' }, { label: 'High', value: 'High' }]}
                    value={priority}
                    onChange={setPriority}
                />

                <GlassButton label="Submit request" loading={submitting} loadingLabel="Submitting…" onPress={submit} style={{ marginTop: 18 }} />
            </View>
        </BottomSheet>
    );
}

const styles = StyleSheet.create({
    scroll: { paddingHorizontal: 16, paddingTop: 4 },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
    headerLeft: { flex: 1 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

    banner: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 14 },

    card: { marginBottom: 14 },
    centerIcon: { width: 60, height: 60, borderRadius: 20, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },

    heroWrap: { marginBottom: 14 },
    hero: { padding: 22, overflow: 'hidden' },
    heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heroAmount: { fontSize: 40, fontWeight: '900', letterSpacing: -1, marginTop: 10 },
    heroCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999, marginTop: 18 },
    chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },

    sectionTitle: { flexDirection: 'row', alignItems: 'center' },

    homeRow: { flexDirection: 'row', alignItems: 'center' },
    homeThumb: { width: 56, height: 56, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    statRow: { flexDirection: 'row', marginTop: 16, paddingTop: 14, borderTopWidth: 1 },
    stat: { flex: 1 },

    payRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
    payIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 12 },

    reqHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    newReqBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
    reqRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
    statusChip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },

    callBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

    payAmount: { alignItems: 'center', paddingVertical: 18, borderRadius: 18, borderWidth: 1, marginBottom: 16 },
    qrWrap: { alignItems: 'center', marginBottom: 16 },
    payField: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 10 },
    copyBtn: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

    fieldLabel: { letterSpacing: 0.6, marginBottom: 8 },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    catChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 }
});
