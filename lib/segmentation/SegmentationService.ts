import { supabase } from '../supabase';

export class SegmentationService {
  private static instance: SegmentationService;
  private batchQueue: string[] = [];
  private batchTimeout: NodeJS.Timeout | null = null;
  private readonly BATCH_DELAY = 2000; // 2 seconds
  private readonly BATCH_SIZE = 5;

  private constructor() {}

  public static getInstance(): SegmentationService {
    if (!SegmentationService.instance) {
      SegmentationService.instance = new SegmentationService();
    }
    return SegmentationService.instance;
  }

  /**
   * Queue a garment for segmentation
   */
  public async queueSegmentation(garmentId: string): Promise<void> {
    this.batchQueue.push(garmentId);
    
    // Clear existing timeout
    if (this.batchTimeout) {
      clearTimeout(this.batchTimeout);
    }
    
    // Set new timeout to process batch
    this.batchTimeout = setTimeout(() => {
      this.processBatch();
    }, this.BATCH_DELAY);
    
    // If queue is full, process immediately
    if (this.batchQueue.length >= this.BATCH_SIZE) {
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
      }
      this.processBatch();
    }
  }

  /**
   * Process a batch of garments for segmentation
   */
  private async processBatch(): Promise<void> {
    if (this.batchQueue.length === 0) {
      return;
    }

    // Take a copy of the current queue and clear it
    const batch = [...this.batchQueue];
    this.batchQueue = [];
    
    console.log(`Processing segmentation batch of ${batch.length} garments`);
    
    try {
      // In a real implementation, this would call your segmentation service
      // For now, we'll just log that it should be triggered
      for (const garmentId of batch) {
        console.log(`Segmentation pipeline triggered for garment ID: ${garmentId}`);
        
        // Example of how you might trigger the segmentation service:
        // await fetch('YOUR_SEGMENTATION_SERVICE_URL/trigger', {
        //   method: 'POST',
        //   headers: {
        //     'Content-Type': 'application/json',
        //   },
        //   body: JSON.stringify({
        //     garment_id: garmentId,
        //   }),
        // });
      }
    } catch (error) {
      console.error('Failed to process segmentation batch:', error);
      
      // Re-queue failed items
      this.batchQueue.push(...batch);
      
      // Set timeout to retry
      if (this.batchTimeout) {
        clearTimeout(this.batchTimeout);
      }
      this.batchTimeout = setTimeout(() => {
        this.processBatch();
      }, this.BATCH_DELAY * 2); // Retry with longer delay
    }
  }

  /**
   * Trigger segmentation for a single garment immediately (bypass batching)
   */
  public async triggerSegmentation(garmentId: string): Promise<void> {
    try {
      console.log(`Triggering immediate segmentation for garment ID: ${garmentId}`);
      
      // In a real implementation, this would call your segmentation service
      // For now, we'll just update the database status
      const { error } = await supabase
        .from('garments')
        .update({ segmentation_status: 'processing' })
        .eq('id', garmentId);
      
      if (error) {
        console.error('Failed to update segmentation status:', error);
      }
    } catch (error) {
      console.error('Failed to trigger segmentation:', error);
      throw error;
    }
  }
}