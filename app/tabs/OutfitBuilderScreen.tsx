import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/authContext';
import { useNavigation } from '@react-navigation/native';
import { Garment } from '../../lib/database.types';

// Define garment types in order
const GARMENT_TYPES = [
  { key: 'top', label: 'Tops' },
  { key: 'bottom', label: 'Bottoms' },
  { key: 'dress', label: 'Dresses' },
  { key: 'outerwear', label: 'Outerwear' },
  { key: 'shoes', label: 'Shoes' },
  { key: 'accessory', label: 'Accessories' },
];

export default function OutfitBuilderScreen() {
  const [garments, setGarments] = useState<Garment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedGarments, setSelectedGarments] = useState<Record<string, string>>({});
  const { session } = useAuth();
  const navigation: any = useNavigation();

  const fetchGarments = useCallback(async () => {
    if (!session?.user) return;

    try {
      setError(null);
      const { data, error } = await supabase
        .from('garments')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw new Error(`Database query failed: ${error.message || 'Unknown error'}`);
      setGarments(data || []);
    } catch (error) {
      console.error('Error fetching garments:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch garments';
      setError(errorMessage);
      Alert.alert('Error', errorMessage);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [session]);

  useEffect(() => {
    fetchGarments();
  }, [fetchGarments]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchGarments();
  }, [fetchGarments]);

  const handleGarmentSelect = (garmentId: string, type: string) => {
    setSelectedGarments(prev => ({
      ...prev,
      [type]: prev[type] === garmentId ? '' : garmentId
    }));
  };

  const handleRender = () => {
    const selectedIds = Object.values(selectedGarments).filter(id => id !== '');
    if (selectedIds.length === 0) {
      Alert.alert('No Garments Selected', 'Please select at least one garment to render.');
      return;
    }
    
    if (session?.user?.id) {
      navigation.navigate('RenderResult', { 
        garment_ids: selectedIds,
        user_id: session.user.id
      });
    }
  };

  const groupGarmentsByType = () => {
    const grouped: Record<string, Garment[]> = {};
    
    GARMENT_TYPES.forEach(type => {
      grouped[type.key] = [];
    });
    
    garments.forEach(garment => {
      if (grouped[garment.type]) {
        grouped[garment.type].push(garment);
      }
    });
    
    return grouped;
  };

  const renderGarmentItem = (garment: Garment) => {
    const isSelected = selectedGarments[garment.type] === garment.id;
    
    return (
      <TouchableOpacity
        key={garment.id}
        style={[styles.garmentItem, isSelected && styles.selectedGarment]}
        onPress={() => handleGarmentSelect(garment.id, garment.type)}
      >
        <Image source={{ uri: garment.image_url }} style={styles.garmentImage} resizeMode="cover" />
        <Text style={styles.garmentName} numberOfLines={1} ellipsizeMode="tail">
          {garment.nickname || 'Unnamed Garment'}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderGarmentSection = (type: string, label: string, garments: Garment[]) => {
    if (garments.length === 0) return null;
    
    return (
      <View style={styles.section} key={type}>
        <Text style={styles.sectionTitle}>{label}</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.horizontalScroll}
          contentContainerStyle={styles.scrollContent}
        >
          {garments.map(renderGarmentItem)}
        </ScrollView>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyStateContainer}>
      <Text style={styles.emptyStateText}>No garments in your wardrobe yet</Text>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => navigation.navigate('GarmentUpload')}
      >
        <Text style={styles.addButtonText}>Add Garments</Text>
      </TouchableOpacity>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.emptyStateContainer}>
      <Text style={styles.emptyStateText}>Failed to load garments</Text>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity
        style={styles.addButton}
        onPress={fetchGarments}
      >
        <Text style={styles.addButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const renderLoadingState = () => (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#007AFF" />
      <Text style={styles.loadingText}>Loading your wardrobe...</Text>
    </View>
  );

  if (loading) {
    return renderLoadingState();
  }

  const groupedGarments = groupGarmentsByType();
  const hasGarments = garments.length > 0;
  const isRenderButtonEnabled = Object.values(selectedGarments).some(id => id !== '');

  return (
    <View style={styles.container}>
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.scrollContainer}
      >
        {error ? (
          renderErrorState()
        ) : hasGarments ? (
          <>
            <Text style={styles.title}>Build Your Outfit</Text>
            {GARMENT_TYPES.map(type => 
              renderGarmentSection(type.key, type.label, groupedGarments[type.key])
            )}
          </>
        ) : (
          renderEmptyState()
        )}
      </ScrollView>
      
      {hasGarments && (
        <TouchableOpacity
          style={[styles.renderButton, !isRenderButtonEnabled && styles.disabledButton]}
          onPress={handleRender}
          disabled={!isRenderButtonEnabled}
        >
          <Text style={styles.renderButtonText}>Render Outfit</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContainer: {
    paddingBottom: 80,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    padding: 20,
    paddingTop: 50,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  horizontalScroll: {
    flexGrow: 0,
  },
  scrollContent: {
    paddingHorizontal: 20,
  },
  garmentItem: {
    width: 120,
    marginRight: 15,
    backgroundColor: 'white',
    borderRadius: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  selectedGarment: {
    borderWidth: 3,
    borderColor: '#007AFF',
  },
  garmentImage: {
    width: '100%',
    height: 120,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  garmentName: {
    padding: 8,
    fontSize: 12,
    textAlign: 'center',
  },
  renderButton: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: '#007AFF',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  disabledButton: {
    backgroundColor: '#cccccc',
  },
  renderButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  emptyStateContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyStateText: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 20,
    color: '#FF3B30',
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  addButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
});