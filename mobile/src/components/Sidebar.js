// File: mobile/src/components/Sidebar.js
// Frosted slide-in drawer. The panel is a strong GlassView so the dimmed app
// shows through it; only transform/opacity animate, keeping both animations on
// the native driver.
import React, { useEffect, useRef, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    Dimensions,
    TouchableWithoutFeedback,
    ScrollView,
    Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { GlassView, Avatar } from '../ui';
import { useTheme, withAlpha } from '../theme';
import { signOut } from '../navigation/flow';

const { width } = Dimensions.get('window');
const PANEL_WIDTH = width * 0.70;
const CLOSED_X = -width * 0.75; // Overshoots the panel width so the shadow hides too.

export default function Sidebar({ isOpen, onClose, navigation, currentRoute = 'Dashboard', setActiveTab }) {
    const t = useTheme();
    const insets = useSafeAreaInsets();

    const [fullName, setFullName] = useState('Property Admin');
    const [email, setEmail] = useState('admin@tenantpro.com');
    const [profilePic, setProfilePic] = useState(null);

    const sidebarAnim = useRef(new Animated.Value(CLOSED_X)).current;
    const backdropOpacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const fetchUserData = async () => {
            try {
                const ownerData = await AsyncStorage.getItem('ownerData');
                if (ownerData) {
                    const parsedData = JSON.parse(ownerData);
                    setFullName(parsedData.name);
                    setEmail(parsedData.email);
                    setProfilePic(parsedData.profile_pic);
                }
            } catch (error) {
                console.log("Error loading user data", error);
            }
        };

        if (isOpen) fetchUserData();

        if (isOpen) {
            Animated.parallel([
                Animated.timing(sidebarAnim, { toValue: 0, duration: t.motion.normal, useNativeDriver: true }),
                Animated.timing(backdropOpacity, { toValue: 1, duration: t.motion.normal, useNativeDriver: true })
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(sidebarAnim, { toValue: CLOSED_X, duration: t.motion.normal, useNativeDriver: true }),
                Animated.timing(backdropOpacity, { toValue: 0, duration: t.motion.normal, useNativeDriver: true })
            ]).start();
        }
    }, [isOpen]);

    // signOut clears every session key AND resets the stack to RoleSelection.
    // The old replace('Login') left the authenticated screen underneath, so
    // Android back walked straight back into the app after logging out.
    const handleLogout = () => {
        Alert.alert(
            'Log out?',
            'You will need to sign in again to manage your properties.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Log Out',
                    style: 'destructive',
                    onPress: () => {
                        onClose();
                        signOut(navigation);
                    }
                }
            ]
        );
    };

    const navigateTo = (screenName) => {
        onClose();
        if (setActiveTab) {
            setActiveTab(screenName); // Instantly swap the middle content!
        } else if (navigation) {
            navigation.navigate(screenName);
        }
    };

    const SidebarItem = ({ icon, title, onPress, color, isActive }) => {
        const iconColor = color || (isActive ? t.colors.primary : t.colors.textMuted);
        const textColor = color || (isActive ? t.colors.primary : t.colors.text);

        return (
            <TouchableOpacity
                style={styles.sidebarItem}
                onPress={onPress}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={title}
                accessibilityState={{ selected: !!isActive }}
            >
                {/* Frosted pill behind the active row. blur is off: the panel is
                    already blurred, so a nested BlurView only costs GPU time. */}
                {isActive ? (
                    <GlassView
                        radius={t.radii.md}
                        blur={false}
                        sheen={false}
                        bordered={false}
                        tintColor={withAlpha(t.colors.primary, t.isDark ? 0.2 : 0.1)}
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                    />
                ) : null}
                {isActive ? (
                    <View style={[styles.activeIndicator, { backgroundColor: t.colors.primary }]} />
                ) : null}
                <View style={styles.sidebarIconBox}>
                    <Ionicons
                        name={isActive ? icon.replace('-outline', '') : icon}
                        size={22}
                        color={iconColor}
                    />
                </View>
                <Text
                    style={[
                        styles.sidebarItemText,
                        { color: textColor },
                        isActive && { fontWeight: '700' }
                    ]}
                >
                    {title}
                </Text>
            </TouchableOpacity>
        );
    };

    if (!isOpen && sidebarAnim._value === CLOSED_X) return null;

    return (
        <View style={styles.overlayContainer} pointerEvents={isOpen ? 'auto' : 'none'}>
            <TouchableWithoutFeedback
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close menu"
            >
                <Animated.View
                    style={[styles.backdrop, { backgroundColor: t.colors.scrim, opacity: backdropOpacity }]}
                />
            </TouchableWithoutFeedback>

            <Animated.View
                style={[
                    styles.sidebar,
                    t.shadows.lg,
                    { transform: [{ translateX: sidebarAnim }] }
                ]}
            >
                <GlassView
                    strong
                    radius={0}
                    bordered={false}
                    // Only the inner edge is rounded/ruled — the drawer is flush
                    // with the screen edge on the left.
                    style={[
                        styles.panel,
                        {
                            borderTopRightRadius: t.radii.xxl,
                            borderBottomRightRadius: t.radii.xxl,
                            borderRightWidth: 1,
                            borderRightColor: t.colors.glassBorder
                        }
                    ]}
                >
                    <LinearGradient
                        colors={t.colors.primaryGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[
                            styles.header,
                            {
                                paddingTop: insets.top + t.spacing.xl,
                                paddingHorizontal: t.spacing.xxl,
                                paddingBottom: t.spacing.xxxl,
                                borderBottomRightRadius: t.radii.xxl
                            }
                        ]}
                    >
                        <TouchableOpacity
                            style={[styles.closeButton, { top: insets.top + t.spacing.sm, right: t.spacing.xl }]}
                            onPress={onClose}
                            accessibilityRole="button"
                            accessibilityLabel="Close menu"
                        >
                            <Ionicons name="close" size={24} color={withAlpha(t.colors.onPrimary, 0.75)} />
                        </TouchableOpacity>

                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => navigateTo('Profile')}
                            style={{ marginTop: t.spacing.md }}
                            accessibilityRole="button"
                            accessibilityLabel={`Open profile for ${fullName}`}
                        >
                            <Avatar
                                name={fullName}
                                uri={profilePic}
                                size={70}
                                borderWidth={2}
                                style={[
                                    { marginBottom: t.spacing.lg },
                                    // Override Avatar's default rim: on the brand
                                    // gradient a light ring reads far better.
                                    { borderColor: withAlpha(t.colors.onPrimary, 0.6) }
                                ]}
                            />
                            <View style={styles.profileTextWrapper}>
                                <Text
                                    style={[styles.name, t.typography.title, { color: t.colors.onPrimary }]}
                                    numberOfLines={1}
                                >
                                    {fullName}
                                </Text>
                                <Text
                                    style={[t.typography.caption, { color: withAlpha(t.colors.onPrimary, 0.85) }]}
                                    numberOfLines={1}
                                >
                                    {email}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    </LinearGradient>

                    <ScrollView
                        style={[styles.menu, { paddingHorizontal: t.spacing.md }]}
                        contentContainerStyle={{ paddingTop: t.spacing.xxl, paddingBottom: t.spacing.xl }}
                        showsVerticalScrollIndicator={false}
                    >
                        <SidebarItem icon="home-outline" title="Dashboard" isActive={currentRoute === 'Home' || currentRoute === 'Dashboard'} onPress={() => navigateTo('Home')} />
                        <SidebarItem icon="person-outline" title="My Profile" isActive={currentRoute === 'Profile'} onPress={() => navigateTo('Profile')} />
                        <SidebarItem icon="business-outline" title="My Properties" isActive={currentRoute === 'Properties'} onPress={() => navigateTo('Properties')} />
                        <SidebarItem icon="people-outline" title="Manage Tenants" isActive={currentRoute === 'Tenants'} onPress={() => navigateTo('Tenants')} />
                        <SidebarItem icon="wallet-outline" title="Transactions" isActive={currentRoute === 'Transactions'} onPress={() => navigateTo('Transactions')} />

                        <SidebarItem icon="qr-code-outline" title="Payment Setup" isActive={currentRoute === 'PaymentSettings'} onPress={() => navigateTo('PaymentSettings')} />

                        <View
                            style={[
                                styles.divider,
                                { backgroundColor: t.colors.border, marginVertical: t.spacing.lg, marginHorizontal: t.spacing.lg }
                            ]}
                        />

                        <SidebarItem
                            icon="settings-outline"
                            title="Settings"
                            isActive={currentRoute === 'Settings'}
                            onPress={() => navigateTo('Settings')}
                        />
                        <SidebarItem
                            icon="help-buoy-outline"
                            title="Help & Support"
                            isActive={currentRoute === 'HelpSupport'}
                            onPress={() => navigateTo('HelpSupport')}
                        />
                    </ScrollView>

                    {/* Footer stays locked to the bottom, above the home indicator. */}
                    <View
                        style={[
                            styles.footer,
                            {
                                paddingHorizontal: t.spacing.md,
                                paddingBottom: insets.bottom + t.spacing.xl,
                                borderTopWidth: 1,
                                borderTopColor: t.colors.border,
                                paddingTop: t.spacing.md
                            }
                        ]}
                    >
                        <SidebarItem icon="log-out-outline" title="Log Out" color={t.colors.danger} onPress={handleLogout} />
                        <Text style={[styles.versionText, t.typography.micro, { color: t.colors.textFaint }]}>
                            TenantPro v1.0
                        </Text>
                    </View>
                </GlassView>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    overlayContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 },
    backdrop: { flex: 1 },

    sidebar: { position: 'absolute', top: 0, bottom: 0, left: 0, width: PANEL_WIDTH },
    panel: { flex: 1 },

    header: { overflow: 'hidden' },
    closeButton: { position: 'absolute', padding: 5, zIndex: 10 },

    profileTextWrapper: { paddingRight: 10 },
    name: { marginBottom: 4 },

    menu: { flex: 1 },

    sidebarItem: {
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 14, paddingHorizontal: 12,
        marginBottom: 6, borderRadius: 12,
        overflow: 'hidden'
    },
    activeIndicator: {
        position: 'absolute', left: 0, top: '25%', bottom: '25%',
        width: 4, borderTopRightRadius: 4, borderBottomRightRadius: 4
    },
    sidebarIconBox: { width: 34, alignItems: 'center' },
    sidebarItemText: { fontSize: 15, fontWeight: '600', marginLeft: 8, letterSpacing: 0.2 },

    divider: { height: 1 },

    footer: {},
    versionText: { textAlign: 'center' }
});
