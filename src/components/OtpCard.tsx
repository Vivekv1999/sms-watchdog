import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { Colors } from '../theme/colors';
import { AppMessage } from '../services/storage';

interface OtpCardProps {
  message: AppMessage;
}

export const OtpCard: React.FC<OtpCardProps> = ({ message }) => {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = () => {
    if (!message.otp) return;
    Clipboard.setString(message.otp);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getServiceColor = (service: string) => {
    switch (service) {
      case 'FLIPKART':
        return Colors.flipkart;
      case 'AMAZON':
        return Colors.amazon;
      case 'MEESHO':
        return Colors.meesho;
      case 'MYNTRA':
        return Colors.myntra;
      case 'SBI BANK':
      case 'HDFC BANK':
      case 'ICICI BANK':
      case 'AXIS BANK':
        return Colors.bank;
      default:
        return Colors.primary;
    }
  };

  const formatTime = (timestamp: number) => {
    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const serviceColor = getServiceColor(message.service);

  return (
    <View style={[styles.card, message.otp ? styles.cardOtpGlow : null]}>
      {/* Top Bar: Service tag, Origin SIM, Timestamp */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.serviceBadge, { backgroundColor: serviceColor + '20', borderColor: serviceColor }]}>
            <Text style={[styles.serviceText, { color: serviceColor }]}>{message.service}</Text>
          </View>
          <Text style={styles.senderText} numberOfLines={1}>
            {message.sender}
          </Text>
        </View>
        <Text style={styles.timeText}>{formatTime(message.timestamp)}</Text>
      </View>

      {/* Origin Device Badge */}
      <View style={styles.deviceRow}>
        <Text style={styles.deviceIcon}>📱</Text>
        <Text style={styles.deviceNameText}>{message.deviceName}</Text>
        <Text style={styles.deviceIdText}>({message.deviceId})</Text>
      </View>

      {/* Hero OTP Section (If OTP exists) */}
      {message.otp ? (
        <View style={styles.otpHeroBox}>
          <View style={styles.otpCodeContainer}>
            <Text style={styles.otpLabel}>ONE-TIME PASSWORD</Text>
            <Text style={styles.otpCode} selectable>
              {message.otp}
            </Text>
          </View>

          <TouchableOpacity
            style={[styles.copyButton, copied ? styles.copyButtonSuccess : null]}
            onPress={handleCopy}
            activeOpacity={0.7}
          >
            <Text style={styles.copyButtonText}>
              {copied ? '✓ COPIED!' : '📋 COPY OTP'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Message Body preview & expander */}
      <TouchableOpacity
        style={styles.bodyContainer}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.8}
      >
        <Text
          style={styles.bodyText}
          numberOfLines={expanded ? undefined : 2}
        >
          {message.body}
        </Text>
        {message.body.length > 90 ? (
          <Text style={styles.expandHint}>
            {expanded ? '▲ Show less' : '▼ Show full SMS'}
          </Text>
        ) : null}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardOtpGlow: {
    borderColor: 'rgba(59, 130, 246, 0.4)',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  serviceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    marginRight: 8,
  },
  serviceText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  senderText: {
    color: Colors.textPrimary,
    fontWeight: '600',
    fontSize: 14,
    flexShrink: 1,
  },
  timeText: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  deviceIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  deviceNameText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
  },
  deviceIdText: {
    color: Colors.textMuted,
    fontSize: 11,
    marginLeft: 4,
  },
  otpHeroBox: {
    backgroundColor: Colors.cardElevated,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  otpCodeContainer: {
    flex: 1,
  },
  otpLabel: {
    color: Colors.primary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 2,
  },
  otpCode: {
    color: Colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 4,
    fontFamily: 'monospace',
  },
  copyButton: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyButtonSuccess: {
    backgroundColor: Colors.success,
  },
  copyButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 0.5,
  },
  bodyContainer: {
    backgroundColor: 'rgba(11, 15, 25, 0.4)',
    borderRadius: 8,
    padding: 10,
  },
  bodyText: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  expandHint: {
    color: Colors.primary,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 6,
  },
});
