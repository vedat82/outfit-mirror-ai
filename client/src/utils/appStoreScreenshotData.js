import { subscriptionStates } from '../config/pricing.js';

function svgDataUrl(svg) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function wardrobeImage({ title, subtitle, background = '#f7f2e9', accent = '#111111', shape = 'top' }) {
  const shapeMarkup = {
    top: `<path d="M170 150c28-34 72-34 100 0l44 54-38 34-24-28v138H188V210l-24 28-38-34 44-54Z" fill="${accent}" opacity=".92"/>`,
    shirt: `<path d="M168 146h104l46 56-36 34-26-30v146h-72V206l-26 30-36-34 46-56Z" fill="${accent}" opacity=".9"/><path d="M195 146c8 20 34 20 42 0" stroke="#fff" stroke-width="10" fill="none" opacity=".85"/>`,
    pants: `<path d="M178 132h100l-12 222h-42l-8-144-12 144h-42l16-222Z" fill="${accent}" opacity=".9"/><path d="M179 132h98v44h-98z" fill="#fff" opacity=".18"/>`,
    shoes: `<path d="M126 250c42 0 84-6 118-18 8 22 25 34 58 38 22 2 38 12 40 30H124c-10-18-9-34 2-50Z" fill="${accent}" opacity=".92"/><path d="M148 284h164" stroke="#fff" stroke-width="10" stroke-linecap="round" opacity=".6"/>`,
    jacket: `<path d="M150 142h116l46 54-28 154h-58l-18-130-18 130h-58l-28-154 46-54Z" fill="${accent}" opacity=".9"/><path d="M207 142v205" stroke="#fff" stroke-width="8" opacity=".55"/>`
  }[shape] || '';

  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="420" height="520" viewBox="0 0 420 520">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${background}"/>
          <stop offset="1" stop-color="#ffffff"/>
        </linearGradient>
      </defs>
      <rect width="420" height="520" rx="34" fill="url(#bg)"/>
      <circle cx="300" cy="126" r="86" fill="#ffffff" opacity=".62"/>
      <circle cx="146" cy="316" r="112" fill="#ffffff" opacity=".45"/>
      ${shapeMarkup}
      <text x="36" y="430" fill="#111111" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800">${title}</text>
      <text x="36" y="466" fill="#74716d" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="600">${subtitle}</text>
    </svg>
  `);
}

function previewImage() {
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960">
      <defs>
        <linearGradient id="room" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#f6efe4"/>
          <stop offset="1" stop-color="#d9c7ad"/>
        </linearGradient>
      </defs>
      <rect width="720" height="960" fill="url(#room)"/>
      <rect x="92" y="82" width="536" height="796" rx="42" fill="#fffaf2" opacity=".78"/>
      <circle cx="360" cy="178" r="52" fill="#c99568"/>
      <path d="M292 242h136l52 190-42 310H282l-42-310 52-190Z" fill="#111827"/>
      <path d="M318 252h84l26 210H292l26-210Z" fill="#f8fafc"/>
      <path d="M278 444h164l-22 286H300l-22-286Z" fill="#1f2937"/>
      <path d="M300 730h48v88h-74c4-40 12-70 26-88Z" fill="#f8fafc"/>
      <path d="M372 730h48c14 18 22 48 26 88h-74v-88Z" fill="#f8fafc"/>
      <text x="58" y="902" fill="#111111" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800">AI-generated preview</text>
    </svg>
  `);
}

