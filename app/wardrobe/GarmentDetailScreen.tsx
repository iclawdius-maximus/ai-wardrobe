import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/authContext';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Garment } from '../../lib/database.types';

export default function GarmentDetailScreen({ navigation }: { navigation: any }) {
  const [garment, setGarment] = useState<Garment | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [brand, setBrand] = useState('');
  const [nickname, setNickname] = useState('');
  const [color, setColor] = useState('');
  const [fabric, setFabric] = useState('');
  const [saving, setSaving] = useState(false);
  const { session } = useAuth();
  const nav = useNavigation();
  const route = useRoute();
  const { id } = route.params as { id: string };

  useEffect(() => {
    if (id && session?.user) {
      fetchGarment();
    }
  }, [id, session]);

  const fetchGarment = async () => {
    try {
      const { data, error } = await supabase
        .from('garments')
        .select('*')
        .eq('id', id)
        .eq('user_id', session?.user.id)
        .single();

      if (error) throw error;
      
      setGarment(data);
      setBrand(data.brand || '');
      setNickname(data.nickname || '');
      setColor(data.color || '');
      setFabric(data.fabric || '');
    } catch (error) {
      console.error('Error fetching garment:', error);
      Alert.alert('Error', 'Failed to fetch garment details');
    } finally {
      setLoading(false);
    }
  };

  const saveEdits = async () => {
    if (!garment || !session?.user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('garments')
        .update({
          brand: brand || null,
          nickname: nickname || null,
          color: color || null,
          fabric: fabric || null,
        })
        .eq('id', garment.id)
        .eq('user_id', session.user.id);

      if (error) throw error;

      // Update local state
      setGarment({
        ...garment,
        brand: brand || null,
        nickname: nickname || null,
        color: color || null,
        fabric: fabric || null,
      });

      setEditing(false);
      Alert.alert('Success', 'Garment updated successfully');
    } catch (error) {
      console.error('Error updating garment:', error);
      Alert.alert('Error', 'Failed to update garment');
    } finally {
      setSaving(false);
    }
  };

  const deleteGarment = async () => {
    if (!garment || !session?.user) return;

    Alert.alert(
      'Delete Garment',
      'Are you sure you want to delete this garment? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete from database
              const { error: deleteError } = await supabase
                .from('garments')
                .delete()
                .eq('id', garment.id)
                .eq('user_id', session.user.id);

              if (deleteError) throw new Error(`Database delete failed: ${deleteError.message || 'Unknown error'}`);

              // Navigate back to wardrobe
              navigation.navigate('MainTabs', { screen: 'Wardrobe' });
              Alert.alert('Success', 'Garment deleted successfully');
            } catch (error) {
              console.error('Error deleting garment:', error);
              const errorMessage = error instanceof Error ? error.message : 'Failed to delete garment';
              Alert.alert('Error', errorMessage);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  if (!garment) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Garment not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.imageContainer}>
        <Image source={{ uri: garment.segmented_url || garment.image_url }} style={styles.garmentImage} resizeMode="contain" />
        {garment.segmentation_status === 'not_started' || garment.segmentation_status === 'processing' ? (
          <View style={styles.processingOverlay}>
            <ActivityIndicator size="small" color="white" />
            <Text style={styles.processingText}>Processing...</Text>
          </View>
        ) : garment.segmentation_status === 'failed' ? (
          <View style={styles.failedOverlay}>
            <Text style={styles.failedText}>Segmentation Failed</Text>
          </View>
        ) : null}
        <View style={[styles.typeBadge, { backgroundColor: getTypeColor(garment.type) }]}>
          <Text style={styles.typeBadgeText}>{garment.type}</Text>
        </View>
      </View>

      <View style={styles.content}>
        {garment.segmentation_status === 'complete' && (
          <Text style={styles.segmentedBadge}>✓ Background removed</Text>
        )}

        {editing ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Brand"
              value={brand}
              onChangeText={setBrand}
            />
            <TextInput
              style={styles.input}
              placeholder="Nickname"
              value={nickname}
              onChangeText={setNickname}
            />
            <View style={styles.infoRow}>
              <Text style={styles.label}>Type:</Text>
              <Text style={styles.value}>{garment.type}</Text>
            </View>
            <TextInput
              style={styles.input}
              placeholder="Color"
              value={color}
              onChangeText={setColor}
            />
            <TextInput
              style={styles.input}
              placeholder="Fabric"
              value={fabric}
              onChangeText={setFabric}
            />
          </>
        ) : (
          <>
            <Text style={styles.nickname}>{garment.nickname || 'Unnamed Garment'}</Text>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Brand:</Text>
              <Text style={styles.value}>{garment.brand || 'Not specified'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Type:</Text>
              <Text style={styles.value}>{garment.type}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Color:</Text>
              <Text style={styles.value}>{garment.color || 'Not specified'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Fabric:</Text>
              <Text style={styles.value}>{garment.fabric || 'Not specified'}</Text>
            </View>
          </>
        )}

        <View style={styles.buttonContainer}>
          {editing ? (
            <>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => setEditing(false)}
                disabled={saving}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.saveButton, saving && styles.disabledButton]}
                onPress={saveEdits}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <Text style={styles.saveButtonText}>Save</Text>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.button, styles.editButton]}
                onPress={() => setEditing(true)}
              >
                <Text style={styles.editButtonText}>Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.deleteButton]}
                onPress={deleteGarment}
              >
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </ScrollView>
  );
}

const getTypeColor = (type: string) => {
  const colors: Record<string, string> = {
    top: '#FF6B6B',
    bottom: '#4ECDC4',
    dress: '#FFBE0B',
    outerwear: '#8338EC',
    shoes: '#FB5607',
    accessory: '#3A86FF',
  };
  return colors[type] || '#666666';
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  imageContainer: {
    position: 'relative',
    width: '100%',
    height: 300,
  },
  garmentImage: {
    width: '100%',
    height: '100%',
  },
  typeBadge: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: '#666666',
    borderRadius: 15,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  typeBadgeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  processingText: {
    color: 'white',
    fontSize: 14,
    marginTop: 4,
  },
  failedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,59,48,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  failedText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  segmentedBadge: {
    fontSize: 14,
    color: '#34C759',
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
  },
  content: {
    padding: 20,
  },
  nickname: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  value: {
    fontSize: 16,
    color: '#666',
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
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
  },
  button: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  editButton: {
    backgroundColor: '#007AFF',
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  saveButton: {
    backgroundColor: '#34C759',
  },
  cancelButton: {
    backgroundColor: '#8E8E93',
  },
  disabledButton: {
    backgroundColor: '#a0a0a0',
  },
  editButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  deleteButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  saveButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  cancelButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  errorText: {
    textAlign: 'center',
    fontSize: 18,
    color: '#666',
    marginTop: 50,
  },
});