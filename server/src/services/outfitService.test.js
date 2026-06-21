import test from 'node:test';
import assert from 'node:assert/strict';
import { suggestOutfit } from './outfitService.js';

const closet = [
  { id: 1, type: 'top', color: 'white', season: 'all' },
  { id: 2, type: 'top', color: 'red', season: 'winter' },
  { id: 3, type: 'bottom', color: 'black', season: 'all' },
  { id: 4, type: 'bottom', color: 'green', season: 'summer' },
  { id: 5, type: 'shoes', color: 'black', season: 'all' }
];

test('returns a helpful message when a category is missing', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'top', color: 'white', season: 'all' },
      { id: 2, type: 'bottom', color: 'black', season: 'all' }
    ],
    'all'
  );

  assert.equal(result.outfit, null);
  assert.deepEqual(result.missingTypes, ['shoes']);
  assert.match(result.message, /shoes/);
});

test('suggests a top, bottom, and shoes', () => {
  const result = suggestOutfit(closet, 'all');

  assert.equal(['top', 'tshirt', 'long sleeve'].includes(result.outfit.top.type), true);
  assert.equal(result.outfit.bottom.type, 'bottom');
  assert.equal(result.outfit.shoes.type, 'shoes');
});

test('filters seasonal clothes while keeping all-season items', () => {
  const result = suggestOutfit(closet, 'summer');

  assert.equal(result.outfit.top.color, 'white');
  assert.equal(result.outfit.bottom.season, 'all');
  assert.equal(result.outfit.shoes.color, 'black');
});

test('prefers neutral shoe and bottom combinations', () => {
  const result = suggestOutfit(closet, 'all');

  assert.equal(result.outfit.bottom.color, 'black');
  assert.equal(result.outfit.shoes.color, 'black');
});

test('avoids same color top and bottom', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'top', color: 'black', season: 'all' },
      { id: 2, type: 'bottom', color: 'black', season: 'all' },
      { id: 3, type: 'bottom', color: 'white', season: 'all' },
      { id: 4, type: 'shoes', color: 'gray', season: 'all' }
    ],
    'all'
  );

  assert.notEqual(result.outfit.top.color, result.outfit.bottom.color);
  assert.equal(result.outfit.bottom.color, 'white');
});

test('prefers dark and light contrast', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'top', color: 'black', season: 'all' },
      { id: 2, type: 'bottom', color: 'navy', season: 'all' },
      { id: 3, type: 'bottom', color: 'white', season: 'all' },
      { id: 4, type: 'shoes', color: 'gray', season: 'all' }
    ],
    'all'
  );

  assert.equal(result.outfit.top.color, 'black');
  assert.equal(result.outfit.bottom.color, 'white');
});

test('returns a message when only same-color top and bottom are available', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'top', color: 'black', season: 'all' },
      { id: 2, type: 'bottom', color: 'black', season: 'all' },
      { id: 3, type: 'shoes', color: 'white', season: 'all' }
    ],
    'all'
  );

  assert.equal(result.outfit, null);
  assert.match(result.message, /different color/);
});

test('cold weather includes a jacket when available', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'tshirt', color: 'white', season: 'all' },
      { id: 2, type: 'jacket', color: 'black', season: 'all' },
      { id: 3, type: 'bottom', color: 'navy', season: 'all' },
      { id: 4, type: 'shoes', color: 'black', season: 'all' }
    ],
    'all',
    { temperatureC: 9, rainy: false }
  );

  assert.equal(result.outfit.jacket.type, 'jacket');
  assert.match(result.outfit.weatherNote, /jacket/);
});

test('cold weather returns a helpful message without jacket or long sleeve', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'tshirt', color: 'white', season: 'all' },
      { id: 2, type: 'bottom', color: 'navy', season: 'all' },
      { id: 3, type: 'shoes', color: 'black', season: 'all' }
    ],
    'all',
    { temperatureC: 8, rainy: false }
  );

  assert.equal(result.outfit, null);
  assert.deepEqual(result.missingTypes, ['long sleeve', 'jacket']);
});

test('hot weather prefers a tshirt and light colors', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'long sleeve', color: 'black', season: 'all' },
      { id: 2, type: 'tshirt', color: 'white', season: 'all' },
      { id: 3, type: 'bottom', color: 'beige', season: 'all' },
      { id: 4, type: 'shoes', color: 'gray', season: 'all' }
    ],
    'all',
    { temperatureC: 31, rainy: false }
  );

  assert.equal(result.outfit.top.type, 'tshirt');
  assert.equal(result.outfit.top.color, 'white');
});

