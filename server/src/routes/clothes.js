import { Router } from 'express';
import { db } from '../db.js';
import { requireUserId } from '../services/userService.js';
import { getBackgroundRemovalConfig, removeBackgroundFromImage } from '../services/backgroundRemovalService.js';

const router = Router();

const listClothes = db.prepare(`
  SELECT id, user_id as userId, type, color, season, style, image_url as imageUrl, created_at as createdAt
  FROM clothes
  WHERE user_id = ?
  ORDER BY created_at DESC, id DESC
`);

const insertClothing = db.prepare(`
  INSERT INTO clothes (user_id, type, color, season, style, image_url)
  VALUES (@userId, @type, @color, @season, @style, @imageUrl)
`);

const getClothingById = db.prepare(`
  SELECT id, user_id as userId, type, color, season, style, image_url as imageUrl, created_at as createdAt
  FROM clothes
  WHERE id = ? AND user_id = ?
`);

const updateClothingImage = db.prepare(`
  UPDATE clothes
  SET image_url = ?
  WHERE id = ? AND user_id = ?
`);

const validTypes = new Set(['top', 'tshirt', 'shirt', 'long sleeve', 'jacket', 'bottom', 'pants', 'shoes']);
const validSeasons = new Set(['spring', 'summer', 'fall', 'winter', 'all']);
const validStyles = new Set(['casual', 'formal', 'sporty', 'classic']);

function summarizeImageProcessing(result = {}) {
  return {
    provider: result.provider || 'none',
    changed: Boolean(result.changed),
    reason: result.reason || '',
    durationMs: result.durationMs || 0,
    inputBytes: result.inputBytes || 0,
    outputBytes: result.outputBytes || 0,
    cached: Boolean(result.cached),
    cost: result.cost || null
  };
}

function queueBackgroundRemoval({ itemId, userId, imageUrl, type }) {
  const config = getBackgroundRemovalConfig();

  if (!imageUrl || !config.enabled || config.provider === 'none') {
    return {
      provider: config.provider,
      changed: false,
      reason: imageUrl ? 'disabled' : 'no-image',
      durationMs: 0
    };
  }

  setTimeout(async () => {
    const startedAt = Date.now();

    try {
      const imageProcessing = await removeBackgroundFromImage(imageUrl, { userId });

      if (imageProcessing.changed && imageProcessing.imageUrl) {
        updateClothingImage.run(imageProcessing.imageUrl, itemId, userId);
      }

      console.log('[clothes] async item image processing', {
        userId,
        itemId,
        type,
        provider: imageProcessing.provider,
        changed: imageProcessing.changed,
        reason: imageProcessing.reason,
        durationMs: imageProcessing.durationMs,
        wallMs: Date.now() - startedAt,
        inputBytes: imageProcessing.inputBytes,
        outputBytes: imageProcessing.outputBytes,
        cached: Boolean(imageProcessing.cached)
      });
    } catch (error) {
      console.warn('[clothes] async item image processing failed', {
        userId,
        itemId,
        type,
        name: error?.name,
        code: error?.code,
        statusCode: error?.statusCode,
        message: error?.message
      });
    }
  }, 0);

  return {
    provider: config.provider,
    changed: false,
    reason: 'queued',
    durationMs: 0
  };
}

router.get('/', (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  res.json(listClothes.all(userId));
});

router.post('/', async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const type = String(req.body.type || '').trim().toLowerCase();
  const color = String(req.body.color || '').trim().toLowerCase();
  const season = String(req.body.season || '').trim().toLowerCase();
  const style = String(req.body.style || 'casual').trim().toLowerCase();
  const imageUrl = String(req.body.imageUrl || '').trim();

  if (!validTypes.has(type)) {
    return res.status(400).json({ message: 'Type must be top, tshirt, shirt, long sleeve, jacket, bottom, pants, or shoes.' });
  }

  if (!color) {
    return res.status(400).json({ message: 'Color is required.' });
  }

  if (!validSeasons.has(season)) {
    return res.status(400).json({ message: 'Season must be spring, summer, fall, winter, or all.' });
  }

  if (!validStyles.has(style)) {
    return res.status(400).json({ message: 'Style must be casual, formal, sporty, or classic.' });
  }

  const result = insertClothing.run({ userId, type, color, season, style, imageUrl: imageUrl || null });
  const item = getClothingById.get(result.lastInsertRowid, userId);
  const imageProcessing = queueBackgroundRemoval({ itemId: item.id, userId, imageUrl, type });

  return res.status(201).json({
    ...item,
    imageProcessing: summarizeImageProcessing(imageProcessing)
  });
});

export default router;
