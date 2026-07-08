import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Image,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/authContext';
import { useNavigation } from '@react-navigation/native';
import { SegmentationService } from '../../lib/segmentation/SegmentationService';


export default function GarmentUploadScreen({ navigation }: { navigation: any }) {
  const [image, setImage] = useState<string | null>(null);
  const [brand, setBrand] = useState('');
  const [nickname, setNickname] = useState('');
  const [type, setType] = useState<'top' | 'bottom' | 'dress' | 'outerwear' | 'shoes' | 'accessory'>('top');
  const [color, setColor] = useState('');
  const [fabric, setFabric] = useState('');
  const [loading, setLoading] = useState(false);
  const { session } = useAuth();
  const nav = useNavigation();

  const types = ['top', 'bottom', 'dress', 'outerwear', 'shoes', 'accessory'];

  const pickImage = async (source: 'camera' | 'gallery') => {
    try {
      let result;
      
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Camera permission is required to take photos');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission needed', 'Gallery permission is required to select photos');
          return;
        }
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [4, 3],
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets && result.assets.length > 0) {
        // Compress image to max 1024x1024
        const compressedImage = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1024, height: 1024 } }],
          { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG }
        );
        setImage(compressedImage.uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const uploadGarment = async () => {
    if (!image) {
      Alert.alert('Error', 'Please select an image first');
      return;
    }

    if (!session?.user) {
      Alert.alert('Error', 'You must be logged in to upload a garment');
      return;
    }

    setLoading(true);

    try {
      // Upload image to Supabase Storage using expo-file-system
      const fileName = `${session.user.id}/${Date.now()}.jpg`;
      const base64 = await FileSystem.readAsStringAsync(image, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const byteArray = Uint8Array.from(atob(base64), c => c.charCodeAt(0));

      const { error: uploadError } = await supabase.storage
        .from('garments')
        .upload(fileName, byteArray, { contentType: 'image/jpeg', upsert: true });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message || 'Unknown error'}`);
      }

      // Get public URL for the uploaded image
      const { data: urlData } = supabase.storage
        .from('garments')
        .getPublicUrl(fileName);

      // Insert garment record into database
      const { data: garmentData, error: insertError } = await supabase.from('garments').insert([
        {
          user_id: session.user.id,
          image_url: urlData.publicUrl,
          brand: brand || null,
          nickname: nickname || null,
          type: type,
          color: color || null,
          fabric: fabric || null,
          segmentation_status: 'not_started',
        },
      ]).select();

      if (insertError) {
        // If database insert fails, try to delete the uploaded image
        await supabase.storage.from('garments').remove([fileName]);
        throw new Error(`Database insert failed: ${insertError.message || 'Unknown error'}`);
      }

      // Trigger segmentation pipeline
      if (garmentData && garmentData.length > 0) {
        const garmentId = garmentData[0].id;
        try {
          // Queue garment for segmentation (batching)
          const segmentationService = SegmentationService.getInstance();
          await segmentationService.queueSegmentation(garmentId);
        } catch (segmentationError) {
          console.error('Failed to queue segmentation pipeline:', segmentationError);
          // Note: We don't throw here because the garment upload was successful
          Alert.alert('Warning', 'Garment uploaded but segmentation failed. You can try again later.');
        }
      }

      // Success
      Alert.alert('Success', 'Garment uploaded successfully!');
      navigation.navigate('MainTabs', { screen: 'Wardrobe' });
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to upload garment';
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Upload Garment</Text>
      
      {/* Camera and Gallery buttons */}
      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.imageButton}
          onPress={() => pickImage('camera')}
          disabled={loading}
        >
          <Text style={styles.buttonText}>📸 Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.imageButton}
          onPress={() => pickImage('gallery')}
          disabled={loading}
        >
          <Text style={styles.buttonText}>🖼️ Gallery</Text>
        </TouchableOpacity>
      </View>

      {/* Image preview */}
      {image && (
        <View style={styles.imagePreviewContainer}>
          <Image source={{ uri: image }} style={styles.imagePreview} resizeMode="contain" />
        </View>
      )}

      {/* Metadata form */}
      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="Brand (optional)"
          value={brand}
          onChangeText={setBrand}
          editable={!loading}
        />
        
        <TextInput
          style={styles.input}
          placeholder="Nickname (optional)"
          value={nickname}
          onChangeText={setNickname}
          editable={!loading}
        />
        
        <View style={styles.pickerContainer}>
          <Text style={styles.pickerLabel}>Type:</Text>
          <View style={styles.pickerWrapper}>
            {types.map((t) => (
              <TouchableOpacity
                key={t}
                style={[
                  styles.pickerItem,
                  type === t && styles.pickerItemSelected,
                ]}
                onPress={() => setType(t as any)}
                disabled={loading}
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    type === t && styles.pickerItemTextSelected,
                  ]}
                >
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        
        <TextInput
          style={styles.input}
          placeholder="Color (optional)"
          value={color}
          onChangeText={setColor}
          editable={!loading}
        />
        
        <TextInput
          style={styles.input}
          placeholder="Fabric (optional)"
          value={fabric}
          onChangeText={setFabric}
          editable={!loading}
        />
        
        <TouchableOpacity
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={uploadGarment}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.saveButtonText}>Save Garment</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 20,
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 20,
  },
  imageButton: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    minWidth: 120,
  },
  buttonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  imagePreviewContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  imagePreview: {
    width: 300,
    height: 300,
    borderRadius: 10,
  },
  form: {
    padding: 20,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
    fontSize: 16,
  },
  pickerContainer: {
    marginBottom: 15,
  },
  pickerLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  pickerWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  pickerItem: {
    backgroundColor: '#e0e0e0',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginRight: 10,
    marginBottom: 10,
  },
  pickerItemSelected: {
    backgroundColor: '#007AFF',
  },
  pickerItemText: {
    color: '#333',
  },
  pickerItemTextSelected: {
    color: 'white',
  },
  saveButton: {
    backgroundColor: '#34C759',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonDisabled: {
    backgroundColor: '#a0a0a0',
  },
  saveButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
});