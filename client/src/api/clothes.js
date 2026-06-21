import { getLocalUserId } from './userIdentity.js';
import { fetchJson } from './http.js';

function userHeaders(extraHeaders = {}, preferences) {
  const headers = {
    ...extraHeaders,
    'X-User-Id': getLocalUserId()
  };

  if (preferences) {
    headers['X-Preferred-Colors'] = preferences.preferredColors.join(',');
    headers['X-Preferred-Style'] = preferences.preferredStyle;
    if (preferences.gender) {
      headers['X-Gender'] = preferences.gender;
    }
    headers['X-Body-Type'] = preferences.bodyType;
    headers['X-Height'] = preferences.height;
    headers['X-Style-Goal'] = preferences.styleGoal;
    if (preferences.skinTone) {
      headers['X-Skin-Tone'] = preferences.skinTone;
    }
  }

  return {
    ...headers
  };
}

export async function getClothes() {
  const { response, data } = await fetchJson('/api/clothes', {
    headers: userHeaders()
  }, 'clothes:list');
  return handleResponse(response, data);
}

export async function addClothing(payload) {
  const { response, data, url, responseText } = await fetchJson('/api/clothes', {
    method: 'POST',
    headers: userHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  }, 'clothes:add');

  return handleResponse(response, data, { url, responseText, area: 'clothes:add' });
}

export async function getSuggestion(season, occasion, preferences, recentOutfits = []) {
  const params = new URLSearchParams({ season, occasion });
  const { response, data } = await fetchJson(`/api/outfits/suggestion?${params.toString()}`, {
    headers: userHeaders(
      recentOutfits.length ? { 'X-Recent-Outfits': recentOutfits.join(',') } : {},
      preferences
    )
  }, 'outfits:suggestion');
  return handleResponse(response, data);
}

export async function getTodaysOutfit(occasion, preferences) {
  const params = new URLSearchParams({ occasion });
  const { response, data } = await fetchJson(`/api/outfits/today?${params.toString()}`, {
    headers: userHeaders({}, preferences)
  }, 'outfits:today');
  return handleResponse(response, data);
}

export async function addOutfitFeedback(outfit, rating) {
  const { response, data } = await fetchJson('/api/outfits/feedback', {
    method: 'POST',
    headers: userHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      liked: rating === 'like',
      outfit: {
        top: outfit.top,
        bottom: outfit.bottom,
        shoes: outfit.shoes
      }
    })
  }, 'outfits:feedback');

  return handleResponse(response, data);
}

export async function getLikedOutfits() {
  const { response, data } = await fetchJson('/api/outfits/liked', {
    headers: userHeaders()
  }, 'outfits:liked');

  return handleResponse(response, data);
}

function handleResponse(response, data, debug = {}) {
  if (!response.ok) {
    const error = new Error(data.message || 'Something went wrong.');
    error.status = response.status;
    error.payload = data;
    error.requestUrl = debug.url;
    error.responseBody = debug.responseText;
    if (import.meta.env.DEV || import.meta.env.VITE_API_DEBUG === 'true') {
      console.error('[api] clothing request failed', {
        area: debug.area,
        url: debug.url,
        status: response.status,
        body: data,
        message: error.message
      });
    }
    throw error;
  }

  return data;
}
