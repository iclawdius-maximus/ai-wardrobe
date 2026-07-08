import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, ActivityIndicator } from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/authContext';
import { useNavigation } from '@react-navigation/native';

export default function ScanProgressScreen() {
  const [status, setStatus] = useState<string>('uploading');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Uploading your scan...');
  const { session } = useAuth();
  const navigation = useNavigation();

  useEffect(() => {
    if (!session?.user) return;

    const interval = setInterval(async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('body_scan_status, body_scan_progress, body_scan_message')
          .eq('id', session.user.id)
          .single();

        if (error) {
          console.error('Error fetching profile status:', error);
          return;
        }

        setStatus(data.body_scan_status);
        if (data.body_scan_progress != null) setProgress(data.body_scan_progress);
        if (data.body_scan_message) setMessage(data.body_scan_message);

        if (data.body_scan_status === 'complete') {
          clearInterval(interval);
        }
      } catch (error) {
        console.error('Error polling profile status:', error);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [session]);

  const retryScan = () => {
    navigation.navigate('BodyScan' as never);
  };

  const continueToWardrobe = () => {
    navigation.navigate('MainTabs' as never);
  };

  const goBack = () => {
    navigation.navigate('MainTabs' as never);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Scan Progress</Text>

      {status === 'failed' ? (
        <View style={styles.stateContainer}>
          <Text style={[styles.icon, styles.errorIcon]}>⚠</Text>
          <Text style={styles.stateTitle}>Scan Processing Failed</Text>
          <Text style={styles.stateDescription}>{message || 'An error occurred during processing.'}</Text>
          <TouchableOpacity style={styles.button} onPress={retryScan}>
            <Text style={styles.buttonText}>Retry Scan</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backButton} onPress={goBack}>
            <Text style={styles.backButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      ) : status === 'complete' ? (
        <View style={styles.stateContainer}>
          <Text style={[styles.icon, styles.checkmark]}>✓</Text>
          <Text style={styles.stateTitle}>Scan Complete!</Text>
          <Text style={styles.stateDescription}>
            Your body measurements have been successfully processed. You can now create personalized outfits.
          </Text>
          <TouchableOpacity style={styles.button} onPress={continueToWardrobe}>
            <Text style={styles.buttonText}>Continue to Wardrobe</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="large" color="#007AFF" style={styles.icon} />
          <Text style={styles.stateTitle}>
            {status === 'uploading' ? 'Uploading Your Scan' : 'Processing Your Scan'}
          </Text>
          <Text style={styles.stateDescription}>{message}</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${Math.min(progress, 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>{progress}%</Text>
          <TouchableOpacity style={styles.backButton} onPress={goBack}>
            <Text style={styles.backButtonText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
  },
  stateContainer: {
    alignItems: 'center',
    padding: 20,
  },
  icon: {
    fontSize: 48,
    marginBottom: 20,
  },
  checkmark: {
    color: '#34C759',
  },
  errorIcon: {
    color: '#FF3B30',
  },
  stateTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
  },
  stateDescription: {
    fontSize: 16,
    textAlign: 'center',
    color: '#666',
    marginBottom: 20,
    lineHeight: 22,
  },
  progressBar: {
    width: '100%',
    height: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 5,
    marginBottom: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 5,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    marginTop: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
  },
  backButtonText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
});
