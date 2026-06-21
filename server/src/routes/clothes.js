import { Router } from 'express';
import { db } from '../db.js';
import { requireUserId } from '../services/userService.js';

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

const validTypes = new Set(['top', 'tshirt', 'shirt', 'long sleeve', 'jacket', 'bottom', 'pants', 'shoes']);
const validSeasons = new Set(['spring', 'summer', 'fall', 'winter', 'all']);
const validStyles = new Set(['casual', 'formal', 'sporty', 'classic']);

router.get('/', (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  res.json(listClothes.all(userId));
});

router.post('/', (req, res) => {
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
  const item = db
    .prepare('SELECT id, user_id as userId, type, color, season, style, image_url as imageUrl, created_at as createdAt FROM clothes WHERE id = ? AND user_id = ?')
    .get(result.lastInsertRowid, userId);

  return res.status(201).json(item);
});

export default router;
