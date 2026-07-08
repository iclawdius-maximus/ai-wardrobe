import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/authContext';
import { useNavigation } from '@react-navigation/native';
import { Garment } from '../../lib/database.types';

export default function WardrobeScreen({ navigation }: { navigation: any }) {
  const [garments, setGarments] = useState<Garment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { session } = useAuth();
  const nav = useNavigation();

  const fetchGarments = useCallback(async () => {
    if (!session?.user) return;

    try {
      setError(null);
      const { data, error } = await supabase
        .from('garments')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
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

  const renderGarmentItem = ({ item }: { item: Garment }) => {
    const displayUrl = item.segmented_url || item.image_url;
    const isProcessing = item.segmentation_status === 'not_started' || item.segmentation_status === 'processing';
    const isFailed = item.segmentation_status === 'failed';

    return (
      <TouchableOpacity
        style={styles.garmentCard}
        onPress={() => navigation.navigate('GarmentDetail', { id: item.id })}
      >
        <View style={styles.imageContainer}>
          <Image 
            source={{ uri: displayUrl }} 
            style={styles.garmentImage} 
            contentFit="cover"
            placeholder={{ blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj' }}
            transition={200}
          />
          {isProcessing && (
            <View style={styles.processingOverlay}>
              <ActivityIndicator size="small" color="white" />
              <Text style={styles.processingText}>Processing...</Text>
            </View>
          )}
          {isFailed && (
            <View style={styles.failedOverlay}>
              <Text style={styles.failedText}>Failed</Text>
            </View>
          )}
          <View style={[styles.typeBadge, { backgroundColor: getTypeColor(item.type) }]}>
            <Text style={styles.typeBadgeText}>{item.type}</Text>
          </View>
        </View>
        <Text style={styles.nickname} numberOfLines={1} ellipsizeMode="tail">
          {item.nickname || 'Unnamed Garment'}
        </Text>
      </TouchableOpacity>
    );
  };

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

  const renderEmptyState = () => (
    <View style={styles.emptyStateContainer}>
      <Text style={styles.emptyStateText}>Upload your first garment</Text>
      <TouchableOpacity
        style={styles.uploadButton}
        onPress={() => navigation.navigate('GarmentUpload')}
      >
        <Text style={styles.uploadButtonText}>Upload Garment</Text>
      </TouchableOpacity>
    </View>
  );

  const renderErrorState = () => (
    <View style={styles.emptyStateContainer}>
      <Text style={styles.emptyStateText}>Failed to load garments</Text>
      <Text style={styles.errorText}>{error}</Text>
      <TouchableOpacity
        style={styles.uploadButton}
        onPress={fetchGarments}
      >
        <Text style={styles.uploadButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  const renderSkeleton = () => (
    <View style={styles.skeletonContainer}>
      {[...Array(4)].map((_, index) => (
        <View key={index} style={styles.skeletonCard} />
      ))}
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={garments}
        renderItem={renderGarmentItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper}
        contentContainerStyle={garments.length === 0 ? styles.emptyContainer : styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={loading ? renderSkeleton : (error ? renderErrorState : renderEmptyState)}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>My Wardrobe</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => navigation.navigate('GarmentUpload')}
            >
              <Text style={styles.addButtonText}>+</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  addButton: {
    backgroundColor: '#007AFF',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
  listContainer: {
    padding: 10,
  },
  emptyContainer: {
    flex: 1,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  garmentCard: {
    backgroundColor: 'white',
    borderRadius: 10,
    margin: 5,
    width: '48%',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  imageContainer: {
    position: 'relative',
  },
  garmentImage: {
    width: '100%',
    height: 150,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  typeBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: '#666666',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  typeBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  processingText: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
  },
  failedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,59,48,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  failedText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  nickname: {
    padding: 10,
    fontSize: 14,
    fontWeight: '500',
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
  uploadButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  uploadButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  skeletonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    padding: 10,
  },
  skeletonCard: {
    backgroundColor: '#e0e0e0',
    borderRadius: 10,
    margin: 5,
    width: '48%',
    height: 200,
  },
});