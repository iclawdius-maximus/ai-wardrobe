import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as Updates from 'expo-updates';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
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
  const [modelPhotoUrl, setModelPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const fetchScanStatus = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('body_scan_status, body_scan_progress, body_scan_message, model_photo_url')
        .eq('id', session.user.id)
        .single();

      if (error) return;
      setScanStatus(data.body_scan_status || 'not_started');
      setScanProgress(data.body_scan_progress || 0);
      setScanMessage(data.body_scan_message || '');
      setModelPhotoUrl(data.model_photo_url || null);
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

  const uploadModelPhoto = async (source: 'camera' | 'gallery') => {
    if (!session?.user?.id) return;

    try {
      setUploadingPhoto(true);

      let result;
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Camera permission is required');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [3, 4],
          quality: 0.9,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Gallery permission is required');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [3, 4],
          quality: 0.9,
        });
      }

      if (result.canceled || !result.assets?.length) return;

      // Compress and resize
      const compressed = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1024, height: 1024 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );

      // Upload to Supabase storage
      const fileName = `${session.user.id}/model-photo.jpg`;
      const base64 = await FileSystem.readAsStringAsync(compressed.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const byteArray = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      const { error: uploadError } = await supabase.storage
        .from('body-scans')
        .upload(fileName, byteArray, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('body-scans')
        .getPublicUrl(fileName);

      // Update profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ model_photo_url: publicUrl })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

      setModelPhotoUrl(publicUrl);
      Alert.alert('Success', 'Model photo updated! You can now render outfits.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      Alert.alert('Error', msg);
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Profile</Text>

      {/* Model Photo Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Model Photo</Text>
        <Text style={styles.sectionDescription}>
          A front-facing photo used for virtual try-on rendering.
        </Text>

        {modelPhotoUrl ? (
          <View style={styles.modelPhotoContainer}>
            <Image source={{ uri: modelPhotoUrl }} style={styles.modelPhoto} resizeMode="cover" />
            <View style={styles.photoButtons}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => uploadModelPhoto('camera')}
                disabled={uploadingPhoto}
              >
                <Text style={styles.secondaryButtonText}>Retake</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.photoButtons}>
            <TouchableOpacity
              style={styles.photoButton}
              onPress={() => uploadModelPhoto('camera')}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.photoButtonText}>📸 Take Photo</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.photoButton}
              onPress={() => uploadModelPhoto('gallery')}
              disabled={uploadingPhoto}
            >
              <Text style={styles.photoButtonText}>🖼️ Choose</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.divider} />

      {/* Body Scan Status */}
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
  section: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
  },
  modelPhotoContainer: {
    alignItems: 'center',
  },
  modelPhoto: {
    width: 150,
    height: 200,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: '#f0f0f0',
  },
  photoButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  photoButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 120,
  },
  photoButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: 'bold',
  },
  secondaryButton: {
    backgroundColor: '#f0f0f0',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#333',
    fontSize: 14,
    fontWeight: '600',
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