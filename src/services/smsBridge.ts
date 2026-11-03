import { NativeModules, DeviceEventEmitter, PermissionsAndroid, Platform } from 'react-native';

const { SmsNativeModule } = NativeModules;

export interface DeviceHardwareInfo {
  deviceId: string;
  fullId: string;
  model: string;
}

export interface SyncConfig {
  deviceId: string;
  deviceName: string;
  groupId: string;
  isApproved: boolean;
  filterMode: 'ALL' | 'SPECIFIC' | 'NO_FORWARD';
  keywords: string;
  firebaseProjectId?: string;
  firebaseApiKey?: string;
}

export interface SyncStatus {
  isSyncActive: boolean;
  isApproved: boolean;
  filterMode: string;
  keywords: string;
  deviceId: string;
  deviceName: string;
  groupId: string;
  isServiceRunning: boolean;
}

export class SmsBridge {
  static async requestPermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;

    try {
      const permissionsToRequest = [
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
        PermissionsAndroid.PERMISSIONS.READ_SMS,
      ];

      if (Platform.Version >= 33) {
        permissionsToRequest.push('android.permission.POST_NOTIFICATIONS' as any);
      }

      const results = await PermissionsAndroid.requestMultiple(permissionsToRequest);

      const smsGranted = results[PermissionsAndroid.PERMISSIONS.RECEIVE_SMS] === PermissionsAndroid.RESULTS.GRANTED;
      return smsGranted;
    } catch (err) {
      console.warn('Failed to request SMS permissions', err);
      return false;
    }
  }

  static async getHardwareDeviceInfo(): Promise<DeviceHardwareInfo> {
    if (SmsNativeModule?.getHardwareDeviceId) {
      try {
        return await SmsNativeModule.getHardwareDeviceId();
      } catch (e) {
        console.warn('Failed to get native device ID', e);
      }
    }
    // Fallback ID
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    return {
      deviceId: `DEV-${randomHex}`,
      fullId: `ID_${Date.now()}_${randomHex}`,
      model: `${Platform.OS.toUpperCase()} Device`,
    };
  }

  static async startSyncService(config: SyncConfig): Promise<boolean> {
    if (SmsNativeModule?.startSyncService) {
      return await SmsNativeModule.startSyncService(config);
    }
    console.log('[Mock] startSyncService called', config);
    return true;
  }

  static async stopSyncService(): Promise<boolean> {
    if (SmsNativeModule?.stopSyncService) {
      return await SmsNativeModule.stopSyncService();
    }
    console.log('[Mock] stopSyncService called');
    return true;
  }

  static async updateFilterSettings(filterMode: 'ALL' | 'SPECIFIC' | 'NO_FORWARD', keywords: string): Promise<boolean> {
    if (SmsNativeModule?.updateFilterSettings) {
      return await SmsNativeModule.updateFilterSettings(filterMode, keywords);
    }
    return true;
  }

  static async setDeviceApproval(isApproved: boolean): Promise<boolean> {
    if (SmsNativeModule?.setDeviceApproval) {
      return await SmsNativeModule.setDeviceApproval(isApproved);
    }
    return true;
  }

  static async setDevicePaused(isPaused: boolean): Promise<boolean> {
    if (SmsNativeModule?.setDevicePaused) {
      return await SmsNativeModule.setDevicePaused(isPaused);
    }
    return true;
  }

  static async getSyncStatus(): Promise<SyncStatus | null> {
    if (SmsNativeModule?.getSyncStatus) {
      try {
        return await SmsNativeModule.getSyncStatus();
      } catch (e) {
        console.warn('Failed to get sync status', e);
      }
    }
    return null;
  }

  static async requestBatteryOptimizationExemption(): Promise<boolean> {
    if (SmsNativeModule?.requestBatteryOptimizationExemption) {
      return await SmsNativeModule.requestBatteryOptimizationExemption();
    }
    return true;
  }

  static addSmsListener(callback: (sms: any) => void) {
    const subscription = DeviceEventEmitter.addListener('onSmsReceived', callback);
    return () => subscription.remove();
  }
}
