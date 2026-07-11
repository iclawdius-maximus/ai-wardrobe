import { RenderService, RenderProgressCallback } from './RenderService';
import { RenderRequest, RenderResult, RenderStatus } from './types';
import { supabase } from '../supabase';
import { RenderCache, Garment } from '../database.types';
import { FashnService } from './FashnService';

export class RenderPipeline {
  private renderService: RenderService;
  private isWarmedUp: boolean = false;

  constructor() {
    this.renderService = new RenderService(this.renderOutfit.bind(this));
  }

  public async warmUp(): Promise<void> {
    if (this.isWarmedUp) return;
    this.isWarmedUp = true;
  }

  public async renderOutfit(
    request: RenderRequest,
    onProgress?: RenderProgressCallback
  ): Promise<RenderResult> {
    try {
      onProgress?.({ status: RenderStatus.PENDING, message: 'Checking cache...' });
      const cachedResult = await this.checkRenderCache(request);
      if (cachedResult) {
        onProgress?.({ status: RenderStatus.COMPLETE, message: 'Using cached result' });
        return cachedResult;
      }

      onProgress?.({ status: RenderStatus.PROCESSING, progress: 10, message: 'Starting render...' });
      const result = await this.runInference(request, onProgress);

      try {
        await this.cacheRenderResult(request, result);
      } catch (error) {
        console.warn('Failed to cache render result:', error);
      }

      onProgress?.({ status: RenderStatus.COMPLETE, progress: 100, message: 'Render complete' });
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      onProgress?.({ status: RenderStatus.FAILED, error: errorMessage });
      throw error;
    }
  }

  private async checkRenderCache(request: RenderRequest): Promise<RenderResult | null> {
    try {
      const cacheKey = this.generateCacheKey(request);
      const { data, error } = await supabase
        .from('render_cache')
        .select('*')
        .eq('cache_key', cacheKey)
        .gt('expires_at', new Date().toISOString())
        .single();
      if (error) return null;
      const cached = data as RenderCache;
      return {
        image_url: cached.image_url,
        cache_key: cached.cache_key,
        timestamp: new Date(cached.created_at).getTime(),
      };
    } catch (error) {
      console.warn('Cache check failed:', error);
      return null;
    }
  }

  private async cacheRenderResult(request: RenderRequest, result: RenderResult): Promise<void> {
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      const { error } = await supabase
        .from('render_cache')
        .upsert({
          cache_key: result.cache_key,
          image_url: result.image_url,
          created_at: new Date(result.timestamp).toISOString(),
          expires_at: expiresAt.toISOString(),
        }, { onConflict: 'cache_key' });
      if (error) console.warn('Failed to cache render result:', error);
    } catch (error) {
      console.warn('Cache save failed:', error);
    }
  }

  private readonly LAYER_ORDER: Record<string, number> = {
    bottom: 0,
    top: 1,
    dress: 2,
    outerwear: 3,
    shoes: 4,
    accessory: 5,
  };

  private async runInference(
    request: RenderRequest,
    onProgress?: RenderProgressCallback
  ): Promise<RenderResult> {
    const apiKey = process.env.EXPO_PUBLIC_FASHN_API_KEY;
    if (!apiKey) {
      throw new Error('FASHN_API_KEY is not configured. Add EXPO_PUBLIC_FASHN_API_KEY to your .env.local file.');
    }

    const fashn = new FashnService(apiKey);

    onProgress?.({ status: RenderStatus.PROCESSING, progress: 50, message: 'Loading garment data...' });

    const garmentIds = request.garment_ids.slice(0, 2);
    const garments: Garment[] = [];

    for (const id of garmentIds) {
      const { data, error } = await supabase
        .from('garments')
        .select('*')
        .eq('id', id)
        .single();
      if (error || !data) {
        const errMsg = error?.message ? (typeof error.message === 'string' ? error.message : JSON.stringify(error.message)) : 'Not found';
        throw new Error(`Failed to load garment ${id}: ${errMsg}`);
      }
      const garment = data as Garment;
      if (!garment.segmented_url && !garment.image_url) {
        throw new Error(`Garment ${garment.nickname || id} has no image URL`);
      }
      garments.push(garment);
    }

    onProgress?.({ status: RenderStatus.PROCESSING, progress: 55, message: 'Loading model photo...' });

    const modelImageUrl = await this.getModelPhotoUrl(request.user_id);
    if (!modelImageUrl) {
      throw new Error('No model photo found. Please upload a front-facing photo from the Profile tab before rendering outfits.');
    }

    const sortedGarments = [...garments].sort((a, b) =>
      (this.LAYER_ORDER[a.type] ?? 99) - (this.LAYER_ORDER[b.type] ?? 99)
    );

    let currentModelImage = modelImageUrl;
    const totalSteps = sortedGarments.length;

    for (let i = 0; i < totalSteps; i++) {
      const garment = sortedGarments[i];
      const garmentImageUrl = garment.segmented_url || garment.image_url;
      const category = this.mapGarmentTypeToCategory(garment.type);
      const stepNum = i + 1;
      const baseProgress = 60 + Math.round((i / totalSteps) * 35);
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

    const cacheKey = this.generateCacheKey(request);
    return {
      image_url: currentModelImage,
      cache_key: cacheKey,
      timestamp: Date.now(),
    };
  }

  private async getModelPhotoUrl(userId: string): Promise<string | null> {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('model_photo_url')
      .eq('id', userId)
      .single();

    if (profileError) {
      const errMsg = typeof profileError.message === 'string' ? profileError.message : JSON.stringify(profileError.message);
      console.warn('Failed to fetch profile for model image:', errMsg);
    }

    if (profile?.model_photo_url) {
      return profile.model_photo_url;
    }

    return null;
  }

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

  private generateCacheKey(request: RenderRequest): string {
    const sortedGarmentIds = [...request.garment_ids].sort();
    const content = `${request.user_id}_${sortedGarmentIds.join('_')}_${request.pose}`;
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `render_${Math.abs(hash)}`;
  }

  public async getCachedResult(request: RenderRequest): Promise<RenderResult | undefined> {
    const result = await this.checkRenderCache(request);
    return result || undefined;
  }

  public async clearCache(): Promise<void> {
    try {
      const { error } = await supabase
        .from('render_cache')
        .delete()
        .lt('expires_at', new Date().toISOString());
      if (error) console.warn('Failed to clear expired cache:', error);
    } catch (error) {
      console.warn('Cache clear failed:', error);
    }
  }

  public getServices() {
    return { renderService: this.renderService };
  }
}