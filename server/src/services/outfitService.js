const neutralColors = new Set(['black', 'white', 'gray', 'grey']);
const workNeutralColors = new Set(['black', 'white', 'gray', 'grey', 'navy']);
const darkColors = new Set(['black', 'navy', 'brown', 'charcoal', 'burgundy', 'forest green']);
const lightColors = new Set(['white', 'cream', 'beige', 'tan', 'yellow', 'pink', 'light blue', 'gray', 'grey']);
const flashyColors = new Set(['red', 'pink', 'yellow']);
const complementaryColors = new Map([
  ['blue', new Set(['beige', 'brown', 'cream', 'white'])],
  ['navy', new Set(['white', 'beige', 'cream', 'gray', 'grey'])],
  ['red', new Set(['green', 'black', 'white', 'gray', 'grey'])],
  ['green', new Set(['red', 'brown', 'beige', 'cream'])],
  ['brown', new Set(['blue', 'green', 'white', 'cream'])],
  ['beige', new Set(['blue', 'navy', 'brown'])],
  ['black', new Set(['white', 'gray', 'grey', 'red'])],
  ['white', new Set(['black', 'navy', 'blue', 'brown', 'red'])],
  ['gray', new Set(['black', 'white', 'navy', 'pink', 'red'])],
  ['grey', new Set(['black', 'white', 'navy', 'pink', 'red'])],
  ['pink', new Set(['gray', 'grey', 'white', 'navy'])]
]);
const topTypes = new Set(['top', 'tshirt', 'shirt', 'long sleeve']);
const validStyles = new Set(['casual', 'sporty', 'classic']);
const validGenders = new Set(['male', 'female', 'non-binary', 'prefer not to say']);
const validBodyTypes = new Set(['slim', 'athletic', 'muscular', 'bulky', 'overweight', 'skinny-fat', 'petite', 'plus-size']);
const validHeights = new Set(['short', 'medium', 'tall']);
const validStyleGoals = new Set(['look bigger', 'slimmer', 'casual', 'elegant']);
const validSkinTones = new Set(['light', 'medium', 'dark']);
const validOccasions = new Set(['daily', 'work', 'date', 'first date', 'picnic', 'dinner', 'wedding', 'engagement', 'formal event', 'casual meetup']);
const formalOccasions = new Set(['wedding', 'engagement', 'formal event']);

function matchesSeason(item, season) {
  return season === 'all' || item.season === 'all' || item.season === season;
}

function isNeutral(color) {
  return neutralColors.has(color);
}

function hasContrast(firstColor, secondColor) {
  return (
    (darkColors.has(firstColor) && lightColors.has(secondColor)) ||
    (lightColors.has(firstColor) && darkColors.has(secondColor))
  );
}

function areComplementary(firstColor, secondColor) {
  return complementaryColors.get(firstColor)?.has(secondColor) || complementaryColors.get(secondColor)?.has(firstColor) || false;
}

function getTemperatureBand(weather) {
  if (!weather || typeof weather.temperatureC !== 'number') return 'normal';
  if (weather.temperatureC < 15) return 'cold';
  if (weather.temperatureC > 25) return 'hot';
  return 'normal';
}

function normalizePreferences(preferences = {}) {
  return {
    preferredColors: Array.isArray(preferences.preferredColors)
      ? preferences.preferredColors.map((color) => String(color).trim().toLowerCase()).filter(Boolean)
      : [],
    preferredStyle: validStyles.has(preferences.preferredStyle) ? preferences.preferredStyle : 'casual',
    gender: validGenders.has(preferences.gender) ? preferences.gender : 'prefer not to say',
    bodyType: validBodyTypes.has(preferences.bodyType) ? preferences.bodyType : 'athletic',
    height: validHeights.has(preferences.height) ? preferences.height : 'medium',
    skinTone: validSkinTones.has(preferences.skinTone) ? preferences.skinTone : 'medium',
    styleGoal: validStyleGoals.has(preferences.styleGoal) ? preferences.styleGoal : 'casual'
  };
}

function normalizeOccasion(occasion = 'daily') {
  const cleanOccasion = String(occasion || '').trim().toLowerCase();
  return validOccasions.has(cleanOccasion) ? cleanOccasion : 'daily';
}