test('rainy weather prefers darker shoes', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'top', color: 'white', season: 'all' },
      { id: 2, type: 'bottom', color: 'beige', season: 'all' },
      { id: 3, type: 'shoes', color: 'white', season: 'all' },
      { id: 4, type: 'shoes', color: 'black', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: true }
  );

  assert.equal(result.outfit.shoes.color, 'black');
});

test('preferred colors increase outfit priority', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'top', color: 'black', season: 'all' },
      { id: 2, type: 'top', color: 'red', season: 'all' },
      { id: 3, type: 'bottom', color: 'white', season: 'all' },
      { id: 4, type: 'shoes', color: 'gray', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: false },
    { preferredColors: ['red'], preferredStyle: 'casual' }
  );

  assert.equal(result.outfit.top.color, 'red');
  assert.deepEqual(result.outfit.preferences.preferredColors, ['red']);
});

test('sporty style prefers tshirts', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'long sleeve', color: 'white', season: 'all' },
      { id: 2, type: 'tshirt', color: 'gray', season: 'all' },
      { id: 3, type: 'bottom', color: 'black', season: 'all' },
      { id: 4, type: 'shoes', color: 'navy', season: 'all' }
    ],
    'all',
    { temperatureC: 20, rainy: false },
    { preferredColors: [], preferredStyle: 'sporty' }
  );

  assert.equal(result.outfit.top.type, 'tshirt');
  assert.equal(result.outfit.preferences.preferredStyle, 'sporty');
});

test('classic style prefers a structured layer when available', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'tshirt', color: 'white', season: 'all' },
      { id: 2, type: 'long sleeve', color: 'white', season: 'all' },
      { id: 3, type: 'jacket', color: 'black', season: 'all' },
      { id: 4, type: 'bottom', color: 'navy', season: 'all' },
      { id: 5, type: 'shoes', color: 'black', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: false },
    { preferredColors: [], preferredStyle: 'classic' }
  );

  assert.equal(result.outfit.top.type, 'long sleeve');
  assert.equal(result.outfit.jacket.type, 'jacket');
});

test('liked feedback gives similar outfits a small boost', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'top', color: 'red', season: 'all' },
      { id: 2, type: 'top', color: 'black', season: 'all' },
      { id: 3, type: 'bottom', color: 'white', season: 'all' },
      { id: 4, type: 'shoes', color: 'gray', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: false },
    { preferredColors: [], preferredStyle: 'casual' },
    [
      {
        rating: 'like',
        outfit: {
          topType: 'top',
          topColor: 'red',
          bottomColor: 'white',
          shoesColor: 'gray',
          jacketColor: null
        }
      }
    ]
  );

  assert.equal(result.outfit.top.color, 'red');
  assert.equal(result.outfit.feedbackCount, 1);
});

test('disliked feedback lowers exact outfit priority', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'top', color: 'black', season: 'all' },
      { id: 2, type: 'top', color: 'red', season: 'all' },
      { id: 3, type: 'bottom', color: 'white', season: 'all' },
      { id: 4, type: 'shoes', color: 'gray', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: false },
    { preferredColors: [], preferredStyle: 'casual' },
    [
      {
        rating: 'dislike',
        outfit: {
          topType: 'top',
          topColor: 'black',
          bottomColor: 'white',
          shoesColor: 'gray',
          jacketColor: null
        }
      }
    ]
  );

  assert.equal(result.outfit.top.color, 'red');
});

test('slim body type prefers layered outfits', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'tshirt', color: 'white', season: 'all' },
      { id: 2, type: 'long sleeve', color: 'white', season: 'all' },
      { id: 3, type: 'jacket', color: 'black', season: 'all' },
      { id: 4, type: 'bottom', color: 'navy', season: 'all' },
      { id: 5, type: 'shoes', color: 'black', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: false },
    { preferredColors: [], preferredStyle: 'casual', bodyType: 'slim', height: 'medium', styleGoal: 'look bigger' }
  );

  assert.equal(result.outfit.jacket.type, 'jacket');
  assert.equal(result.outfit.preferences.bodyType, 'slim');
});

test('bulky body type avoids heavier layered looks when possible', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'long sleeve', color: 'white', season: 'all' },
      { id: 2, type: 'top', color: 'black', season: 'all' },
      { id: 3, type: 'jacket', color: 'black', season: 'all' },
      { id: 4, type: 'bottom', color: 'navy', season: 'all' },
      { id: 5, type: 'shoes', color: 'black', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: false },
    { preferredColors: [], preferredStyle: 'casual', bodyType: 'bulky', height: 'medium', styleGoal: 'slimmer' }
  );

  assert.equal(result.outfit.top.type, 'top');
  assert.equal(result.outfit.top.color, 'black');
});

