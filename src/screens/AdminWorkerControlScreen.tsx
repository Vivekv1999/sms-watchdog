import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  StatusBar,
  Switch,
  RefreshControl,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { StorageService, ManagedDevice } from '../services/storage';
import { CloudSyncService } from '../services/cloudSync';

interface AdminWorkerControlScreenProps {
  onBack: () => void;
}

export const AdminWorkerControlScreen: React.FC<AdminWorkerControlScreenProps> = ({ onBack }) => {
  const [devices, setDevices] = useState<ManagedDevice[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState('');

  useEffect(() => {
    loadDevices();
  }, []);

  const loadDevices = async () => {
    const gid = await StorageService.getGroupId();
    setGroupId(gid);
    const fb = await StorageService.getFirebaseConfig();
    const devList = await CloudSyncService.fetchGroupDevices(fb.projectId, fb.apiKey, gid);
    // Only show approved devices here
    setDevices(devList.filter((d) => d.status === 'APPROVED'));
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDevices();
    setRefreshing(false);
  };

  const handleTogglePause = async (device: ManagedDevice, paused: boolean) => {
    setTogglingId(device.deviceId);
    try {
      const fb = await StorageService.getFirebaseConfig();
      const ok = await CloudSyncService.setDeviceForwardingPaused(
        fb.projectId,
        fb.apiKey,
        groupId,
        device.deviceId,
        paused
      );

      if (ok) {
        // Optimistic update
        setDevices((prev) =>
          prev.map((d) =>
            d.deviceId === device.deviceId ? { ...d, pausedForwarding: paused } : d
          )
        );
      } else {
        Alert.alert('Error', 'Could not update device. Check your connection and try again.');
      }
    } catch {
      Alert.alert('Error', 'Something went wrong. Try again.');
    } finally {
      setTogglingId(null);
    }
  };

  const handlePauseAll = () => {
    const active = devices.filter((d) => !d.pausedForwarding);
    if (active.length === 0) {
      Alert.alert('All Paused', 'All worker devices are already paused.');
      return;
    }
    Alert.alert(
      'Pause All Workers',
      `Stop SMS forwarding on all ${active.length} active worker device(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Pause All',
          style: 'destructive',
          onPress: async () => {
            const fb = await StorageService.getFirebaseConfig();
            await Promise.all(
              active.map((d) =>
                CloudSyncService.setDeviceForwardingPaused(
                  fb.projectId, fb.apiKey, groupId, d.deviceId, true
                )
              )
            );
            await loadDevices();
          },
        },
      ]
    );
  };

  const handleResumeAll = () => {
    const paused = devices.filter((d) => d.pausedForwarding);
    if (paused.length === 0) {
      Alert.alert('All Active', 'All worker devices are already forwarding.');
      return;
    }
    Alert.alert(
      'Resume All Workers',
      `Resume SMS forwarding on all ${paused.length} paused device(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Resume All',
          onPress: async () => {
            const fb = await StorageService.getFirebaseConfig();
            await Promise.all(
              paused.map((d) =>
                CloudSyncService.setDeviceForwardingPaused(
                  fb.projectId, fb.apiKey, groupId, d.deviceId, false
                )
              )
            );
            await loadDevices();
          },
        },
      ]
    );
  };

  const activeCount = devices.filter((d) => !d.pausedForwarding).length;
  const pausedCount = devices.filter((d) => d.pausedForwarding).length;

  const renderDevice = useCallback(
    ({ item }: { item: ManagedDevice }) => {
      const isPaused = item.pausedForwarding === true;
      const isToggling = togglingId === item.deviceId;

      return (
        <View style={[styles.deviceCard, isPaused ? styles.deviceCardPaused : null]}>
          {/* Left: icon + info */}
          <View style={[styles.deviceIconCircle, isPaused ? styles.deviceIconCirclePaused : null]}>
            <Text style={styles.deviceIconText}>{isPaused ? '⏸️' : '📱'}</Text>
          </View>

          <View style={styles.deviceInfo}>
            <Text style={styles.deviceName} numberOfLines={1}>
              {item.deviceName}
            </Text>
            <Text style={styles.deviceSub} numberOfLines={1}>
              {item.model}
            </Text>
            <View style={[styles.statusPill, isPaused ? styles.statusPillPaused : styles.statusPillActive]}>
              <View style={[styles.statusDot, isPaused ? styles.statusDotPaused : styles.statusDotActive]} />
              <Text style={[styles.statusPillText, isPaused ? styles.statusPillTextPaused : styles.statusPillTextActive]}>
                {isPaused ? 'PAUSED' : 'FORWARDING'}
              </Text>
            </View>
          </View>

          {/* Right: switch */}
          <View style={styles.switchCol}>
            {isToggling ? (
              <ActivityIndicator size="small" color={Colors.primary} />
            ) : (
              <Switch
                value={!isPaused}
                onValueChange={(val) => handleTogglePause(item, !val)}
                trackColor={{ false: Colors.dangerGlow, true: Colors.successGlow }}
                thumbColor={isPaused ? Colors.danger : Colors.success}
              />
            )}
            <Text style={[styles.switchLabel, isPaused ? styles.switchLabelPaused : styles.switchLabelActive]}>
              {isPaused ? 'Paused' : 'Active'}
            </Text>
          </View>
        </View>
      );
    },
    [togglingId, groupId]
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Worker Controls</Text>
        <View style={{ width: 56 }} />
      </View>

      <FlatList
        data={devices}
        keyExtractor={(item) => item.deviceId}
        renderItem={renderDevice}
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
            {/* Summary card */}
            <View style={styles.summaryCard}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryCount}>{devices.length}</Text>
                <Text style={styles.summaryLabel}>Total Workers</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: Colors.success }]}>{activeCount}</Text>
                <Text style={styles.summaryLabel}>Forwarding</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={[styles.summaryCount, { color: Colors.danger }]}>{pausedCount}</Text>
                <Text style={styles.summaryLabel}>Paused</Text>
              </View>
            </View>

            {/* Bulk action buttons */}
            {devices.length > 1 && (
              <View style={styles.bulkRow}>
                <TouchableOpacity style={styles.bulkBtnPause} onPress={handlePauseAll}>
                  <Text style={styles.bulkBtnPauseText}>⏸ Pause All</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.bulkBtnResume} onPress={handleResumeAll}>
                  <Text style={styles.bulkBtnResumeText}>▶ Resume All</Text>
                </TouchableOpacity>
              </View>
            )}

            <Text style={styles.sectionLabel}>
              APPROVED WORKERS ({devices.length})
            </Text>
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>No Approved Workers</Text>
            <Text style={styles.emptyDesc}>
              Approve worker devices from the Devices screen first. Once approved, they'll appear here and you can pause or resume each one individually.
            </Text>
          </View>
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
    alignItems: 'center',
    justifyContent: 'space-between',
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

  // Summary card
  summaryCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 14,
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  summaryItem: {
    alignItems: 'center',
    flex: 1,
  },
  summaryCount: {
    fontSize: 26,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  summaryLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    marginTop: 2,
    fontWeight: '600',
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: Colors.border,
  },

  // Bulk buttons
  bulkRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  bulkBtnPause: {
    flex: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: Colors.danger,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  bulkBtnPauseText: {
    color: Colors.danger,
    fontWeight: '700',
    fontSize: 13,
  },
  bulkBtnResume: {
    flex: 1,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: Colors.success,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  bulkBtnResumeText: {
    color: Colors.success,
    fontWeight: '700',
    fontSize: 13,
  },

  sectionLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 10,
  },

  // Device card
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 10,
  },
  deviceCardPaused: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.04)',
  },
  deviceIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  deviceIconCirclePaused: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  deviceIconText: {
    fontSize: 22,
  },
  deviceInfo: {
    flex: 1,
    marginRight: 10,
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
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 6,
    borderWidth: 1,
  },
  statusPillActive: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderColor: Colors.success,
  },
  statusPillPaused: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderColor: Colors.danger,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginRight: 4,
  },
  statusDotActive: {
    backgroundColor: Colors.success,
  },
  statusDotPaused: {
    backgroundColor: Colors.danger,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  statusPillTextActive: {
    color: Colors.success,
  },
  statusPillTextPaused: {
    color: Colors.danger,
  },

  // Switch column
  switchCol: {
    alignItems: 'center',
    minWidth: 52,
  },
  switchLabel: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 4,
  },
  switchLabelActive: {
    color: Colors.success,
  },
  switchLabelPaused: {
    color: Colors.danger,
  },

  // Empty state
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 28,
    alignItems: 'center',
    marginTop: 16,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
});

