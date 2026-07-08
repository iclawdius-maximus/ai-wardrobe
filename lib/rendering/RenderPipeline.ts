import { RenderService, RenderProgressCallback } from './RenderService';
import { ModelManager } from './ModelManager';
import { GarmentConditioningService } from './GarmentConditioningService';
import { LoRAService } from './LoRAService';
import { RenderRequest, RenderResult, RenderStatus, AiRendererModule } from './types';
import { supabase } from '../supabase';
import { RenderCache } from '../database.types';

// Lazy import of native module to avoid issues in test environment
let AiRenderer: AiRendererModule | null = null;
function getAiRenderer(): AiRendererModule | null {
  if (AiRenderer !== null) return AiRenderer;
  try {
    // @ts-ignore
    AiRenderer = require('../../modules/ai-renderer').default;
  } catch (error) {
    // Native module not available (e.g., in test environment)
    AiRenderer = null;
  }
  return AiRenderer;
}

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

      // Step 2: Load user LoRA
      onProgress?.({ status: RenderStatus.PROCESSING, progress: 10, message: 'Loading user LoRA weights' });
      try {
        await this.loraService.loadUserLoRA(request.user_id);
      } catch (error) {
        const errorMessage = `Failed to load LoRA weights: ${error instanceof Error ? error.message : 'Unknown error'}`;
        onProgress?.({ status: RenderStatus.FAILED, error: errorMessage });
        throw new Error(errorMessage);
      }

      // Step 3: Load garment conditioning data
      onProgress?.({ status: RenderStatus.PROCESSING, progress: 30, message: 'Preparing garment conditioning data' });
      const conditioningPromises = request.garment_ids.map(garmentId => 
        this.garmentConditioningService.prepareGarmentConditioning(garmentId)
      );
      
      try {
        await Promise.all(conditioningPromises);
      } catch (error) {
        const errorMessage = `Failed to prepare garment conditioning: ${error instanceof Error ? error.message : 'Unknown error'}`;
        onProgress?.({ status: RenderStatus.FAILED, error: errorMessage });
        throw new Error(errorMessage);
      }

      // Step 4: Run inference (mock for now)
      onProgress?.({ status: RenderStatus.PROCESSING, progress: 50, message: 'Running inference' });
      const result = await this.runInference(request, onProgress);

      // Step 5: Cache result
      try {
        await this.cacheRenderResult(request, result);
      } catch (error) {
        console.warn('Failed to cache render result:', error);
        // Don't throw here as the render was successful
      }

      // Step 6: Return result
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
   * Run the actual inference (uses native module when available, fallback to mock)
   */
  private async runInference(
    request: RenderRequest,
    onProgress?: RenderProgressCallback
  ): Promise<RenderResult> {
    try {
      // Use native module if available
      const renderer = getAiRenderer();
    if (renderer) {
        try {
          onProgress?.({ 
            status: RenderStatus.PROCESSING, 
            progress: 60, 
            message: 'Using native AI renderer' 
          });
          
          // Check if model is loaded, if not load it
          if (!renderer.isModelLoaded()) {
            onProgress?.({ 
              status: RenderStatus.PROCESSING, 
              progress: 65, 
              message: 'Loading model' 
            });
            // In a real implementation, you would provide the actual model path
            // await AiRenderer.loadModel('/path/to/model');
          }
          
          // Prepare generation options
          // In a real implementation, you would map the request to proper options
          const prompt = `fashion model wearing ${request.garment_ids.length} items, ${request.pose} pose`;
          
          // Generate image using native module
          const imagePath = await renderer.generate(prompt);
          
          // Generate result
          const cacheKey = this.generateCacheKey(request);
          
          return {
            image_url: `file://${imagePath}`,
            cache_key: cacheKey,
            timestamp: Date.now()
          };
        } catch (error) {
          console.error('Native rendering failed, falling back to mock:', error);
          onProgress?.({ 
            status: RenderStatus.PROCESSING, 
            progress: 70, 
            message: 'Native rendering failed, using mock' 
          });
        }
      }
      
      // Fallback to mock implementation
      // In a real implementation, this would:
      // 1. Load the Stable Diffusion model with user LoRA
      // 2. Apply garment conditioning data
      // 3. Run the inference with the specified pose
      // 4. Return the generated image
      
      // Simulate the process with delays
      for (let i = 0; i <= 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 300));
        onProgress?.({ 
          status: RenderStatus.PROCESSING, 
          progress: 70 + (i * 6), 
          message: `Generating image (${i}/5)` 
        });
      }
      
      // Generate mock result
      const cacheKey = this.generateCacheKey(request);
      const imageUrl = `file:///tmp/${cacheKey}.png`;
      
      return {
        image_url: imageUrl,
        cache_key: cacheKey,
        timestamp: Date.now()
      };
    } catch (error) {
      const errorMessage = `Inference failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      onProgress?.({ status: RenderStatus.FAILED, error: errorMessage });
      throw new Error(errorMessage);
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