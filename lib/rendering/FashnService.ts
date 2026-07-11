/**
 * FASHN Virtual Try-On API Service
 * 
 * Uses FASHN's tryon-v1.6 endpoint via direct REST API.
 * Flow: POST /v1/run → poll /v1/status/{id} → download result image
 * 
 * Docs: https://docs.fashn.ai/api-reference/tryon-v1-6
 * Pricing: ~$0.075/image (1 credit)
 */

const FASHN_BASE_URL = 'https://api.fashn.ai/v1';

export interface FashnInput {
  model_image: string;   // URL or base64 of the person
  garment_image: string; // URL or base64 of the garment
  category?: 'tops' | 'bottoms' | 'one-pieces' | 'auto';
  mode?: 'performance' | 'balanced' | 'quality';
  garment_photo_type?: 'model' | 'flat-lay' | 'auto';
  num_samples?: number;
  output_format?: 'png' | 'jpeg';
}

// The FASHN API returns output as a direct array of URL strings:
// e.g. { "output": ["https://cdn.fashn.ai/.../output_0.png"] }
export type FashnOutput = string[];

export interface FashnPrediction {
  id: string;
  status: 'starting' | 'in_queue' | 'processing' | 'completed' | 'failed' | 'canceled';
  output?: FashnOutput;
  error?: string | null | Record<string, unknown>;
}

export class FashnService {
  private apiKey: string;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('FASHN_API_KEY is required');
    }
    this.apiKey = apiKey;
  }

  /**
   * Submit a try-on prediction and poll until complete.
   * Returns the result image URL.
   */
  async runTryOn(
    input: FashnInput,
    onProgress?: (message: string) => void
  ): Promise<string> {
    // Step 1: Submit
    onProgress?.('Submitting to FASHN...');
    const predictionId = await this.submit(input);

    // Step 2: Poll until complete
    const result = await this.poll(predictionId, onProgress);

    // Step 3: Return first image URL
    if (!result.output?.length) {
      throw new Error('FASHN returned no images');
    }

    return result.output[0];
  }

  /**
   * Submit a prediction request
   */
  private async submit(input: FashnInput): Promise<string> {
    const response = await fetch(`${FASHN_BASE_URL}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model_name: 'tryon-v1.6',
        inputs: {
          model_image: input.model_image,
          garment_image: input.garment_image,
          category: input.category || 'auto',
          mode: input.mode || 'balanced',
          garment_photo_type: input.garment_photo_type || 'auto',
          num_samples: input.num_samples || 1,
          output_format: input.output_format || 'png',
        },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`FASHN submit failed (${response.status}): ${errorBody}`);
    }

    const data = await response.json();
    if (!data.id) {
      const errStr = data.error ? (typeof data.error === 'string' ? data.error : JSON.stringify(data.error)) : 'no prediction ID returned';
      throw new Error(`FASHN submit failed: ${errStr}`);
    }

    return data.id;
  }

  /**
   * Poll for prediction status until complete or failed
   */
  private async poll(
    predictionId: string,
    onProgress?: (message: string) => void
  ): Promise<FashnPrediction> {
    const maxAttempts = 60; // 3 minutes max at 3s intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;

      const response = await fetch(
        `${FASHN_BASE_URL}/status/${predictionId}`,
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error(`FASHN status check failed (${response.status})`);
      }

      const prediction: FashnPrediction = await response.json();

      switch (prediction.status) {
        case 'completed':
          return prediction;

        case 'failed':
        case 'canceled': {
          const errStr = typeof prediction.error === 'string'
            ? prediction.error
            : prediction.error
              ? JSON.stringify(prediction.error)
              : 'Unknown error';
          throw new Error(`FASHN prediction ${prediction.status}: ${errStr}`);
        }

        case 'starting':
          onProgress?.('FASHN is starting...');
          break;
        case 'in_queue':
          onProgress?.('Waiting in FASHN queue...');
          break;
        case 'processing':
          onProgress?.('FASHN is generating your outfit...');
          break;
      }

      // Wait 3 seconds between polls
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    throw new Error('FASHN prediction timed out');
  }
}
