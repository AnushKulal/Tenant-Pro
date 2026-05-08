// File: mobile/src/components/BottomNav.js
import React from 'react';
import { View, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
import { Feather } from '@expo/vector-icons';

export default function BottomNav({ activeTab, setActiveTab }) {
    const theme = useColorScheme();
    const isDark = theme === 'dark';

    const NavItem = ({ name, icon }) => {
        const isActive = activeTab === name;
        const activeColor = '#6366F1'; 
        const inactiveColor = isDark ? '#7E859E' : '#94A3B8'; 

        return (
            <TouchableOpacity 
                style={styles.navItem} 
                onPress={() => setActiveTab(name)} 
                activeOpacity={0.7}
            >
                <View style={styles.iconContainer}>
                    <Feather 
                        name={icon} 
                        size={24} 
                        color={isActive ? activeColor : inactiveColor} 
                        style={{ transform: [{ scale: isActive ? 1.1 : 1 }] }} 
                    />
                </View>
                
                {isActive && <View style={styles.navIndicator} />}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.floatingNavContainer}>
            <View style={[styles.floatingNav, isDark ? styles.darkNav : styles.lightNav]}>
                {/* UPGRADED: New Order with Rooms replacing Profile */}
                <NavItem name="Home" icon="home" />
                <NavItem name="Rooms" icon="key" /> 
                <NavItem name="Properties" icon="grid" />
                <NavItem name="Tenants" icon="users" />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    floatingNavContainer: { position: 'absolute', bottom: 25, left: 20, right: 20, alignItems: 'center', zIndex: 50 },
    floatingNav: { 
        flexDirection: 'row', width: '100%', height: 75, borderRadius: 30, 
        justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 10,
        shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 15, 
    },
    lightNav: { backgroundColor: '#FFFFFF', shadowColor: '#64748B', borderWidth: 1, borderColor: 'rgba(0,0,0,0.05)' },
    darkNav: { backgroundColor: '#151A25', shadowColor: '#000', borderWidth: 1, borderColor: '#1E2638' },
    navItem: { alignItems: 'center', justifyContent: 'center', height: '100%', flex: 1 },
    iconContainer: { height: 30, justifyContent: 'center' },
    navIndicator: { 
        width: 20, height: 4, borderRadius: 2, backgroundColor: '#6366F1', 
        position: 'absolute', bottom: 12, shadowColor: '#6366F1', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.5, shadowRadius: 4,
    },
});