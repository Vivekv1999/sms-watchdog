import { StorageService, AppMessage, ManagedDevice, FilterConfig } from './storage';
import { parseSmsDetails } from '../utils/otpExtractor';
import { SmsBridge } from './smsBridge';

export class CloudSyncService {
  /**
   * Fetch messages from Firestore for this group
   */
  static async fetchMessages(
    projectId: string,
    apiKey: string,
    groupId: string
  ): Promise<AppMessage[]> {
    if (!projectId || !groupId) {
      return await StorageService.getCachedMessages();
    }

    try {
      const url = apiKey
        ? `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/messages?pageSize=50&key=${apiKey}`
        : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/messages?pageSize=50`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Firestore fetch failed: ${response.status}`);
      }

      const data = await response.json();
      if (!data.documents) return await StorageService.getCachedMessages();

      const messages: AppMessage[] = data.documents.map((doc: any) => {
        const fields = doc.fields || {};
        const parts = doc.name.split('/');
        const id = parts[parts.length - 1];

        const sender = fields.sender?.stringValue || 'Unknown';
        const body = fields.body?.stringValue || '';
        const parsed = parseSmsDetails(sender, body);

        return {
          id,
          sender,
          body,
          otp: fields.otp?.stringValue || parsed.otp,
          service: fields.service?.stringValue || parsed.service,
          timestamp: parseInt(fields.timestamp?.integerValue || Date.now().toString(), 10),
          deviceId: fields.deviceId?.stringValue || 'DEV-SIM',
          deviceName: fields.deviceName?.stringValue || 'Worker Phone',
          receivedAt: parseInt(fields.createdAt?.integerValue || Date.now().toString(), 10),
        };
      });

      // Sort newest first
      messages.sort((a, b) => b.timestamp - a.timestamp);

      // Cache locally
      for (const m of messages) {
        await StorageService.addMessage(m);
      }

