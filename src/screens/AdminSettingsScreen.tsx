import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Alert,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Clipboard from '@react-native-clipboard/clipboard';
import { Colors } from '../theme/colors';
import { StorageService, FilterConfig, FilterMode, DEFAULT_KEYWORDS } from '../services/storage';
import { CloudSyncService } from '../services/cloudSync';
import { SmsBridge } from '../services/smsBridge';

interface AdminSettingsScreenProps {
  onBack: () => void;
  onResetRole: () => void;
}

export const AdminSettingsScreen: React.FC<AdminSettingsScreenProps> = ({
  onBack,
  onResetRole,
}) => {
  const [groupId, setGroupId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('SPECIFIC');
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [firebaseProject, setFirebaseProject] = useState('');
  const [firebaseApiKey, setFirebaseApiKey] = useState('');
  const [copiedGroup, setCopiedGroup] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const gid = await StorageService.getGroupId();
    const gName = await StorageService.getGroupName();
    const fConfig = await StorageService.getFilterConfig();
    const fb = await StorageService.getFirebaseConfig();

    setGroupId(gid);
    setGroupName(gName);
    setFilterMode(fConfig.mode);
    setKeywords(fConfig.keywords);
    setFirebaseProject(fb.projectId);
    setFirebaseApiKey(fb.apiKey);

    // Silently ensure the group document exists in Firestore on every load
    if (fb.projectId && gid) {
      CloudSyncService.ensureGroupDocument(fb.projectId, fb.apiKey, gid, gName);
    }
  };

  const copyGroupCode = () => {
    Clipboard.setString(groupId);
    setCopiedGroup(true);
    setTimeout(() => setCopiedGroup(false), 2000);
  };

  const handleAddKeyword = () => {
    const trimmed = newKeyword.trim().toLowerCase();
    if (!trimmed) return;
    if (keywords.includes(trimmed)) {
      Alert.alert('Exists', 'This keyword is already in the list.');
      return;
    }
    setKeywords([...keywords, trimmed]);
    setNewKeyword('');
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    setKeywords(keywords.filter((k) => k !== keywordToRemove));
  };

  const handleResetDefaultKeywords = () => {
    setKeywords(DEFAULT_KEYWORDS);
  };

  const handleSaveAll = async () => {
    setStatusMessage('');

    // 1. Save filter config
    const newFilterConfig: FilterConfig = {
      mode: filterMode,
      keywords,
      noMessageForwarding: filterMode === 'NO_FORWARD',
    };
    await StorageService.saveFilterConfig(newFilterConfig);

    // 2. Save Firebase config
    const cleanProject = firebaseProject.trim();
    const cleanApiKey = firebaseApiKey.trim();
    await StorageService.saveFirebaseConfig({
      projectId: cleanProject,
      apiKey: cleanApiKey,
    });

    // 3. Save group name
    const cleanGroupName = groupName.trim();
    await StorageService.setGroupName(cleanGroupName);

    // 4. Update native module filter settings on this device if running
    await SmsBridge.updateFilterSettings(filterMode, keywords.join(','));

    // 5. Ensure Firestore group document exists FIRST (creates it if not exists)
    //    This is critical — without this, the PATCH to save filterMode returns 404.
    await CloudSyncService.ensureGroupDocument(cleanProject, cleanApiKey, groupId, cleanGroupName);

    // 6. Sync filterMode + keywords to Firestore (full upsert PATCH, no updateMask)
    const synced = await CloudSyncService.syncGroupFilterConfig(
      cleanProject,
      cleanApiKey,
      groupId,
      newFilterConfig
    );

    if (synced) {
      const modeLabel =
        filterMode === 'NO_FORWARD'
          ? '🚫 No Message Forwarding (Admin Only)'
          : filterMode === 'ALL'
          ? '📬 Forward ALL SMS'
          : '🎯 Keywords Only';
      setStatusMessage(`✅ Settings saved! Filter: ${modeLabel}`);
    } else {
      setStatusMessage('⚠️ Saved locally, but cloud sync failed. Check Firebase Project ID.');
    }
    setTimeout(() => setStatusMessage(''), 4000);
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Group Settings & Rules</Text>
        <TouchableOpacity onPress={handleSaveAll} style={styles.saveHeaderBtn}>
          <Text style={styles.saveHeaderBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {statusMessage ? (
          <View style={styles.toast}>
            <Text style={styles.toastText}>{statusMessage}</Text>
          </View>
        ) : null}

        {/* Section 1: Pairing & Group Info */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>GROUP PAIRING CODE</Text>
          <Text style={styles.cardDesc}>
            Enter this code on your worker SIM phones to connect them to this admin dashboard.
          </Text>

          <View style={styles.codeRow}>
            <View style={styles.codeBox}>
              <Text style={styles.codeText}>{groupId}</Text>
            </View>
            <TouchableOpacity
              style={[styles.copyBtn, copiedGroup ? styles.copyBtnSuccess : null]}
              onPress={copyGroupCode}
            >
              <Text style={styles.copyBtnText}>
                {copiedGroup ? '✓ Copied' : 'Copy Code'}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.inputLabel, { marginTop: 14 }]}>GROUP NAME</Text>
          <TextInput
            style={styles.input}
            value={groupName}
            onChangeText={setGroupName}
            placeholder="e.g. E-Commerce Accounts Hub"
            placeholderTextColor={Colors.textMuted}
          />
        </View>

        {/* Section 2: SMS Filter Control (As requested by user!) */}
        <View style={styles.card}>
          <View style={styles.filterTitleRow}>
            <Text style={styles.sectionHeader}>SMS FORWARDING RULES</Text>
            <View
              style={[
                styles.activeModeBadge,
                filterMode === 'NO_FORWARD' ? styles.activeModeBadgeDanger : null,
              ]}
            >
              <Text
                style={[
                  styles.activeModeText,
                  filterMode === 'NO_FORWARD' ? styles.activeModeTextDanger : null,
                ]}
              >
                {filterMode === 'NO_FORWARD' ? 'NO FORWARD (ADMIN ONLY)' : filterMode}
              </Text>
            </View>
          </View>

          <Text style={styles.cardDesc}>
            Choose whether connected SIM devices should forward every single SMS, specific keywords, or disable forwarding with the Admin-Only switch.
          </Text>

          {/* Quick No Message Forwarding Switch (Admin Only) */}
          <View
            style={[
              styles.adminSwitchCard,
              filterMode === 'NO_FORWARD' ? styles.adminSwitchCardActive : null,
            ]}
          >
            <View style={styles.adminSwitchTextCol}>
              <View style={styles.adminBadgeRow}>
                <Text style={styles.adminSwitchTitle}>No Message Forwarding Switch</Text>
                <View style={styles.adminOnlyTag}>
                  <Text style={styles.adminOnlyTagText}>ADMIN ONLY</Text>
                </View>
              </View>
              <Text style={styles.adminSwitchSub}>
                {filterMode === 'NO_FORWARD'
                  ? 'ON — Worker devices will NOT forward any SMS to admin'
                  : 'OFF — Normal message forwarding is enabled'}
              </Text>
            </View>
            <Switch
              value={filterMode === 'NO_FORWARD'}
              onValueChange={(val) => {
                setFilterMode(val ? 'NO_FORWARD' : 'SPECIFIC');
              }}
              trackColor={{ false: Colors.border, true: Colors.danger }}
              thumbColor={filterMode === 'NO_FORWARD' ? Colors.white : Colors.textSecondary}
            />
          </View>

          {/* Mode Selector */}
          <View style={styles.modeContainer}>
            <TouchableOpacity
              style={[
                styles.modeOption,
                filterMode === 'SPECIFIC' ? styles.modeOptionSelected : null,
              ]}
              onPress={() => setFilterMode('SPECIFIC')}
            >
              <Text style={styles.modeIcon}>🎯</Text>
              <View style={styles.modeTextContainer}>
                <Text style={styles.modeTitle}>Specific Keywords Only</Text>
                <Text style={styles.modeSubtitle}>
                  Recommended. Forwards only OTPs & e-commerce messages. Preserves personal privacy.
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeOption,
                filterMode === 'ALL' ? styles.modeOptionSelected : null,
              ]}
              onPress={() => setFilterMode('ALL')}
            >
              <Text style={styles.modeIcon}>📬</Text>
              <View style={styles.modeTextContainer}>
                <Text style={styles.modeTitle}>Forward ALL SMS</Text>
                <Text style={styles.modeSubtitle}>
                  Forwards every incoming SMS from connected SIM phones without filtering.
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.modeOption,
                filterMode === 'NO_FORWARD' ? styles.modeOptionSelectedDanger : null,
              ]}
              onPress={() => setFilterMode('NO_FORWARD')}
            >
              <Text style={styles.modeIcon}>🚫</Text>
              <View style={styles.modeTextContainer}>
                <View style={styles.adminBadgeRow}>
                  <Text style={styles.modeTitle}>No Message Forwarding</Text>
                  <View style={styles.adminOnlyTag}>
                    <Text style={styles.adminOnlyTagText}>ADMIN ONLY</Text>
                  </View>
                </View>
                <Text style={styles.modeSubtitle}>
                  Stops all message forwarding from worker devices. When active, no SMS is forwarded to admin.
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Keywords Management (Shown when mode is SPECIFIC) */}
          {filterMode === 'SPECIFIC' ? (
            <View style={styles.keywordsSection}>
              <View style={styles.keywordsHeaderRow}>
                <Text style={styles.inputLabel}>
                  ACTIVE KEYWORDS ({keywords.length})
                </Text>
                <TouchableOpacity onPress={handleResetDefaultKeywords}>
                  <Text style={styles.resetKeywordsText}>Reset Defaults</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.chipsContainer}>
                {keywords.map((kw) => (
                  <View key={kw} style={styles.keywordChip}>
                    <Text style={styles.keywordChipText}>{kw}</Text>
                    <TouchableOpacity
                      onPress={() => handleRemoveKeyword(kw)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Text style={styles.removeChipText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              {/* Add New Keyword */}
              <View style={styles.addKeywordRow}>
                <TextInput
                  style={styles.addKeywordInput}
                  placeholder="Add custom keyword (e.g. shopify, delhivery)"
                  placeholderTextColor={Colors.textMuted}
                  value={newKeyword}
                  onChangeText={setNewKeyword}
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={styles.addKeywordBtn}
                  onPress={handleAddKeyword}
                >
                  <Text style={styles.addKeywordBtnText}>+ Add</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}
        </View>

        {/* Section 3: 100% Free Cloud Backend (Firebase Spark Plan) */}
        <View style={styles.card}>
          <Text style={styles.sectionHeader}>FREE CLOUD BACKEND (FIREBASE SPARK)</Text>
          <Text style={styles.cardDesc}>
            Google Firebase Spark Plan is 100% free forever (50,000 daily reads, 20,000 daily SMS writes, no credit card required).
          </Text>

          <Text style={styles.inputLabel}>FIREBASE PROJECT ID</Text>
          <TextInput
            style={styles.input}
            value={firebaseProject}
            onChangeText={setFirebaseProject}
            placeholder="e.g. my-sms-watch-app"
            placeholderTextColor={Colors.textMuted}
            autoCapitalize="none"
          />

          <Text style={[styles.inputLabel, { marginTop: 12 }]}>
            WEB API KEY (OPTIONAL)
          </Text>
          <TextInput
            style={styles.input}
            value={firebaseApiKey}
            onChangeText={setFirebaseApiKey}
            placeholder="AIzaSy..."
            placeholderTextColor={Colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
          />
        </View>

        {/* Save Button */}
        <TouchableOpacity
          style={styles.saveBtn}
          onPress={handleSaveAll}
          activeOpacity={0.8}
        >
          <Text style={styles.saveBtnText}>Save & Apply Settings</Text>
        </TouchableOpacity>

        {/* Reset Device Role */}
        <TouchableOpacity
          style={styles.resetRoleBtn}
          onPress={() => {
            Alert.alert(
              'Switch Role',
              'Do you want to switch this device from Admin to Worker SIM mode?',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Switch Role',
                  style: 'destructive',
                  onPress: onResetRole,
                },
              ]
            );
          }}
        >
          <Text style={styles.resetRoleBtnText}>Switch Device Role</Text>
        </TouchableOpacity>

        {/* App Version */}
        <Text style={styles.versionFooter}>SMS Watchdog v1.0.1 (Build 2)</Text>
      </ScrollView>
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
  saveHeaderBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  saveHeaderBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 13,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  toast: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    borderColor: Colors.success,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  toastText: {
    color: Colors.success,
    fontWeight: '700',
    fontSize: 13,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionHeader: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  cardDesc: {
    color: Colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 4,
    marginBottom: 14,
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  codeBox: {
    flex: 1,
    backgroundColor: Colors.cardElevated,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
  },
  codeText: {
    color: Colors.primary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 3,
    fontFamily: 'monospace',
  },
  copyBtn: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 10,
  },
  copyBtnSuccess: {
    backgroundColor: Colors.success,
  },
  copyBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 13,
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
  filterTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activeModeBadge: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.primary,
  },
  activeModeText: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '800',
  },
  activeModeBadgeDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: Colors.danger,
  },
  activeModeTextDanger: {
    color: Colors.danger,
  },
  adminSwitchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.cardElevated,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  adminSwitchCardActive: {
    borderColor: Colors.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  adminSwitchTextCol: {
    flex: 1,
    marginRight: 10,
  },
  adminBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  adminSwitchTitle: {
    color: Colors.textPrimary,
    fontWeight: '700',
    fontSize: 13,
  },
  adminOnlyTag: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  adminOnlyTagText: {
    color: Colors.danger,
    fontSize: 9,
    fontWeight: '800',
  },
  adminSwitchSub: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 3,
    lineHeight: 15,
  },
  modeOptionSelectedDanger: {
    borderColor: Colors.danger,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  modeContainer: {
    gap: 10,
    marginBottom: 16,
  },
  modeOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: Colors.cardElevated,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  modeOptionSelected: {
    borderColor: Colors.primary,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  modeIcon: {
    fontSize: 20,
    marginRight: 12,
    marginTop: 2,
  },
  modeTextContainer: {
    flex: 1,
  },
  modeTitle: {
    color: Colors.textPrimary,
    fontWeight: '700',
    fontSize: 14,
  },
  modeSubtitle: {
    color: Colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  keywordsSection: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    paddingTop: 14,
  },
  keywordsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  resetKeywordsText: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '600',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  keywordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  keywordChipText: {
    color: Colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
    marginRight: 6,
  },
  removeChipText: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  addKeywordRow: {
    flexDirection: 'row',
    gap: 8,
  },
  addKeywordInput: {
    flex: 1,
    backgroundColor: Colors.cardElevated,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: Colors.textPrimary,
    fontSize: 13,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addKeywordBtn: {
    backgroundColor: Colors.cardElevated,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  addKeywordBtnText: {
    color: Colors.primary,
    fontWeight: '700',
    fontSize: 12,
  },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 14,
  },
  saveBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  resetRoleBtn: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  resetRoleBtnText: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  versionFooter: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
