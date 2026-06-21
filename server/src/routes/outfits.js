import { Router } from 'express';
import { db } from '../db.js';
import { suggestOutfit } from '../services/outfitService.js';
import { getCurrentWeather } from '../services/weatherService.js';
import { getIsPremium, requireUserId } from '../services/userService.js';

const router = Router();

const listClothes = db.prepare(`
  SELECT id, user_id as userId, type, color, season, style, image_url as imageUrl, created_at as createdAt
  FROM clothes
  WHERE user_id = ?
  ORDER BY created_at DESC, id DESC
`);

const listFeedback = db.prepare(`
  SELECT
    id,
    user_id as userId,
    top_id as topId,
    top_type as topType,
    top_color as topColor,
    bottom_id as bottomId,
    bottom_type as bottomType,
    bottom_color as bottomColor,
    shoes_id as shoesId,
    shoes_type as shoesType,
    shoes_color as shoesColor,
    liked,
    created_at as createdAt
  FROM outfit_feedback
  WHERE user_id = ?
  ORDER BY created_at DESC, id DESC
  LIMIT 50
`);

const listLikedFeedback = db.prepare(`
  SELECT
    id,
    user_id as userId,
    top_id as topId,
    top_type as topType,
    top_color as topColor,
    bottom_id as bottomId,
    bottom_type as bottomType,
    bottom_color as bottomColor,
    shoes_id as shoesId,
    shoes_type as shoesType,
    shoes_color as shoesColor,
    created_at as createdAt
  FROM outfit_feedback
  WHERE user_id = ? AND liked = 1
  ORDER BY created_at DESC, id DESC
  LIMIT 12
`);

const insertFeedback = db.prepare(`
  INSERT INTO outfit_feedback (
    user_id,
    top_id,
    top_type,
    top_color,
    bottom_id,
    bottom_type,
    bottom_color,
    shoes_id,
    shoes_type,
    shoes_color,
    liked
  )
  VALUES (
    @userId,
    @topId,
    @topType,
    @topColor,
    @bottomId,
    @bottomType,
    @bottomColor,
    @shoesId,
    @shoesType,
    @shoesColor,
    @liked
  )
`);

async function getWeatherFromQuery(query) {
  let weather = null;

  try {
    weather = await getCurrentWeather({
      latitude: query.latitude,
      longitude: query.longitude,
      city: query.city
    });
  } catch (error) {
    weather = {
      unavailable: true,
      message: error.message
    };
  }

  return weather;
}

function sendSuggestion(res, result, weather) {
  if (!result.outfit) {
    return res.status(422).json({
      message: result.message,
      missingTypes: result.missingTypes,
      weather
    });
  }

  return res.json(result.outfit);
}

function withPremiumFlag(outfit, req) {
  return {
    ...outfit,
    isPremium: getIsPremium(req)
  };
}

function getPreferences(req) {
  const colors = String(req.get('x-preferred-colors') || req.query.preferredColors || '')
    .split(',')
    .map((color) => color.trim().toLowerCase())
    .filter(Boolean);
  const style = String(req.get('x-preferred-style') || req.query.preferredStyle || 'casual').trim().toLowerCase();
  const gender = String(req.get('x-gender') || req.query.gender || 'prefer not to say').trim().toLowerCase();
  const bodyType = String(req.get('x-body-type') || req.query.bodyType || 'athletic').trim().toLowerCase();
  const height = String(req.get('x-height') || req.query.height || 'medium').trim().toLowerCase();
  const skinTone = String(req.get('x-skin-tone') || req.query.skinTone || 'medium').trim().toLowerCase();
  const styleGoal = String(req.get('x-style-goal') || req.query.styleGoal || 'casual').trim().toLowerCase();

  return {
    preferredColors: colors,
    preferredStyle: style,
    gender,
    bodyType,
    height,
    skinTone,
    styleGoal
  };
}

function getOccasion(req) {
  return String(req.get('x-occasion') || req.query.occasion || 'daily').trim().toLowerCase();
}

function getRecentOutfitSignatures(req) {
  return String(req.get('x-recent-outfits') || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);
}