function scorePreferredColors(items, preferredColors) {
  if (!preferredColors.length) return 0;

  return items.reduce((score, item) => {
    if (!item) return score;
    return preferredColors.includes(item.color) ? score + 6 : score;
  }, 0);
}

function scoreStyle(top, bottom, shoes, jacket, preferredStyle) {
  if (preferredStyle === 'sporty') {
    let score = 0;
    if (top.type === 'tshirt') score += 5;
    if (['black', 'gray', 'grey', 'navy', 'white'].includes(shoes.color)) score += 3;
    if (!jacket) score += 1;
    return score;
  }

  if (preferredStyle === 'classic') {
    let score = 0;
    if (top.type === 'long sleeve' || top.type === 'top') score += 4;
    if (jacket) score += 3;
    if ([top, bottom, shoes, jacket].filter(Boolean).some((item) => isNeutral(item.color))) score += 3;
    return score;
  }

  let score = 0;
  if (top.type === 'tshirt' || top.type === 'top') score += 3;
  if (['denim', 'black', 'white', 'gray', 'grey', 'navy'].includes(bottom.color)) score += 2;
  return score;
}

function scoreAppearance(top, bottom, shoes, jacket, preferences) {
  let score = 0;

  if (preferences.bodyType === 'slim') {
    if (jacket) score += 5;
    if (top.type === 'long sleeve') score += 3;
    if (top.type === 'tshirt' && !jacket) score -= 2;
  }

  if (preferences.bodyType === 'bulky') {
    if (jacket && top.type === 'long sleeve') score -= 3;
    if (top.type === 'tshirt' || top.type === 'top') score += 3;
    if (darkColors.has(top.color) || darkColors.has(bottom.color)) score += 2;
  }

  if (preferences.bodyType === 'skinny-fat') {
    if (jacket) score += 8;
    if (top.type === 'shirt' || top.type === 'long sleeve') score += 7;
    if (top.type === 'tshirt' && !jacket) score -= 5;
  }

  if (preferences.bodyType === 'muscular') {
    if (!jacket) score += 3;
    if (top.type === 'tshirt' || top.type === 'shirt') score += 3;
    if (jacket && top.type === 'long sleeve') score -= 2;
  }

  if (preferences.bodyType === 'overweight' || preferences.bodyType === 'plus-size') {
    if (darkColors.has(top.color)) score += 7;
    if (darkColors.has(bottom.color)) score += 5;
    if (top.type === 'shirt' || top.type === 'long sleeve') score += 4;
    if (jacket && top.type === 'long sleeve') score -= 2;
  }

  if (preferences.bodyType === 'petite') {
    if (jacket) score -= 4;
    if (top.type === 'tshirt' || top.type === 'shirt') score += 3;
    if (darkColors.has(bottom.color)) score += 2;
  }

  if (preferences.height === 'short') {
    if (jacket) score -= 4;
    if (top.type === 'tshirt' || top.type === 'top') score += 3;
  }

  if (preferences.height === 'short' || preferences.bodyType === 'petite') {
    if (jacket) score -= 2;
  }

  if (preferences.height === 'tall') {
    if (jacket) score += 2;
    if (top.type === 'long sleeve') score += 1;
  }

  if (preferences.skinTone === 'light') {
    if (darkColors.has(top.color) || darkColors.has(bottom.color)) score += 1;
  }

  if (preferences.skinTone === 'dark') {
    if (lightColors.has(top.color) || lightColors.has(bottom.color)) score += 1;
  }

  if (preferences.styleGoal === 'look bigger') {
    if (jacket) score += 4;
    if (top.type === 'long sleeve') score += 2;
    if (lightColors.has(top.color)) score += 2;
  }

  if (preferences.styleGoal === 'slimmer') {
    if (jacket && top.type === 'long sleeve') score -= 2;
    if (darkColors.has(top.color)) score += 3;
    if (darkColors.has(bottom.color)) score += 2;
  }

  if (preferences.styleGoal === 'elegant') {
    if (top.type === 'long sleeve' || top.type === 'top') score += 3;
    if (jacket) score += 3;
    if (isNeutral(shoes.color)) score += 2;
  }

  if (preferences.gender === 'male' || preferences.gender === 'female' || preferences.gender === 'non-binary') {
    if (hasContrast(top.color, bottom.color) || areComplementary(top.color, bottom.color)) score += 1;
  }

  if (preferences.gender === 'prefer not to say') {
    if (isNeutral(shoes.color)) score += 1;
  }

  return score;
}