      return messages;
    } catch (e) {
      console.warn('Could not sync with Firestore, using cached messages', e);
      return await StorageService.getCachedMessages();
    }
  }

  /**
   * Worker Device: Request to join group (Puts device in PENDING state until admin approves)
   */
  static async requestDeviceJoin(
    projectId: string,
    apiKey: string,
    groupId: string,
    device: { deviceId: string; deviceName: string; model: string }
  ): Promise<'APPROVED' | 'PENDING'> {
    if (!projectId || !groupId) {
      return 'PENDING';
    }

    try {
      const url = apiKey
        ? `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/devices/${device.deviceId}?key=${apiKey}`
        : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/devices/${device.deviceId}`;

      // Check if already approved
      const checkRes = await fetch(url);
      if (checkRes.ok) {
        const existing = await checkRes.json();
        const currentStatus = existing.fields?.status?.stringValue;
        if (currentStatus === 'APPROVED') return 'APPROVED';
        if (currentStatus === 'BLOCKED') return 'PENDING';
      }

      // Create or update request as PENDING
      const body = {
        fields: {
          deviceId: { stringValue: device.deviceId },
          deviceName: { stringValue: device.deviceName },
          model: { stringValue: device.model },
          status: { stringValue: 'PENDING' },
          requestedAt: { integerValue: Date.now().toString() },
          lastPing: { integerValue: Date.now().toString() },
        },
      };

      await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      return 'PENDING';
    } catch (e) {
      console.warn('Failed to register device in Firestore', e);
      return 'PENDING';
    }
  }

  /**
   * Check if worker device is approved by admin
   */
  static async checkDeviceApprovalStatus(
    projectId: string,
    apiKey: string,
    groupId: string,
    deviceId: string
  ): Promise<'APPROVED' | 'PENDING' | 'BLOCKED'> {
    if (!projectId || !groupId) {
      return 'PENDING';
    }

    try {
      const url = apiKey
        ? `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/devices/${deviceId}?key=${apiKey}`
        : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/devices/${deviceId}`;

      const res = await fetch(url);
      if (!res.ok) return 'PENDING';

      const data = await res.json();
      return (data.fields?.status?.stringValue as any) || 'PENDING';
    } catch {
      return 'PENDING';
    }
  }

  /**
   * Admin: Fetch all registered devices for this group
   */
  static async fetchGroupDevices(
    projectId: string,
    apiKey: string,
    groupId: string
  ): Promise<ManagedDevice[]> {
    if (!projectId || !groupId) {
      return await StorageService.getManagedDevices();
    }

    try {
      const url = apiKey
        ? `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/devices?key=${apiKey}`
        : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/devices`;

      const res = await fetch(url);
      if (!res.ok) return await StorageService.getManagedDevices();

      const data = await res.json();
      if (!data.documents) return await StorageService.getManagedDevices();

      const devices: ManagedDevice[] = data.documents.map((doc: any) => {
        const fields = doc.fields || {};
        const parts = doc.name.split('/');
        const deviceId = parts[parts.length - 1];

        return {
          deviceId,
          deviceName: fields.deviceName?.stringValue || 'Worker Phone',
          model: fields.model?.stringValue || 'Android Device',
          status: (fields.status?.stringValue as any) || 'PENDING',
          requestedAt: parseInt(fields.requestedAt?.integerValue || Date.now().toString(), 10),
          lastPingAt: parseInt(fields.lastPing?.integerValue || Date.now().toString(), 10),
        };
      });

      await StorageService.saveManagedDevices(devices);
      return devices;
    } catch (e) {
      console.warn('Failed to fetch devices from Firestore', e);
      return await StorageService.getManagedDevices();
    }
  }

  /**
   * Admin: Approve or block a device
   */
  static async updateDeviceStatus(
    projectId: string,
    apiKey: string,
    groupId: string,
    deviceId: string,
    status: 'APPROVED' | 'BLOCKED'
  ): Promise<boolean> {
    // Update local storage first
    await StorageService.updateDeviceStatus(deviceId, status);

    if (!projectId || !groupId) return true;

    try {
      const url = apiKey
        ? `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/devices/${deviceId}?updateMask.fieldPaths=status&key=${apiKey}`
        : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}/devices/${deviceId}?updateMask.fieldPaths=status`;

      await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            status: { stringValue: status },
          },
        }),
      });
      return true;
    } catch (e) {
      console.warn('Failed to update device status on Firestore', e);
      return false;
    }
  }

  /**
   * Sync Group Filter Configuration (ALL vs SPECIFIC keywords)
   * Uses a plain PATCH with NO updateMask so Firestore creates the document if it doesn't exist.
   * The Admin's filterMode and keywords are written/overwritten every time.
   */
  static async syncGroupFilterConfig(
    projectId: string,
    apiKey: string,
    groupId: string,
    config: FilterConfig
  ): Promise<boolean> {
    await StorageService.saveFilterConfig(config);

    if (!projectId || !groupId) return true;

    try {
      // No updateMask → Firestore will upsert (create if not exists, merge if exists).
      // We send ALL fields we want on the group document to avoid accidental deletion.
      const url = apiKey
        ? `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}?key=${apiKey}`
        : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}`;

      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            filterMode: { stringValue: config.mode },
            keywords: { stringValue: config.keywords.join(',') },
            updatedAt: { integerValue: Date.now().toString() },
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.warn(`Firestore syncGroupFilterConfig failed (${res.status}):`, errText);
        return false;
      }

      console.log(`[CloudSync] Filter config saved to Firestore: mode=${config.mode}, keywords=${config.keywords.join(',')}`);
      return true;
    } catch (e) {
      console.warn('Failed to upload filter config to Firestore', e);
      return false;
    }
  }

  /**
   * Ensure the group document exists in Firestore.
   * Call this when Admin first sets up, before any filter sync.
   * Uses PATCH without updateMask → creates document if not exists.
   */
  static async ensureGroupDocument(
    projectId: string,
    apiKey: string,
    groupId: string,
    groupName: string
  ): Promise<boolean> {
    if (!projectId || !groupId) return false;
    try {
      // First check if it already exists
      const checkUrl = apiKey
        ? `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}?key=${apiKey}`
        : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}`;

      const checkRes = await fetch(checkUrl);
      if (checkRes.ok) {
        // Document exists — no need to create
        return true;
      }

      // Document doesn't exist (404) — create it now
      const patchUrl = apiKey
        ? `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}?key=${apiKey}`
        : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}`;

      const res = await fetch(patchUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            groupId: { stringValue: groupId },
            groupName: { stringValue: groupName },
            filterMode: { stringValue: 'SPECIFIC' },
            keywords: { stringValue: 'otp,code,verification,flipkart,amazon,meesho,bank,sbi,hdfc,icici,axis' },
            createdAt: { integerValue: Date.now().toString() },
          },
        }),
      });

      console.log(`[CloudSync] ensureGroupDocument: created group doc ${groupId}, status=${res.status}`);
      return res.ok;
    } catch (e) {
      console.warn('[CloudSync] ensureGroupDocument failed', e);
      return false;
    }
  }


  /**
   * Fetch Group Filter Configuration from Firestore and update native module.
   * Called by Worker phone every 10s to stay in sync with Admin's filter rules.
   */
  static async fetchGroupFilterConfig(
    projectId: string,
    apiKey: string,
    groupId: string
  ): Promise<FilterConfig | null> {
    if (!projectId || !groupId) return null;

    try {
      const url = apiKey
        ? `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}?key=${apiKey}`
        : `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/groups/${groupId}`;

      const res = await fetch(url);
      if (!res.ok) return null;

      const data = await res.json();
      const fields = data.fields || {};
      const filterMode = (fields.filterMode?.stringValue as 'ALL' | 'SPECIFIC') || 'SPECIFIC';
      const keywordsStr = fields.keywords?.stringValue || '';
      const keywords = keywordsStr
        ? keywordsStr.split(',').map((k: string) => k.trim().toLowerCase()).filter(Boolean)
        : [];

      const config: FilterConfig = {
        mode: filterMode,
        keywords,
      };

      await StorageService.saveFilterConfig(config);
      await SmsBridge.updateFilterSettings(filterMode, keywordsStr);

      return config;
    } catch (e) {
      console.warn('Failed to fetch group filter config', e);
      return null;
    }
  }
}
