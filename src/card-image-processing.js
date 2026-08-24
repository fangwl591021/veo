import { newId } from './member-repository.js';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_ORIGINAL_BYTES = 15 * 1024 * 1024;
const MAX_PROCESSED_BYTES = 2 * 1024 * 1024;
const PROCESSING_VERSION = 'card-image-v1';
const VALID_STATUSES = new Set(['completed', 'needs_review']);
const text = (value, max = 500) => String(value || '').trim().slice(0, max);
const score = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
const confidence = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function normalizePurpose(value) {
  return value === 'personal' ? 'personal' : 'collection';
}

function normalizeSide(value) {
  return value === 'back' ? 'back' : 'front';
}

export function normalizeCardImageMetadata(value = {}) {
  const quality = value?.quality && typeof value.quality === 'object' ? value.quality : {};
  const processing = value?.processing && typeof value.processing === 'object' ? value.processing : {};
  const corners = Array.isArray(value?.corners)
    ? value.corners.slice(0, 4).map((point) => ({
      x: Math.max(0, Math.min(1, Number(point?.x) || 0)),
      y: Math.max(0, Math.min(1, Number(point?.y) || 0)),
    }))
    : [];
  return {
    processingVersion: PROCESSING_VERSION,
    original: {
      width: Math.max(0, Math.round(Number(value?.original?.width) || 0)),
      height: Math.max(0, Math.round(Number(value?.original?.height) || 0)),
    },
    detection: {
      detected: value?.detection?.detected === true,
      confidence: confidence(value?.detection?.confidence ?? value?.processingConfidence),
    },
    card: {
      orientation: ['landscape', 'portrait'].includes(value?.card?.orientation) ? value.card.orientation : '',
      rotation: [0, 90, 180, 270].includes(Number(value?.card?.rotation)) ? Number(value.card.rotation) : 0,
    },
    quality: {
      overall: score(quality.overall),
      blur: score(quality.blur),
      brightness: score(quality.brightness),
      glare: score(quality.glare),
      coverage: score(quality.coverage),
    },
    processing: {
      perspectiveCorrected: processing.perspectiveCorrected === true,
      cropped: processing.cropped === true,
      rotated: processing.rotated === true,
      lightingEnhanced: processing.lightingEnhanced === true,
      manualCorrection: processing.manualCorrection === true,
    },
    corners,
    warning: text(value?.warning, 300),
  };
}

function publicJob(row = {}) {
  let metadata = {};
  try { metadata = JSON.parse(row.metadata_json || '{}') || {}; } catch {}
  return {
    id: row.id,
    status: row.status,
    purpose: row.purpose,
    side: row.side,
    processingVersion: row.processing_version,
    confidence: Number(row.processing_confidence || 0),
    qualityScore: Number(row.quality_score || 0),
    manualReviewRequired: Boolean(row.manual_review_required),
    processedImageUrl: row.processed_r2_key ? `/v1/card-images/${encodeURIComponent(row.id)}/processed` : '',
    metadata,
    failureReason: row.failure_reason || '',
    createdAt: row.created_at,
    completedAt: row.completed_at || '',
  };
}

export async function createCardImageJob(db, bucket, userId, request) {
  if (!bucket) throw new Error('名片圖片儲存空間尚未設定');
  const contentType = text(request.headers.get('content-type'), 100).split(';')[0].toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) throw new Error('名片原圖僅支援 JPEG、PNG 或 WebP');
  const declaredSize = Number(request.headers.get('content-length') || request.headers.get('x-card-file-size') || 0);
  if (declaredSize > MAX_ORIGINAL_BYTES) throw new Error('名片原圖不可超過 15MB');
  if (!request.body) throw new Error('找不到名片原圖');

  const purpose = normalizePurpose(request.headers.get('x-card-purpose'));
  const side = normalizeSide(request.headers.get('x-card-side'));
  const id = newId('card_image');
  const extension = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
  const originalKey = `card-images/${userId}/${id}/original-${side}.${extension}`;
  await bucket.put(originalKey, request.body, {
    httpMetadata: { contentType },
    customMetadata: { userId, purpose, side, processingVersion:PROCESSING_VERSION },
  });
  const stored = await bucket.head(originalKey);
  const actualSize = Number(stored?.size || declaredSize || 0);
  if (actualSize <= 0 || actualSize > MAX_ORIGINAL_BYTES) {
    await bucket.delete(originalKey).catch(() => null);
    throw new Error(actualSize > MAX_ORIGINAL_BYTES ? '名片原圖不可超過 15MB' : '無法確認名片原圖大小，請重新選擇圖片');
  }
  try {
    await db.prepare(`INSERT INTO card_image_processing
      (id,user_id,purpose,side,original_r2_key,original_content_type,original_size,status,processing_version)
      VALUES (?,?,?,?,?,?,?,'uploaded',?)`)
      .bind(id,userId,purpose,side,originalKey,contentType,actualSize,PROCESSING_VERSION).run();
  } catch (error) {
    await bucket.delete(originalKey).catch(() => null);
    throw error;
  }
  return { id, status:'uploaded', purpose, side, processingVersion:PROCESSING_VERSION };
}