function scoreOccasion(top, bottom, shoes, jacket, occasion) {
  let score = 0;
  const items = [top, bottom, shoes, jacket].filter(Boolean);
  const neutralCount = items.filter((item) => isNeutral(item.color)).length;
  const darkCount = items.filter((item) => darkColors.has(item.color)).length;
  const lightCount = items.filter((item) => lightColors.has(item.color)).length;

  if (occasion === 'daily') {
    if (top.type === 'tshirt' || top.type === 'top') score += 3;
    if (!jacket) score += 1;
    if (isNeutral(shoes.color)) score += 2;
  }

  if (occasion === 'work') {
    if (top.type === 'shirt' || top.type === 'long sleeve') score += 6;
    if (items.filter((item) => workNeutralColors.has(item.color)).length >= 2) score += 7;
    if (darkColors.has(bottom.color)) score += 3;
    if (flashyColors.has(top.color) || flashyColors.has(bottom.color)) score -= 7;
    if (top.type === 'tshirt') score -= 4;
  }

  if (occasion === 'date' || occasion === 'first date') {
    if (hasContrast(top.color, bottom.color) || areComplementary(top.color, bottom.color)) score += 5;
    if (isNeutral(shoes.color)) score += 3;
    if (jacket) score += 2;
    if (flashyColors.has(top.color) && flashyColors.has(bottom.color)) score -= 4;
    if (occasion === 'first date' && neutralCount >= 1) score += 2;
  }

  if (occasion === 'picnic') {
    if (top.type === 'tshirt' || top.type === 'top') score += 6;
    if (lightCount >= 1) score += 4;
    if (!jacket) score += 3;
    if (darkCount >= 3) score -= 4;
  }

  if (occasion === 'dinner') {
    if (top.type === 'shirt' || top.type === 'long sleeve') score += 4;
    if (hasContrast(top.color, bottom.color)) score += 3;
    if (isNeutral(shoes.color)) score += 3;
  }

  if (formalOccasions.has(occasion)) {
    if (top.type === 'shirt' || top.type === 'long sleeve') score += 7;
    if (jacket) score += 7;
    if (neutralCount >= 2) score += 5;
    if (isNeutral(shoes.color) || darkColors.has(shoes.color)) score += 4;
    if (top.type === 'tshirt') score -= 8;
  }

  if (occasion === 'casual meetup') {
    if (top.type === 'tshirt' || top.type === 'top') score += 4;
    if (hasContrast(top.color, bottom.color) || areComplementary(top.color, bottom.color)) score += 3;
    if (!jacket) score += 1;
  }

  return score;
}

function isSuitableForOccasion(top, bottom, shoes, jacket, occasion, isPremium) {
  const items = [top, bottom, shoes, jacket].filter(Boolean);
  const workNeutralCount = items.filter((item) => workNeutralColors.has(item.color)).length;
  const neutralCount = items.filter((item) => isNeutral(item.color)).length;
  const lightCount = items.filter((item) => lightColors.has(item.color)).length;
  const flashyCount = items.filter((item) => flashyColors.has(item.color)).length;

  if (occasion === 'work') {
    if (flashyCount >= 2) return false;
    return isPremium ? workNeutralCount >= 2 && top.type !== 'tshirt' : workNeutralCount >= 1;
  }

  if (occasion === 'date' || occasion === 'first date') {
    const hasBalancedColor = hasContrast(top.color, bottom.color) || areComplementary(top.color, bottom.color) || isNeutral(top.color) || isNeutral(bottom.color);
    return isPremium ? hasBalancedColor && flashyCount < 2 : hasBalancedColor;
  }

  if (occasion === 'picnic') {
    const isComfortableTop = top.type === 'tshirt' || top.type === 'top';
    return isPremium ? isComfortableTop && lightCount >= 1 && !jacket : isComfortableTop || lightCount >= 1;
  }

  if (formalOccasions.has(occasion)) {
    const hasFormalTop = top.type === 'shirt' || top.type === 'long sleeve';
    return isPremium ? hasFormalTop && jacket && neutralCount >= 1 : hasFormalTop;
  }

  if (occasion === 'dinner') {
    return top.type !== 'tshirt' || hasContrast(top.color, bottom.color) || areComplementary(top.color, bottom.color);
  }

  return true;
}

