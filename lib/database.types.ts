// profiles
export type Profile = {
  id: string;
  body_scan_status: 'not_started' | 'uploaded' | 'processing' | 'complete' | 'failed';
  body_scan_progress?: number | null;
  body_scan_message?: string | null;
  body_scan_photos?: string[];
  body_scan_updated_at?: string | null;
  body_measurements?: Record<string, number> | null;
  model_photo_url?: string | null; // Front-facing still image for FASHN try-on
  lora_url: string | null;
  lora_trained_at: string | null;
  created_at: string;
};

// garments
export type Garment = {
  id: string;
  user_id: string;
  image_url: string;
  segmented_url: string | null;
  segmentation_status: 'not_started' | 'processing' | 'complete' | 'failed';
  brand: string | null;
  nickname: string | null;
  type: 'top' | 'bottom' | 'dress' | 'outerwear' | 'shoes' | 'accessory';
  color: string | null;
  fabric: string | null;
  created_at: string;
};

// outfits
export type Outfit = {
  id: string;
  user_id: string;
  garment_ids: string[];
  rendered_url: string | null;
  pose: 'front' | 'back';
  created_at: string;
};

// render_cache
export type RenderCache = {
  id: string;
  cache_key: string;
  image_url: string;
  created_at: string;
  expires_at: string;
};