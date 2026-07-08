import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Updates from 'expo-updates';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/authContext';

type ScanStatus = 'not_started' | 'uploaded' | 'processing' | 'complete' | 'failed';

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const [scanStatus, setScanStatus] = useState<ScanStatus>('not_started');
  const [scanProgress, setScanProgress] = useState(0);
  const [scanMessage, setScanMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchScanStatus = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('body_scan_status, body_scan_progress, body_scan_message')
        .eq('id', session.user.id)
        .single();

      if (error) return;
      setScanStatus(data.body_scan_status || 'not_started');
      setScanProgress(data.body_scan_progress || 0);
      setScanMessage(data.body_scan_message || '');
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchScanStatus();
    const interval = setInterval(fetchScanStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchScanStatus]);

  const statusLabel = () => {
    switch (scanStatus) {
      case 'not_started': return 'No scan yet';
      case 'uploaded': return 'Uploading...';
      case 'processing': return `Processing... ${scanProgress}%`;
      case 'complete': return 'Complete';
      case 'failed': return 'Failed';
    }
  };

  const statusColor = () => {
    switch (scanStatus) {
      case 'complete': return '#34C759';
      case 'failed': return '#FF3B30';
      case 'processing':
      case 'uploaded': return '#007AFF';
      default: return '#999';
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      {/* Scan Status Line Item */}
      <TouchableOpacity
        style={styles.statusRow}
        onPress={() => {
          if (scanStatus === 'complete' || scanStatus === 'failed' || scanStatus === 'processing' || scanStatus === 'uploaded') {
            navigation.navigate('ScanProgress');
          }
        }}
      >
        <View style={styles.statusLeft}>
          <Text style={styles.statusLabel}>Body Scan</Text>
          {loading ? (
            <ActivityIndicator size="small" color="#999" />
          ) : (
            <Text style={[styles.statusValue, { color: statusColor() }]}>
              {statusLabel()}
            </Text>
          )}
          {scanMessage && scanStatus !== 'not_started' && (
            <Text style={styles.statusMessage} numberOfLines={1}>{scanMessage}</Text>
          )}
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <View style={styles.divider} />

      {/* Start Scan Button */}
      <TouchableOpacity
        style={styles.button}
        onPress={() => navigation.navigate('BodyScan')}
      >
        <Text style={styles.buttonText}>
          {scanStatus === 'not_started' ? 'Start Body Scan' : 'Re-scan'}
        </Text>
      </TouchableOpacity>

      {/* Version Info */}
      <View style={styles.versionContainer}>
        <Text style={styles.versionText}>
          Runtime: {Updates.runtimeVersion || 'N/A'}
        </Text>
        <Text style={styles.versionText}>
          Update: {Updates.updateId ? Updates.updateId.substring(0, 8) : 'embedded'}
        </Text>
        <Text style={styles.versionText}>
          Channel: {Updates.channel || 'N/A'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    marginTop: 10,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  statusLeft: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 17,
    fontWeight: '500',
    color: '#000',
  },
  statusValue: {
    fontSize: 15,
    marginTop: 2,
  },
  statusMessage: {
    fontSize: 13,
    color: '#999',
    marginTop: 2,
  },
  chevron: {
    fontSize: 24,
    color: '#ccc',
    marginLeft: 10,
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  versionContainer: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 11,
    color: '#bbb',
    marginBottom: 2,
  },
});
