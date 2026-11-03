import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { APP_VERSION_LABEL } from '../constants/app';

interface RoleSelectScreenProps {
  onSelectRole: (role: 'ADMIN' | 'WORKER') => void;
}

export const RoleSelectScreen: React.FC<RoleSelectScreenProps> = ({ onSelectRole }) => {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.content}>
        {/* Logo & Intro */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>⚡</Text>
          </View>
          <Text style={styles.title}>SMS Watchdog</Text>
          <Text style={styles.subtitle}>
            Multi-Device E-Commerce OTP & SMS Gateway
          </Text>
        </View>

        {/* Question */}
        <Text style={styles.question}>Select this device's role:</Text>

        {/* Option 1: Admin */}
        <TouchableOpacity
          style={styles.roleCard}
          onPress={() => onSelectRole('ADMIN')}
          activeOpacity={0.8}
        >
          <View style={[styles.roleIconBox, { backgroundColor: 'rgba(59, 130, 246, 0.15)' }]}>
            <Text style={styles.roleIcon}>👑</Text>
          </View>
          <View style={styles.roleTextBox}>
            <View style={styles.roleTitleRow}>
              <Text style={styles.roleTitle}>Admin / Co-Admin Device</Text>
              <Text style={styles.badge}>DASHBOARD</Text>
            </View>
            <Text style={styles.roleDesc}>
              Watch all incoming OTPs live, approve/reject worker phones, toggle keyword filters, and copy codes with 1 tap.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Option 2: Worker */}
        <TouchableOpacity
          style={styles.roleCard}
          onPress={() => onSelectRole('WORKER')}
          activeOpacity={0.8}
        >
          <View style={[styles.roleIconBox, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
            <Text style={styles.roleIcon}>📱</Text>
          </View>
          <View style={styles.roleTextBox}>
            <View style={styles.roleTitleRow}>
              <Text style={styles.roleTitle}>Worker SIM Phone</Text>
              <Text style={[styles.badge, { backgroundColor: Colors.success + '20', color: Colors.success, borderColor: Colors.success }]}>
                FORWARDER
              </Text>
            </View>
            <Text style={styles.roleDesc}>
              Installed on phones holding your seller account SIM cards. Runs 24/7 background service to send OTPs to Admin.
            </Text>
          </View>
        </TouchableOpacity>

        {/* Version Badge */}
        <Text style={styles.versionText}>{APP_VERSION_LABEL}</Text>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 32,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
  },
  question: {
    color: Colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 14,
  },
  roleCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: 'row',
    marginBottom: 16,
  },
  roleIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  roleIcon: {
    fontSize: 24,
  },
  roleTextBox: {
    flex: 1,
  },
  roleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  roleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
    flexShrink: 1,
  },
  badge: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: Colors.primary,
    overflow: 'hidden',
  },
  roleDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  versionText: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 24,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
