export type LoRAStatus = 'idle' | 'downloading' | 'ready' | 'failed';

export interface LoRAProgress {
  status: LoRAStatus;
  progress?: number;
  error?: string;
}

export type LoRAProgressCallback = (progress: LoRAProgress) => void;

export class LoRAService {
  private loraStatus: Map<string, LoRAStatus> = new Map(); // user_id -> status
  private loraPaths: Map<string, string> = new Map(); // user_id -> local_path
  private progressCallbacks: Map<string, LoRAProgressCallback> = new Map();
  private downloadPromises: Map<string, Promise<string>> = new Map();

  constructor() {
    // Initialize LoRA service
  }

  /**
   * Download and cache user-specific LoRA weights from Cloudflare R2
   */
  public async loadUserLoRA(
    userId: string, 
    onProgress?: LoRAProgressCallback
  ): Promise<string> {
    // Return cached path if already loaded
    if (this.loraPaths.has(userId)) {
      return this.loraPaths.get(userId)!;
    }

    // Return existing promise if already downloading
    if (this.downloadPromises.has(userId)) {
      return this.downloadPromises.get(userId)!;
    }

    // Register progress callback if provided
    if (onProgress) {
      this.progressCallbacks.set(userId, onProgress);
    }

    // Create new download promise
    const downloadPromise = this.downloadLoRAWeights(userId);
    this.downloadPromises.set(userId, downloadPromise);

    try {
      this.updateStatus(userId, 'downloading');
      const localPath = await downloadPromise;
      this.loraPaths.set(userId, localPath);
      this.updateStatus(userId, 'ready');
      return localPath;
    } catch (error) {
      this.updateStatus(userId, 'failed', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    } finally {
      this.downloadPromises.delete(userId);
      this.progressCallbacks.delete(userId);
    }
  }

  /**
   * Download LoRA weights from Cloudflare R2
   */
  private async downloadLoRAWeights(userId: string): Promise<string> {
    // Simulate multi-step download process
    const steps = 4;
    for (let i = 0; i < steps; i++) {
      // Simulate network delay
      await new Promise(resolve => setTimeout(resolve, 400));
      
      // Report progress
      const progress = Math.round(((i + 1) / steps) * 100);
      this.reportProgress(userId, { 
        status: 'downloading', 
        progress 
      });
    }
    
    // Return mock local path
    return `/tmp/lora_${userId}.safetensors`;
  }

  /**
   * Update LoRA status and notify callback
   */
  private updateStatus(userId: string, status: LoRAStatus, error?: string): void {
    this.loraStatus.set(userId, status);
    
    if (status === 'failed' && error) {
      this.reportProgress(userId, { status, error });
    } else {
      this.reportProgress(userId, { status });
    }
  }

  /**
   * Report progress to callback if registered
   */
  private reportProgress(userId: string, progress: LoRAProgress): void {
    const callback = this.progressCallbacks.get(userId);
    if (callback) {
      callback(progress);
    }
  }

  /**
   * Get current LoRA status for a user
   */
  public getLoRAStatus(userId: string): LoRAStatus {
    return this.loraStatus.get(userId) || 'idle';
  }

  /**
   * Get cached LoRA path for a user
   */
  public getCachedLoRAPath(userId: string): string | undefined {
    return this.loraPaths.get(userId);
  }

  /**
   * Check if LoRA weights are ready for a user
   */
  public isLoRAReady(userId: string): boolean {
    return this.loraStatus.get(userId) === 'ready';
  }

  /**
   * Clear cached LoRA weights for a user
   */
  public clearUserLoRACache(userId: string): void {
    this.loraStatus.delete(userId);
    this.loraPaths.delete(userId);
    this.downloadPromises.delete(userId);
    this.progressCallbacks.delete(userId);
  }

  /**
   * Clear all cached LoRA weights
   */
  public clearAllCache(): void {
    this.loraStatus.clear();
    this.loraPaths.clear();
    this.downloadPromises.clear();
    this.progressCallbacks.clear();
  }
}