function normalizeFeedback(feedback = []) {
  return Array.isArray(feedback)
    ? feedback
        .map((item) => ({
          ...item,
          rating: ['like', 'dislike'].includes(item.rating) ? item.rating : item.liked === true ? 'like' : item.liked === false ? 'dislike' : null
        }))
        .filter((item) => ['like', 'dislike'].includes(item.rating) && item.outfit)
        .slice(0, 20)
    : [];
}

function scoreFeedback(top, bottom, shoes, jacket, feedback) {
  return feedback.reduce((score, item) => {
    const saved = item.outfit;
    let matches = 0;

    if (saved.topType === top.type) matches += 1;
    if (saved.topColor === top.color) matches += 1;
    if (saved.bottomType === bottom.type) matches += 1;
    if (saved.bottomColor === bottom.color) matches += 1;
    if (saved.shoesType === shoes.type) matches += 1;
    if (saved.shoesColor === shoes.color) matches += 1;
    if ((saved.jacketColor || null) === (jacket?.color || null)) matches += 1;

    if (!matches) return score;

    const exactCoreMatch = saved.topColor === top.color && saved.bottomColor === bottom.color && saved.shoesColor === shoes.color;
    const direction = item.rating === 'like' ? 1 : -1;

    return score + direction * (matches * 2 + (exactCoreMatch ? 6 : 0));
  }, 0);
}

function scorePremiumColorHarmony(top, bottom, shoes) {
  let score = 0;

  if (areComplementary(top.color, bottom.color)) score += 9;
  if (areComplementary(bottom.color, shoes.color)) score += 4;
  if (areComplementary(top.color, shoes.color)) score += 2;

  const weakDarkPair = darkColors.has(top.color) && darkColors.has(bottom.color) && !isNeutral(top.color) && !isNeutral(bottom.color);
  const weakLightPair = lightColors.has(top.color) && lightColors.has(bottom.color) && !isNeutral(top.color) && !isNeutral(bottom.color);

  if (weakDarkPair) score -= 7;
  if (weakLightPair) score -= 5;
  if (!hasContrast(top.color, bottom.color) && !areComplementary(top.color, bottom.color) && !isNeutral(top.color) && !isNeutral(bottom.color)) {
    score -= 4;
  }

  return score;
}

function scorePremiumPersonalization(top, bottom, shoes, jacket, preferences) {
  let score = 0;
  const items = [top, bottom, shoes, jacket].filter(Boolean);

  for (const item of items) {
    if (preferences.preferredColors.includes(item.color)) score += 8;
  }

  if (preferences.preferredStyle === 'sporty') {
    if (top.type === 'tshirt') score += 5;
    if (['white', 'gray', 'grey', 'black'].includes(shoes.color)) score += 4;
  }

  if (preferences.preferredStyle === 'classic') {
    if (top.type === 'shirt' || top.type === 'long sleeve') score += 5;
    if (isNeutral(top.color) && isNeutral(shoes.color)) score += 4;
  }

  if (preferences.styleGoal === 'elegant') {
    if (areComplementary(top.color, bottom.color)) score += 4;
    if (isNeutral(shoes.color)) score += 3;
  }

  return score;
}

function scorePremiumFeedback(top, bottom, shoes, jacket, feedback) {
  return feedback.reduce((score, item) => {
    const saved = item.outfit;
    const sameCore =
      saved.topType === top.type &&
      saved.topColor === top.color &&
      saved.bottomColor === bottom.color &&
      saved.shoesColor === shoes.color;
    const sharedColors = [top.color, bottom.color, shoes.color, jacket?.color].filter(Boolean).filter((color) => {
      return [saved.topColor, saved.bottomColor, saved.shoesColor, saved.jacketColor].includes(color);
    }).length;
    const sharedTypes = [saved.topType === top.type, saved.bottomType === bottom.type, saved.shoesType === shoes.type].filter(Boolean).length;

    if (item.rating === 'like') {
      if (sameCore) return score - 18;
      return score + sharedColors * 4 + sharedTypes * 3;
    }

    if (sameCore) return score - 18;
    return score - sharedColors * 2;
  }, 0);
}