function personPhoto() {
  return svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="520" height="720" viewBox="0 0 520 720">
      <rect width="520" height="720" fill="#f4efe7"/>
      <rect x="52" y="46" width="416" height="628" rx="36" fill="#ffffff"/>
      <circle cx="260" cy="152" r="44" fill="#c9976b"/>
      <path d="M202 214h116l58 158-30 238H174l-30-238 58-158Z" fill="#d1d5db"/>
      <path d="M226 220h68l28 180H198l28-180Z" fill="#111827"/>
      <path d="M190 388h140l-18 210H208l-18-210Z" fill="#374151"/>
      <path d="M210 598h42v52h-70c4-24 12-42 28-52Z" fill="#f8fafc"/>
      <path d="M268 598h42c16 10 24 28 28 52h-70v-52Z" fill="#f8fafc"/>
      <text x="78" y="690" fill="#77716b" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="700">clean full-body reference</text>
    </svg>
  `);
}

function createScreenshotData() {
  const whiteShirt = {
    id: 'demo-white-shirt',
    type: 'shirt',
    color: 'white',
    season: 'all',
    style: 'classic',
    imageUrl: wardrobeImage({ title: 'White shirt', subtitle: 'classic', background: '#f8f5ee', accent: '#f9fafb', shape: 'shirt' })
  };

  const navyJacket = {
    id: 'demo-navy-jacket',
    type: 'jacket',
    color: 'navy',
    season: 'all',
    style: 'classic',
    imageUrl: wardrobeImage({ title: 'Navy jacket', subtitle: 'smart layer', background: '#eef6f4', accent: '#111827', shape: 'jacket' })
  };

  const blackPants = {
    id: 'demo-black-pants',
    type: 'pants',
    color: 'black',
    season: 'all',
    style: 'formal',
    imageUrl: wardrobeImage({ title: 'Black pants', subtitle: 'formal', background: '#f5f0e7', accent: '#171717', shape: 'pants' })
  };

  const whiteShoes = {
    id: 'demo-white-shoes',
    type: 'shoes',
    color: 'white',
    season: 'all',
    style: 'casual',
    imageUrl: wardrobeImage({ title: 'White sneakers', subtitle: 'versatile', background: '#f6f5ef', accent: '#f8fafc', shape: 'shoes' })
  };

  const creamTshirt = {
    id: 'demo-cream-tshirt',
    type: 'tshirt',
    color: 'cream',
    season: 'summer',
    style: 'casual',
    imageUrl: wardrobeImage({ title: 'Cream tee', subtitle: 'daily', background: '#f6eee1', accent: '#f5ead2', shape: 'top' })
  };

  const beigePants = {
    id: 'demo-beige-pants',
    type: 'pants',
    color: 'beige',
    season: 'all',
    style: 'casual',
    imageUrl: wardrobeImage({ title: 'Beige chinos', subtitle: 'smart casual', background: '#f4eee2', accent: '#c7b58a', shape: 'pants' })
  };

  const brownShoes = {
    id: 'demo-brown-shoes',
    type: 'shoes',
    color: 'brown',
    season: 'all',
    style: 'classic',
    imageUrl: wardrobeImage({ title: 'Brown loafers', subtitle: 'classic', background: '#f5efe7', accent: '#7c4a2d', shape: 'shoes' })
  };

  const grayOvershirt = {
    id: 'demo-gray-overshirt',
    type: 'shirt',
    color: 'gray',
    season: 'spring',
    style: 'casual',
    imageUrl: wardrobeImage({ title: 'Gray overshirt', subtitle: 'layering', background: '#f0f2f2', accent: '#6b7280', shape: 'shirt' })
  };

  const primaryOutfit = {
    top: whiteShirt,
    bottom: blackPants,
    shoes: whiteShoes,
    jacket: navyJacket,
    reason: 'A clean, premium smart-casual look with strong contrast and easy layers.'
  };

  const casualOutfit = {
    top: creamTshirt,
    bottom: beigePants,
    shoes: brownShoes,
    jacket: grayOvershirt,
    reason: 'A softer everyday combination that still looks polished.'
  };

  return {
    clothes: [whiteShirt, navyJacket, blackPants, whiteShoes, creamTshirt, beigePants, brownShoes, grayOvershirt],
    suggestions: [primaryOutfit, casualOutfit],
    suggestion: primaryOutfit,
    outfitHistory: [
      { ...primaryOutfit, historyId: 'demo-history-smart' },
      { ...casualOutfit, historyId: 'demo-history-casual' }
    ],
    reviewHistory: [
      {
        id: 'demo-review-1',
        imageUrl: previewImage(),
        rating: 8,
        comments: ['Strong color balance', 'The jacket adds structure'],
        suggestions: ['Try white sneakers for a cleaner finish']
      }
    ],
    appearanceProfile: {
      gender: 'prefer-not-to-say',
      bodyType: 'athletic',
      height: 'medium',
      skinTone: 'medium',
      styleGoal: 'elegant',
      photos: [{ id: 'demo-photo-1', imageUrl: personPhoto() }]
    },
    preferences: {
      preferredColors: ['black', 'white', 'navy'],
      preferredStyle: 'classic',
      styleGoal: 'elegant'
    },
    accessStatus: {
      isPremium: true,
      premiumPlanId: 'premium-monthly',
      premiumPlan: null,
      subscriptionState: subscriptionStates.premiumMonthly,
      subscriptionLabelKey: `premium.subscriptionStates.${subscriptionStates.premiumMonthly}`,
      trialStartDate: '',
      hasTrialStarted: false,
      isTrialActive: false,
      isTrialEnded: false,
      trialDaysLeft: 0,
      trialEndDate: '',
      tier: 'premium',
      hasFullAccess: true,
      canStartTrial: false,
      dailySuggestionLimit: null,
      canUseManualClothesEntry: true,
      canUseUnlimitedOutfits: true,
      canUseImageUpload: true,
      canUseUserPhotoUpload: true,
      canUseOutfitPhotoAnalysis: true,
      canUseSeeOnMe: true,
      canUseAdvancedOutfitLogic: true
    },
    savedLooks: [
      {
        id: 'demo-saved-look-1',
        previewImageUrl: previewImage(),
        createdAt: '2026-07-12T12:00:00.000Z',
        outfit: primaryOutfit,
        metadata: { provider: 'demo' }
      }
    ],
    seeOnMePreview: {
      previewImageUrl: previewImage(),
      cached: true,
      metadata: { provider: 'demo-screenshot' }
    }
  };
}

export const appStoreScreenshotData = createScreenshotData();
