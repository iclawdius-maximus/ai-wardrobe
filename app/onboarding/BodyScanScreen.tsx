import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/authContext';
import { useNavigation } from '@react-navigation/native';

type ScanPhase = 'instructions' | 'camera' | 'uploading';

// Decode base64 to Uint8Array (React Native compatible)
function decodeBase64(base64: string): Uint8Array {
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

export default function BodyScanScreen() {
  const [phase, setPhase] = useState<ScanPhase>('instructions');
  const [isRecording, setIsRecording] = useState(false);
  const [videoUri, setVideoUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const cameraRef = useRef<CameraView>(null);
  const { session } = useAuth();
  const navigation = useNavigation();

  const handleStartScan = async () => {
    try {
      if (!permission?.granted) {
        const result = await requestPermission();
        if (!result.granted) {
          Alert.alert(
            'Camera Required',
            'Body scan needs camera access. Please enable camera permissions in Settings.',
            [{ text: 'OK' }]
          );
          return;
        }
      }
      setPhase('camera');
      setVideoUri(null);
      setError(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start camera';
      setError(msg);
      Alert.alert('Error', msg);
    }
  };

  const toggleFacing = useCallback(() => {
    setFacing(prev => (prev === 'front' ? 'back' : 'front'));
  }, []);

  const startRecording = useCallback(async () => {
    if (!cameraRef.current || isRecording) return;
    try {
      setIsRecording(true);
      const video = await cameraRef.current.recordAsync({
        maxDuration: 30,
      });
      if (video?.uri) {
        setVideoUri(video.uri);
        setIsRecording(false);
      }
    } catch (err) {
      setIsRecording(false);
      const msg = err instanceof Error ? err.message : 'Failed to record video';
      Alert.alert('Recording Error', msg);
    }
  }, [isRecording]);

  const stopRecording = useCallback(async () => {
    if (!cameraRef.current || !isRecording) return;
    try {
      await cameraRef.current.stopRecording();
    } catch (err) {
      // stopRecording may throw if already stopped
    }
    setIsRecording(false);
  }, [isRecording]);

  const retakeVideo = useCallback(() => {
    setVideoUri(null);
    setError(null);
  }, []);

  const uploadScan = useCallback(async () => {
    if (!session?.user?.id || !videoUri) return;

    setIsUploading(true);
    setPhase('uploading');
    setError(null);

    try {
      const fileName = `body-scan/${session.user.id}/${Date.now()}.mp4`;

      // Remove any previous scan data before starting a new one
      const { data: existing } = await supabase
        .from('profiles')
        .select('body_scan_photos')
        .eq('id', session.user.id)
        .single();

      if (existing?.body_scan_photos?.length) {
        // Delete old scan video from storage
        const oldPath = existing.body_scan_photos[0].split('/').slice(-2).join('/');
        await supabase.storage.from('body-scans').remove([oldPath]);
      }

      // Reset profile scan data
      await supabase
        .from('profiles')
        .update({
          body_scan_status: 'uploading',
          body_scan_progress: 0,
          body_scan_message: '',
          body_measurements: null,
          body_scan_photos: [],
          lora_url: null,
        })
        .eq('id', session.user.id);

      // Read file as base64, then upload via Supabase client
      const base64 = await FileSystem.readAsStringAsync(videoUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const { data, error } = await supabase.storage
        .from('body-scans')
        .upload(fileName, decodeBase64(base64), {
          contentType: 'video/mp4',
          upsert: true,
        });

      if (error) throw error;

      const { data: { publicUrl } } = supabase.storage
        .from('body-scans')
        .getPublicUrl(fileName);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          body_scan_status: 'uploaded',
          body_scan_progress: 0,
          body_scan_message: 'Upload complete, waiting for processing...',
          body_scan_photos: [publicUrl],
          body_scan_updated_at: new Date().toISOString(),
        })
        .eq('id', session.user.id);

      if (updateError) throw updateError;

      navigation.navigate('ScanProgress' as never);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
      setPhase('camera');
      setIsUploading(false);
      Alert.alert('Upload Error', msg);
    }
  }, [session, videoUri, navigation]);

  if (phase === 'camera' && permission?.granted) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={facing}
          mode="video"
          videoQuality="720p"
        >
          <View style={styles.cameraOverlay}>
            <TouchableOpacity style={styles.flipButton} onPress={toggleFacing}>
              <Text style={styles.flipButtonText}>⟳ Flip</Text>
            </TouchableOpacity>

            {videoUri ? (
              <View style={styles.previewOverlay}>
                <Text style={styles.previewText}>Video captured!</Text>
                <View style={styles.previewButtons}>
                  <TouchableOpacity style={styles.retakeButton} onPress={retakeVideo}>
                    <Text style={styles.retakeButtonText}>Retake</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.uploadButton} onPress={uploadScan}>
                    <Text style={styles.uploadButtonText}>Use Video</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                <Text style={styles.cameraHint}>
                  {isRecording
                    ? 'Recording... slowly turn 360°'
                    : 'Press record, then slowly turn 360°'}
                </Text>

                <View style={styles.cameraControls}>
                  <TouchableOpacity
                    style={[styles.recordButton, isRecording && styles.recordingActive]}
                    onPress={isRecording ? stopRecording : startRecording}
                  >
                    <View style={[styles.recordInner, isRecording && styles.recordInnerActive]} />
                  </TouchableOpacity>
                </View>

                {isRecording && (
                  <Text style={styles.recordingIndicator}>● REC</Text>
                )}
              </>
            )}
          </View>
        </CameraView>
      </View>
    );
  }

  if (phase === 'uploading') {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.uploadingText}>Uploading your scan...</Text>
        <TouchableOpacity
          style={styles.cancelUploadButton}
          onPress={() => {
            setPhase('camera');
            setVideoUri(null);
            setIsUploading(false);
            setError(null);
          }}
        >
          <Text style={styles.cancelUploadText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Body Scan Setup</Text>

      <View style={styles.instructionsContainer}>
        <Text style={styles.instructionsTitle}>Instructions</Text>
        <Text style={styles.instructions}>
          Record a 360° video of yourself:
        </Text>
        <Text style={styles.bullet}>• Wear form-fitting clothing</Text>
        <Text style={styles.bullet}>• Stand in good lighting</Text>
        <Text style={styles.bullet}>• Slowly turn 360° in front of the camera</Text>
        <Text style={styles.bullet}>• Keep arms slightly away from your body</Text>
        <Text style={styles.bullet}>• Use the flip button to switch cameras</Text>
      </View>

      {error && (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => setError(null)}
          >
            <Text style={styles.retryButtonText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.button} onPress={handleStartScan}>
        <Text style={styles.buttonText}>Start Body Scan</Text>
      </TouchableOpacity>
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
  instructionsContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
  },
  instructionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 10,
  },
  instructions: {
    fontSize: 16,
    color: '#666',
    marginBottom: 10,
  },
  bullet: {
    fontSize: 15,
    color: '#555',
    marginBottom: 8,
    paddingLeft: 10,
  },
  uploadingText: {
    fontSize: 16,
    color: '#666',
    marginTop: 15,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  errorContainer: {
    backgroundColor: '#ffebee',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
    alignItems: 'center',
  },
  errorText: {
    color: '#c62828',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: '#c62828',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 4,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: 'black',
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 50,
    alignItems: 'center',
  },
  flipButton: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  flipButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  cameraHint: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cameraControls: {
    alignItems: 'center',
    marginBottom: 20,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recordingActive: {
    borderColor: '#ff4444',
  },
  recordInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#ff4444',
  },
  recordInnerActive: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: '#ff4444',
  },
  recordingIndicator: {
    color: '#ff4444',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  previewOverlay: {
    alignItems: 'center',
    marginBottom: 40,
  },
  previewText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  previewButtons: {
    flexDirection: 'row',
    gap: 20,
  },
  retakeButton: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  retakeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  uploadButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 8,
  },
  uploadButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelUploadButton: {
    marginTop: 24,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ccc',
    alignSelf: 'center',
  },
  cancelUploadText: {
    color: '#666',
    fontSize: 14,
    fontWeight: '600',
  },
});