export async function saveCardImageResult(db, bucket, userId, jobId, form) {
  const row = await db.prepare('SELECT * FROM card_image_processing WHERE id=? AND user_id=?').bind(jobId,userId).first();
  if (!row) throw new Error('找不到這次名片影像處理');
  if (['completed','needs_review'].includes(row.status) && row.processed_r2_key) return publicJob(row);
  const file = form.get('image');
  if (!(file instanceof File) || !file.size) throw new Error('找不到處理後名片圖片');
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error('處理圖僅支援 JPEG、PNG 或 WebP');
  if (file.size > MAX_PROCESSED_BYTES) throw new Error('處理後名片圖片不可超過 2MB');
  let suppliedMetadata = {};
  try { suppliedMetadata = JSON.parse(String(form.get('metadata') || '{}')); }
  catch { throw new Error('影像處理資訊格式錯誤'); }
  const metadata = normalizeCardImageMetadata(suppliedMetadata);
  const status = VALID_STATUSES.has(String(form.get('status') || '')) ? String(form.get('status')) : 'needs_review';
  const manualRequired = status === 'needs_review';
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const processedKey = `card-images/${userId}/${jobId}/processed-${row.side}.${extension}`;
  await db.prepare("UPDATE card_image_processing SET status='processing',updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").bind(jobId,userId).run();
  try {
    await bucket.put(processedKey, file.stream(), {
      httpMetadata: { contentType:file.type },
      customMetadata: { userId, sourceJobId:jobId, processingVersion:PROCESSING_VERSION },
    });
    await db.prepare(`UPDATE card_image_processing SET processed_r2_key=?,processed_content_type=?,status=?,
      processing_confidence=?,quality_score=?,blur_score=?,brightness_score=?,glare_score=?,coverage_score=?,
      orientation=?,rotation=?,manual_review_required=?,metadata_json=?,failure_reason='',completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND user_id=?`)
      .bind(processedKey,file.type,status,metadata.detection.confidence,metadata.quality.overall,metadata.quality.blur,
        metadata.quality.brightness,metadata.quality.glare,metadata.quality.coverage,metadata.card.orientation,
        metadata.card.rotation,manualRequired ? 1 : 0,JSON.stringify(metadata),jobId,userId).run();
  } catch (error) {
    await bucket.delete(processedKey).catch(() => null);
    await db.prepare("UPDATE card_image_processing SET status='failed',failure_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?")
      .bind(text(error.message || 'PROCESSING_FAILED', 300),jobId,userId).run().catch(() => null);
    throw error;
  }
  return publicJob(await db.prepare('SELECT * FROM card_image_processing WHERE id=? AND user_id=?').bind(jobId,userId).first());
}

export async function getCardImageJob(db, userId, jobId) {
  const row = await db.prepare('SELECT * FROM card_image_processing WHERE id=? AND user_id=?').bind(jobId,userId).first();
  if (!row) return null;
  return publicJob(row);
}

export async function serveProcessedCardImage(db, bucket, userId, jobId) {
  const row = await db.prepare('SELECT processed_r2_key,processed_content_type FROM card_image_processing WHERE id=? AND user_id=?').bind(jobId,userId).first();
  if (!row?.processed_r2_key) return null;
  const object = await bucket.get(row.processed_r2_key);
  if (!object) return null;
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType || row.processed_content_type || 'image/webp',
      'cache-control': 'private, max-age=300',
      'x-content-type-options': 'nosniff',
    },
  });
}

export async function resolveCardImageJobFile(db, bucket, userId, jobId) {
  if (!jobId) return null;
  const row = await db.prepare(`SELECT id,processed_r2_key,processed_content_type,status FROM card_image_processing
    WHERE id=? AND user_id=?`).bind(jobId,userId).first();
  if (!row || !['completed','needs_review'].includes(row.status) || !row.processed_r2_key) throw new Error('名片智慧裁切尚未完成');
  const object = await bucket.get(row.processed_r2_key);
  if (!object) throw new Error('找不到處理後名片圖片');
  const type = object.httpMetadata?.contentType || row.processed_content_type || 'image/webp';
  const bytes = await object.arrayBuffer();
  if (bytes.byteLength > MAX_PROCESSED_BYTES) throw new Error('處理後名片圖片不可超過 2MB');
  return new File([bytes], `business-card-${row.id}.webp`, { type });
}

export const cardImageProcessingLimits = Object.freeze({
  maxOriginalBytes:MAX_ORIGINAL_BYTES,
  maxProcessedBytes:MAX_PROCESSED_BYTES,
  processingVersion:PROCESSING_VERSION,
});
