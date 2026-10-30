import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { SmsBridge, DeviceHardwareInfo, SyncStatus } from '../services/smsBridge';
import { StorageService } from '../services/storage';
import { CloudSyncService } from '../services/cloudSync';

interface WorkerSetupScreenProps {
  onBackToRoles: () => void;
}

export const WorkerSetupScreen: React.FC<WorkerSetupScreenProps> = ({ onBackToRoles }) => {
  const [deviceName, setDeviceName] = useState('');
  const [groupCode, setGroupCode] = useState('');
  const [hardwareInfo, setHardwareInfo] = useState<DeviceHardwareInfo | null>(null);
  const [approvalStatus, setApprovalStatus] = useState<'UNPAIRED' | 'PENDING' | 'APPROVED' | 'BLOCKED'>('UNPAIRED');
  const [isServiceActive, setIsServiceActive] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    if (approvalStatus === 'PENDING') {
      const timer = setInterval(() => {
        checkStatusSilently();
      }, 4000);
      return () => clearInterval(timer);
    } else if (approvalStatus === 'APPROVED') {
      syncGroupFilters();
      const timer = setInterval(() => {
        syncGroupFilters();
      }, 10000);
      return () => clearInterval(timer);
    }
  }, [approvalStatus, groupCode, hardwareInfo]);

  const syncGroupFilters = async () => {
    const fb = await StorageService.getFirebaseConfig();
    const storedGid = await StorageService.getGroupId();
    const cleanGroup = (groupCode || storedGid || '').trim().toUpperCase();
    if (fb.projectId && cleanGroup) {
      await CloudSyncService.fetchGroupFilterConfig(fb.projectId, fb.apiKey, cleanGroup);
    }
  };

  const checkStatusSilently = async () => {
    const fb = await StorageService.getFirebaseConfig();
    const storedGid = await StorageService.getGroupId();
    const cleanGroup = (groupCode || storedGid || '').trim().toUpperCase();
    const devId = hardwareInfo?.deviceId || 'DEV-SIM';
    if (!fb.projectId || !cleanGroup) return;

    const status = await CloudSyncService.checkDeviceApprovalStatus(
      fb.projectId,
      fb.apiKey,
      cleanGroup,
      devId
    );

    if (status === 'APPROVED') {
      setApprovalStatus('APPROVED');
      await SmsBridge.setDeviceApproval(true);
      await syncGroupFilters();
      await startForegroundService(cleanGroup, devId, true);
    } else if (status === 'BLOCKED') {
      setApprovalStatus('BLOCKED');
      await SmsBridge.stopSyncService();
      setIsServiceActive(false);
    }
  };

  const init = async () => {
    // 1. Fetch hardware device identity
    const hw = await SmsBridge.getHardwareDeviceInfo();
    setHardwareInfo(hw);

    // 2. Default device name if empty
    setDeviceName(`${hw.model} (${hw.deviceId})`);

    // 3. Check existing sync status
    const status = await SmsBridge.getSyncStatus();
    if (status && status.groupId) {
      setGroupCode(status.groupId);
      if (status.deviceName) setDeviceName(status.deviceName);
      setIsServiceActive(status.isSyncActive && status.isServiceRunning);

      if (status.isApproved) {
        setApprovalStatus('APPROVED');
        syncGroupFilters();
      } else if (status.isSyncActive) {
        setApprovalStatus('PENDING');
      }
    }
  };

  const handleRequestPairing = async () => {
    if (!groupCode.trim()) {
      Alert.alert('Required', 'Please enter the 6-digit Group Code from the Admin phone.');
      return;
    }
    if (!deviceName.trim()) {
      Alert.alert('Required', 'Please enter a name for this SIM phone.');
      return;
    }

    setLoading(true);

    // 1. Request SMS and Notification permissions
    const granted = await SmsBridge.requestPermissions();
    if (!granted) {
      Alert.alert(
        'Permission Required',
        'SMS permissions are required so this phone can forward incoming OTPs to the Admin.'
      );
      setLoading(false);
      return;
    }

    const fb = await StorageService.getFirebaseConfig();
    if (!fb.projectId) {
      Alert.alert('Error', 'Firebase Project ID is missing from .env configuration.');
      setLoading(false);
      return;
    }

    const cleanGroup = groupCode.trim().toUpperCase();
    const devId = hardwareInfo?.deviceId || 'DEV-SIM';

    // 2. Submit device approval request
    const status = await CloudSyncService.requestDeviceJoin(
      fb.projectId,
      fb.apiKey,
      cleanGroup,
      {
        deviceId: devId,
        deviceName: deviceName.trim(),
        model: hardwareInfo?.model || 'Android Device',
      }
    );

    // Save group code locally
    await StorageService.setGroupId(cleanGroup);

    if (status === 'APPROVED') {
      setApprovalStatus('APPROVED');
      startForegroundService(cleanGroup, devId, true);
    } else {
      setApprovalStatus('PENDING');
      startForegroundService(cleanGroup, devId, false);
    }

    setLoading(false);
  };

  const startForegroundService = async (gId: string, dId: string, approved: boolean) => {
    if (approved) {
      await syncGroupFilters();
    }
    const fConfig = await StorageService.getFilterConfig();
    const fb = await StorageService.getFirebaseConfig();

    await SmsBridge.startSyncService({
      deviceId: dId,
      deviceName: deviceName.trim(),
      groupId: gId,
      isApproved: approved,
      filterMode: fConfig.mode,
      keywords: fConfig.keywords.join(','),
      firebaseProjectId: fb.projectId,
      firebaseApiKey: fb.apiKey,
    });
    setIsServiceActive(true);
  };

  const checkStatusWithAdmin = async () => {
    setLoading(true);
    const fb = await StorageService.getFirebaseConfig();
    const cleanGroup = groupCode.trim().toUpperCase();
    const devId = hardwareInfo?.deviceId || 'DEV-SIM';

    const status = await CloudSyncService.checkDeviceApprovalStatus(
      fb.projectId,
      fb.apiKey,
      cleanGroup,
      devId
    );

    if (status === 'APPROVED') {
      setApprovalStatus('APPROVED');
      await SmsBridge.setDeviceApproval(true);
      await syncGroupFilters();
      await startForegroundService(cleanGroup, devId, true);
      Alert.alert('Approved!', 'The Admin has approved your device! SMS sync is now active.');
    } else if (status === 'BLOCKED') {
      setApprovalStatus('BLOCKED');
      await SmsBridge.stopSyncService();
      setIsServiceActive(false);
      Alert.alert('Blocked', 'This device was blocked by the Admin.');
    } else {
      Alert.alert('Pending', 'Still waiting for Admin approval. Please ask the Admin to tap Approve on their dashboard.');
    }
    setLoading(false);
  };

  const toggleService = async () => {
    if (isServiceActive) {
      await SmsBridge.stopSyncService();
      setIsServiceActive(false);
    } else {
      const cleanGroup = groupCode.trim().toUpperCase();
      const devId = hardwareInfo?.deviceId || 'DEV-SIM';
      await startForegroundService(cleanGroup, devId, approvalStatus === 'APPROVED');
      setIsServiceActive(true);
    }
  };

  const handleBatteryOptimization = async () => {
    const alreadyIgnored = await SmsBridge.requestBatteryOptimizationExemption();
    if (alreadyIgnored) {
      Alert.alert('Protected', 'Battery optimization is already turned off. Background sync will stay alive.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>📱</Text>
          </View>
          <Text style={styles.title}>Worker SIM Forwarder</Text>
          <Text style={styles.subtitle}>
            Device Identity: {hardwareInfo?.deviceId} ({hardwareInfo?.model})
          </Text>
        </View>

        {/* STATE 1: UNPAIRED / NEW SETUP */}
        {approvalStatus === 'UNPAIRED' ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>CONNECT TO ADMIN GROUP</Text>
            <Text style={styles.cardDesc}>
              Enter the 6-character Group Code shown on your Admin's phone to connect this SIM device.
            </Text>

            <Text style={styles.inputLabel}>DEVICE NICKNAME</Text>
            <TextInput
              style={styles.input}
              value={deviceName}
              onChangeText={setDeviceName}
              placeholder="e.g. Flipkart Account #3 (Rahul)"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={[styles.inputLabel, { marginTop: 14 }]}>GROUP CODE</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={groupCode}
              onChangeText={setGroupCode}
              placeholder="e.g. SYNC-4819"
              placeholderTextColor={Colors.textMuted}
              autoCapitalize="characters"
            />

            <TouchableOpacity
              style={styles.connectBtn}
              onPress={handleRequestPairing}
              disabled={loading}
            >
              <Text style={styles.connectBtnText}>
                {loading ? 'Connecting...' : 'Connect & Request Approval'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* STATE 2: PENDING ADMIN APPROVAL (APK Theft Defense) */}
        {approvalStatus === 'PENDING' ? (
          <View style={[styles.card, styles.pendingBorder]}>
            <View style={styles.pendingHeader}>
              <Text style={styles.pendingLockIcon}>🔒</Text>
              <Text style={styles.pendingTitle}>Waiting for Admin Approval</Text>
            </View>

            <Text style={styles.pendingDesc}>
              This phone is locked and waiting for the group Admin to approve it.
            </Text>

            <View style={styles.deviceDetailsBox}>
              <Text style={styles.detailLabel}>DEVICE ID:</Text>
              <Text style={styles.detailVal}>{hardwareInfo?.deviceId}</Text>
              <Text style={[styles.detailLabel, { marginTop: 8 }]}>GROUP CODE:</Text>
              <Text style={styles.detailVal}>{groupCode}</Text>
              <Text style={[styles.detailLabel, { marginTop: 8 }]}>NAME:</Text>
              <Text style={styles.detailVal}>{deviceName}</Text>
            </View>

            <TouchableOpacity
              style={styles.checkStatusBtn}
              onPress={checkStatusWithAdmin}
              disabled={loading}
            >
              <Text style={styles.checkStatusBtnText}>
                {loading ? 'Checking...' : '🔄 Check Approval Status'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* STATE 3: APPROVED & ACTIVE */}
        {approvalStatus === 'APPROVED' ? (
          <View style={[styles.card, styles.approvedBorder]}>
            <View style={styles.approvedHeader}>
              <View style={styles.greenDot} />
              <Text style={styles.approvedTitle}>Connected & Approved</Text>
            </View>

            <Text style={styles.approvedSub}>
              Group: <Text style={styles.boldText}>{groupCode}</Text> • Device:{' '}
              <Text style={styles.boldText}>{deviceName}</Text>
            </Text>

            {/* Toggle Service */}
            <View style={styles.serviceToggleBox}>
              <View>
                <Text style={styles.serviceToggleTitle}>24/7 SMS Watchdog</Text>
                <Text style={styles.serviceToggleSub}>
                  {isServiceActive ? 'Running in background' : 'Sync paused'}
                </Text>
              </View>

              <TouchableOpacity
                style={[
                  styles.toggleBtn,
                  isServiceActive ? styles.toggleBtnActive : styles.toggleBtnInactive,
                ]}
                onPress={toggleService}
              >
                <Text style={styles.toggleBtnText}>
                  {isServiceActive ? 'ACTIVE' : 'PAUSED'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Battery Optimization Whitelist */}
            <TouchableOpacity
              style={styles.batteryBtn}
              onPress={handleBatteryOptimization}
            >
              <Text style={styles.batteryBtnText}>
                🔋 Keep Active in Background (Disable Battery Saver)
              </Text>
            </TouchableOpacity>

            <View style={styles.infoBadge}>
              <Text style={styles.infoBadgeText}>
                ✓ Reboots automatically if phone restarts.
              </Text>
            </View>
          </View>
        ) : null}

        {/* STATE 4: BLOCKED */}
        {approvalStatus === 'BLOCKED' ? (
          <View style={[styles.card, styles.blockedBorder]}>
            <Text style={styles.blockedTitle}>❌ Device Access Revoked</Text>
            <Text style={styles.blockedDesc}>
              This phone has been blocked by the group Admin. It cannot send SMS or access the group.
            </Text>
          </View>
        ) : null}

        {/* Switch Role / Back */}
        <TouchableOpacity style={styles.backBtn} onPress={onBackToRoles}>
          <Text style={styles.backBtnText}>← Switch Device Role (Admin Mode)</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 20,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  iconText: {
    fontSize: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pendingBorder: {
    borderColor: Colors.warning,
  },
  approvedBorder: {
    borderColor: Colors.success,
  },
  blockedBorder: {
    borderColor: Colors.danger,
  },
  cardTitle: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cardDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
    marginBottom: 16,
    lineHeight: 17,
  },
  inputLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.cardElevated,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  codeInput: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 2,
    color: Colors.primary,
    fontFamily: 'monospace',
  },
  connectBtn: {
    backgroundColor: Colors.success,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 20,
  },
  connectBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  pendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  pendingLockIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  pendingTitle: {
    color: Colors.warning,
    fontSize: 16,
    fontWeight: '800',
  },
  pendingDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  deviceDetailsBox: {
    backgroundColor: Colors.cardElevated,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  detailLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
  },
  detailVal: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    marginTop: 2,
  },
  checkStatusBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  checkStatusBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
  approvedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.success,
    marginRight: 8,
  },
  approvedTitle: {
    color: Colors.success,
    fontSize: 16,
    fontWeight: '800',
  },
  approvedSub: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginBottom: 16,
  },
  boldText: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  serviceToggleBox: {
    backgroundColor: Colors.cardElevated,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  serviceToggleTitle: {
    color: Colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  serviceToggleSub: {
    color: Colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  toggleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  toggleBtnActive: {
    backgroundColor: Colors.success,
  },
  toggleBtnInactive: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toggleBtnText: {
    color: Colors.white,
    fontWeight: '800',
    fontSize: 12,
  },
  batteryBtn: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    marginBottom: 12,
  },
  batteryBtnText: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  infoBadge: {
    alignItems: 'center',
  },
  infoBadgeText: {
    color: Colors.textMuted,
    fontSize: 11,
  },
  blockedTitle: {
    color: Colors.danger,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 6,
  },
  blockedDesc: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  backBtn: {
    alignItems: 'center',
    marginTop: 24,
  },
  backBtnText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
});