function mapFeedbackRow(row) {
  return {
    rating: row.liked ? 'like' : 'dislike',
    outfit: {
      topType: row.topType,
      topColor: row.topColor,
      bottomType: row.bottomType,
      bottomColor: row.bottomColor,
      shoesType: row.shoesType,
      shoesColor: row.shoesColor,
      jacketColor: null
    },
    createdAt: row.createdAt
  };
}

function mapLikedFeedbackRow(row) {
  return {
    id: row.id,
    userId: row.userId,
    createdAt: row.createdAt,
    top: {
      id: row.topId,
      type: row.topType,
      color: row.topColor
    },
    bottom: {
      id: row.bottomId,
      type: row.bottomType,
      color: row.bottomColor
    },
    shoes: {
      id: row.shoesId,
      type: row.shoesType,
      color: row.shoesColor
    }
  };
}

function getFeedback(userId) {
  return listFeedback.all(userId).map(mapFeedbackRow);
}

function normalizeOutfitItem(item) {
  if (!item || typeof item !== 'object') return null;

  const type = String(item.type || '').trim().toLowerCase();
  const color = String(item.color || '').trim().toLowerCase();

  if (!type || !color) return null;

  return {
    id: Number.isInteger(item.id) ? item.id : null,
    type,
    color
  };
}

function normalizeFeedbackPayload(body) {
  const top = normalizeOutfitItem(body?.outfit?.top);
  const bottom = normalizeOutfitItem(body?.outfit?.bottom);
  const shoes = normalizeOutfitItem(body?.outfit?.shoes);

  if (!top || !bottom || !shoes || typeof body?.liked !== 'boolean') {
    return null;
  }

  return {
    top,
    bottom,
    shoes,
    liked: body.liked ? 1 : 0
  };
}

router.get('/today', async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const weather = await getWeatherFromQuery(req.query);
  const isPremium = getIsPremium(req);
  const result = suggestOutfit(listClothes.all(userId), 'all', weather, getPreferences(req), getFeedback(userId), {
    isPremium,
    occasion: getOccasion(req)
  });

  if (result.outfit) result.outfit = withPremiumFlag(result.outfit, req);
  return sendSuggestion(res, result, weather);
});

router.get('/suggestion', async (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const season = String(req.query.season || 'all').toLowerCase();
  const weather = await getWeatherFromQuery(req.query);
  const isPremium = getIsPremium(req);
  const result = suggestOutfit(listClothes.all(userId), season, weather, getPreferences(req), getFeedback(userId), {
    isPremium,
    occasion: getOccasion(req),
    recentOutfits: getRecentOutfitSignatures(req)
  });

  if (result.outfit) result.outfit = withPremiumFlag(result.outfit, req);
  return sendSuggestion(res, result, weather);
});

router.get('/liked', (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  return res.json(listLikedFeedback.all(userId).map(mapLikedFeedbackRow));
});

router.post('/feedback', (req, res) => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const feedback = normalizeFeedbackPayload(req.body);

  if (!feedback) {
    return res.status(400).json({ message: 'Feedback must include top, bottom, shoes, and liked.' });
  }

  const result = insertFeedback.run({
    userId,
    topId: feedback.top.id,
    topType: feedback.top.type,
    topColor: feedback.top.color,
    bottomId: feedback.bottom.id,
    bottomType: feedback.bottom.type,
    bottomColor: feedback.bottom.color,
    shoesId: feedback.shoes.id,
    shoesType: feedback.shoes.type,
    shoesColor: feedback.shoes.color,
    liked: feedback.liked
  });

  const saved = db
    .prepare(`
      SELECT
        id,
        user_id as userId,
        top_id as topId,
        top_type as topType,
        top_color as topColor,
        bottom_id as bottomId,
        bottom_type as bottomType,
        bottom_color as bottomColor,
        shoes_id as shoesId,
        shoes_type as shoesType,
        shoes_color as shoesColor,
        liked,
        created_at as createdAt
      FROM outfit_feedback
      WHERE id = ? AND user_id = ?
    `)
    .get(result.lastInsertRowid, userId);

  return res.status(201).json({
    ...saved,
    liked: Boolean(saved.liked)
  });
});

export default router;
