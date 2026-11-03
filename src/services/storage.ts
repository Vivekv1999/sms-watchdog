import AsyncStorage from '@react-native-async-storage/async-storage';
import { FIREBASE_PROJECT_ID, FIREBASE_API_KEY } from '@env';

export interface AppMessage {
  id: string;
  sender: string;
  body: string;
  otp: string;
  service: string;
  timestamp: number;
  deviceId: string;
  deviceName: string;
  receivedAt: number;
}

export interface ManagedDevice {
  deviceId: string;
  deviceName: string;
  model: string;
  status: 'APPROVED' | 'PENDING' | 'BLOCKED';
  requestedAt: number;
  lastPingAt?: number;
  totalForwarded?: number;
}

export type FilterMode = 'ALL' | 'SPECIFIC' | 'NO_FORWARD';

export interface FilterConfig {
  mode: FilterMode;
  keywords: string[];
  noMessageForwarding?: boolean;
}

const KEYS = {
  APP_ROLE: '@sms_watch_role',
  MASTER_PIN: '@sms_watch_master_pin',
  GROUP_ID: '@sms_watch_group_id',
  GROUP_NAME: '@sms_watch_group_name',
  DEVICE_INFO: '@sms_watch_device_info',
  FILTER_CONFIG: '@sms_watch_filter_config',
  FIREBASE_CONFIG: '@sms_watch_firebase_config',
  CACHED_MESSAGES: '@sms_watch_cached_messages',
  MANAGED_DEVICES: '@sms_watch_managed_devices',
};

export const DEFAULT_KEYWORDS = [
  'otp',
  'code',
  'verification',
  'flipkart',
  'amazon',
  'meesho',
  'myntra',
  'shopify',
  'bank',
  'sbi',
  'hdfc',
  'icici',
  'axis',
  'paytm',
  'razorpay',
  'zomato',
  'swiggy',
];

export class StorageService {
  static async getRole(): Promise<'ADMIN' | 'WORKER' | null> {
    const val = await AsyncStorage.getItem(KEYS.APP_ROLE);
    return val as 'ADMIN' | 'WORKER' | null;
  }

  static async setRole(role: 'ADMIN' | 'WORKER'): Promise<void> {
    await AsyncStorage.setItem(KEYS.APP_ROLE, role);
  }

  static async clearRole(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.APP_ROLE);
  }

  static async getMasterPin(): Promise<string | null> {
    return await AsyncStorage.getItem(KEYS.MASTER_PIN);
  }

  static async setMasterPin(pin: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.MASTER_PIN, pin);
  }

  static async getGroupId(): Promise<string> {
    const gid = await AsyncStorage.getItem(KEYS.GROUP_ID);
    if (!gid) {
      const generated = 'SYNC-' + Math.floor(1000 + Math.random() * 9000);
      await AsyncStorage.setItem(KEYS.GROUP_ID, generated);
      return generated;
    }
    return gid;
  }

  static async setGroupId(id: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.GROUP_ID, id);
  }

  static async getGroupName(): Promise<string> {
    return (await AsyncStorage.getItem(KEYS.GROUP_NAME)) || 'My E-Commerce Hub';
  }

  static async setGroupName(name: string): Promise<void> {
    await AsyncStorage.setItem(KEYS.GROUP_NAME, name);
  }

  static async getFilterConfig(): Promise<FilterConfig> {
    const json = await AsyncStorage.getItem(KEYS.FILTER_CONFIG);
    if (json) {
      try {
        const parsed = JSON.parse(json);
        const mode: FilterMode =
          parsed.mode === 'NO_FORWARD' || parsed.mode === 'ALL' || parsed.mode === 'SPECIFIC'
            ? parsed.mode
            : parsed.noMessageForwarding
            ? 'NO_FORWARD'
            : 'SPECIFIC';
        return {
          mode,
          keywords: Array.isArray(parsed.keywords) ? parsed.keywords : DEFAULT_KEYWORDS,
          noMessageForwarding: mode === 'NO_FORWARD' || Boolean(parsed.noMessageForwarding),
        };
      } catch {}
    }
    return {
      mode: 'SPECIFIC',
      keywords: DEFAULT_KEYWORDS,
      noMessageForwarding: false,
    };
  }

  static async saveFilterConfig(config: FilterConfig): Promise<void> {
    const normalized: FilterConfig = {
      ...config,
      noMessageForwarding: config.mode === 'NO_FORWARD' || Boolean(config.noMessageForwarding),
    };
    await AsyncStorage.setItem(KEYS.FILTER_CONFIG, JSON.stringify(normalized));
  }

  static async getFirebaseConfig(): Promise<{ projectId: string; apiKey: string }> {
    const json = await AsyncStorage.getItem(KEYS.FIREBASE_CONFIG);
    if (json) {
      try {
        const parsed = JSON.parse(json);
        if (parsed.projectId) return parsed;
      } catch {}
    }
    return {
      projectId: (FIREBASE_PROJECT_ID || '').trim(),
      apiKey: (FIREBASE_API_KEY || '').trim(),
    };
  }

  static async saveFirebaseConfig(config: { projectId: string; apiKey: string }): Promise<void> {
    await AsyncStorage.setItem(KEYS.FIREBASE_CONFIG, JSON.stringify(config));
  }

  static async getCachedMessages(): Promise<AppMessage[]> {
    const json = await AsyncStorage.getItem(KEYS.CACHED_MESSAGES);
    if (json) {
      try {
        return JSON.parse(json);
      } catch {}
    }
    return [];
  }

  static async addMessage(msg: AppMessage): Promise<AppMessage[]> {
    const current = await this.getCachedMessages();
    // Prepend new message and deduplicate by id
    const filtered = current.filter((m) => m.id !== msg.id);
    const updated = [msg, ...filtered].slice(0, 300); // Keep last 300 messages
    await AsyncStorage.setItem(KEYS.CACHED_MESSAGES, JSON.stringify(updated));
    return updated;
  }

  static async clearMessages(): Promise<void> {
    await AsyncStorage.removeItem(KEYS.CACHED_MESSAGES);
  }

  static async getManagedDevices(): Promise<ManagedDevice[]> {
    const json = await AsyncStorage.getItem(KEYS.MANAGED_DEVICES);
    if (json) {
      try {
        return JSON.parse(json);
      } catch {}
    }
    return [];
  }

  static async saveManagedDevices(devices: ManagedDevice[]): Promise<void> {
    await AsyncStorage.setItem(KEYS.MANAGED_DEVICES, JSON.stringify(devices));
  }

  static async updateDeviceStatus(deviceId: string, status: 'APPROVED' | 'PENDING' | 'BLOCKED'): Promise<ManagedDevice[]> {
    const devices = await this.getManagedDevices();
    const updated = devices.map((d) => (d.deviceId === deviceId ? { ...d, status } : d));
    await this.saveManagedDevices(updated);
    return updated;
  }

  static async removeDevice(deviceId: string): Promise<ManagedDevice[]> {
    const devices = await this.getManagedDevices();
    const updated = devices.filter((d) => d.deviceId !== deviceId);
    await this.saveManagedDevices(updated);
    return updated;
  }
}
