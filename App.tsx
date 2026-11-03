import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Colors } from './src/theme/colors';
import { StorageService } from './src/services/storage';
import { RoleSelectScreen } from './src/screens/RoleSelectScreen';
import { AdminAuthScreen } from './src/screens/AdminAuthScreen';
import { AdminDashboardScreen } from './src/screens/AdminDashboardScreen';
import { AdminSettingsScreen } from './src/screens/AdminSettingsScreen';
import { AdminDevicesScreen } from './src/screens/AdminDevicesScreen';
import { AdminWorkerControlScreen } from './src/screens/AdminWorkerControlScreen';
import { WorkerSetupScreen } from './src/screens/WorkerSetupScreen';

export default function App() {
  const [role, setRole] = useState<'ADMIN' | 'WORKER' | null>(null);
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false);
  const [adminScreen, setAdminScreen] = useState<'FEED' | 'SETTINGS' | 'DEVICES' | 'WORKER_CONTROL'>('FEED');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkSavedRole();
  }, []);

  const checkSavedRole = async () => {
    try {
      const savedRole = await StorageService.getRole();
      if (savedRole) {
        setRole(savedRole);
      }
    } catch (e) {
      console.warn('Error reading stored role', e);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectRole = async (selectedRole: 'ADMIN' | 'WORKER') => {
    await StorageService.setRole(selectedRole);
    setRole(selectedRole);
    if (selectedRole === 'WORKER') {
      setIsAdminUnlocked(false);
    }
  };

  const handleResetRole = async () => {
    await StorageService.clearRole();
    setRole(null);
    setIsAdminUnlocked(false);
    setAdminScreen('FEED');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider style={styles.root}>
      <StatusBar barStyle="light-content" />

      {/* 1. ROLE NOT CHOSEN YET */}
      {!role && <RoleSelectScreen onSelectRole={handleSelectRole} />}

      {/* 2. ADMIN ROLE */}
      {role === 'ADMIN' && !isAdminUnlocked && (
        <AdminAuthScreen
          onAuthenticated={() => setIsAdminUnlocked(true)}
          onBackToRoles={handleResetRole}
        />
      )}

      {role === 'ADMIN' && isAdminUnlocked && (
        <>
          {adminScreen === 'FEED' && (
            <AdminDashboardScreen
              onNavigateToDevices={() => setAdminScreen('DEVICES')}
              onNavigateToSettings={() => setAdminScreen('SETTINGS')}
              onNavigateToWorkerControl={() => setAdminScreen('WORKER_CONTROL')}
            />
          )}

          {adminScreen === 'SETTINGS' && (
            <AdminSettingsScreen
              onBack={() => setAdminScreen('FEED')}
              onResetRole={handleResetRole}
            />
          )}

          {adminScreen === 'DEVICES' && (
            <AdminDevicesScreen onBack={() => setAdminScreen('FEED')} />
          )}

          {adminScreen === 'WORKER_CONTROL' && (
            <AdminWorkerControlScreen onBack={() => setAdminScreen('FEED')} />
          )}
        </>
      )}

      {/* 3. WORKER SIM PHONE ROLE */}
      {role === 'WORKER' && <WorkerSetupScreen onBackToRoles={handleResetRole} />}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