test('short height avoids extra long-looking layers when possible', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'tshirt', color: 'white', season: 'all' },
      { id: 2, type: 'long sleeve', color: 'white', season: 'all' },
      { id: 3, type: 'jacket', color: 'black', season: 'all' },
      { id: 4, type: 'bottom', color: 'navy', season: 'all' },
      { id: 5, type: 'shoes', color: 'black', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: false },
    { preferredColors: [], preferredStyle: 'casual', bodyType: 'athletic', height: 'short', styleGoal: 'casual' }
  );

  assert.equal(result.outfit.top.type, 'tshirt');
  assert.equal(result.outfit.jacket, null);
});

test('skinny-fat body type prefers structured layered outfits', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'tshirt', color: 'white', season: 'all' },
      { id: 2, type: 'shirt', color: 'white', season: 'all' },
      { id: 3, type: 'jacket', color: 'black', season: 'all' },
      { id: 4, type: 'bottom', color: 'navy', season: 'all' },
      { id: 5, type: 'shoes', color: 'black', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: false },
    { preferredColors: [], preferredStyle: 'casual', bodyType: 'skinny-fat', height: 'medium', styleGoal: 'casual' }
  );

  assert.equal(result.outfit.top.type, 'shirt');
  assert.equal(result.outfit.jacket.type, 'jacket');
});

test('muscular body type avoids hiding shape with extra layers when possible', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'tshirt', color: 'white', season: 'all' },
      { id: 2, type: 'long sleeve', color: 'white', season: 'all' },
      { id: 3, type: 'jacket', color: 'black', season: 'all' },
      { id: 4, type: 'bottom', color: 'navy', season: 'all' },
      { id: 5, type: 'shoes', color: 'black', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: false },
    { preferredColors: [], preferredStyle: 'casual', bodyType: 'muscular', height: 'medium', styleGoal: 'casual' }
  );

  assert.equal(result.outfit.top.type, 'tshirt');
  assert.equal(result.outfit.jacket, null);
});

test('plus-size body type prefers clean darker lines', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'shirt', color: 'white', season: 'all' },
      { id: 2, type: 'shirt', color: 'black', season: 'all' },
      { id: 3, type: 'bottom', color: 'navy', season: 'all' },
      { id: 4, type: 'bottom', color: 'beige', season: 'all' },
      { id: 5, type: 'shoes', color: 'black', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: false },
    { preferredColors: [], preferredStyle: 'casual', bodyType: 'plus-size', height: 'medium', styleGoal: 'casual' }
  );

  assert.equal(result.outfit.top.color, 'black');
  assert.equal(result.outfit.bottom.color, 'navy');
});

test('premium logic prefers complementary color harmony over simple neutral contrast', () => {
  const freeResult = suggestOutfit(
    [
      { id: 1, type: 'top', color: 'black', season: 'all' },
      { id: 2, type: 'top', color: 'red', season: 'all' },
      { id: 3, type: 'bottom', color: 'beige', season: 'all' },
      { id: 4, type: 'bottom', color: 'green', season: 'all' },
      { id: 5, type: 'shoes', color: 'gray', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: false },
    { preferredColors: [], preferredStyle: 'casual' }
  );
  const premiumResult = suggestOutfit(
    [
      { id: 1, type: 'top', color: 'black', season: 'all' },
      { id: 2, type: 'top', color: 'red', season: 'all' },
      { id: 3, type: 'bottom', color: 'beige', season: 'all' },
      { id: 4, type: 'bottom', color: 'green', season: 'all' },
      { id: 5, type: 'shoes', color: 'gray', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: false },
    { preferredColors: [], preferredStyle: 'casual' },
    [],
    { isPremium: true }
  );

  assert.equal(freeResult.outfit.top.color, 'black');
  assert.equal(freeResult.outfit.bottom.color, 'beige');
  assert.equal(premiumResult.outfit.top.color, 'red');
  assert.equal(premiumResult.outfit.bottom.color, 'green');
  assert.equal(premiumResult.outfit.logicTier, 'premium');
});

test('premium logic uses liked history without repeating the exact same outfit', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'top', color: 'red', season: 'all' },
      { id: 2, type: 'bottom', color: 'green', season: 'all' },
      { id: 3, type: 'bottom', color: 'beige', season: 'all' },
      { id: 4, type: 'shoes', color: 'gray', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: false },
    { preferredColors: [], preferredStyle: 'casual' },
    [
      {
        rating: 'like',
        outfit: {
          topType: 'top',
          topColor: 'red',
          bottomType: 'bottom',
          bottomColor: 'green',
          shoesType: 'shoes',
          shoesColor: 'gray',
          jacketColor: null
        }
      }
    ],
    { isPremium: true }
  );

  assert.equal(result.outfit.top.color, 'red');
  assert.equal(result.outfit.bottom.color, 'beige');
  assert.equal(result.outfit.shoes.color, 'gray');
});

