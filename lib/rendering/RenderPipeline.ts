import { RenderService, RenderProgressCallback } from './RenderService';
import { ModelManager } from './ModelManager';
import { GarmentConditioningService } from './GarmentConditioningService';
import { LoRAService } from './LoRAService';
import { RenderRequest, RenderResult, RenderStatus } from './types';
import { supabase } from '../supabase';
import { RenderCache, Garment } from '../database.types';
import { FashnService } from './FashnService';

export class RenderPipeline {
  private renderService: RenderService;
  private modelManager: ModelManager;
  private garmentConditioningService: GarmentConditioningService;
  private loraService: LoRAService;
  private isWarmedUp: boolean = false;

  constructor() {
    this.renderService = new RenderService(this.renderOutfit.bind(this));
    this.modelManager = new ModelManager();
    this.garmentConditioningService = new GarmentConditioningService();
    this.loraService = new LoRAService();
  }

  /**
   * Warm up the render pipeline by loading models and initializing services
   */
  public async warmUp(): Promise<void> {
    if (this.isWarmedUp) {
      return;
    }

    try {
      // Warm up by loading a dummy model (in a real implementation)
      console.log('Render pipeline warming up...');
      
      // Mark as warmed up
      this.isWarmedUp = true;
      console.log('Render pipeline warmed up successfully');
    } catch (error) {
      console.warn('Failed to warm up render pipeline:', error);
      // Don't throw error as this is just optimization
    }
  }

  /**
   * Render a full outfit by orchestrating all pipeline steps
   */
  public async renderOutfit(
    request: RenderRequest,
    onProgress?: RenderProgressCallback
  ): Promise<RenderResult> {
    try {
      // Step 1: Check render cache
      onProgress?.({ status: RenderStatus.PENDING, message: 'Checking cache...' });
      const cachedResult = await this.checkRenderCache(request);
      if (cachedResult) {
        onProgress?.({ status: RenderStatus.COMPLETE, message: 'Using cached result' });
        return cachedResult;
      }

      // Step 2: Run FASHN inference (handles 1-2 garments via chained rendering)
      onProgress?.({ status: RenderStatus.PROCESSING, progress: 10, message: 'Starting render...' });
      const result = await this.runInference(request, onProgress);

      // Step 3: Cache result
      try {
        await this.cacheRenderResult(request, result);
      } catch (error) {
        console.warn('Failed to cache render result:', error);
        // Don't throw here as the render was successful
      }

      // Step 4: Return result
      onProgress?.({ status: RenderStatus.COMPLETE, progress: 100, message: 'Render complete' });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown rendering error';
      onProgress?.({ status: RenderStatus.FAILED, error: errorMessage });
      throw error;
    }
  }

  /**
   * Check if the render result is already cached
   */
  private async checkRenderCache(request: RenderRequest): Promise<RenderResult | null> {
    try {
      const cacheKey = this.generateCacheKey(request);
      
      // Check database cache first
      const { data, error } = await supabase
        .from('render_cache')
        .select('*')
        .eq('cache_key', cacheKey)
        .gt('expires_at', new Date().toISOString())
        .single();
      
      if (error) {
        // No cached result found or error occurred
        return null;
      }
      
      const cached = data as RenderCache;
      
      // Return cached result
      return {
        image_url: cached.image_url,
        cache_key: cached.cache_key,
        timestamp: new Date(cached.created_at).getTime()
      };
    } catch (error) {
      console.warn('Cache check failed:', error);
      return null;
    }
  }

  /**
   * Cache the render result
   */
  private async cacheRenderResult(request: RenderRequest, result: RenderResult): Promise<void> {
    try {
      // Calculate expiration date (30 days from now)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      // Save to database
      const { error } = await supabase
        .from('render_cache')
        .upsert({
          cache_key: result.cache_key,
          image_url: result.image_url,
          created_at: new Date(result.timestamp).toISOString(),
          expires_at: expiresAt.toISOString()
        }, {
          onConflict: 'cache_key'
        });
      
      if (error) {
        console.warn('Failed to cache render result:', error);
      }
    } catch (error) {
      console.warn('Cache save failed:', error);
    }
  }

  /**
   * Layer priority for chained rendering.
   * Base layers first, outerwear last — so jackets go on top of shirts.
   */
  private readonly LAYER_ORDER: Record<string, number> = {
    bottom: 0,
    top: 1,
    dress: 2,    // one-pieces after base layers
    outerwear: 3, // outerwear always last
    shoes: 4,
    accessory: 5,
  };

  /**
   * Run inference using FASHN Virtual Try-On API.
   *
   * Supports up to 2 garments via chained rendering:
   *   - 1 garment: body scan + garment → result
   *   - 2 garments: body scan + garment_1 → intermediate → + garment_2 → final result
   *
   * Garments are sorted by layer priority (base layers first, outerwear last)
   * so that each subsequent FASHN call adds the next garment on top.
   *
   * Flow:
   * 1. Fetch all garment data from Supabase
   * 2. Fetch user's body scan image from Supabase storage
   * 3. Sort garments by layer order
   * 4. Chain FASHN try-on calls (each result becomes the model_image for the next)
   * 5. Return the final result image URL
   */
  private async runInference(
    request: RenderRequest,
    onProgress?: RenderProgressCallback
  ): Promise<RenderResult> {
    const apiKey = process.env.EXPO_PUBLIC_FASHN_API_KEY;
    if (!apiKey) {
      throw new Error('FASHN_API_KEY is not configured. Add EXPO_PUBLIC_FASHN_API_KEY to your .env.local file.');
    }

    const fashn = new FashnService(apiKey);

    // Step 1: Fetch all garment data
    onProgress?.({ status: RenderStatus.PROCESSING, progress: 50, message: 'Loading garment data...' });

    const garmentIds = request.garment_ids.slice(0, 2); // Max 2 garments
    const garments: Garment[] = [];

    for (const id of garmentIds) {
      const { data, error } = await supabase
        .from('garments')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !data) {
        throw new Error(`Failed to load garment ${id}: ${error?.message || 'Not found'}`);
      }

      const garment = data as Garment;
      if (!garment.segmented_url && !garment.image_url) {
        throw new Error(`Garment ${garment.nickname || id} has no image URL`);
      }

      garments.push(garment);
    }