function scorePremiumOccasion(top, bottom, shoes, jacket, occasion) {
  let score = 0;
  const items = [top, bottom, shoes, jacket].filter(Boolean);
  const neutralCount = items.filter((item) => isNeutral(item.color)).length;

  if (occasion === 'work') {
    if (workNeutralColors.has(top.color)) score += 5;
    if (workNeutralColors.has(bottom.color)) score += 5;
    if (flashyColors.has(top.color) || flashyColors.has(bottom.color)) score -= 10;
  }

  if (occasion === 'date' || occasion === 'first date') {
    if (areComplementary(top.color, bottom.color)) score += 5;
    if (hasContrast(top.color, bottom.color)) score += 4;
    if (jacket) score += 2;
  }

  if (occasion === 'picnic') {
    if (top.type === 'tshirt') score += 5;
    if (lightColors.has(top.color) || lightColors.has(bottom.color)) score += 5;
    if (jacket) score -= 6;
  }

  if (formalOccasions.has(occasion)) {
    if (top.type === 'shirt') score += 6;
    if (jacket) score += 8;
    if (neutralCount >= 2) score += 6;
    if (top.type === 'tshirt') score -= 14;
  }

  return score;
}

function scorePremiumCombination(top, bottom, shoes, jacket, preferences, feedback, occasion) {
  return (
    scorePremiumColorHarmony(top, bottom, shoes) +
    scorePremiumPersonalization(top, bottom, shoes, jacket, preferences) +
    scorePremiumFeedback(top, bottom, shoes, jacket, feedback) +
    scorePremiumOccasion(top, bottom, shoes, jacket, occasion)
  );
}

function getOutfitSignature(top, bottom, shoes, jacket) {
  return [top, bottom, shoes, jacket]
    .map((item) => (item ? `${item.type}:${item.color}` : 'none'))
    .join('|');
}

function scoreCombination(top, bottom, shoes, jacket, weather, preferences, feedback, options = {}) {
  let score = 0;
  const temperatureBand = getTemperatureBand(weather);
  const normalizedPreferences = normalizePreferences(preferences);
  const normalizedFeedback = normalizeFeedback(feedback);
  const occasion = normalizeOccasion(options.occasion);
  const recentOutfits = Array.isArray(options.recentOutfits) ? options.recentOutfits : [];

  if (top.color === bottom.color) {
    return -1;
  }

  if (hasContrast(top.color, bottom.color)) score += 5;
  if (isNeutral(top.color) || isNeutral(bottom.color)) score += 2;
  if (isNeutral(shoes.color)) score += 3;
  if (shoes.color === bottom.color) score += 2;
  if (shoes.color !== top.color) score += 1;

  if (top.season === bottom.season || top.season === 'all' || bottom.season === 'all') score += 1;
  if (shoes.season === 'all' || shoes.season === top.season || shoes.season === bottom.season) score += 1;

  if (temperatureBand === 'cold') {
    if (top.type === 'long sleeve') score += 6;
    if (jacket) score += 8;
    if (top.type === 'tshirt' && !jacket) score -= 4;
  }

  if (temperatureBand === 'hot') {
    if (top.type === 'tshirt') score += 7;
    if (lightColors.has(top.color)) score += 3;
    if (lightColors.has(bottom.color)) score += 2;
    if (jacket) score -= 10;
    if (top.type === 'long sleeve') score -= 4;
  }

  if (weather?.rainy && darkColors.has(shoes.color)) score += 6;
  score += scorePreferredColors([top, bottom, shoes, jacket], normalizedPreferences.preferredColors);
  score += scoreStyle(top, bottom, shoes, jacket, normalizedPreferences.preferredStyle);
  score += scoreAppearance(top, bottom, shoes, jacket, normalizedPreferences);
  score += scoreFeedback(top, bottom, shoes, jacket, normalizedFeedback);
  score += scoreOccasion(top, bottom, shoes, jacket, occasion);
  if (recentOutfits.includes(getOutfitSignature(top, bottom, shoes, jacket))) {
    score -= options.isPremium ? 34 : 18;
  }
  if (options.isPremium) {
    score += scorePremiumCombination(top, bottom, shoes, jacket, normalizedPreferences, normalizedFeedback, occasion);
  }

  return score;
}

