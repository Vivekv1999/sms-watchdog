import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  StatusBar,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../theme/colors';
import { StorageService } from '../services/storage';

interface AdminAuthScreenProps {
  onAuthenticated: () => void;
  onBackToRoles: () => void;
}

export const AdminAuthScreen: React.FC<AdminAuthScreenProps> = ({
  onAuthenticated,
  onBackToRoles,
}) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [existingPin, setExistingPin] = useState<string | null>(null);
  const [isSetupMode, setIsSetupMode] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    checkPin();
  }, []);

  const checkPin = async () => {
    const savedPin = await StorageService.getMasterPin();
    if (!savedPin) {
      setIsSetupMode(true);
    } else {
      setExistingPin(savedPin);
      setIsSetupMode(false);
    }
  };

  const handleUnlock = async () => {
    setError('');
    if (!pin.trim()) {
      setError('Please enter your Master Admin Key');
      return;
    }

    if (isSetupMode) {
      if (pin.length < 4) {
        setError('PIN must be at least 4 characters');
        return;
      }
      if (pin !== confirmPin) {
        setError('Confirmation PIN does not match');
        return;
      }
      await StorageService.setMasterPin(pin.trim());
      onAuthenticated();
    } else {
      if (pin.trim() === existingPin) {
        onAuthenticated();
      } else {
        setError('Incorrect Master Key. Please try again.');
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.content}>
        {/* Header Icon */}
        <View style={styles.header}>
          <View style={styles.lockIconBox}>
            <Text style={styles.lockIcon}>👑</Text>
          </View>
          <Text style={styles.title}>
            {isSetupMode ? 'Create Admin Key' : 'Admin Security Gate'}
          </Text>
          <Text style={styles.subtitle}>
            {isSetupMode
              ? 'Set a private Master PIN (e.g., 8844 or SHOP-99). No emails or passwords required!'
              : 'Enter your Master PIN or Co-Admin Key to access the live SMS dashboard.'}
          </Text>
        </View>

        {/* Form Container */}
        <View style={styles.card}>
          <Text style={styles.inputLabel}>
            {isSetupMode ? 'CHOOSE MASTER ADMIN KEY' : 'ENTER MASTER KEY / CO-ADMIN PIN'}
          </Text>
          <TextInput
            style={styles.input}
            placeholder={isSetupMode ? 'e.g. 8844 or SECRET' : 'Enter PIN'}
            placeholderTextColor={Colors.textMuted}
            value={pin}
            onChangeText={(t) => {
              setPin(t);
              setError('');
            }}
            secureTextEntry
            autoCapitalize="none"
          />

          {isSetupMode ? (
            <>
              <Text style={[styles.inputLabel, { marginTop: 14 }]}>CONFIRM KEY</Text>
              <TextInput
                style={styles.input}
                placeholder="Re-enter to confirm"
                placeholderTextColor={Colors.textMuted}
                value={confirmPin}
                onChangeText={(t) => {
                  setConfirmPin(t);
                  setError('');
                }}
                secureTextEntry
                autoCapitalize="none"
              />
            </>
          ) : null}

          {error ? <Text style={styles.errorText}>⚠️ {error}</Text> : null}

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={handleUnlock}
            activeOpacity={0.8}
          >
            <Text style={styles.submitBtnText}>
              {isSetupMode ? 'Set Key & Enter Dashboard' : 'Unlock Dashboard'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Switch Role / Reset */}
        <TouchableOpacity style={styles.backBtn} onPress={onBackToRoles}>
          <Text style={styles.backBtnText}>← Switch Device Role (Worker Mode)</Text>
        </TouchableOpacity>

        {/* Notice */}
        <View style={styles.securityBadge}>
          <Text style={styles.securityBadgeText}>
            🛡️ Zero-Auth Architecture: Protected by local hardware encryption & Master PIN.
          </Text>
        </View>
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
    marginBottom: 28,
  },
  lockIconBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  lockIcon: {
    fontSize: 28,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 12,
    lineHeight: 18,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputLabel: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.cardElevated,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    color: Colors.textPrimary,
    fontSize: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  errorText: {
    color: Colors.danger,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
  },
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  submitBtnText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.5,
  },
  backBtn: {
    alignItems: 'center',
    marginTop: 20,
  },
  backBtnText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
  securityBadge: {
    marginTop: 32,
    alignItems: 'center',
  },
  securityBadgeText: {
    color: Colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
});
