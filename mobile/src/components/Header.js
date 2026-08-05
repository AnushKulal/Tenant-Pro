// File: mobile/src/components/Header.js
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Image, Modal, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client, { SERVER_URL, mediaUrl } from '../api/client';
import Avatar from '../ui/Avatar';
import { GlassView } from '../ui';
import { useTheme, withAlpha } from '../theme';

// Reusable Smart Image for the Bottom Sheet List
const PropertyListImage = ({ imageUrl }) => {
    const t = useTheme();
    const [hasError, setHasError] = useState(false);
    const defaultImage = `${SERVER_URL}/uploads/property/default-property.jpg`;
    const imageSource = (imageUrl && !hasError) ? mediaUrl(imageUrl) : defaultImage;

    return (
        <Image
            source={{ uri: imageSource }}
            // Tinted placeholder so the row keeps its shape while the photo decodes.
            style={[styles.sheetPropImage, { backgroundColor: t.colors.surfaceHigh, borderColor: t.colors.border }]}
            onError={() => setHasError(true)}
        />
    );
};

export default function Header({
    userName,
    profilePic,
    isDark,
    // Tapping the avatar now means what it looks like it means: go to the
    // profile. It used to open the drawer, which is why the drawer was
    // undiscoverable — see HeaderMenu for the full reasoning.
    onProfilePress,
    // Opens the "more options" menu, which the screen owns.
    onMorePress,
    isMenuOpen = false,
    fadeAnim,
    currentRoute,
    selectedProperty,
    setSelectedProperty
}) {
    // `isDark` is still accepted for callers, but the theme context is the source
    // of truth (it also carries the user's manual override).
    const t = useTheme();
    const ringPulseAnim = useRef(new Animated.Value(1)).current;

    // --- NEW: Bottom Sheet States ---
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [properties, setProperties] = useState([]);
    const [isLoadingProps, setIsLoadingProps] = useState(false);

    // --- "More options" menu ---
    // The menu itself lives in the screen, not in here: it has to sit above the
    // tab bar and share a coordinate space with this header's layout box. See the
    // positioning note at the top of HeaderMenu. This component only reports the
    // press and reflects the open state.
    const menuPress = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(ringPulseAnim, { toValue: 1.08, duration: 1500, useNativeDriver: true }),
                Animated.timing(ringPulseAnim, { toValue: 1, duration: 1500, useNativeDriver: true })
            ])
        ).start();
    }, []);

    // Avatar renders initials on a gradient immediately and cross-fades the photo
    // in once it has decoded, so there is never an empty gap while it downloads.
    const renderAvatar = () => (
        <Avatar name={userName} uri={profilePic} size={40} radius={20} />
    );

    // --- NEW: Open Sheet and Fetch Properties ---
    const handleOpenPropertySelector = async () => {
        setIsSheetOpen(true);
        setIsLoadingProps(true);
        try {
            const token = await AsyncStorage.getItem('userToken');
            const response = await client.get('/properties', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setProperties(response.data.properties);
        } catch (error) {
            console.log("Failed to load properties for header", error);
        } finally {
            setIsLoadingProps(false);
        }
    };

    // --- NEW: Select Property and Save Context ---
    const handleSelectProperty = async (prop) => {
        const propData = prop ? { id: prop.id, name: prop.name } : { id: 'all', name: 'All Properties' };

        await AsyncStorage.setItem('selectedProperty', JSON.stringify(propData));
        setSelectedProperty(propData);
        setIsSheetOpen(false);
    };

    const getHeaderText = () => {
        switch(currentRoute) {
            case 'Home':
            case 'Dashboard': return "Ready to manage properties.";
            case 'Profile': return "Update your personal details.";
            case 'Settings': return "Manage your app preferences.";
            case 'HelpSupport': return "How can we help you today?";
            case 'Terms': return "Review our service terms.";
            case 'Properties': return "Manage your buildings and units.";
            case 'Tenants': return "View and manage your tenants.";
            case 'Transactions': return "Track rent and expenses.";
            case 'Rooms': return "Manage your individual units.";
            default: return "Ready to manage properties.";
        }
    };

    const getPageTitle = () => {
        switch(currentRoute) {
            case 'Home':
            case 'Dashboard': return `Hello, ${userName}`;
            case 'Profile': return "My Profile";
            case 'Settings': return "Settings";
            case 'HelpSupport': return "Help & Support";
            case 'Terms': return "Terms of Service";
            case 'Properties': return "My Properties";
            case 'Tenants': return "Manage Tenants";
            case 'Transactions': return "Transactions";
            case 'Rooms': return "Rooms & Units";
            default: return `Hello, ${userName}`;
        }
    };

    const activePropertyName = selectedProperty?.name || 'All Properties';

    return (
        <View style={styles.headerWrapper}>
            {/* Shadow lives on the wrapper: GlassView clips its children, so an
                inner shadow would be cut off by its overflow:hidden. */}
            <Animated.View style={[{ opacity: fadeAnim, borderRadius: t.radii.xxl }, t.shadows.md]}>
                <GlassView radius={t.radii.xxl} style={styles.bar}>
                    <View style={styles.headerContent}>

                        <View style={styles.textStack}>
                            {/* --- UPGRADED: Property Selector Button --- */}
                            <TouchableOpacity
                                style={[styles.switcherRow, { backgroundColor: t.colors.glassHighlight, borderColor: t.colors.borderStrong, borderRadius: t.radii.md }]}
                                activeOpacity={0.7}
                                onPress={handleOpenPropertySelector}
                                accessibilityRole="button"
                                accessibilityLabel={`Change property. Currently ${activePropertyName}`}
                            >
                                <Ionicons name="business" size={12} color={t.colors.primary} style={{ marginRight: 4 }} />
                                <Text style={[t.typography.micro, styles.locationText, { color: t.colors.primary }]} numberOfLines={1}>
                                    {activePropertyName}
                                </Text>
                                <Ionicons name="chevron-down" size={12} color={t.colors.primary} style={{ marginLeft: 4, marginTop: 1 }} />
                            </TouchableOpacity>

                            {/* Also single-line: "Hello, <name>" wraps at 360dp for
                                a longer first name, and a wrapped title grows the
                                bar just as a wrapped caption does. */}
                            <Text
                                style={[t.typography.subheading, styles.userName, { color: t.colors.text }]}
                                numberOfLines={1}
                            >
                                {getPageTitle()}
                            </Text>

                            {/* Single line on purpose: with three controls on the
                                right, this string wraps at 360dp and silently makes
                                the whole bar taller. Truncating keeps the header one
                                fixed height on every device. */}
                            <Text
                                style={[t.typography.caption, { color: t.colors.textMuted }]}
                                numberOfLines={1}
                            >
                                 {getHeaderText()}
                            </Text>
                        </View>

                        <View style={styles.rightActions}>
                            <TouchableOpacity
                                style={styles.notificationBtn}
                                activeOpacity={0.7}
                                accessibilityRole="button"
                                accessibilityLabel="Notifications"
                            >
                                <Ionicons name="notifications-outline" size={24} color={t.colors.text} />
                                {/* Ring matches the page background so the dot reads as detached. */}
                                <View style={[styles.badge, { backgroundColor: t.colors.danger, borderColor: t.colors.bg }]} />
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={onProfilePress}
                                activeOpacity={0.9}
                                accessibilityRole="button"
                                accessibilityLabel="Open my profile"
                            >
                                <Animated.View style={[styles.avatarRing, { borderColor: t.colors.borderStrong, transform: [{ scale: ringPulseAnim }] }]}>
                                    <View style={[styles.profileAvatar, { backgroundColor: t.colors.primary }, t.shadows.glow]}>
                                        {renderAvatar()}
                                    </View>
                                </Animated.View>
                            </TouchableOpacity>

                            {/* The overflow control. Rightmost, because that is where
                                every platform puts "more" — and labelled as such, so
                                nobody has to guess that a portrait hides the menu. */}
                            <View>
                                <Animated.View
                                    style={{
                                        transform: [{
                                            scale: menuPress.interpolate({
                                                inputRange: [0, 1],
                                                outputRange: [1, 0.9]
                                            })
                                        }]
                                    }}
                                >
                                    <TouchableOpacity
                                        onPress={() => onMorePress?.()}
                                        onPressIn={() => Animated.spring(menuPress, {
                                            toValue: 1, useNativeDriver: true, ...t.motion.spring
                                        }).start()}
                                        onPressOut={() => Animated.spring(menuPress, {
                                            toValue: 0, useNativeDriver: true, ...t.motion.spring
                                        }).start()}
                                        activeOpacity={1}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                        accessibilityRole="button"
                                        accessibilityLabel="More options"
                                        accessibilityState={{ expanded: isMenuOpen }}
                                        style={[
                                            styles.menuBtn,
                                            {
                                                borderColor: t.colors.borderStrong,
                                                backgroundColor: isMenuOpen
                                                    ? withAlpha(t.colors.primary, t.isDark ? 0.24 : 0.14)
                                                    : t.colors.glassHighlight
                                            }
                                        ]}
                                    >
                                        <Ionicons
                                            name="ellipsis-horizontal"
                                            size={20}
                                            color={isMenuOpen ? t.colors.primary : t.colors.text}
                                        />
                                    </TouchableOpacity>
                                </Animated.View>
                            </View>
                        </View>
                    </View>
                </GlassView>
            </Animated.View>

            {/* --- NEW: BOTTOM SHEET MODAL --- */}
            <Modal animationType="slide" transparent={true} visible={isSheetOpen} onRequestClose={() => setIsSheetOpen(false)}>
                <View style={styles.sheetOverlay}>
                    {/* Tap background to close */}
                    <TouchableOpacity
                        style={[styles.sheetBackdrop, { backgroundColor: t.colors.scrim }]}
                        activeOpacity={1}
                        onPress={() => setIsSheetOpen(false)}
                        accessibilityRole="button"
                        accessibilityLabel="Close property selector"
                    />

                    <GlassView
                        strong
                        radius={t.radii.xxl}
                        style={[styles.sheetContent, { paddingBottom: Platform.OS === 'ios' ? 34 : t.spacing.xxl }]}
                    >
                        {/* Grab handle — same affordance as the shared BottomSheet. */}
                        <View style={styles.handleZone}>
                            <View style={[styles.handle, { backgroundColor: t.colors.textFaint }]} />
                        </View>

                        <View style={styles.sheetHeader}>
                            <Text style={[t.typography.heading, { color: t.colors.text }]}>Select Property</Text>
                            <TouchableOpacity
                                onPress={() => setIsSheetOpen(false)}
                                style={[styles.closeBtn, { backgroundColor: t.colors.surfaceAlt }]}
                                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                                accessibilityRole="button"
                                accessibilityLabel="Close"
                            >
                                <Ionicons name="close" size={19} color={t.colors.textMuted} />
                            </TouchableOpacity>
                        </View>

                        {isLoadingProps ? (
                            <View style={{ paddingVertical: 40 }}>
                                <ActivityIndicator size="large" color={t.colors.primary} />
                            </View>
                        ) : (
                            <ScrollView showsVerticalScrollIndicator={false}>

                                {/* Option: ALL PROPERTIES */}
                                <TouchableOpacity
                                    style={[
                                        styles.sheetItem,
                                        { borderRadius: t.radii.lg, borderColor: 'transparent' },
                                        selectedProperty?.id === 'all' && { backgroundColor: t.colors.glassHighlight, borderColor: t.colors.borderStrong }
                                    ]}
                                    onPress={() => handleSelectProperty(null)}
                                    accessibilityRole="button"
                                    accessibilityLabel="All properties, global overview"
                                >
                                    <View style={[styles.allPropsIcon, { backgroundColor: t.colors.glassHighlight, borderColor: t.colors.border }]}>
                                        <Ionicons name="grid" size={20} color={t.colors.primary} />
                                    </View>
                                    <View style={styles.sheetItemTextContainer}>
                                        <Text style={[t.typography.bodyStrong, styles.sheetItemTitle, { color: t.colors.text }]}>All Properties</Text>
                                        <Text style={[t.typography.caption, { color: t.colors.textMuted }]}>Global Overview</Text>
                                    </View>
                                    {selectedProperty?.id === 'all' && <Ionicons name="checkmark-circle" size={24} color={t.colors.success} />}
                                </TouchableOpacity>

                                {/* Dynamic Property List */}
                                {properties.map((prop) => {
                                    const isSelected = selectedProperty?.id === prop.id;
                                    return (
                                        <TouchableOpacity
                                            key={prop.id}
                                            style={[
                                                styles.sheetItem,
                                                { borderRadius: t.radii.lg, borderColor: 'transparent' },
                                                isSelected && { backgroundColor: t.colors.glassHighlight, borderColor: t.colors.borderStrong }
                                            ]}
                                            onPress={() => handleSelectProperty(prop)}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Select ${prop.name}`}
                                        >
                                            <PropertyListImage imageUrl={prop.image_url} />

                                            <View style={styles.sheetItemTextContainer}>
                                                <Text style={[t.typography.bodyStrong, styles.sheetItemTitle, { color: t.colors.text }]} numberOfLines={1}>
                                                    {prop.name}
                                                </Text>
                                                <Text style={[t.typography.caption, { color: t.colors.textMuted }]} numberOfLines={1}>
                                                    {prop.locality}, {prop.city}
                                                </Text>
                                            </View>

                                            {isSelected && <Ionicons name="checkmark-circle" size={24} color={t.colors.success} />}
                                        </TouchableOpacity>
                                    );
                                })}

                                <View style={{ height: 40 }} />
                            </ScrollView>
                        )}
                    </GlassView>
                </View>
            </Modal>

        </View>
    );
}

const styles = StyleSheet.create({
    headerWrapper: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 12, zIndex: 10 },
    bar: { paddingHorizontal: 16, paddingVertical: 12 },
    headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    textStack: { justifyContent: 'center', flex: 1 },

    switcherRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, alignSelf: 'flex-start', paddingVertical: 5, paddingHorizontal: 12, borderWidth: 1 },
    locationText: { textTransform: 'uppercase', maxWidth: 150 },
    userName: { letterSpacing: -0.5, marginBottom: 4 },

    // 12, not 16: there are three controls here now, and at 360dp the extra 8dp
    // came straight out of the page title.
    rightActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    notificationBtn: { padding: 4, justifyContent: 'center', alignItems: 'center' },
    badge: { position: 'absolute', top: 4, right: 5, width: 9, height: 9, borderRadius: 4.5, borderWidth: 1.5 },

    menuBtn: {
        width: 38, height: 38, borderRadius: 19, borderWidth: 1,
        alignItems: 'center', justifyContent: 'center'
    },

    avatarRing: { padding: 3, borderRadius: 30, borderWidth: 1.5 },
    // Must stay 40x40 / r20 to match the <Avatar size={40} radius={20} /> inside.
    profileAvatar: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },

    // --- BOTTOM SHEET STYLES ---
    sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
    sheetBackdrop: { ...StyleSheet.absoluteFillObject },
    sheetContent: {
        width: '100%',
        borderBottomLeftRadius: 0,
        borderBottomRightRadius: 0,
        paddingHorizontal: 20,
        paddingTop: 6,
        maxHeight: '78%'
    },
    handleZone: { alignItems: 'center', paddingVertical: 8 },
    handle: { width: 44, height: 4.5, borderRadius: 3, opacity: 0.5 },

    sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 16, paddingHorizontal: 4 },
    closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },

    sheetItem: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 10, borderWidth: 1 },

    allPropsIcon: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
    sheetPropImage: { width: 44, height: 44, borderRadius: 12, borderWidth: 1 },

    sheetItemTextContainer: { flex: 1, marginLeft: 15 },
    sheetItemTitle: { marginBottom: 2 }
});
