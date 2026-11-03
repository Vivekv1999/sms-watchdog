import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { StorageService, ManagedDevice } from '../services/storage';
import { CloudSyncService } from '../services/cloudSync';

interface AdminDevicesScreenProps {
  onBack: () => void;
}

export const AdminDevicesScreen: React.FC<AdminDevicesScreenProps> = ({ onBack }) => {
  const [devices, setDevices] = useState<ManagedDevice[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [groupId, setGroupId] = useState('');

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    const gid = await StorageService.getGroupId();
    setGroupId(gid);
    const fb = await StorageService.getFirebaseConfig();

    const devList = await CloudSyncService.fetchGroupDevices(fb.projectId, fb.apiKey, gid);
    setDevices(devList);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDevices();
    setRefreshing(false);
  };

  const handleApprove = async (device: ManagedDevice) => {
    const fb = await StorageService.getFirebaseConfig();
    await CloudSyncService.updateDeviceStatus(
      fb.projectId,
      fb.apiKey,
      groupId,
      device.deviceId,
      'APPROVED'
    );
    await loadDevices();
    Alert.alert('Approved', `Device "${device.deviceName}" is now approved and active.`);
  };

  const handleReject = async (device: ManagedDevice) => {
    Alert.alert(
      'Block Device',
      `Reject and block "${device.deviceName}" (${device.deviceId})? It will not be able to connect or forward SMS.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block & Reject',
          style: 'destructive',
          onPress: async () => {
            const fb = await StorageService.getFirebaseConfig();
            await CloudSyncService.updateDeviceStatus(
              fb.projectId,
              fb.apiKey,
              groupId,
              device.deviceId,
              'BLOCKED'
            );
            await loadDevices();
          },
        },
      ]
    );
  };

  const handleRevoke = async (device: ManagedDevice) => {
    Alert.alert(
      'Revoke Device Access',
      `Revoke access for "${device.deviceName}"? Its background sync will be immediately terminated.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke Access',
          style: 'destructive',
          onPress: async () => {
            const fb = await StorageService.getFirebaseConfig();
            await CloudSyncService.updateDeviceStatus(
              fb.projectId,
              fb.apiKey,
              groupId,
              device.deviceId,
              'BLOCKED'
            );
            await StorageService.removeDevice(device.deviceId);
            await loadDevices();
          },
        },
      ]
    );
  };

  const handleTogglePause = async (device: ManagedDevice, paused: boolean) => {
    const fb = await StorageService.getFirebaseConfig();
    await CloudSyncService.setDeviceForwardingPaused(
      fb.projectId,
      fb.apiKey,
      groupId,
      device.deviceId,
      paused
    );
    await loadDevices();
  };

  const pendingDevices = devices.filter((d) => d.status === 'PENDING');
  const approvedDevices = devices.filter((d) => d.status === 'APPROVED');
  const blockedDevices = devices.filter((d) => d.status === 'BLOCKED');

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Connected Devices</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={[]}
        renderItem={() => null}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        ListHeaderComponent={
          <>
            {/* Security Info Card */}
            <View style={styles.securityBanner}>
              <Text style={styles.securityBannerIcon}>🛡️</Text>
              <View style={styles.securityBannerText}>
                <Text style={styles.securityBannerTitle}>APK Theft Protection Active</Text>
                <Text style={styles.securityBannerSub}>
                  Even if someone copies the APK file to their phone, they are locked until you explicitly approve them below.
                </Text>
              </View>
            </View>

            {/* Section 1: Pending Approvals */}
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>
                  PENDING APPROVALS ({pendingDevices.length})
                </Text>
              </View>

              {pendingDevices.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyCardText}>
                    No pending device requests. All worker phones are vetted.
                  </Text>
                </View>
              ) : (
                pendingDevices.map((dev) => (
                  <View key={dev.deviceId} style={styles.pendingCard}>
                    <View style={styles.deviceRow}>
                      <View style={styles.deviceIconCircle}>
                        <Text style={styles.deviceIconText}>📱</Text>
                      </View>
                      <View style={styles.deviceInfo}>
                        <Text style={styles.deviceName}>{dev.deviceName}</Text>
                        <Text style={styles.deviceSub}>
                          {dev.model} • ID: {dev.deviceId}
                        </Text>
                      </View>
                      <View style={styles.pendingBadge}>
                        <Text style={styles.pendingBadgeText}>PENDING</Text>
                      </View>
                    </View>

                    <View style={styles.actionRow}>
                      <TouchableOpacity
                        style={styles.approveBtn}
                        onPress={() => handleApprove(dev)}
                      >
                        <Text style={styles.approveBtnText}>✅ Approve Device</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.rejectBtn}
                        onPress={() => handleReject(dev)}
                      >
                        <Text style={styles.rejectBtnText}>❌ Block</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Section 2: Approved Active Devices */}
            <View style={[styles.section, { marginTop: 24 }]}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>
                  APPROVED WORKER PHONES ({approvedDevices.length})
                </Text>
              </View>

              {approvedDevices.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyCardText}>
                    No approved worker phones yet. Open the app on your SIM phone, choose "Worker SIM Phone", and enter code {groupId}.
                  </Text>
                </View>
              ) : (
                approvedDevices.map((dev) => (
                  <View key={dev.deviceId} style={styles.activeCard}>
                    <View style={styles.deviceRow}>
                      <View style={[styles.deviceIconCircle, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                        <Text style={styles.deviceIconText}>📱</Text>
                      </View>
                      <View style={styles.deviceInfo}>
                        <Text style={styles.deviceName}>{dev.deviceName}</Text>
                        <Text style={styles.deviceSub}>
                          {dev.model} • ID: {dev.deviceId}
                        </Text>
                      </View>
                      {dev.pausedForwarding ? (
                        <View style={styles.pausedBadge}>
                          <Text style={styles.pausedBadgeText}>PAUSED</Text>
                        </View>
                      ) : (
                        <View style={styles.activeBadge}>
                          <View style={styles.activeDot} />
                          <Text style={styles.activeBadgeText}>ACTIVE</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.cardFooter}>
                      <Text style={styles.lastPingText}>
                        {dev.pausedForwarding
                          ? 'Forwarding paused by Admin'
                          : 'Connected & listening for SMS'}
                      </Text>
                      <View style={styles.activeActionsRow}>
                        <TouchableOpacity
                          style={[styles.pauseBtn, dev.pausedForwarding ? styles.resumeBtn : null]}
                          onPress={() => handleTogglePause(dev, !dev.pausedForwarding)}
                        >
                          <Text style={[styles.pauseBtnText, dev.pausedForwarding ? styles.resumeBtnText : null]}>
                            {dev.pausedForwarding ? '▶ Resume' : '⏸ Pause'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.revokeBtn}
                          onPress={() => handleRevoke(dev)}
                        >
                          <Text style={styles.revokeBtnText}>Revoke</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </View>

            {/* Section 3: Blocked Devices */}
            {blockedDevices.length > 0 ? (
              <View style={[styles.section, { marginTop: 24 }]}>
                <Text style={styles.sectionTitle}>
                  BLOCKED DEVICES ({blockedDevices.length})
                </Text>
                {blockedDevices.map((dev) => (
                  <View key={dev.deviceId} style={styles.blockedCard}>
                    <Text style={styles.deviceName}>{dev.deviceName}</Text>
                    <Text style={styles.deviceSub}>
                      {dev.model} • ID: {dev.deviceId} (Blocked)
                    </Text>
                    <TouchableOpacity
                      style={styles.reApproveBtn}
                      onPress={() => handleApprove(dev)}
                    >
                      <Text style={styles.reApproveBtnText}>Unblock & Approve</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        }
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  backBtnText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  securityBanner: {
    flexDirection: 'row',
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    marginBottom: 20,
    alignItems: 'center',
  },
  securityBannerIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  securityBannerText: {
    flex: 1,
  },
  securityBannerTitle: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  securityBannerSub: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  section: {},
  sectionHeaderRow: {
    marginBottom: 10,
  },
  sectionTitle: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  emptyCardText: {
    color: Colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  pendingCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.warning,
    marginBottom: 10,
  },
  activeCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 10,
  },
  blockedCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.danger,
    marginBottom: 8,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deviceIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  deviceIconText: {
    fontSize: 20,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  deviceSub: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  pendingBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.warning,
  },
  pendingBadgeText: {
    color: Colors.warning,
    fontSize: 10,
    fontWeight: '800',
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
    marginRight: 4,
  },
  activeBadgeText: {
    color: Colors.success,
    fontSize: 10,
    fontWeight: '800',
  },
  pausedBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.danger,
  },
  pausedBadgeText: {
    color: Colors.danger,
    fontSize: 10,
    fontWeight: '800',
  },
  activeActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pauseBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: Colors.danger,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
  },
  resumeBtn: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderColor: Colors.success,
  },
  pauseBtnText: {
    color: Colors.danger,
    fontSize: 11,
    fontWeight: '700',
  },
  resumeBtnText: {
    color: Colors.success,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 10,
  },
  approveBtn: {
    flex: 1,
    backgroundColor: Colors.success,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  approveBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 12,
  },
  rejectBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: Colors.danger,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectBtnText: {
    color: Colors.danger,
    fontWeight: '700',
    fontSize: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 8,
  },
  lastPingText: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  revokeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  revokeBtnText: {
    color: Colors.danger,
    fontSize: 11,
    fontWeight: '600',
  },
  reApproveBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  reApproveBtnText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
});