test('premium logic weights preferred colors more strongly', () => {
  const freeResult = suggestOutfit(
    [
      { id: 1, type: 'top', color: 'black', season: 'all' },
      { id: 2, type: 'top', color: 'pink', season: 'all' },
      { id: 3, type: 'bottom', color: 'white', season: 'all' },
      { id: 4, type: 'shoes', color: 'gray', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: false },
    { preferredColors: ['pink'], preferredStyle: 'casual' }
  );
  const premiumResult = suggestOutfit(
    [
      { id: 1, type: 'top', color: 'black', season: 'all' },
      { id: 2, type: 'top', color: 'pink', season: 'all' },
      { id: 3, type: 'bottom', color: 'white', season: 'all' },
      { id: 4, type: 'shoes', color: 'gray', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: false },
    { preferredColors: ['pink'], preferredStyle: 'casual' },
    [],
    { isPremium: true }
  );

  assert.equal(freeResult.outfit.top.color, 'pink');
  assert.equal(premiumResult.outfit.top.color, 'pink');
  assert.equal(premiumResult.outfit.score > freeResult.outfit.score, true);
});

test('work occasion prefers clean classic neutral outfits', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'tshirt', color: 'red', season: 'all' },
      { id: 2, type: 'shirt', color: 'white', season: 'all' },
      { id: 3, type: 'bottom', color: 'black', season: 'all' },
      { id: 4, type: 'shoes', color: 'black', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: false },
    { preferredColors: [], preferredStyle: 'casual' },
    [],
    { occasion: 'work' }
  );

  assert.equal(result.outfit.top.type, 'shirt');
  assert.equal(result.outfit.occasion, 'work');
});

test('picnic occasion prefers casual light comfortable outfits', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'long sleeve', color: 'black', season: 'all' },
      { id: 2, type: 'tshirt', color: 'white', season: 'all' },
      { id: 3, type: 'bottom', color: 'beige', season: 'all' },
      { id: 4, type: 'shoes', color: 'gray', season: 'all' },
      { id: 5, type: 'jacket', color: 'black', season: 'all' }
    ],
    'all',
    { temperatureC: 20, rainy: false },
    { preferredColors: [], preferredStyle: 'casual' },
    [],
    { occasion: 'picnic' }
  );

  assert.equal(result.outfit.top.type, 'tshirt');
  assert.equal(result.outfit.jacket, null);
});

test('formal occasion prefers elegant layered neutral outfits', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'tshirt', color: 'white', season: 'all' },
      { id: 2, type: 'shirt', color: 'white', season: 'all' },
      { id: 3, type: 'jacket', color: 'black', season: 'all' },
      { id: 4, type: 'bottom', color: 'navy', season: 'all' },
      { id: 5, type: 'shoes', color: 'black', season: 'all' }
    ],
    'all',
    { temperatureC: 18, rainy: false },
    { preferredColors: [], preferredStyle: 'casual' },
    [],
    { occasion: 'formal event' }
  );

  assert.equal(result.outfit.top.type, 'shirt');
  assert.equal(result.outfit.jacket.type, 'jacket');
  assert.equal(result.outfit.occasion, 'formal event');
});

test('occasion fallback returns a helpful message when wardrobe is unsuitable', () => {
  const result = suggestOutfit(
    [
      { id: 1, type: 'tshirt', color: 'pink', season: 'all' },
      { id: 2, type: 'bottom', color: 'red', season: 'all' },
      { id: 3, type: 'shoes', color: 'white', season: 'all' }
    ],
    'all',
    { temperatureC: 20, rainy: false },
    { preferredColors: [], preferredStyle: 'casual' },
    [],
    { occasion: 'formal event' }
  );

  assert.equal(result.outfit, null);
  assert.equal(result.message, 'messages.occasionUnavailable');
});

test('premium work occasion applies stricter filtering than free', () => {
  const clothes = [
    { id: 1, type: 'tshirt', color: 'white', season: 'all' },
    { id: 2, type: 'bottom', color: 'black', season: 'all' },
    { id: 3, type: 'shoes', color: 'black', season: 'all' }
  ];
  const freeResult = suggestOutfit(clothes, 'all', { temperatureC: 20, rainy: false }, {}, [], { occasion: 'work' });
  const premiumResult = suggestOutfit(clothes, 'all', { temperatureC: 20, rainy: false }, {}, [], { occasion: 'work', isPremium: true });

  assert.equal(freeResult.outfit.top.type, 'tshirt');
  assert.equal(premiumResult.outfit, null);
  assert.equal(premiumResult.message, 'messages.occasionUnavailable');
});