function getMissingTypes(tops, bottoms, shoes) {
  return [
    !tops.length ? 'top' : null,
    !bottoms.length ? 'bottom' : null,
    !shoes.length ? 'shoes' : null
  ].filter(Boolean);
}

function getWeatherNote(weather, best) {
  const temperatureBand = getTemperatureBand(weather);

  if (!weather) {
    return 'No weather data was used for this suggestion.';
  }

  if (temperatureBand === 'cold') {
    return best.jacket
      ? 'Cold weather: added a jacket layer.'
      : 'Cold weather: chose a warmer top. Add a jacket for better cold-weather suggestions.';
  }

  if (temperatureBand === 'hot') {
    return 'Hot weather: preferred a tshirt and lighter colors.';
  }

  if (weather.rainy) {
    return 'Rainy weather: preferred darker shoes.';
  }

  return 'Mild weather: used the regular outfit rules.';
}

export function suggestOutfit(clothes, season = 'all', weather = null, preferences = {}, feedback = [], options = {}) {
  const normalizedPreferences = normalizePreferences(preferences);
  const normalizedFeedback = normalizeFeedback(feedback);
  const isPremium = Boolean(options.isPremium);
  const occasion = normalizeOccasion(options.occasion);
  const recentOutfits = Array.isArray(options.recentOutfits) ? options.recentOutfits : [];
  const seasonalClothes = clothes.filter((item) => matchesSeason(item, season));
  const tops = seasonalClothes.filter((item) => topTypes.has(item.type));
  const bottoms = seasonalClothes.filter((item) => item.type === 'bottom' || item.type === 'pants');
  const shoes = seasonalClothes.filter((item) => item.type === 'shoes');
  const jackets = seasonalClothes.filter((item) => item.type === 'jacket');
  const missingTypes = getMissingTypes(tops, bottoms, shoes);

  if (missingTypes.length) {
    return {
      outfit: null,
      missingTypes,
      message: `Add at least one ${missingTypes.join(', ')} for ${season} to get an outfit suggestion.`
    };
  }

  if (getTemperatureBand(weather) === 'cold' && !tops.some((item) => item.type === 'long sleeve') && !jackets.length) {
    return {
      outfit: null,
      missingTypes: ['long sleeve', 'jacket'],
      message: 'It is cold outside. Add a long sleeve or jacket to get a weather-ready outfit suggestion.'
    };
  }

  const combinations = [];
  let skippedForOccasion = 0;

  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const shoe of shoes) {
        const jacketOptions = getTemperatureBand(weather) === 'hot' ? [null] : [null, ...jackets];

        for (const jacket of jacketOptions) {
          if (!isSuitableForOccasion(top, bottom, shoe, jacket, occasion, isPremium)) {
            skippedForOccasion += 1;
            continue;
          }

          const score = scoreCombination(top, bottom, shoe, jacket, weather, normalizedPreferences, normalizedFeedback, { isPremium, occasion, recentOutfits });

          if (score >= 0) {
            combinations.push({
              top,
              bottom,
              shoes: shoe,
              jacket,
              score
            });
          }
        }
      }
    }
  }

  if (!combinations.length) {
    if (skippedForOccasion) {
      return {
        outfit: null,
        missingTypes: [],
        message: 'messages.occasionUnavailable'
      };
    }

    return {
      outfit: null,
      missingTypes: [],
      message: 'Add another top or bottom in a different color so the outfit does not repeat the same color.'
    };
  }

  combinations.sort((a, b) => b.score - a.score);

  const best = combinations[0];

  return {
    outfit: {
      season,
      occasion,
      top: best.top,
      bottom: best.bottom,
      shoes: best.shoes,
      jacket: best.jacket,
      score: best.score,
      weather,
      preferences: normalizedPreferences,
      feedbackCount: normalizedFeedback.length,
      logicTier: isPremium ? 'premium' : 'free',
      weatherNote: getWeatherNote(weather, best),
      ruleSummary:
        isPremium
          ? 'Premium logic adds stronger color harmony, more variety, and heavier personalization from preferences and liked outfit history.'
          : 'Avoids same-color tops and bottoms, prefers dark-light contrast, treats black, white, and gray as easy neutrals, adjusts for weather, and gives extra weight to color, style, appearance preferences, and outfit feedback.'
    },
    missingTypes: [],
    message: 'Outfit suggestion ready.'
  };
}
