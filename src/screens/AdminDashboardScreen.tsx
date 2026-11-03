import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { OtpCard } from '../components/OtpCard';
import { StorageService, AppMessage, ManagedDevice, FilterConfig } from '../services/storage';
import { CloudSyncService } from '../services/cloudSync';
import { SmsBridge } from '../services/smsBridge';
import { parseSmsDetails } from '../utils/otpExtractor';

interface AdminDashboardScreenProps {
  onNavigateToDevices: () => void;
  onNavigateToSettings: () => void;
  onNavigateToWorkerControl: () => void;
}

export const AdminDashboardScreen: React.FC<AdminDashboardScreenProps> = ({
  onNavigateToDevices,
  onNavigateToSettings,
  onNavigateToWorkerControl,
}) => {
  const [messages, setMessages] = useState<AppMessage[]>([]);
  const [filteredMessages, setFilteredMessages] = useState<AppMessage[]>([]);
  const [groupId, setGroupId] = useState('');
  const [filterConfig, setFilterConfig] = useState<FilterConfig>({ mode: 'SPECIFIC', keywords: [] });
  const [pendingDevices, setPendingDevices] = useState<ManagedDevice[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();

    // Listen for local native SMS events if triggered on this device
    const unsubscribe = SmsBridge.addSmsListener(async (rawSms) => {
      const parsed = parseSmsDetails(rawSms.sender, rawSms.body);
      const newMsg: AppMessage = {
        id: `local_${Date.now()}`,
        sender: rawSms.sender,
        body: rawSms.body,
        otp: rawSms.otp || parsed.otp,
        service: rawSms.service || parsed.service,
        timestamp: rawSms.timestamp || Date.now(),
        deviceId: rawSms.deviceId || 'DEV-LOCAL',
        deviceName: rawSms.deviceName || 'Local SIM',
        receivedAt: Date.now(),
      };
      const updated = await StorageService.addMessage(newMsg);
      setMessages(updated);
    });

    // Auto-poll Firestore or local store every 5 seconds
    const interval = setInterval(() => {
      syncLatest();
    }, 5000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    applyFilters();
  }, [messages, searchQuery]);

  const loadData = async () => {
    const gid = await StorageService.getGroupId();
    setGroupId(gid);

    const fConfig = await StorageService.getFilterConfig();
    setFilterConfig(fConfig);

    const cached = await StorageService.getCachedMessages();
    setMessages(cached);

    // Ensure Firestore group document exists so workers can sync filter rules
    const fb = await StorageService.getFirebaseConfig();
    const gName = await StorageService.getGroupName();
    if (fb.projectId && gid) {
      CloudSyncService.ensureGroupDocument(fb.projectId, fb.apiKey, gid, gName);
    }

    await syncLatest();
  };

  const syncLatest = async () => {
    const fb = await StorageService.getFirebaseConfig();
    const gid = await StorageService.getGroupId();

    // 1. Sync messages
    const remoteMessages = await CloudSyncService.fetchMessages(fb.projectId, fb.apiKey, gid);
    if (remoteMessages.length > 0) {
      setMessages(remoteMessages);
    }

    // 2. Check for pending devices needing approval
    const devices = await CloudSyncService.fetchGroupDevices(fb.projectId, fb.apiKey, gid);
    const pending = devices.filter((d) => d.status === 'PENDING');
    setPendingDevices(pending);

    // 3. Keep filterConfig in sync with local storage
    const localConfig = await StorageService.getFilterConfig();
    setFilterConfig(localConfig);
  };

  const toggleNoForwardMode = async (enableNoForward: boolean) => {
    const newMode = enableNoForward ? 'NO_FORWARD' : 'SPECIFIC';
    const updatedConfig: FilterConfig = {
      ...filterConfig,
      mode: newMode,
      noMessageForwarding: enableNoForward,
    };
    setFilterConfig(updatedConfig);
    await StorageService.saveFilterConfig(updatedConfig);

    const fb = await StorageService.getFirebaseConfig();
    const gid = await StorageService.getGroupId();
    if (fb.projectId && gid) {
      await CloudSyncService.syncGroupFilterConfig(fb.projectId, fb.apiKey, gid, updatedConfig);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await syncLatest();
    setRefreshing(false);
  };

  const applyFilters = () => {
    let result = [...messages];

    // Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.sender.toLowerCase().includes(q) ||
          m.body.toLowerCase().includes(q) ||
          m.otp.includes(q) ||
          m.deviceName.toLowerCase().includes(q) ||
          m.service.toLowerCase().includes(q)
      );
    }

    setFilteredMessages(result);
  };

  // Quick simulation tool to verify real-time OTP cards
  const simulateTestSms = async (serviceName: 'FLIPKART' | 'AMAZON' | 'MEESHO') => {
    const randomOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const senders = {
      FLIPKART: 'VK-FLPKRT',
      AMAZON: 'BZ-AMZIN',
      MEESHO: 'AD-MEESHO',
    };
    const bodies = {
      FLIPKART: `${randomOtp} is your OTP for Flipkart account login. Do not share with anyone. Valid for 10 minutes.`,
      AMAZON: `Your Amazon verification code is: ${randomOtp}. Use this to verify your login.`,
      MEESHO: `Meesho Seller Hub: ${randomOtp} is your secret code to log in.`,
    };

    const newMsg: AppMessage = {
      id: `sim_${Date.now()}`,
      sender: senders[serviceName],
      body: bodies[serviceName],
      otp: randomOtp,
      service: serviceName,
      timestamp: Date.now(),
      deviceId: 'DEV-SIM-2',
      deviceName: 'Office SIM #2 (Rahul)',
      receivedAt: Date.now(),
    };

    const updated = await StorageService.addMessage(newMsg);
    setMessages(updated);
  };

  const handleClearMessages = () => {
    Alert.alert(
      'Clear Feed',
      'This will permanently delete all messages from the cloud and clear your local feed. New messages arriving after this point will still appear.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete & Clear',
          style: 'destructive',
          onPress: async () => {
            // 1. Clear local cache and save clearedAt timestamp
            await StorageService.clearMessages();
            setMessages([]);
            setFilteredMessages([]);

            // 2. Delete all documents from Firestore so remote devices also see empty feed
            const fb = await StorageService.getFirebaseConfig();
            const gid = await StorageService.getGroupId();
            if (fb.projectId && gid) {
              CloudSyncService.deleteAllGroupMessages(fb.projectId, fb.apiKey, gid);
            }
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Live SMS Watch</Text>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onNavigateToSettings} activeOpacity={0.7}>
            <Text style={styles.subtitle} numberOfLines={1}>
              Group: <Text style={styles.highlightText}>{groupId}</Text> • Rule:{' '}
              <Text
                style={[
                  styles.highlightText,
                  filterConfig.mode === 'NO_FORWARD' ? styles.highlightTextDanger : null,
                ]}
              >
                {filterConfig.mode === 'NO_FORWARD'
                  ? '🚫 NO FORWARD ⚙️'
                  : filterConfig.mode === 'ALL'
                  ? 'ALL SMS ⚙️'
                  : 'KEYWORDS ⚙️'}
              </Text>
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onNavigateToWorkerControl}
          >
            <Text style={styles.headerBtnIcon}>🎛️</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onNavigateToDevices}
          >
            <Text style={styles.headerBtnIcon}>📱</Text>
            {pendingDevices.length > 0 ? (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{pendingDevices.length}</Text>
              </View>
            ) : null}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.headerBtn}
            onPress={onNavigateToSettings}
          >
            <Text style={styles.headerBtnIcon}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Admin Quick Control: No Message Forwarding Switch */}
      <View
        style={[
          styles.quickControlCard,
          filterConfig.mode === 'NO_FORWARD' ? styles.quickControlCardActive : null,
        ]}
      >
        <View
          style={[
            styles.quickControlIconBox,
            filterConfig.mode === 'NO_FORWARD' ? styles.quickControlIconBoxActive : null,
          ]}
        >
          <Text style={styles.quickControlIcon}>
            {filterConfig.mode === 'NO_FORWARD' ? '🚫' : '📬'}
          </Text>
        </View>

        <View style={styles.quickControlTextCol}>
          <View style={styles.quickControlBadgeRow}>
            <Text style={styles.quickControlHeading} numberOfLines={1}>
              No Message Forwarding
            </Text>
            <View
              style={[
                styles.adminOnlyPill,
                filterConfig.mode === 'NO_FORWARD' ? styles.adminOnlyPillActive : null,
              ]}
            >
              <Text
                style={[
                  styles.adminOnlyPillText,
                  filterConfig.mode === 'NO_FORWARD' ? styles.adminOnlyPillTextActive : null,
                ]}
              >
                ADMIN ONLY
              </Text>
            </View>
          </View>
          <Text
            style={[
              styles.quickControlSubtitle,
              filterConfig.mode === 'NO_FORWARD' ? styles.quickControlSubtitleActive : null,
            ]}
            numberOfLines={1}
          >
            {filterConfig.mode === 'NO_FORWARD'
              ? '⛔ Active • Worker SMS forwarding paused'
              : 'Forwarding enabled according to rules'}
          </Text>
        </View>

        <View style={styles.switchWrapper}>
          <Switch
            value={filterConfig.mode === 'NO_FORWARD'}
            onValueChange={toggleNoForwardMode}
            trackColor={{ false: Colors.border, true: Colors.danger }}
            thumbColor={filterConfig.mode === 'NO_FORWARD' ? Colors.white : Colors.textSecondary}
          />
        </View>
      </View>

      {/* Per-Worker Pause / Active Controls */}
      <TouchableOpacity
        style={styles.workerControlBanner}
        onPress={onNavigateToWorkerControl}
        activeOpacity={0.8}
      >
        <Text style={styles.workerControlBannerIcon}>🎛️</Text>
        <View style={styles.workerControlBannerTextCol}>
          <Text style={styles.workerControlBannerTitle}>Worker Device Controls</Text>
          <Text style={styles.workerControlBannerSub}>
            Pause or activate forwarding per worker phone
          </Text>
        </View>
        <Text style={styles.workerControlBannerArrow}>Manage →</Text>
      </TouchableOpacity>

      {/* Pending Approval Banner (Alerts Admin if new APK was installed) */}
      {pendingDevices.length > 0 ? (
        <TouchableOpacity
          style={styles.pendingBanner}
          onPress={onNavigateToDevices}
          activeOpacity={0.8}
        >
          <Text style={styles.pendingIcon}>⚠️</Text>
          <View style={styles.pendingTextBox}>
            <Text style={styles.pendingTitle}>
              {pendingDevices.length} Device Request Waiting!
            </Text>
            <Text style={styles.pendingSub}>
              {pendingDevices[0].deviceName} ({pendingDevices[0].deviceId}) wants to join. Tap to approve.
            </Text>
          </View>
          <Text style={styles.pendingAction}>Review →</Text>
        </TouchableOpacity>
      ) : null}

      {/* Search Input */}
      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by sender, OTP, service, or device..."
          placeholderTextColor={Colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {messages.length > 0 ? (
          <TouchableOpacity
            onPress={handleClearMessages}
            style={styles.clearFeedBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.clearFeedIcon}>🗑️</Text>
          </TouchableOpacity>
        ) : null}
        {searchQuery ? (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Text style={styles.clearSearch}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Messages Feed */}
      <FlatList
        data={filteredMessages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <OtpCard message={item} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={Colors.primary}
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📬</Text>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptySub}>
              When your connected SIM phones receive an OTP or SMS, it will appear here instantly in real-time.
            </Text>

            {/* Test Simulation Buttons */}
            <View style={styles.testBox}>
              <Text style={styles.testLabel}>TEST LIVE SIMULATION:</Text>
              <View style={styles.testBtnRow}>
                <TouchableOpacity
                  style={[styles.testBtn, { borderColor: Colors.flipkart }]}
                  onPress={() => simulateTestSms('FLIPKART')}
                >
                  <Text style={[styles.testBtnText, { color: Colors.flipkart }]}>
                    + Flipkart OTP
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.testBtn, { borderColor: Colors.amazon }]}
                  onPress={() => simulateTestSms('AMAZON')}
                >
                  <Text style={[styles.testBtnText, { color: Colors.amazon }]}>
                    + Amazon OTP
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.testBtn, { borderColor: Colors.meesho }]}
                  onPress={() => simulateTestSms('MEESHO')}
                >
                  <Text style={[styles.testBtnText, { color: Colors.meesho }]}>
                    + Meesho OTP
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerLeft: {
    flex: 1,
    marginRight: 10,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.textPrimary,
    marginRight: 8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.success,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.success,
    marginRight: 4,
  },
  liveText: {
    color: Colors.success,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  highlightText: {
    color: Colors.primary,
    fontWeight: '700',
  },
  highlightTextDanger: {
    color: Colors.danger,
    fontWeight: '800',
  },
  quickControlCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickControlCardActive: {
    borderColor: Colors.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  quickControlIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.cardElevated,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  quickControlIconBoxActive: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  quickControlIcon: {
    fontSize: 16,
  },
  quickControlTextCol: {
    flex: 1,
    marginHorizontal: 12,
    justifyContent: 'center',
  },
  quickControlBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 2,
  },
  quickControlHeading: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  adminOnlyPill: {
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.3)',
  },
  adminOnlyPillActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  adminOnlyPillText: {
    color: Colors.textSecondary,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  adminOnlyPillTextActive: {
    color: Colors.danger,
  },
  quickControlSubtitle: {
    color: Colors.textSecondary,
    fontSize: 11,
    lineHeight: 15,
  },
  quickControlSubtitleActive: {
    color: Colors.danger,
    fontWeight: '600',
  },
  switchWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    position: 'relative',
  },
  headerBtnIcon: {
    fontSize: 16,
  },
  headerBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: Colors.danger,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  headerBadgeText: {
    color: Colors.white,
    fontSize: 9,
    fontWeight: '800',
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderBottomWidth: 1,
    borderBottomColor: Colors.warning,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  pendingIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  pendingTextBox: {
    flex: 1,
  },
  pendingTitle: {
    color: Colors.warning,
    fontWeight: '700',
    fontSize: 13,
  },
  pendingSub: {
    color: Colors.textSecondary,
    fontSize: 11,
  },
  pendingAction: {
    color: Colors.warning,
    fontWeight: '700',
    fontSize: 12,
    marginLeft: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 10,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 13,
    paddingVertical: 8,
  },
  clearSearch: {
    color: Colors.textMuted,
    fontSize: 14,
    padding: 4,
  },
  clearFeedBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  clearFeedIcon: {
    fontSize: 14,
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  emptySub: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 18,
  },
  testBox: {
    marginTop: 32,
    alignItems: 'center',
    width: '100%',
  },
  testLabel: {
    color: Colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },
  testBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  testBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: Colors.card,
  },
  testBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  workerControlBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  workerControlBannerIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  workerControlBannerTextCol: {
    flex: 1,
  },
  workerControlBannerTitle: {
    color: Colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  workerControlBannerSub: {
    color: Colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
  workerControlBannerArrow: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
  },
});
