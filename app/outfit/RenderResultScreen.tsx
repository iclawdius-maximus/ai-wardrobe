import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image, TouchableOpacity, Alert } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { RenderPipeline } from '../../lib/rendering/RenderPipeline';
import { RenderStatus, RenderResult } from '../../lib/rendering/types';
import { supabase } from '../../lib/supabase';

export default function RenderResultScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { garment_ids, user_id } = route.params as { garment_ids: string | string[], user_id: string };
  
  const [status, setStatus] = useState<RenderStatus>(RenderStatus.PENDING);
  const [message, setMessage] = useState<string>('Preparing your outfit...');
  const [result, setResult] = useState<RenderResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const renderPipeline = new RenderPipeline();

  useEffect(() => {
    if (!garment_ids || !user_id) {
      setError('Missing required parameters');
      return;
    }
    
    const garmentIds = Array.isArray(garment_ids) ? garment_ids : [garment_ids];
    
    // Start the rendering process
    renderOutfit(garmentIds, user_id);
  }, [garment_ids, user_id]);

  const renderOutfit = async (garmentIds: string[], userId: string) => {
    try {
      const result = await renderPipeline.renderOutfit(
        {
          garment_ids: garmentIds,
          pose: 'front', // Default pose for now
          user_id: userId
        },
        (progress) => {
          setStatus(progress.status);
          if (progress.message) {
            setMessage(progress.message);
          }
          if (progress.error) {
            setError(progress.error);
          }
        }
      );
      
      setResult(result);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setStatus(RenderStatus.FAILED);
      console.error('Render error:', err);
    }
  };

  const handleSave = async () => {
    if (!result || !user_id) return;
    
    try {
      const garmentIds = Array.isArray(garment_ids) ? garment_ids : [garment_ids];
      
      const { error } = await supabase
        .from('outfits')
        .insert({
          user_id: user_id,
          garment_ids: garmentIds,
          rendered_url: result.image_url,
          pose: 'front'
        });

      if (error) throw error;
      
      Alert.alert('Success', 'Outfit saved to your wardrobe!');
    } catch (err) {
      console.error('Error saving outfit:', err);
      Alert.alert('Error', 'Failed to save outfit');
    }
  };

  const handleTryDifferentPose = () => {
    // For now, we'll just restart the render with a different pose
    // In a more advanced implementation, you might have specific poses to cycle through
    setResult(null);
    setError(null);
    setStatus(RenderStatus.PENDING);
    setMessage('Preparing your outfit...');
    
    const garmentIds = Array.isArray(garment_ids) ? garment_ids : [garment_ids];
    renderOutfit(garmentIds, user_id);
  };

  const handleBack = () => {
    navigation.goBack();
  };

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Render Failed</Text>
        <Text style={styles.error}>{error}</Text>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.retryButton} onPress={() => navigation.goBack()}>
            <Text style={styles.buttonText}>Back to Builder</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.retryButton} onPress={() => {
            setError(null);
            setStatus(RenderStatus.PENDING);
            setMessage('Preparing your outfit...');
            const garmentIds = Array.isArray(garment_ids) ? garment_ids : [garment_ids];
            renderOutfit(garmentIds, user_id);
          }}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (result) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Your Outfit</Text>
        <Image source={{ uri: result.image_url }} style={styles.image} resizeMode="contain" />
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.actionButton} onPress={handleSave}>
            <Text style={styles.buttonText}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleTryDifferentPose}>
            <Text style={styles.buttonText}>Try Different Pose</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleBack}>
            <Text style={styles.buttonText}>Back to Wardrobe</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Rendering Outfit</Text>
      
      <View style={styles.progressContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.status}>{message}</Text>
      </View>
      
      <View style={styles.statusMessages}>
        <Text style={[styles.statusStep, status === RenderStatus.PENDING && styles.activeStep]}>
          Preparing your outfit...
        </Text>
        <Text style={[styles.statusStep, status === RenderStatus.PROCESSING && styles.activeStep]}>
          Loading your body model...
        </Text>
        <Text style={[styles.statusStep, status === RenderStatus.PROCESSING && styles.activeStep]}>
          Generating your outfit...
        </Text>
        <Text style={[styles.statusStep, status === RenderStatus.PROCESSING && styles.activeStep]}>
          Finalizing...
        </Text>
      </View>
      
      <TouchableOpacity 
        style={styles.cancelButton} 
        onPress={handleBack}
      >
        <Text style={styles.cancelButtonText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#f5f5f5',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
  },
  progressContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  status: {
    fontSize: 16,
    marginVertical: 10,
    textAlign: 'center',
  },
  statusMessages: {
    width: '100%',
    marginBottom: 30,
  },
  statusStep: {
    fontSize: 14,
    color: '#999',
    marginVertical: 5,
    textAlign: 'center',
  },
  activeStep: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  image: {
    width: 300,
    height: 400,
    marginBottom: 30,
    borderRadius: 10,
    backgroundColor: '#e0e0e0',
  },
  buttonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
  },
  actionButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
  },
  retryButton: {
    backgroundColor: '#FF3B30',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 120,
    alignItems: 'center',
    marginHorizontal: 10,
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  error: {
    color: 'red',
    textAlign: 'center',
    marginBottom: 20,
    fontSize: 16,
  },
  cancelButton: {
    marginTop: 20,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
  },
});