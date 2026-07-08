import { RenderRequest, RenderResult, RenderStatus, RenderProgress } from './types';

export type RenderExecutor = (
  request: RenderRequest,
  onProgress?: RenderProgressCallback
) => Promise<RenderResult>;

export type RenderProgressCallback = (progress: RenderProgress) => void;

export class RenderService {
  private renderQueue: RenderRequest[] = [];
  private renderStatus: Map<string, RenderStatus> = new Map(); // request_id -> status
  private renderResults: Map<string, RenderResult> = new Map(); // request_id -> result
  private progressCallbacks: Map<string, RenderProgressCallback> = new Map();
  private isProcessing: boolean = false;
  private renderExecutor?: RenderExecutor;

  constructor(renderExecutor?: RenderExecutor) {
    this.renderExecutor = renderExecutor;
  }

  /**
   * Submit a render request to the queue
   */
  public async submitRenderRequest(
    request: RenderRequest,
    onProgress?: RenderProgressCallback
  ): Promise<string> {
    // Generate unique request ID
    const requestId = this.generateRequestId(request);
    
    // Add to queue
    this.renderQueue.push(request);
    this.renderStatus.set(requestId, RenderStatus.PENDING);
    
    // Register progress callback if provided
    if (onProgress) {
      this.progressCallbacks.set(requestId, onProgress);
    }
    
    // Start processing if not already
    if (!this.isProcessing) {
      this.processQueue();
    }
    
    return requestId;
  }

  /**
   * Get the status of a render request
   */
  public getRenderStatus(requestId: string): RenderStatus | undefined {
    return this.renderStatus.get(requestId);
  }

  /**
   * Get the result of a completed render request
   */
  public getRenderResult(requestId: string): RenderResult | undefined {
    return this.renderResults.get(requestId);
  }

  /**
   * Cancel a pending render request
   */
  public cancelRenderRequest(requestId: string): boolean {
    if (this.renderStatus.get(requestId) !== RenderStatus.PENDING) {
      return false;
    }
    
    // Remove from queue
    this.renderQueue = this.renderQueue.filter(req => 
      this.generateRequestId(req) !== requestId
    );
    
    // Update status
    this.renderStatus.set(requestId, RenderStatus.FAILED);
    this.reportProgress(requestId, { 
      status: RenderStatus.FAILED, 
      error: 'Request cancelled' 
    });
    
    // Clean up
    this.progressCallbacks.delete(requestId);
    
    return true;
  }

  /**
   * Process the render queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    
    while (this.renderQueue.length > 0) {
      const request = this.renderQueue.shift()!;
      const requestId = this.generateRequestId(request);
      
      try {
        // Update status to processing
        this.renderStatus.set(requestId, RenderStatus.PROCESSING);
        this.reportProgress(requestId, { 
          status: RenderStatus.PROCESSING, 
          progress: 0,
          message: 'Starting render process'
        });
        
        // Use the injected render executor, or throw if not configured
        if (!this.renderExecutor) {
          throw new Error('RenderService requires a render executor. Provide one via the constructor or setRenderExecutor().');
        }
        const result = await this.renderExecutor(request, (progress) => {
          this.reportProgress(requestId, progress);
        });
        
        // Store result
        this.renderResults.set(requestId, result);
        this.renderStatus.set(requestId, RenderStatus.COMPLETE);
        this.reportProgress(requestId, { 
          status: RenderStatus.COMPLETE, 
          progress: 100,
          message: 'Render complete'
        });
      } catch (error) {
        // Handle error
        this.renderStatus.set(requestId, RenderStatus.FAILED);
        this.reportProgress(requestId, { 
          status: RenderStatus.FAILED, 
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      } finally {
        // Clean up progress callback
        this.progressCallbacks.delete(requestId);
      }
    }
    
    this.isProcessing = false;
  }

  /**
   * Report progress to callback if registered
   */
  private reportProgress(requestId: string, progress: RenderProgress): void {
    const callback = this.progressCallbacks.get(requestId);
    if (callback) {
      callback(progress);
    }
  }

  /**
   * Generate a unique request ID based on request content
   */
  private generateRequestId(request: RenderRequest): string {
    const content = `${request.user_id}_${request.garment_ids.join('_')}_${request.pose}`;
    // Simple hash function for request ID
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `req_${Math.abs(hash)}`;
  }

  /**
   * Set or update the render executor used to process queued requests.
   */
  public setRenderExecutor(renderExecutor: RenderExecutor): void {
    this.renderExecutor = renderExecutor;
  }

  /**
   * Clear completed results (for memory management)
   */
  public clearCompletedResults(): void {
    this.renderStatus.forEach((status, requestId) => {
      if (status === RenderStatus.COMPLETE || status === RenderStatus.FAILED) {
        this.renderStatus.delete(requestId);
        this.renderResults.delete(requestId);
        this.progressCallbacks.delete(requestId);
      }
    });
  }
}