    // Step 2: Fetch user's body scan image
    onProgress?.({ status: RenderStatus.PROCESSING, progress: 55, message: 'Loading body scan...' });

    const modelImageUrl = await this.getBodyScanImageUrl(request.user_id);
    if (!modelImageUrl) {
      throw new Error(
        'No body scan found. Please complete a body scan in the Body Scan tab before rendering outfits.'
      );
    }

    // Step 3: Sort garments by layer order (base layers first, outerwear last)
    const sortedGarments = [...garments].sort((a, b) =>
      (this.LAYER_ORDER[a.type] ?? 99) - (this.LAYER_ORDER[b.type] ?? 99)
    );

    // Step 4: Chain FASHN try-on calls
    let currentModelImage = modelImageUrl;
    const totalSteps = sortedGarments.length;

    for (let i = 0; i < totalSteps; i++) {
      const garment = sortedGarments[i];
      const garmentImageUrl = garment.segmented_url || garment.image_url;
      const category = this.mapGarmentTypeToCategory(garment.type);
      const stepNum = i + 1;
      const baseProgress = 60 + Math.round((i / totalSteps) * 35); // 60-95%
      const garmentLabel = garment.nickname || garment.type;

      onProgress?.({
        status: RenderStatus.PROCESSING,
        progress: baseProgress,
        message: `Rendering garment ${stepNum} of ${totalSteps}: ${garmentLabel}...`,
      });

      currentModelImage = await fashn.runTryOn(
        {
          model_image: currentModelImage,
          garment_image: garmentImageUrl!,
          category,
          mode: 'balanced',
          garment_photo_type: 'auto',
          num_samples: 1,
          output_format: 'png',
        },
        (message) => {
          onProgress?.({
            status: RenderStatus.PROCESSING,
            progress: baseProgress + 5,
            message: `[${garmentLabel}] ${message}`,
          });
        }
      );
    }

    // Step 5: Return result
    const cacheKey = this.generateCacheKey(request);

    return {
      image_url: currentModelImage,
      cache_key: cacheKey,
      timestamp: Date.now(),
    };
  }

  /**
   * Fetch the user's body scan image URL from Supabase storage.
   * Returns a signed URL valid for 1 hour, or null if no scan exists.
   */
  private async getBodyScanImageUrl(userId: string): Promise<string | null> {
    const { data: scanFiles } = await supabase
      .storage
      .from('body-scans')
      .list(`${userId}`);

    if (!scanFiles || scanFiles.length === 0) {
      return null;
    }

    const frontScan = scanFiles.find(f => f.name.includes('front'));
    const scanFile = frontScan || scanFiles[0];

    const { data: signedUrl } = await supabase
      .storage
      .from('body-scans')
      .createSignedUrl(`${userId}/${scanFile.name}`, 3600);

    return signedUrl?.signedUrl || null;
  }

  /**
   * Map garment type to FASHN category
   */
  private mapGarmentTypeToCategory(type: string): 'tops' | 'bottoms' | 'one-pieces' | 'auto' {
    switch (type) {
      case 'top':
      case 'outerwear':
        return 'tops';
      case 'bottom':
        return 'bottoms';
      case 'dress':
        return 'one-pieces';
      default:
        return 'auto';
    }
  }

  /**
   * Generate a cache key for a render request
   * Cache key: hash(user_id + sorted_garment_ids + pose)
   */
  private generateCacheKey(request: RenderRequest): string {
    // Sort garment IDs to ensure consistent cache keys regardless of order
    const sortedGarmentIds = [...request.garment_ids].sort();
    const content = `${request.user_id}_${sortedGarmentIds.join('_')}_${request.pose}`;
    // Simple hash function for cache key
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `render_${Math.abs(hash)}`;
  }

  /**
   * Get cached render result
   */
  public async getCachedResult(request: RenderRequest): Promise<RenderResult | undefined> {
    const result = await this.checkRenderCache(request);
    return result || undefined;
  }

  /**
   * Clear render cache
   */
  public async clearCache(): Promise<void> {
    try {
      const { error } = await supabase
        .from('render_cache')
        .delete()
        .lt('expires_at', new Date().toISOString());
      
      if (error) {
        console.warn('Failed to clear expired cache:', error);
      }
    } catch (error) {
      console.warn('Cache clear failed:', error);
    }
  }

  /**
   * Get underlying services for advanced usage
   */
  public getServices() {
    return {
      renderService: this.renderService,
      modelManager: this.modelManager,
      garmentConditioningService: this.garmentConditioningService,
      loraService: this.loraService
    };
  }
}