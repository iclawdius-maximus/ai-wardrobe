import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import * as Updates from 'expo-updates';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/authContext';

export default function ProfileScreen() {
  const { session } = useAuth();
  const [modelPhotoUrl, setModelPhotoUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!session?.user?.id) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('model_photo_url')
        .eq('id', session.user.id)
        .single();

      if (error) return;
      setModelPhotoUrl(data.model_photo_url || null);
    } finally {
      setLoading(false);
    }
  }, [session]);

  React.useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

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
      const msg = err instanceof Error ? err.message : (err as any)?.message || JSON.stringify(err);
      Alert.alert('Error', typeof msg === 'string' ? msg : 'Upload failed');
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
          A front-facing full-body photo used for virtual try-on rendering.
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
                {uploadingPhoto ? (
                  <ActivityIndicator color="#333" />
                ) : (
                  <Text style={styles.secondaryButtonText}>📸 Retake</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => uploadModelPhoto('gallery')}
                disabled={uploadingPhoto}
              >
                <Text style={styles.secondaryButtonText}>🖼️ Choose</Text>
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

        {!modelPhotoUrl && !loading && (
          <Text style={styles.hint}>
            ⚠️ You need a model photo to render outfits. Take or upload a full-body photo.
          </Text>
        )}
      </View>

      <View style={styles.divider} />

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
    width: 180,
    height: 240,
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
  hint: {
    fontSize: 13,
    color: '#FF3B30',
    marginTop: 12,
    textAlign: 'center',
  },
  divider: {
    height: 1,
    backgroundColor: '#f0f0f0',
    marginBottom: 20,
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