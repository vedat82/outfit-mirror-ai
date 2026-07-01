import { useEffect, useMemo, useRef, useState } from 'react';
import { addClothing, addOutfitFeedback, getClothes, getLikedOutfits, getSuggestion } from './api/clothes.js';
import AddClothingForm from './components/AddClothingForm.jsx';
import {
  freeDailySuggestionLimit,
  getAccessStatus,
  getDailySuggestionUsage,
  getIsPremium,
  getLocalUserId,
  incrementDailySuggestionUsage,
  setIsPremium as saveIsPremium
} from './api/userIdentity.js';
import PreferencesPanel from './components/PreferencesPanel.jsx';
import { getOnboardingCompleted, getPreferences, savePreferences, setOnboardingCompleted } from './api/preferences.js';
import { useI18n } from './i18n/I18nProvider.jsx';
import { getAppearanceProfile, saveAppearanceProfile } from './api/appearanceProfile.js';
import { maxAppearancePhotos } from './api/appearanceProfile.js';
import { generateSeeOnMePreview, getSavedSeeOnMeLooks, getSeeOnMeDebug, saveSeeOnMeLook } from './api/seeOnMe.js';
import { defaultPremiumPlanId, getPlanById } from './config/pricing.js';
import AppearanceProfile from './components/AppearanceProfile.jsx';
import OutfitPhotoAnalysis from './components/OutfitPhotoAnalysis.jsx';
import PaywallScreen from './components/PaywallScreen.jsx';
import PaymentResultPage from './components/PaymentResultPage.jsx';
import { getPaymentStatus, resetPaymentStatus, verifyApplePurchase } from './api/payment.js';
import { getActiveAppleSubscription, isAppleAlreadyPurchased, isApplePurchaseCancelled, purchaseAppleSubscription, restoreAppleSubscriptions } from './api/applePurchases.js';
import { canUseAppleSubscriptions, detectPaymentPlatform, isNativeApp } from './utils/platform.js';
import { compressImageDataUrlToBudget, compressImageFile } from './utils/imageCompression.js';
import { getNativeImagePickerDebug, imageSources, isNativeImagePickerCancel, pickNativeImageDataUrl } from './utils/nativeImagePicker.js';
import { canUsePaymentTestHelpers, isCurrentPaymentRequest, isXcodeStoreKitEnvironment, withPaymentTimeout } from './utils/paymentFlow.js';
import { addMonitoringBreadcrumb, captureAppError } from './monitoring/sentry.js';
import { getApiBaseUrl } from './api/http.js';
import stylistHero from './assets/stylist-hero.jpg';
import {
  ArrowPathIcon,
  CameraIcon,
  ChevronRightIcon,
  CreditCardIcon,
  HeartIcon,
  HomeIcon,
  LanguageIcon,
  LockClosedIcon,
  MagnifyingGlassIcon,
  PhotoIcon,
  PlusIcon,
  QuestionMarkCircleIcon,
  ShieldCheckIcon,
  SparklesIcon,
  Squares2X2Icon,
  UserCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

const tabs = [
  { id: 'home', labelKey: 'tabs.home', Icon: HomeIcon },
  { id: 'studio', labelKey: 'tabs.mirror', Icon: SparklesIcon },
  { id: 'wardrobe', labelKey: 'tabs.wardrobe', Icon: Squares2X2Icon },
  { id: 'profile', labelKey: 'tabs.profile', Icon: UserCircleIcon }
];

const wardrobeFilters = ['all', 'tops', 'bottoms', 'shoes', 'jackets'];
const topTypes = new Set(['top', 'tshirt', 'shirt', 'long sleeve']);
const bottomTypes = new Set(['bottom', 'pants']);
const wardrobeSearchTypes = ['tshirt', 'shirt', 'long sleeve', 'jacket', 'pants', 'shoes'];
const wardrobeSearchColors = ['black', 'white', 'gray', 'blue', 'navy', 'beige', 'brown', 'red', 'green', 'pink', 'cream'];
const wardrobeSearchSeasons = ['all', 'spring', 'summer', 'fall', 'winter'];
const wardrobeSearchStyles = ['casual', 'formal', 'sporty', 'classic'];
const neutralColors = new Set(['black', 'white', 'gray', 'navy', 'beige', 'cream']);
const darkColors = new Set(['black', 'navy', 'brown', 'gray']);
const lightColors = new Set(['white', 'beige', 'cream']);
const onboardingStyles = ['casual', 'sporty', 'classic'];
const onboardingStyleGoals = ['look bigger', 'slimmer', 'casual', 'elegant'];
const onboardingColors = ['black', 'white', 'gray', 'navy', 'beige', 'brown', 'red', 'green'];
const onboardingBodyTypes = ['slim', 'athletic', 'muscular', 'bulky', 'overweight', 'skinny-fat', 'petite', 'plus-size'];
const colorHexMap = {
  black: '#111827',
  white: '#f8fafc',
  gray: '#94a3b8',
  blue: '#3b82f6',
  navy: '#172554',
  beige: '#d6c7a1',
  brown: '#7c4a2d',
  red: '#dc2626',
  green: '#16a34a',
  pink: '#ec4899',
  cream: '#f5ead2'
};

function getColorHex(color) {
  return colorHexMap[color] || '#e2e8f0';
}

function getOutfitSignature(outfit) {
  if (!outfit) return '';

  return [outfit.top, outfit.bottom, outfit.shoes, outfit.jacket]
    .map((item) => (item ? `${item.type}:${item.color}` : 'none'))
    .join('|');
}

function stripOutfitImages(outfit = {}) {
  const nextOutfit = { ...outfit };
  for (const key of ['top', 'bottom', 'shoes', 'jacket']) {
    if (nextOutfit[key]) {
      const { imageUrl, ...itemWithoutImage } = nextOutfit[key];
      nextOutfit[key] = itemWithoutImage;
    }
  }
  return nextOutfit;
}

function hasEnoughWardrobeForOutfit(clothes) {
  return clothes.some((item) => topTypes.has(item.type)) &&
    clothes.some((item) => bottomTypes.has(item.type)) &&
    clothes.some((item) => item.type === 'shoes');
}

function PageHeader({ title, description, action }) {
  return (
    <div className="grid w-full max-w-full shrink-0 gap-3 sm:flex sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h2 className="text-xl font-bold tracking-normal text-slate-950">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p> : null}
      </div>
      {action ? <div className="w-full min-w-0 sm:w-auto sm:shrink-0">{action}</div> : null}
    </div>
  );
}

function ScrollPanel({ children, className = '' }) {
  return <div className={`mobile-scroll min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden ${className}`}>{children}</div>;
}

function SoftCard({ children, className = '' }) {
  return <section className={`w-full max-w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${className}`}>{children}</section>;
}

function useStableMobileViewport() {
  useEffect(() => {
    let blurResetTimer;

    function isFormElementFocused() {
      return ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName);
    }

    function setKeyboardOffset() {
      const viewport = window.visualViewport;
      const isFocused = isFormElementFocused();
      const offset = viewport && isFocused
        ? Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop))
        : 0;

      document.documentElement.style.setProperty('--keyboard-offset', `${offset}px`);
    }

    function setAppHeight({ force = false } = {}) {
      setKeyboardOffset();
      if (!force && isFormElementFocused()) return;

      const height = window.innerHeight;
      if (height > 0) {
        document.documentElement.style.setProperty('--app-height', `${height}px`);
      }

      if (force) {
        window.scrollTo(0, 0);
        document.scrollingElement?.scrollTo(0, 0);
      }
    }

    function scheduleReset() {
      window.clearTimeout(blurResetTimer);
      blurResetTimer = window.setTimeout(() => {
        document.documentElement.style.setProperty('--keyboard-offset', '0px');
        setAppHeight({ force: true });
      }, 180);
      window.setTimeout(() => {
        document.documentElement.style.setProperty('--keyboard-offset', '0px');
        setAppHeight({ force: true });
      }, 420);
    }

    function handleFocusIn(event) {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target?.tagName)) {
        document.documentElement.dataset.formFocused = 'true';
        window.setTimeout(setKeyboardOffset, 80);
        window.setTimeout(setKeyboardOffset, 260);
      }
    }

    function handleFocusOut() {
      delete document.documentElement.dataset.formFocused;
      scheduleReset();
    }

    setAppHeight({ force: true });
    setKeyboardOffset();

    window.addEventListener('resize', setAppHeight);
    window.addEventListener('orientationchange', scheduleReset);
    window.visualViewport?.addEventListener('resize', setAppHeight);
    window.visualViewport?.addEventListener('scroll', setAppHeight);
    document.addEventListener('focusin', handleFocusIn);
    document.addEventListener('focusout', handleFocusOut);

    return () => {
      window.clearTimeout(blurResetTimer);
      window.removeEventListener('resize', setAppHeight);
      window.removeEventListener('orientationchange', scheduleReset);
      window.visualViewport?.removeEventListener('resize', setAppHeight);
      window.visualViewport?.removeEventListener('scroll', setAppHeight);
      document.removeEventListener('focusin', handleFocusIn);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, []);
}

function OnboardingScreen({ preferences, appearanceProfile, onComplete, onSkip }) {
  const { t, optionLabel } = useI18n();
  const [step, setStep] = useState(0);
  const [draftPreferences, setDraftPreferences] = useState(preferences);
  const [draftAppearance, setDraftAppearance] = useState(appearanceProfile);
  const steps = ['style', 'colors', 'fit'];

  function toggleColor(color) {
    setDraftPreferences((current) => {
      const colors = current.preferredColors.includes(color)
        ? current.preferredColors.filter((item) => item !== color)
        : [...current.preferredColors, color];

      return { ...current, preferredColors: colors };
    });
  }

  function isLastStep() {
    return step === steps.length - 1;
  }

  function handleNext() {
    if (!isLastStep()) {
      setStep((current) => current + 1);
      return;
    }

    onComplete(draftPreferences, draftAppearance);
  }

  return (
    <main className="min-h-dvh overflow-x-hidden bg-slate-100 px-4 py-6 text-slate-950">
      <section className="mx-auto flex min-h-[calc(var(--app-height)-48px)] w-full max-w-lg min-w-0 flex-col justify-center">
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{t('onboarding.eyebrow')}</p>
              <h1 className="mt-2 text-2xl font-bold tracking-normal text-slate-950">{t('onboarding.title')}</h1>
              <p className="mt-2 text-sm leading-6 text-slate-500">{t('onboarding.description')}</p>
            </div>
            <button type="button" onClick={onSkip} className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-500">
              {t('buttons.skip')}
            </button>
          </div>

          <div className="mt-5 flex gap-2">
            {steps.map((item, index) => (
              <span key={item} className={`h-1.5 flex-1 rounded-full ${index <= step ? 'bg-teal-700' : 'bg-slate-200'}`} />
            ))}
          </div>

          {steps[step] === 'style' ? (
            <div className="mt-6 grid gap-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">{t('onboarding.styleTitle')}</h2>
                <p className="mt-1 text-sm text-slate-500">{t('onboarding.styleDescription')}</p>
              </div>
              <div className="grid gap-2">
                {onboardingStyles.map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => setDraftPreferences((current) => ({ ...current, preferredStyle: style }))}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold ${draftPreferences.preferredStyle === style ? 'border-teal-600 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white text-slate-700'}`}
                  >
                    {optionLabel('styles', style)}
                  </button>
                ))}
              </div>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                {t('preferences.styleGoal')}
                <select
                  value={draftPreferences.styleGoal}
                  onChange={(event) => setDraftPreferences((current) => ({ ...current, styleGoal: event.target.value }))}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                >
                  {onboardingStyleGoals.map((goal) => (
                    <option key={goal} value={goal}>{optionLabel('styleGoals', goal)}</option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {steps[step] === 'colors' ? (
            <div className="mt-6 grid gap-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">{t('onboarding.colorsTitle')}</h2>
                <p className="mt-1 text-sm text-slate-500">{t('onboarding.colorsDescription')}</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {onboardingColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => toggleColor(color)}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm font-semibold capitalize ${draftPreferences.preferredColors.includes(color) ? 'border-teal-600 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white text-slate-700'}`}
                  >
                    {optionLabel('colors', color)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {steps[step] === 'fit' ? (
            <div className="mt-6 grid gap-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">{t('onboarding.fitTitle')}</h2>
                <p className="mt-1 text-sm text-slate-500">{t('onboarding.fitDescription')}</p>
              </div>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                {t('preferences.bodyType')}
                <select
                  value={draftAppearance.bodyType}
                  onChange={(event) => setDraftAppearance((current) => ({ ...current, bodyType: event.target.value }))}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                >
                  {onboardingBodyTypes.map((bodyType) => (
                    <option key={bodyType} value={bodyType}>{optionLabel('bodyTypes', bodyType)}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm font-medium text-slate-700">
                {t('preferences.height')}
                <select
                  value={draftAppearance.height}
                  onChange={(event) => setDraftAppearance((current) => ({ ...current, height: event.target.value }))}
                  className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-950 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                >
                  {['short', 'medium', 'tall'].map((height) => (
                    <option key={height} value={height}>{optionLabel('heights', height)}</option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setStep((current) => Math.max(0, current - 1))}
              disabled={step === 0}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-600 disabled:opacity-40"
            >
              {t('buttons.back')}
            </button>
            <button type="button" onClick={handleNext} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white">
              {isLastStep() ? t('onboarding.finish') : t('buttons.next')}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

function PremiumBanner({ accessStatus, onOpenPaywall, compact = false }) {
  const { t } = useI18n();

  if (accessStatus.isPremium) {
    return (
      <SoftCard className={`border-teal-200 bg-teal-50 ${compact ? 'p-3' : ''}`}>
        <p className="text-sm font-semibold text-teal-900">{t(accessStatus.subscriptionLabelKey)}</p>
        {!compact ? <p className="mt-1 text-sm text-teal-800">{t('premium.fullAccessDescription')}</p> : null}
      </SoftCard>
    );
  }

  if (accessStatus.isTrialActive) {
    return (
      <SoftCard className={`border-teal-200 bg-teal-50 ${compact ? 'p-3' : ''}`}>
        <p className="text-sm font-semibold text-teal-900">{t('premium.trialStatus', { days: accessStatus.trialDaysLeft })}</p>
        {!compact ? <p className="mt-1 text-sm text-teal-800">{t('premium.trialFullAccess')}</p> : null}
      </SoftCard>
    );
  }

  return (
    <SoftCard className={`border-amber-200 bg-amber-50 ${compact ? 'p-3' : ''}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-amber-950">{accessStatus.isTrialEnded ? t('premium.trialEndedPaywall') : t('premium.tryTrialDescription')}</p>
          {!compact ? <p className="mt-1 text-sm text-amber-800">{t('premium.goDescription')}</p> : null}
        </div>
        <div className={`grid gap-2 ${compact ? 'sm:flex' : 'sm:min-w-44'}`}>
          <button type="button" onClick={onOpenPaywall} className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-50">
            {t('buttons.openPaywall')}
          </button>
        </div>
      </div>
    </SoftCard>
  );
}

function LockedFeature() {
  const { t } = useI18n();

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-950"><LockClosedIcon className="h-4 w-4" aria-hidden="true" />{t('premium.lockedFeature')}</p>
      <p className="mt-1 text-sm text-amber-800">{t('premium.availableInPremium')}</p>
    </div>
  );
}

function AdPlaceholder({ compact = false }) {
  const { t } = useI18n();

  return (
    <div className={`rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-center ${compact ? 'p-3' : 'p-4'}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('ads.label')}</p>
      {!compact ? <p className="mt-1 text-xs text-slate-500">{t('ads.placeholder')}</p> : null}
    </div>
  );
}

function OutfitItemMini({ label, item }) {
  const { optionLabel } = useI18n();
  if (!item) return null;

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
      {item.imageUrl ? (
        <img src={item.imageUrl} alt={`${optionLabel('colors', item.color)} ${optionLabel('types', item.type)}`} className="h-24 w-full object-cover" loading="lazy" decoding="async" />
      ) : null}
      <div className="p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 truncate text-base font-semibold capitalize text-slate-950">{optionLabel('colors', item.color)}</p>
        <p className="truncate text-xs capitalize text-slate-500">{optionLabel('types', item.type)}</p>
      </div>
    </div>
  );
}

function OutfitResultCard({ suggestion, isFeedbackLoading, onFeedback, onAddClothes, onSeeOnMe, hasEnoughWardrobe }) {
  const { t } = useI18n();

  if (!suggestion) {
    return (
      <div className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
        <div>
          <p className="text-sm font-semibold text-slate-900">{t(hasEnoughWardrobe ? 'outfit.readyTitle' : 'outfit.emptyTitle')}</p>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-slate-500">{t(hasEnoughWardrobe ? 'outfit.readyDescription' : 'outfit.emptyDescription')}</p>
          {!hasEnoughWardrobe && onAddClothes ? (
            <button type="button" onClick={onAddClothes} className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
              {t('wardrobe.addAction')}
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-3">
        <OutfitItemMini label={t('outfit.labels.top')} item={suggestion.top} />
        <OutfitItemMini label={t('outfit.labels.bottom')} item={suggestion.bottom} />
        <OutfitItemMini label={t('outfit.labels.shoes')} item={suggestion.shoes} />
        <OutfitItemMini label={t('outfit.labels.jacket')} item={suggestion.jacket} />
      </div>
      {suggestion.weather && !suggestion.weather.unavailable ? (
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          {t('outfit.weather', {
            temperature: Math.round(suggestion.weather.temperatureC),
            condition: suggestion.weather.rainy ? t('outfit.rainy') : t('outfit.dry'),
            city: suggestion.weather.city
          })}
        </p>
      ) : null}
      {onFeedback ? (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onFeedback('like')} disabled={isFeedbackLoading} className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-900">
            {t('buttons.like')}
          </button>
          <button type="button" onClick={() => onFeedback('dislike')} disabled={isFeedbackLoading} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">
            {t('buttons.dislike')}
          </button>
        </div>
      ) : null}
      {onSeeOnMe ? (
        <button type="button" onClick={onSeeOnMe} className="rounded-xl border border-slate-900 bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800">
          {t('home.seeOnMeCta')}
        </button>
      ) : null}
    </div>
  );
}

function HomeHistoryPreview({ outfit }) {
  const { t, optionLabel } = useI18n();
  if (outfit.type === 'review') {
    return (
      <div className="aura-history-preview is-review" aria-hidden="true">
        <img src={outfit.imageUrl} alt="" loading="lazy" decoding="async" />
      </div>
    );
  }

  const items = [outfit.top, outfit.bottom, outfit.shoes].filter(Boolean);

  return (
    <div className="aura-history-preview" aria-hidden="true">
      {items.map((item, index) => (
        <span key={`${item.id || item.type}-${index}`} className="aura-history-piece" style={{ '--piece-color': getColorHex(item.color) }}>
          {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" decoding="async" /> : <small>{optionLabel('types', item.type).slice(0, 1)}</small>}
        </span>
      ))}
      {!items.length ? <small>{t('home2.outfitBadge')}</small> : null}
    </div>
  );
}

function HomeTab({ outfitHistory, reviewHistory = [], suggestion, accessStatus, onAnalyze, onSuggest, onSeeOnMe, onOpenPaywall, onSelectOutfit, onSelectReview, onFeedback, isFeedbackLoading, hasEnoughWardrobe, onAddClothes, isSuggesting }) {
  const { t, optionLabel } = useI18n();
  const recentReviews = [
    ...reviewHistory.map((item) => ({ ...item, sortTime: item.createdAt || 0 })),
    ...outfitHistory.map((item) => ({ ...item, type: 'outfit', sortTime: Number(String(item.historyId || '').split('-')[0]) || 0 }))
  ].sort((a, b) => b.sortTime - a.sortTime).slice(0, 3);

  return (
    <ScrollPanel className="aura-page">
      <section className="aura-hero">
        <img src={stylistHero} alt={t('home2.heroAlt')} className="aura-hero-image" />
        <div className="aura-hero-scrim" />
        <div className="aura-hero-content">
          <p className="aura-kicker">{t('home2.kicker')}</p>
          <h2>{t('home2.title')}</h2>
          <p>{t('home2.description')}</p>
          <div className="aura-hero-actions">
            <button type="button" onClick={onAnalyze} className="aura-button aura-button-primary">
              <CameraIcon aria-hidden="true" />
              {t('home2.analyze')}
            </button>
            <button
              type="button"
              onClick={accessStatus.hasFullAccess ? onSeeOnMe : onOpenPaywall}
              className="aura-button aura-button-glass"
            >
              <SparklesIcon aria-hidden="true" />
              {t('home2.seeOnMe')}
              {!accessStatus.hasFullAccess ? <span className="aura-premium-dot">{t('home2.premium')}</span> : null}
            </button>
          </div>
        </div>
      </section>

      {suggestion ? (
        <section className="aura-section">
          <div className="aura-section-heading">
            <div>
              <p className="aura-kicker">{t('home2.selectedKicker')}</p>
              <h3>{t('home2.selectedTitle')}</h3>
            </div>
            <button type="button" onClick={onSuggest} disabled={isSuggesting} className="aura-text-button disabled:cursor-not-allowed disabled:opacity-50">
              {isSuggesting ? t('seeOnMe.generating') : t('seeOnMe.generateNewOutfit')} <ChevronRightIcon aria-hidden="true" />
            </button>
          </div>
          <OutfitResultCard
            suggestion={suggestion}
            isFeedbackLoading={isFeedbackLoading}
            onFeedback={onFeedback}
            onAddClothes={onAddClothes}
            onSeeOnMe={onSeeOnMe}
            hasEnoughWardrobe={hasEnoughWardrobe}
          />
        </section>
      ) : null}

      <section className="aura-section">
        <div className="aura-section-heading">
          <div>
            <p className="aura-kicker">{t('home2.recentKicker')}</p>
            <h3>{t('home2.recentTitle')}</h3>
          </div>
          <button type="button" onClick={onAnalyze} className="aura-text-button">
            {t('home2.newReview')} <ChevronRightIcon aria-hidden="true" />
          </button>
        </div>

        {recentReviews.length ? (
          <div className="aura-carousel" aria-label={t('home2.recentTitle')}>
            {recentReviews.map((outfit, index) => {
              const isReview = outfit.type === 'review';
              return (
                <button type="button" className="aura-review-card" key={outfit.historyId || outfit.createdAt || index} onClick={() => (isReview ? onSelectReview(outfit) : onSelectOutfit(outfit, { openSeeOnMe: true }))}>
                  <HomeHistoryPreview outfit={outfit} />
                  <div>
                    <span className="aura-score">{isReview ? t('home2.reviewBadge', { score: outfit.score }) : t('home2.outfitBadge')}</span>
                    <p>{isReview ? t('home2.photoReviewVerdict') : t('home2.reviewVerdict')}</p>
                    <small>{isReview ? t('home2.openReview') : t('home.seeOnMeCta')}</small>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <button type="button" onClick={onAnalyze} className="aura-empty-row">
            <CameraIcon aria-hidden="true" />
            <span>
              <strong>{t('home2.emptyTitle')}</strong>
              <small>{t('home2.emptyDescription')}</small>
            </span>
            <ChevronRightIcon aria-hidden="true" />
          </button>
        )}
      </section>
    </ScrollPanel>
  );
}

function WardrobeCard({ item }) {
  const { t, optionLabel } = useI18n();
  const hasImage = Boolean(item.imageUrl);

  return (
    <article className={`aura-wardrobe-card ${hasImage ? '' : 'is-text-only'}`}>
      {hasImage ? (
        <img src={item.imageUrl} alt={t('closet.itemPhotoAlt')} loading="lazy" decoding="async" />
      ) : (
        <div className="aura-wardrobe-placeholder">
          <PhotoIcon aria-hidden="true" />
          <span>{optionLabel('types', item.type)}</span>
        </div>
      )}
      <div className="aura-wardrobe-meta">
        <p>{optionLabel('colors', item.color)} {optionLabel('types', item.type)}</p>
        <small>{optionLabel('seasons', item.season)}{item.style ? ` · ${optionLabel('styles', item.style)}` : ''}</small>
      </div>
    </article>
  );
}

function matchesWardrobeFilter(item, filter) {
  if (filter === 'tops') return topTypes.has(item.type);
  if (filter === 'bottoms') return bottomTypes.has(item.type);
  if (filter === 'shoes') return item.type === 'shoes';
  if (filter === 'jackets') return item.type === 'jacket';
  return true;
}

function hasItem(clothes, predicate) {
  return clothes.some(predicate);
}

function getOccasionHints(outfitHistory) {
  const counts = outfitHistory.reduce((acc, outfit) => {
    if (outfit.occasion) {
      acc[outfit.occasion] = (acc[outfit.occasion] || 0) + 1;
    }
    return acc;
  }, {});

  return {
    hasWork: Boolean(counts.work),
    hasDate: Boolean(counts.date || counts['first date'] || counts.dinner),
    hasFormal: Boolean(counts.wedding || counts.engagement || counts['formal event']),
    hasCasual: Boolean(counts.daily || counts.picnic || counts['casual meetup'])
  };
}

function buildWardrobeRecommendations({ clothes, preferences, appearanceProfile, outfitHistory }) {
  const recommendations = [];
  const preferredStyle = preferences?.preferredStyle || 'casual';
  const preferredColors = preferences?.preferredColors || [];
  const occasionHints = getOccasionHints(outfitHistory);
  const hasNeutralShoes = hasItem(clothes, (item) => item.type === 'shoes' && neutralColors.has(item.color));
  const hasLightShoes = hasItem(clothes, (item) => item.type === 'shoes' && lightColors.has(item.color));
  const hasDarkShoes = hasItem(clothes, (item) => item.type === 'shoes' && darkColors.has(item.color));
  const hasDarkBottom = hasItem(clothes, (item) => bottomTypes.has(item.type) && darkColors.has(item.color));
  const hasLightBottom = hasItem(clothes, (item) => bottomTypes.has(item.type) && lightColors.has(item.color));
  const hasNeutralLayer = hasItem(clothes, (item) => ['jacket', 'shirt', 'long sleeve'].includes(item.type) && neutralColors.has(item.color));
  const hasFormalShoes = hasItem(clothes, (item) => item.type === 'shoes' && item.style === 'formal');
  const hasWhiteShirt = hasItem(clothes, (item) => item.type === 'shirt' && item.color === 'white');
  const hasLightTshirt = hasItem(clothes, (item) => item.type === 'tshirt' && lightColors.has(item.color));
  const hasNavyLayer = hasItem(clothes, (item) => ['jacket', 'shirt', 'long sleeve'].includes(item.type) && item.color === 'navy');
  const hasClassicBottom = hasItem(clothes, (item) => bottomTypes.has(item.type) && ['black', 'navy', 'gray'].includes(item.color));
  const hasSummerShirt = hasItem(clothes, (item) => item.type === 'shirt' && lightColors.has(item.color) && ['summer', 'all'].includes(item.season));
  const hasWinterKnit = hasItem(clothes, (item) => item.type === 'long sleeve' && ['gray', 'navy', 'black', 'cream'].includes(item.color));

  function addRecommendation(itemKey, reasonKey, priority, score) {
    if (recommendations.some((item) => item.itemKey === itemKey)) return;
    recommendations.push({ itemKey, reasonKey, priority, score });
  }

  if (!hasNeutralShoes) {
    addRecommendation('whiteSneakers', 'neutralShoes', 'high', 100);
  } else if (!hasLightShoes && (occasionHints.hasDate || preferredStyle === 'casual')) {
    addRecommendation('whiteSneakers', 'smartCasual', 'medium', 62);
  }

  if (!hasDarkBottom) {
    addRecommendation('darkJeans', 'darkBottoms', 'high', 95);
  }

  if (!hasClassicBottom) {
    addRecommendation('smartCasualPants', 'workLooks', 'medium', 84);
  }

  if (!hasNeutralLayer) {
    addRecommendation('neutralOvershirt', appearanceProfile?.bodyType === 'slim' || appearanceProfile?.bodyType === 'skinny-fat' ? 'layering' : 'smartCasual', 'medium', 78);
  }

  if (!hasNavyLayer) {
    addRecommendation('navyOvershirt', 'smartCasual', 'medium', 74);
  }

  if ((occasionHints.hasWork || occasionHints.hasFormal || preferredStyle === 'classic' || preferredStyle === 'formal') && !hasFormalShoes) {
    addRecommendation('formalShoes', 'formalOccasions', occasionHints.hasFormal ? 'high' : 'medium', 86);
  }

  if ((occasionHints.hasWork || preferredStyle === 'classic') && !hasWhiteShirt) {
    addRecommendation('whiteShirt', 'workLooks', 'medium', 72);
  }

  if ((occasionHints.hasCasual || preferredStyle === 'sporty') && !hasLightTshirt) {
    addRecommendation('lightTshirt', 'warmWeather', 'optional', 45);
  }

  if (!hasLightBottom && (occasionHints.hasCasual || preferredStyle === 'casual')) {
    addRecommendation('beigeChinos', 'smartCasual', 'optional', 52);
  }

  if (!hasSummerShirt) {
    addRecommendation('linenShirt', 'warmWeather', 'optional', 48);
  }

  if (!hasWinterKnit && (appearanceProfile?.bodyType === 'slim' || appearanceProfile?.bodyType === 'skinny-fat')) {
    addRecommendation('structuredKnit', 'layering', 'optional', 46);
  }

  if (!hasDarkShoes) {
    addRecommendation('darkSneakers', 'rainReady', 'medium', 64);
  }

  if (preferredColors.includes('blue') && !hasItem(clothes, (item) => item.color === 'blue' || item.color === 'navy')) {
    addRecommendation('navyBasic', 'preferredColors', 'optional', 42);
  }

  const fallbackRecommendations = [
    ['whiteSneakers', 'neutralShoes', 'high', 40],
    ['darkJeans', 'darkBottoms', 'high', 39],
    ['neutralOvershirt', 'smartCasual', 'medium', 38],
    ['smartCasualPants', 'workLooks', 'medium', 37],
    ['formalShoes', 'formalOccasions', 'medium', 36],
    ['whiteShirt', 'workLooks', 'medium', 35],
    ['navyOvershirt', 'smartCasual', 'medium', 34],
    ['beigeChinos', 'smartCasual', 'optional', 33],
    ['linenShirt', 'warmWeather', 'optional', 32],
    ['structuredKnit', 'layering', 'optional', 31],
    ['darkSneakers', 'rainReady', 'optional', 30],
    ['lightTshirt', 'warmWeather', 'optional', 29]
  ];

  fallbackRecommendations.forEach(([itemKey, reasonKey, priority, score]) => {
    if (recommendations.length < 8) {
      addRecommendation(itemKey, reasonKey, priority, score);
    }
  });

  return recommendations.sort((a, b) => b.score - a.score);
}

function WardrobeRecommendationCard({ recommendation }) {
  const { t } = useI18n();
  const priorityClasses = {
    high: 'border-rose-200 bg-rose-50 text-rose-800',
    medium: 'border-amber-200 bg-amber-50 text-amber-800',
    optional: 'border-slate-200 bg-slate-50 text-slate-600'
  };

  return (
    <article className="flex min-h-52 min-w-0 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-3">
        <span className={`w-fit rounded-full border px-3 py-1 text-xs font-semibold ${priorityClasses[recommendation.priority]}`}>
          {t(`wardrobe.improve.priorities.${recommendation.priority}`)}
        </span>
        <div>
          <h4 className="text-sm font-semibold text-slate-950">{t(`wardrobe.improve.items.${recommendation.itemKey}`)}</h4>
          <p className="mt-2 text-sm leading-6 text-slate-500">{t(`wardrobe.improve.reasons.${recommendation.reasonKey}`)}</p>
        </div>
      </div>
      <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-400">
        {t('wardrobe.improve.shopPlaceholder')}
      </div>
    </article>
  );
}

function WardrobeImprovementPanel({ recommendations, visibleCount, onShowMore }) {
  const { t } = useI18n();
  const visibleRecommendations = recommendations.slice(0, visibleCount);
  const canShowMore = visibleCount < recommendations.length;

  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-teal-100 bg-teal-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-teal-950">{t('wardrobe.improve.title')}</p>
          <p className="mt-1 text-sm leading-6 text-teal-800">{t('wardrobe.improve.description')}</p>
        </div>
        {canShowMore ? (
          <button type="button" onClick={onShowMore} className="shrink-0 rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs font-semibold text-teal-900">
            {t('wardrobe.improve.more')}
          </button>
        ) : null}
      </div>
      {visibleRecommendations.length ? (
        <div className="mt-4 grid gap-3">
          <div className="wardrobe-recommendation-rail" aria-label={t('wardrobe.improve.title')}>
            {visibleRecommendations.map((recommendation) => (
              <WardrobeRecommendationCard key={recommendation.itemKey} recommendation={recommendation} />
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-teal-200 bg-white p-4 text-sm text-teal-800">
          {t('wardrobe.improve.empty')}
        </div>
      )}
    </section>
  );
}

function LegacyWardrobeTab({ clothes, isLoading, onAdd, isAddingClothes, accessStatus, preferences, appearanceProfile, outfitHistory }) {
  const { t, optionLabel } = useI18n();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [onlyWithPhotos, setOnlyWithPhotos] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [visibleRecommendationCount, setVisibleRecommendationCount] = useState(4);

  const searchSuggestions = useMemo(() => {
    const translatedOptions = [
      ...wardrobeSearchTypes.map((value) => optionLabel('types', value)),
      ...wardrobeSearchColors.map((value) => optionLabel('colors', value)),
      ...wardrobeSearchSeasons.map((value) => optionLabel('seasons', value)),
      ...wardrobeSearchStyles.map((value) => optionLabel('styles', value))
    ];
    const wardrobeOptions = clothes.flatMap((item) => [
      item.type,
      item.color,
      item.season,
      item.style,
      optionLabel('types', item.type),
      optionLabel('colors', item.color),
      optionLabel('seasons', item.season),
      optionLabel('styles', item.style)
    ]);

    return [...new Set([...translatedOptions, ...wardrobeOptions].filter(Boolean))];
  }, [clothes, optionLabel]);

  const filteredClothes = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return clothes.filter((item) => {
      const searchable = [
        item.type,
        item.color,
        item.season,
        item.style,
        optionLabel('types', item.type),
        optionLabel('colors', item.color),
        optionLabel('seasons', item.season),
        optionLabel('styles', item.style)
      ].filter(Boolean).join(' ').toLowerCase();
      return matchesWardrobeFilter(item, filter) && (!onlyWithPhotos || Boolean(item.imageUrl)) && (!cleanQuery || searchable.includes(cleanQuery));
    });
  }, [clothes, filter, onlyWithPhotos, optionLabel, query]);

  const wardrobeRecommendations = useMemo(() => buildWardrobeRecommendations({
    clothes,
    preferences,
    appearanceProfile,
    outfitHistory
  }), [appearanceProfile, clothes, outfitHistory, preferences]);

  function toggleAddMode() {
    setShowAdd((value) => {
      const nextValue = !value;
      if (nextValue) {
        setQuery('');
        setFilter('all');
      }
      return nextValue;
    });
  }

  async function handleAddAndReturnToList(payload) {
    await onAdd(payload);
    setShowAdd(false);
    setQuery('');
    setFilter('all');
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader
        title={t('wardrobe.title')}
        description={t('wardrobe.description')}
        action={
          <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:flex sm:w-auto">
            {!showAdd ? (
              <button type="button" onClick={() => setShowRecommendations((value) => !value)} className="min-w-0 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-900">
                {t('wardrobe.improve.action')}
              </button>
            ) : null}
            <button type="button" onClick={toggleAddMode} className="min-w-0 rounded-xl bg-slate-950 px-3 py-2 text-sm font-semibold text-white">
              {showAdd ? t('buttons.cancel') : t('wardrobe.addAction')}
            </button>
          </div>
        }
      />
      {!showAdd ? (
        <div className="grid shrink-0 gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('wardrobe.searchPlaceholder')}
            list="wardrobe-search-suggestions"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          />
          <datalist id="wardrobe-search-suggestions">
            {searchSuggestions.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
          <div className="flex min-w-0 flex-wrap gap-2">
            {wardrobeFilters.map((item) => (
              <button key={item} type="button" onClick={() => setFilter(item)} className={`min-w-0 rounded-full px-3 py-2 text-xs font-semibold sm:px-4 sm:text-sm ${filter === item ? 'bg-slate-950 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>
                {t(`wardrobe.filters.${item}`)}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOnlyWithPhotos((value) => !value)}
              className={`min-w-0 rounded-full px-3 py-2 text-xs font-semibold sm:px-4 sm:text-sm ${onlyWithPhotos ? 'bg-teal-700 text-white' : 'border border-slate-200 bg-white text-slate-600'}`}
            >
              {t('wardrobe.filters.withPhotos')}
            </button>
          </div>
        </div>
      ) : null}
      <ScrollPanel className="pb-2">
        <div className="grid gap-3 pb-2">
          {showAdd ? (
            <AddClothingForm onAdd={handleAddAndReturnToList} isLoading={isAddingClothes} accessStatus={accessStatus} />
          ) : isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[1, 2, 3, 4].map((item) => <div key={item} className="aspect-square animate-pulse rounded-2xl bg-slate-200" />)}
            </div>
          ) : (
            <>
              {showRecommendations ? (
                <WardrobeImprovementPanel
                  recommendations={wardrobeRecommendations}
                  visibleCount={visibleRecommendationCount}
                  onShowMore={() => {
                    setVisibleRecommendationCount((value) => {
                      return Math.min(value + 3, wardrobeRecommendations.length);
                    });
                  }}
                />
              ) : null}
              {filteredClothes.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {filteredClothes.map((item) => <WardrobeCard key={item.id} item={item} />)}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-6 text-center">
                  <p className="text-sm font-semibold text-slate-900">{t('wardrobe.emptyTitle')}</p>
                  <p className="mt-2 text-sm text-slate-500">{t('wardrobe.emptyDescription')}</p>
                  <button type="button" onClick={() => setShowAdd(true)} className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
                    {t('wardrobe.addAction')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollPanel>
    </div>
  );
}

function WardrobeTab({ clothes, isLoading, onAdd, isAddingClothes, accessStatus, preferences, appearanceProfile, outfitHistory }) {
  const { t, optionLabel } = useI18n();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [showSearch, setShowSearch] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [visibleRecommendationCount, setVisibleRecommendationCount] = useState(12);

  const filteredClothes = useMemo(() => {
    const cleanQuery = query.trim().toLowerCase();
    return clothes.filter((item) => {
      const searchable = [
        item.type,
        item.color,
        item.season,
        item.style,
        optionLabel('types', item.type),
        optionLabel('colors', item.color)
      ].filter(Boolean).join(' ').toLowerCase();
      return matchesWardrobeFilter(item, filter) && (!cleanQuery || searchable.includes(cleanQuery));
    });
  }, [clothes, filter, optionLabel, query]);

  const wardrobeRecommendations = useMemo(() => buildWardrobeRecommendations({
    clothes,
    preferences,
    appearanceProfile,
    outfitHistory
  }), [appearanceProfile, clothes, outfitHistory, preferences]);

  async function handleAddAndClose(payload) {
    await onAdd(payload);
    setShowAddForm(false);
    setShowAddSheet(false);
  }

  function openAddForm() {
    setShowAddSheet(false);
    setShowAddForm(true);
  }

  if (showAddForm) {
    return (
      <div className="wardrobe-shell">
        <div className="wardrobe-header wardrobe-add-header">
          <button type="button" className="aura-text-button" onClick={() => setShowAddForm(false)}>{t('buttons.back')}</button>
          <div>
            <p className="aura-kicker">{t('wardrobe2.addKicker')}</p>
            <h2>{t('addClothes.title')}</h2>
          </div>
        </div>
        <ScrollPanel className="wardrobe-scroll">
          <AddClothingForm onAdd={handleAddAndClose} isLoading={isAddingClothes} accessStatus={accessStatus} />
        </ScrollPanel>
      </div>
    );
  }

  return (
    <div className="wardrobe-shell">
      <div className="wardrobe-header">
        <div>
          <p className="aura-kicker">{t('wardrobe2.kicker')}</p>
          <h2>{t('wardrobe.title')}</h2>
          <span>{t('wardrobe2.itemCount', { count: clothes.length })}</span>
        </div>
        <button type="button" className="aura-icon-button" onClick={() => setShowSearch((value) => !value)} aria-label={t('wardrobe.searchPlaceholder')}>
          <MagnifyingGlassIcon aria-hidden="true" />
        </button>
      </div>

      {showSearch ? (
        <div className="wardrobe-search">
          <MagnifyingGlassIcon aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.target.value)} autoFocus placeholder={t('wardrobe.searchPlaceholder')} />
        </div>
      ) : null}

      <div className="wardrobe-filters" role="tablist" aria-label={t('wardrobe.title')}>
        {wardrobeFilters.map((item) => (
          <button key={item} type="button" onClick={() => setFilter(item)} className={filter === item ? 'is-active' : ''}>
            {t(`wardrobe.filters.${item}`)}
          </button>
        ))}
      </div>

      <button type="button" onClick={() => setShowRecommendations((value) => !value)} className="wardrobe-improve-button">
        <SparklesIcon aria-hidden="true" />
        <span>{t('wardrobe.improve.action')}</span>
      </button>

      <ScrollPanel className="wardrobe-scroll">
        {isLoading ? (
          <div className="wardrobe-grid">
            {[1, 2, 3, 4, 5, 6].map((item) => <div key={item} className="wardrobe-skeleton" />)}
          </div>
        ) : (
          <div className="grid gap-3">
            {showRecommendations ? (
              <WardrobeImprovementPanel
                recommendations={wardrobeRecommendations}
                visibleCount={visibleRecommendationCount}
                onShowMore={() => {
                  setVisibleRecommendationCount((value) => {
                    return Math.min(value + 3, wardrobeRecommendations.length);
                  });
                }}
              />
            ) : null}
            {filteredClothes.length ? (
              <div className="wardrobe-grid">
                {filteredClothes.map((item) => <WardrobeCard key={item.id} item={item} />)}
              </div>
            ) : (
              <button type="button" onClick={() => setShowAddSheet(true)} className="aura-empty-row wardrobe-empty">
                <PlusIcon aria-hidden="true" />
                <span>
                  <strong>{t('wardrobe.emptyTitle')}</strong>
                  <small>{t('wardrobe.emptyDescription')}</small>
                </span>
                <ChevronRightIcon aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </ScrollPanel>

      <button type="button" onClick={() => setShowAddSheet(true)} className="wardrobe-add-button" aria-label={t('wardrobe.addAction')}>
        <PlusIcon aria-hidden="true" />
      </button>

      {showAddSheet ? (
        <div className="aura-sheet-backdrop" role="presentation" onClick={() => setShowAddSheet(false)}>
          <section className="aura-sheet" role="dialog" aria-modal="true" aria-labelledby="add-wardrobe-title" onClick={(event) => event.stopPropagation()}>
            <span className="aura-sheet-handle" />
            <h3 id="add-wardrobe-title">{t('wardrobe2.addTitle')}</h3>
            <button type="button" className="aura-sheet-row is-primary" onClick={openAddForm}>
              <CameraIcon aria-hidden="true" />
              <span><strong>{t('wardrobe2.takePhoto')}</strong><small>{t('wardrobe2.takePhotoDescription')}</small></span>
              <ChevronRightIcon aria-hidden="true" />
            </button>
            <button type="button" className="aura-sheet-row" onClick={openAddForm}>
              <PhotoIcon aria-hidden="true" />
              <span><strong>{t('wardrobe2.library')}</strong><small>{t('wardrobe2.libraryDescription')}</small></span>
              <ChevronRightIcon aria-hidden="true" />
            </button>
            <button type="button" className="aura-sheet-row" onClick={openAddForm}>
              <PlusIcon aria-hidden="true" />
              <span><strong>{t('wardrobe2.manual')}</strong><small>{t('wardrobe2.manualDescription')}</small></span>
              <ChevronRightIcon aria-hidden="true" />
            </button>
            <button type="button" className="aura-sheet-cancel" onClick={() => setShowAddSheet(false)}>{t('buttons.cancel')}</button>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function StudioSection({ title, description, children, locked }) {
  return (
    <SoftCard className={locked ? 'border-amber-200 bg-amber-50/40' : ''}>
      <div className="mb-3">
        <h3 className="text-base font-semibold text-slate-950">{title}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>
      </div>
      {locked ? <LockedFeature /> : children}
    </SoftCard>
  );
}

function PhotoChoiceCard({ photo, isSelected, onSelect, disabled = false }) {
  const { t } = useI18n();

  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={`overflow-hidden rounded-2xl border text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${isSelected ? 'border-teal-600 ring-2 ring-teal-100' : 'border-slate-200 hover:border-slate-300'}`}
    >
      <img src={photo.imageUrl} alt={t('appearance.previewAlt')} className="h-28 w-full object-cover" loading="lazy" decoding="async" />
      <span className="block px-3 py-2 text-xs font-semibold text-slate-600">
        {isSelected ? t('seeOnMe.selectedPhoto') : t('seeOnMe.usePhoto')}
      </span>
    </button>
  );
}

function SeeOnMeLoadingState() {
  const { t } = useI18n();
  const [stepIndex, setStepIndex] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const loadingMessages = [
    t('seeOnMe.loadingSteps.styling'),
    t('seeOnMe.loadingSteps.matching'),
    t('seeOnMe.loadingSteps.fitting'),
    t('seeOnMe.loadingSteps.adjusting'),
    t('seeOnMe.loadingSteps.almostReady')
  ];

  useEffect(() => {
    const messageTimer = window.setInterval(() => {
      setStepIndex((currentIndex) => Math.min(currentIndex + 1, loadingMessages.length - 1));
    }, 3200);
    const elapsedTimer = window.setInterval(() => {
      setElapsedSeconds((currentSeconds) => currentSeconds + 1);
    }, 1000);

    return () => {
      window.clearInterval(messageTimer);
      window.clearInterval(elapsedTimer);
    };
  }, [loadingMessages.length]);

  const isLongWait = elapsedSeconds >= 30;

  return (
    <div className="see-on-me-loading rounded-3xl border border-teal-100 bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-5 text-white shadow-sm" aria-live="polite">
      <div className="flex items-start gap-4">
        <div className="relative h-28 w-20 shrink-0 overflow-hidden rounded-[2rem] bg-white/10 ring-1 ring-white/10">
          <div className="absolute left-1/2 top-3 h-7 w-7 -translate-x-1/2 rounded-full bg-white/20" />
          <div className="absolute left-1/2 top-12 h-14 w-10 -translate-x-1/2 rounded-t-3xl bg-white/15" />
          <div className="absolute bottom-3 left-6 h-9 w-2 rounded-full bg-white/15" />
          <div className="absolute bottom-3 right-6 h-9 w-2 rounded-full bg-white/15" />
          <div className="see-on-me-shimmer absolute inset-0" />
        </div>
        <div className="min-w-0 flex-1">
          <span className="inline-flex rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-teal-100">
            {t('home.seeOnMeCta')}
          </span>
          <p className="mt-3 text-base font-semibold">{loadingMessages[stepIndex]}</p>
          <p className="mt-2 text-sm leading-6 text-white/70">{t('seeOnMe.loadingExpectation')}</p>
          {isLongWait ? (
            <p className="mt-3 rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold text-teal-50">
              {t('seeOnMe.longWait')}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-5 grid grid-cols-5 gap-2">
        {loadingMessages.map((message, index) => (
          <span
            key={message}
            className={`h-1.5 rounded-full transition-all duration-500 ${index <= stepIndex ? 'bg-teal-200' : 'bg-white/15'}`}
          />
        ))}
      </div>
      <div className="mt-5 grid grid-cols-3 gap-2">
        <span className="see-on-me-pulse h-16 rounded-2xl bg-white/10" />
        <span className="see-on-me-pulse h-16 rounded-2xl bg-white/10 [animation-delay:140ms]" />
        <span className="see-on-me-pulse h-16 rounded-2xl bg-white/10 [animation-delay:280ms]" />
      </div>
    </div>
  );
}

function SeeOnMeOutfitPreview({ suggestion }) {
  const { t } = useI18n();

  return (
    <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-950">{t('seeOnMe.outfitTitle')}</h4>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-500">{t('home.seeOnMeCta')}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <OutfitItemMini label={t('outfit.labels.top')} item={suggestion.top} />
        <OutfitItemMini label={t('outfit.labels.bottom')} item={suggestion.bottom} />
        <OutfitItemMini label={t('outfit.labels.shoes')} item={suggestion.shoes} />
        <OutfitItemMini label={t('outfit.labels.jacket')} item={suggestion.jacket} />
      </div>
    </div>
  );
}

function SeeOnMePanel({ accessStatus, suggestion, appearanceProfile, preferences, onSaveAppearance, onGenerateNewOutfit, onSavedLook, onOpenSavedLooks }) {
  const { t, language } = useI18n();
  const [selectedPhotoId, setSelectedPhotoId] = useState(appearanceProfile.photos[0]?.id || '');
  const [selectedPhotoDataUrl, setSelectedPhotoDataUrl] = useState(appearanceProfile.photos[0]?.imageUrl || '');
  const [preview, setPreview] = useState(null);
  const [state, setState] = useState('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [serviceError, setServiceError] = useState(null);
  const [validationWarning, setValidationWarning] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedLookId, setSavedLookId] = useState('');
  const seeOnMeLibraryInputRef = useRef(null);
  const seeOnMeCameraInputRef = useRef(null);
  const isGenerating = state === 'generating';
  const isGeneratingRef = useRef(false);
  const suggestionSignature = getOutfitSignature(suggestion);
  const canUploadMore = accessStatus.canUseUserPhotoUpload && appearanceProfile.photos.length < maxAppearancePhotos && !isGenerating;

  useEffect(() => {
    setPreview(null);
    setState('idle');
    setErrorMessage('');
    setServiceError(null);
    setValidationWarning(null);
    setSavedLookId('');
  }, [suggestionSignature]);

  function handleSelectPhoto(photo) {
    if (isGenerating) return;
    setSelectedPhotoId(photo.id);
    setSelectedPhotoDataUrl(photo.imageUrl);
    setPreview(null);
    setErrorMessage('');
    setServiceError(null);
    setValidationWarning(null);
    setSavedLookId('');
  }

  function addSeeOnMePhoto(imageDataUrl) {
      const nextPhoto = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        imageUrl: imageDataUrl
      };
      onSaveAppearance({
        ...appearanceProfile,
        photos: [...appearanceProfile.photos, nextPhoto].slice(0, maxAppearancePhotos)
      });
      setSelectedPhotoId(nextPhoto.id);
      setSelectedPhotoDataUrl(nextPhoto.imageUrl);
      setPreview(null);
      setErrorMessage('');
      setServiceError(null);
      setValidationWarning(null);
      setSavedLookId('');
  }

  async function handlePhotoUpload(event) {
    const file = event.target.files?.[0];
    if (!file || !canUploadMore) return;

    try {
      const imageDataUrl = await compressImageFile(file, { maxDimension: 820, quality: 0.6 });
      addSeeOnMePhoto(imageDataUrl);
    } catch {
      setErrorMessage(t('seeOnMe.uploadFailed'));
    } finally {
      event.target.value = '';
    }
  }

  async function handleNativeSeeOnMePhotoPick(source, fallbackInputRef) {
    if (!canUploadMore) return;

    try {
      const imageDataUrl = await pickNativeImageDataUrl({
        source,
        maxDimension: 820,
        quality: 0.6
      });

      if (imageDataUrl) {
        addSeeOnMePhoto(imageDataUrl);
        return;
      }
    } catch (error) {
      if (isNativeImagePickerCancel(error)) return;
      setErrorMessage(t('seeOnMe.uploadFailed'));
      if (isNativeApp()) return;
    }

    fallbackInputRef.current?.click();
  }

  function handleRemoveCurrentPhoto() {
    if (!selectedPhotoId || isGenerating) return;

    const nextPhotos = appearanceProfile.photos.filter((photo) => photo.id !== selectedPhotoId);
    const nextSelectedPhoto = nextPhotos[0] || null;
    onSaveAppearance({
      ...appearanceProfile,
      photos: nextPhotos
    });
    setSelectedPhotoId(nextSelectedPhoto?.id || '');
    setSelectedPhotoDataUrl(nextSelectedPhoto?.imageUrl || '');
    setPreview(null);
    setErrorMessage('');
    setValidationWarning(null);
    setSavedLookId('');
  }

  async function handleGeneratePreview(options = {}) {
    if (isGeneratingRef.current) return;

    if (!suggestion) {
      setErrorMessage(t('seeOnMe.needOutfit'));
      return;
    }

    if (!selectedPhotoDataUrl) {
      setErrorMessage(t('seeOnMe.needPhoto'));
      return;
    }

    isGeneratingRef.current = true;
    setState('generating');
    setPreview(null);
    setErrorMessage('');
    setServiceError(null);
    setValidationWarning(null);
    setSavedLookId('');

    try {
      const result = await generateSeeOnMePreview({
        imageDataUrl: selectedPhotoDataUrl,
        outfit: suggestion,
        appearanceProfile,
        preferences,
        language,
        continueAnyway: Boolean(options.continueAnyway)
      });
      setPreview(result);
      setErrorMessage(result.cached ? t('seeOnMe.cachedPreview') : '');
      setState(result.usedFallback || result.messageKey ? 'review' : 'ready');
    } catch (error) {
      const payloadMessageKey = error.payload?.messageKey;
      if (payloadMessageKey === 'seeOnMe.validationWarning' && error.payload?.validation?.canContinue) {
        setValidationWarning({
          message: t('seeOnMe.validationWarning'),
          validation: error.payload.validation
        });
        setState('review');
        return;
      }
      const messageKey = payloadMessageKey || error.message;
      const serviceFailureKeys = [
        'seeOnMe.serviceUnavailable',
        'seeOnMe.capacityUnavailable',
        'seeOnMe.configUnavailable',
        'seeOnMe.organizationUnavailable',
        'seeOnMe.timeout',
        'seeOnMe.generationFailed',
        'seeOnMe.maintenance'
      ];

      if (serviceFailureKeys.includes(messageKey)) {
        setServiceError({
          message: t(messageKey),
          canRetry: !['seeOnMe.maintenance', 'seeOnMe.configUnavailable', 'seeOnMe.organizationUnavailable'].includes(messageKey)
        });
      } else {
        setErrorMessage(payloadMessageKey ? t(payloadMessageKey) : error.message?.startsWith('seeOnMe.') || error.message?.startsWith('messages.') || error.message?.startsWith('premium.') ? t(error.message) : t('seeOnMe.unavailable'));
      }
      setState('error');
    } finally {
      isGeneratingRef.current = false;
    }
  }

  async function handleGenerateNewOutfitFromSeeOnMe() {
    if (isGenerating) return;

    setPreview(null);
    setState('idle');
    setErrorMessage('');
    setServiceError(null);
    setValidationWarning(null);
    setSavedLookId('');
    await onGenerateNewOutfit?.();
  }

  async function handleSaveLook() {
    if (!preview?.previewImageUrl || !suggestion) return;

    setIsSaving(true);

    try {
      const savedLook = await saveSeeOnMeLook({
        previewImageUrl: await compressImageDataUrlToBudget(preview.previewImageUrl, {
          maxBytes: 520000,
          maxDimension: 900,
          minDimension: 520,
          quality: 0.66,
          minQuality: 0.42
        }),
        userPhotoImageUrl: await compressImageDataUrlToBudget(selectedPhotoDataUrl, {
          maxBytes: 180000,
          maxDimension: 520,
          minDimension: 320,
          quality: 0.58,
          minQuality: 0.38
        }),
        outfit: stripOutfitImages(suggestion),
        metadata: preview.metadata || {}
      });
      onSavedLook(savedLook);
      setSavedLookId(String(savedLook.id || Date.now()));
      setErrorMessage(t('seeOnMe.savedToProfile'));
    } catch {
      setErrorMessage(t('messages.actionFailed'));
    } finally {
      setIsSaving(false);
    }
  }

  if (!suggestion) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
        <p className="text-sm font-semibold text-slate-900">{t('seeOnMe.needOutfitTitle')}</p>
        <p className="mt-2 text-sm text-slate-500">{t('seeOnMe.needOutfit')}</p>
        <button type="button" onClick={onGenerateNewOutfit} className="mt-4 rounded-xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white">
          {t('seeOnMe.generateNewOutfit')}
        </button>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-950">{t('seeOnMe.photoTitle')}</h4>
            <p className="mt-1 text-xs text-slate-500">{t('seeOnMe.photoDescription')}</p>
          </div>
          <div className="grid shrink-0 grid-cols-2 gap-2">
            <button type="button" onClick={() => handleNativeSeeOnMePhotoPick(imageSources.photos, seeOnMeLibraryInputRef)} disabled={!canUploadMore} className={`rounded-xl px-3 py-2 text-sm font-semibold ${canUploadMore ? 'border border-slate-300 bg-white text-slate-700' : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'}`}>
              {t('seeOnMe.uploadNew')}
            </button>
            <button type="button" onClick={() => handleNativeSeeOnMePhotoPick(imageSources.camera, seeOnMeCameraInputRef)} disabled={!canUploadMore} className={`rounded-xl px-3 py-2 text-sm font-semibold ${canUploadMore ? 'border border-slate-300 bg-white text-slate-700' : 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'}`}>
              {t('buttons.takePhoto')}
            </button>
            <input ref={seeOnMeLibraryInputRef} type="file" accept="image/*" className="sr-only" disabled={!canUploadMore} onChange={handlePhotoUpload} />
            <input ref={seeOnMeCameraInputRef} type="file" accept="image/*" capture="user" className="sr-only" disabled={!canUploadMore} onChange={handlePhotoUpload} />
          </div>
        </div>

        {appearanceProfile.photos.length ? (
          <div className="grid gap-3">
            <div className="grid grid-cols-3 gap-2">
              {appearanceProfile.photos.map((photo) => (
                <PhotoChoiceCard key={photo.id} photo={photo} isSelected={selectedPhotoId === photo.id} onSelect={() => handleSelectPhoto(photo)} disabled={isGenerating} />
              ))}
            </div>
            {selectedPhotoId ? (
              <button type="button" onClick={handleRemoveCurrentPhoto} disabled={isGenerating} className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-60">
                {t('seeOnMe.removeCurrentPhoto')}
              </button>
            ) : null}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
            <p className="text-sm font-semibold text-slate-800">{t('seeOnMe.noPhotoTitle')}</p>
            <p className="mt-1 text-sm text-slate-500">{t('seeOnMe.noPhotoDescription')}</p>
          </div>
        )}
      </div>

      <SeeOnMeOutfitPreview suggestion={suggestion} />

      <button type="button" onClick={handleGenerateNewOutfitFromSeeOnMe} disabled={isGenerating} className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 shadow-sm disabled:cursor-not-allowed disabled:opacity-60">
        {t('seeOnMe.generateNewOutfit')}
      </button>

      {isGenerating ? <SeeOnMeLoadingState /> : null}

      {errorMessage ? (
        <div className={`rounded-2xl border p-3 text-sm font-semibold ${state === 'error' ? 'border-amber-200 bg-amber-50 text-amber-900' : 'border-teal-200 bg-teal-50 text-teal-900'}`}>
          {errorMessage}
        </div>
      ) : null}

      {serviceError ? (
        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm font-semibold text-slate-950">{serviceError.message}</p>
          {serviceError.canRetry ? (
            <button type="button" onClick={handleGeneratePreview} disabled={isGenerating} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:bg-slate-400">
              {t('seeOnMe.tryAgain')}
            </button>
          ) : (
            <p className="text-xs font-semibold text-slate-400">{t('seeOnMe.tryLater')}</p>
          )}
        </div>
      ) : null}

      {validationWarning ? (
        <div className="grid gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-950">{validationWarning.message}</p>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => handleGeneratePreview({ continueAnyway: true })} disabled={isGenerating} className="rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white disabled:bg-slate-400">
              {t('seeOnMe.continueAnyway')}
            </button>
            <button type="button" onClick={() => setValidationWarning(null)} disabled={isGenerating} className="rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-semibold text-amber-900 disabled:cursor-not-allowed disabled:opacity-60">
              {t('seeOnMe.chooseAnother')}
            </button>
          </div>
        </div>
      ) : null}

      {!preview && !validationWarning && !serviceError && !isGenerating ? (
        <button type="button" onClick={handleGeneratePreview} disabled={state === 'generating' || !selectedPhotoDataUrl} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:bg-slate-400">
          {state === 'generating' ? t('seeOnMe.generating') : t('seeOnMe.generate')}
        </button>
      ) : null}

      {preview ? (
        <div className="see-on-me-result grid gap-3">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-slate-950 shadow-sm">
            <img src={preview.previewImageUrl} alt={t('seeOnMe.previewAlt')} className="max-h-[560px] w-full object-contain" loading="lazy" decoding="async" />
          </div>
          <p className="text-center text-xs font-semibold uppercase tracking-wide text-slate-400">{t('seeOnMe.aiGeneratedNote')}</p>
          {preview.messageKey ? (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              {t(preview.messageKey)}
            </p>
          ) : null}
          <div className="grid gap-2">
            <button type="button" onClick={handleSaveLook} disabled={isSaving || Boolean(savedLookId)} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-900 disabled:cursor-not-allowed disabled:opacity-70">
              {isSaving ? t('buttons.adding') : savedLookId ? t('seeOnMe.savedShort') : t('seeOnMe.saveLook')}
            </button>
          </div>
          {savedLookId ? (
            <button type="button" onClick={onOpenSavedLooks} className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-900">
              {t('seeOnMe.openSavedLooks')}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AiStudioTab({ accessStatus, onAdd, isAddingClothes, clothes, appearanceProfile, preferences, onSaveAppearance, activeTool, onActiveToolChange, suggestion, onGenerateNewOutfit, onSavedLook, onOpenSavedLooks, onAnalysisComplete }) {
  const { t } = useI18n();
  const locked = !accessStatus.hasFullAccess;
  const mirrorTools = [
    { id: 'review', labelKey: 'mirror.review' },
    { id: 'see-on-me', labelKey: 'mirror.seeOnMe', premium: true }
  ];

  return (
    <div className="mirror-shell">
      <div className="mirror-header">
        <p className="aura-kicker">{t('mirror.kicker')}</p>
        <h2>{t('mirror.title')}</h2>
      </div>
      <div className="mirror-segments" role="tablist" aria-label={t('mirror.title')}>
        {mirrorTools.map((tool) => (
          <button
            key={tool.id}
            type="button"
            onClick={() => onActiveToolChange(tool.id)}
            className={activeTool === tool.id ? 'is-active' : ''}
            role="tab"
            aria-selected={activeTool === tool.id}
          >
            {t(tool.labelKey)}
            {tool.premium ? <SparklesIcon aria-hidden="true" /> : null}
          </button>
        ))}
      </div>
      <ScrollPanel className="mirror-content">
        <div className="mirror-tool-panel">
          {activeTool === 'review' ? (
            <section className="mirror-review">
              <div className="mirror-capture-intro">
                <div className="mirror-capture-frame">
                  <img src={stylistHero} alt={t('mirror.photoAlt')} />
                  <span className="mirror-corner mirror-corner-tl" />
                  <span className="mirror-corner mirror-corner-tr" />
                  <span className="mirror-corner mirror-corner-bl" />
                  <span className="mirror-corner mirror-corner-br" />
                  <p>{t('mirror.photoHint')}</p>
                </div>
                <div className="mirror-steps" aria-label={t('mirror.stepsLabel')}>
                  <span className="is-active">{t('mirror.steps.upload')}</span>
                  <span>{t('mirror.steps.review')}</span>
                  <span>{t('mirror.steps.improve')}</span>
                </div>
              </div>
              <OutfitPhotoAnalysis clothes={clothes} accessStatus={accessStatus} appearanceProfile={appearanceProfile} preferences={preferences} onAnalysisComplete={onAnalysisComplete} />
            </section>
          ) : null}
          {activeTool === 'see-on-me' ? (
            <section className="mirror-see-on-me">
              <div className="mirror-tool-heading">
                <div>
                  <p className="aura-kicker">{t('mirror.flagship')}</p>
                  <h3>{t('studio.seeOnMeTitle')}</h3>
                  <p>{t('studio.seeOnMeDescription')}</p>
                </div>
                <SparklesIcon aria-hidden="true" />
              </div>
              {locked ? <LockedFeature /> : (
              <SeeOnMePanel
                accessStatus={accessStatus}
                suggestion={suggestion}
                appearanceProfile={appearanceProfile}
                preferences={preferences}
                onSaveAppearance={onSaveAppearance}
                onGenerateNewOutfit={onGenerateNewOutfit}
                onSavedLook={onSavedLook}
                onOpenSavedLooks={onOpenSavedLooks}
              />
              )}
            </section>
          ) : null}
        </div>
      </ScrollPanel>
    </div>
  );
}

function LikedOutfitCard({ outfit }) {
  const { t, optionLabel } = useI18n();
  const items = [
    [t('outfit.labels.top'), outfit.top],
    [t('outfit.labels.bottom'), outfit.bottom],
    [t('outfit.labels.shoes'), outfit.shoes]
  ];

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid gap-2">
        {items.map(([label, item]) => (
          <div key={label} className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-slate-500">{label}</span>
            <span className="text-right font-semibold capitalize text-slate-900">{optionLabel('colors', item.color)} {optionLabel('types', item.type)}</span>
          </div>
        ))}
      </div>
    </article>
  );
}

function SavedLookPreviewCard({ look, onSelect }) {
  const { t } = useI18n();

  return (
    <button type="button" onClick={() => onSelect?.(look)} className="overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition active:scale-[0.99]">
      <img src={look.previewImageUrl} alt={t('seeOnMe.previewAlt')} className="h-56 w-full object-cover" loading="lazy" decoding="async" />
      <div className="p-3">
        <p className="text-sm font-semibold text-slate-950">{t('profile.savedSeeOnMeTitle')}</p>
        <p className="mt-1 text-xs text-slate-500">{look.createdAt ? new Date(look.createdAt).toLocaleDateString() : ''}</p>
      </div>
    </button>
  );
}

function SavedLooksSection({ likedOutfits, isLoadingLikedOutfits, outfitHistory, savedLooks, isLoadingSavedLooks }) {
  const { t } = useI18n();
  const [selectedLook, setSelectedLook] = useState(null);

  return (
    <SoftCard>
      <h3 className="text-base font-semibold text-slate-950">{t('profile.savedLooksTitle')}</h3>
      {selectedLook ? (
        <div className="mt-3 grid gap-3 rounded-2xl border border-teal-100 bg-teal-50 p-3">
          <img src={selectedLook.previewImageUrl} alt={t('seeOnMe.previewAlt')} className="max-h-[520px] w-full rounded-2xl bg-slate-950 object-contain" loading="lazy" decoding="async" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-teal-950">{t('profile.savedSeeOnMeTitle')}</p>
            <button type="button" onClick={() => setSelectedLook(null)} className="rounded-xl border border-teal-200 bg-white px-3 py-2 text-xs font-semibold text-teal-900">
              {t('buttons.back')}
            </button>
          </div>
        </div>
      ) : null}
      {isLoadingLikedOutfits || isLoadingSavedLooks ? (
        <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{t('likedOutfits.loading')}</p>
      ) : savedLooks.length ? (
        <div className="mt-3 grid max-h-96 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {savedLooks.map((look) => <SavedLookPreviewCard key={look.id} look={look} onSelect={setSelectedLook} />)}
        </div>
      ) : likedOutfits.length ? (
        <div className="mt-3 grid max-h-72 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
          {likedOutfits.slice(0, 6).map((outfit) => <LikedOutfitCard key={outfit.id} outfit={outfit} />)}
        </div>
      ) : outfitHistory.length ? (
        <div className="mt-3 grid max-h-72 gap-3 overflow-y-auto pr-1">
          {outfitHistory.slice(0, 4).map((item) => <OutfitResultCard key={item.historyId} suggestion={item} isFeedbackLoading={false} hasEnoughWardrobe />)}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">{t('profile.savedLooksEmpty')}</p>
      )}
    </SoftCard>
  );
}

function DiagnosticsCard() {
  const { t } = useI18n();
  const pickerDebug = getNativeImagePickerDebug();
  const seeOnMeDebug = getSeeOnMeDebug();
  const apiBaseUrl = getApiBaseUrl() || '(relative)';
  const values = [
    ['Environment', import.meta.env.MODE || 'unknown'],
    ['Native', isNativeApp() ? 'yes' : 'no'],
    ['Capacitor', window.Capacitor?.getPlatform?.() || 'missing'],
    ['API', apiBaseUrl],
    ['Build', import.meta.env.VITE_APP_BUILD || import.meta.env.VITE_APP_VERSION || 'local'],
    ['Picker', pickerDebug ? `${pickerDebug.source || '-'} / ${pickerDebug.status || '-'}` : '-'],
    ['Picker time', pickerDebug?.createdAt || '-'],
    ['Picker message', pickerDebug?.message || '-'],
    ['See On Me', seeOnMeDebug ? `${seeOnMeDebug.status || '-'} / ${seeOnMeDebug.messageKey || seeOnMeDebug.message || '-'}` : '-'],
    ['See status', seeOnMeDebug?.httpStatus || '-'],
    ['See code', seeOnMeDebug?.safeCode || seeOnMeDebug?.category || '-'],
    ['See body bytes', seeOnMeDebug?.requestBodyBytes || '-'],
    ['See image bytes', seeOnMeDebug?.imageBytes || '-']
  ];

  return (
    <section className="profile-diagnostics">
      <h4>{t('profile2.diagnostics')}</h4>
      <dl>
        {values.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function LegacyProfileTab({ preferences, accessStatus, appearanceProfile, paymentPlatform, isPaymentLoading, paywallRequestId, likedOutfits, isLoadingLikedOutfits, savedLooks, isLoadingSavedLooks, outfitHistory, onStartPremium, onRestorePurchases, onCancelPremiumFlow, onSavePreferences, onSaveAppearance, onResetPremiumState }) {
  const { t } = useI18n();
  const [showPaywall, setShowPaywall] = useState(false);
  const profileWithStyleGoal = { ...appearanceProfile, styleGoal: preferences.styleGoal };

  useEffect(() => {
    if (paywallRequestId > 0) {
      setShowPaywall(true);
    }
  }, [paywallRequestId]);

  useEffect(() => {
    if (accessStatus.isPremium && !isPaymentLoading) {
      setShowPaywall(false);
    }
  }, [accessStatus.isPremium, isPaymentLoading]);

  function handleSaveAppearanceAndPreferences(nextProfile) {
    const { styleGoal, ...nextAppearanceProfile } = nextProfile;
    onSaveAppearance(nextAppearanceProfile);
    onSavePreferences({
      ...preferences,
      styleGoal: styleGoal || preferences.styleGoal
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <PageHeader title={t('profile.title')} description={t('profile.description')} />
      <ScrollPanel className="pb-2">
        <div className="grid gap-3 pb-2">
          {showPaywall && !accessStatus.isPremium ? (
            <PaywallScreen
              accessStatus={accessStatus}
              paymentPlatform={paymentPlatform}
              isPaymentLoading={isPaymentLoading}
              onStartPremium={onStartPremium}
              onRestorePurchases={onRestorePurchases}
              onCancelPayment={onCancelPremiumFlow}
              onMaybeLater={() => {
                onCancelPremiumFlow();
                setShowPaywall(false);
              }}
            />
          ) : null}
          <PreferencesPanel
            preferences={preferences}
            accessStatus={accessStatus}
            onOpenPaywall={() => setShowPaywall(true)}
            onResetPremiumState={onResetPremiumState}
            onSave={onSavePreferences}
          />
          <AppearanceProfile profile={profileWithStyleGoal} accessStatus={accessStatus} onSave={handleSaveAppearanceAndPreferences} showPhotoTools={false} />
          <SavedLooksSection likedOutfits={likedOutfits} isLoadingLikedOutfits={isLoadingLikedOutfits} savedLooks={savedLooks} isLoadingSavedLooks={isLoadingSavedLooks} outfitHistory={outfitHistory} />
        </div>
      </ScrollPanel>
    </div>
  );
}

function ProfileTab({ preferences, accessStatus, appearanceProfile, paymentPlatform, isPaymentLoading, paywallRequestId, requestedSection, likedOutfits, isLoadingLikedOutfits, savedLooks, isLoadingSavedLooks, outfitHistory, onStartPremium, onRestorePurchases, onCancelPremiumFlow, onSavePreferences, onSaveAppearance, onResetPremiumState }) {
  const { t } = useI18n();
  const [activeSection, setActiveSection] = useState('');
  const [showPaywall, setShowPaywall] = useState(false);
  const profileWithStyleGoal = { ...appearanceProfile, styleGoal: preferences.styleGoal };

  useEffect(() => {
    if (paywallRequestId > 0) {
      setActiveSection('subscription');
      setShowPaywall(true);
    }
  }, [paywallRequestId]);

  useEffect(() => {
    if (accessStatus.isPremium && !isPaymentLoading) setShowPaywall(false);
  }, [accessStatus.isPremium, isPaymentLoading]);

  useEffect(() => {
    if (requestedSection?.section) {
      setActiveSection(requestedSection.section);
      setShowPaywall(false);
    }
  }, [requestedSection]);

  function handleSaveAppearanceAndPreferences(nextProfile) {
    const { styleGoal, ...nextAppearanceProfile } = nextProfile;
    onSaveAppearance(nextAppearanceProfile);
    onSavePreferences({ ...preferences, styleGoal: styleGoal || preferences.styleGoal });
  }

  const rows = [
    { id: 'appearance', label: t('profile2.appearance'), value: t('profile2.appearanceValue'), Icon: UserCircleIcon },
    { id: 'saved', label: t('profile2.savedLooks'), value: savedLooks.length ? String(savedLooks.length) : '', Icon: HeartIcon },
    { id: 'language', label: t('profile2.language'), value: t('profile2.languageValue'), Icon: LanguageIcon },
    { id: 'subscription', label: t('profile2.subscription'), value: accessStatus.isPremium ? t(accessStatus.subscriptionLabelKey) : t('premium.statusFree'), Icon: CreditCardIcon },
    { id: 'privacy', label: t('profile2.privacy'), value: '', Icon: ShieldCheckIcon },
    { id: 'help', label: t('profile2.help'), value: '', Icon: QuestionMarkCircleIcon }
  ];
  const isDetailMode = Boolean(activeSection || showPaywall);
  const activeRow = rows.find((row) => row.id === activeSection) || rows.find((row) => row.id === 'subscription');

  function openSection(id) {
    setActiveSection(id);
    setShowPaywall(id === 'subscription' && !accessStatus.isPremium);
  }

  function closeSection() {
    onCancelPremiumFlow();
    setShowPaywall(false);
    setActiveSection('');
  }

  return (
    <ScrollPanel className="profile-shell">
      <div className="profile-title">
        <p className="aura-kicker">{t('profile2.kicker')}</p>
        <h2>{t('profile.title')}</h2>
      </div>

      {!isDetailMode ? (
        <section className="profile-identity">
          <div className="profile-avatar"><UserCircleIcon aria-hidden="true" /></div>
          <div>
            <h3>{t('profile2.localProfile')}</h3>
            <p>{t('profile2.privateProfile')}</p>
          </div>
          <span className={accessStatus.isPremium ? 'is-premium' : ''}>
            {accessStatus.isPremium ? t(accessStatus.subscriptionLabelKey) : t('premium.statusFree')}
          </span>
        </section>
      ) : (
        <div className="profile-detail-controls">
          <nav className="profile-detail-nav" aria-label={t('profile.title')}>
            {rows.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                className={activeSection === id ? 'is-active' : ''}
                aria-label={label}
                aria-current={activeSection === id ? 'page' : undefined}
                title={label}
                onClick={() => openSection(id)}
              >
                <Icon aria-hidden="true" />
              </button>
            ))}
          </nav>
          <div className="profile-detail-heading">
            <h3>{activeRow?.label}</h3>
            <button type="button" onClick={closeSection} aria-label={t('buttons.back')} title={t('buttons.back')}>
              <XMarkIcon aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {showPaywall && !accessStatus.isPremium ? (
        <PaywallScreen
          accessStatus={accessStatus}
          paymentPlatform={paymentPlatform}
          isPaymentLoading={isPaymentLoading}
          onStartPremium={onStartPremium}
          onRestorePurchases={onRestorePurchases}
          onCancelPayment={onCancelPremiumFlow}
          onMaybeLater={closeSection}
        />
      ) : null}

      {!isDetailMode ? (
        <section className="profile-list">
          {rows.map(({ id, label, value, Icon }) => (
            <button key={id} type="button" onClick={() => openSection(id)}>
              <Icon aria-hidden="true" />
              <span><strong>{label}</strong>{value ? <small>{value}</small> : null}</span>
              <ChevronRightIcon aria-hidden="true" />
            </button>
          ))}
        </section>
      ) : null}

      {activeSection === 'appearance' ? (
        <AppearanceProfile profile={profileWithStyleGoal} accessStatus={accessStatus} onSave={handleSaveAppearanceAndPreferences} showPhotoTools={false} />
      ) : null}
      {activeSection === 'saved' ? (
        <SavedLooksSection likedOutfits={likedOutfits} isLoadingLikedOutfits={isLoadingLikedOutfits} savedLooks={savedLooks} isLoadingSavedLooks={isLoadingSavedLooks} outfitHistory={outfitHistory} />
      ) : null}
      {activeSection === 'language' ? (
        <PreferencesPanel preferences={preferences} accessStatus={accessStatus} onOpenPaywall={() => setShowPaywall(true)} onResetPremiumState={onResetPremiumState} onSave={onSavePreferences} />
      ) : null}
      {activeSection === 'subscription' && accessStatus.isPremium ? (
        <section className="profile-detail-card">
          <CreditCardIcon aria-hidden="true" />
          <div><strong>{t(accessStatus.subscriptionLabelKey)}</strong><p>{t('profile2.manageInAppStore')}</p></div>
        </section>
      ) : null}
      {activeSection === 'privacy' ? <section className="profile-detail-card"><ShieldCheckIcon aria-hidden="true" /><div><strong>{t('profile2.privacy')}</strong><p>{t('profile2.privacyDescription')}</p></div></section> : null}
      {activeSection === 'help' ? (
        <div className="grid gap-3">
          <section className="profile-detail-card"><QuestionMarkCircleIcon aria-hidden="true" /><div><strong>{t('profile2.help')}</strong><p>{t('profile2.helpDescription')}</p></div></section>
          <DiagnosticsCard />
        </div>
      ) : null}

      <p className="profile-version">{t('profile2.version')}</p>
    </ScrollPanel>
  );
}

export default function App() {
  const { t } = useI18n();
  useStableMobileViewport();
  const [clothes, setClothes] = useState([]);
  const [suggestion, setSuggestion] = useState(null);
  const [occasion, setOccasion] = useState('daily');
  const [season, setSeason] = useState('all');
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState('info');
  const [isLoadingClothes, setIsLoadingClothes] = useState(true);
  const [isLoadingLikedOutfits, setIsLoadingLikedOutfits] = useState(true);
  const [isLoadingSavedLooks, setIsLoadingSavedLooks] = useState(true);
  const [isAddingClothes, setIsAddingClothes] = useState(false);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [isCheckingPaymentReturn, setIsCheckingPaymentReturn] = useState(false);
  const [paymentPlatform] = useState(() => detectPaymentPlatform());
  const [userId] = useState(() => getLocalUserId());
  const [, setIsPremium] = useState(() => getIsPremium());
  const [accessStatus, setAccessStatus] = useState(() => getAccessStatus());
  const [dailySuggestionUsage, setDailySuggestionUsage] = useState(() => getDailySuggestionUsage());
  const [preferences, setPreferences] = useState(() => getPreferences());
  const [appearanceProfile, setAppearanceProfile] = useState(() => getAppearanceProfile());
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState(() => getOnboardingCompleted());
  const [activePage, setActivePage] = useState('home');
  const [activeStudioTool, setActiveStudioTool] = useState('review');
  const [profileSectionRequest, setProfileSectionRequest] = useState(null);
  const [paywallRequestId, setPaywallRequestId] = useState(0);
  const [likedOutfits, setLikedOutfits] = useState([]);
  const [savedLooks, setSavedLooks] = useState([]);
  const [outfitHistory, setOutfitHistory] = useState([]);
  const [reviewHistory, setReviewHistory] = useState([]);
  const paymentRequestRef = useRef(0);
  const suggestionPreferences = {
    ...preferences,
    gender: appearanceProfile.gender,
    bodyType: appearanceProfile.bodyType,
    height: appearanceProfile.height,
    skinTone: appearanceProfile.skinTone
  };
  const isPaymentResultPage = window.location.pathname === '/payment-success';
  const paymentReturnStatus = new URLSearchParams(window.location.search).get('payment');

  async function syncPremiumFromBackend() {
    const paymentStatus = await getPaymentStatus();

    if (paymentStatus.isPremium) {
      setIsPremium(saveIsPremium(true, paymentStatus.premiumPlan || defaultPremiumPlanId));
      setAccessStatus(getAccessStatus());
    }

    return paymentStatus;
  }

  async function loadClothes() {
    setIsLoadingClothes(true);

    try {
      setClothes(await getClothes());
    } catch {
      setMessageTone('error');
      setMessage('messages.actionFailed');
    } finally {
      setIsLoadingClothes(false);
    }
  }

  async function loadLikedOutfits() {
    setIsLoadingLikedOutfits(true);

    try {
      setLikedOutfits(await getLikedOutfits());
    } catch {
      setMessageTone('error');
      setMessage('messages.actionFailed');
    } finally {
      setIsLoadingLikedOutfits(false);
    }
  }

  async function loadSavedLooks() {
    setIsLoadingSavedLooks(true);

    try {
      setSavedLooks(await getSavedSeeOnMeLooks());
    } catch {
      setMessageTone('error');
      setMessage('messages.actionFailed');
    } finally {
      setIsLoadingSavedLooks(false);
    }
  }

  function rememberOutfit(outfit) {
    setOutfitHistory((current) => [{ ...outfit, historyId: `${Date.now()}-${Math.random().toString(36).slice(2)}` }, ...current].slice(0, 8));
  }

  async function handleAdd(payload) {
    setMessage('');
    setIsAddingClothes(true);

    try {
      const payloads = Array.isArray(payload) ? payload : [payload];
      const items = [];

      for (const clothingPayload of payloads) {
        items.push(await addClothing(clothingPayload));
      }

      setClothes((current) => [...items.reverse(), ...current]);
      setMessageTone('success');
      setMessage(payloads.length > 1 ? 'messages.itemsAdded' : 'messages.itemAdded');
    } catch (error) {
      setMessageTone('error');
      setMessage('messages.actionFailed');
      throw error;
    } finally {
      setIsAddingClothes(false);
    }
  }

  async function handleSuggest() {
    const currentUsage = getDailySuggestionUsage();
    setDailySuggestionUsage(currentUsage);

    if (!accessStatus.canUseUnlimitedOutfits && currentUsage.count >= freeDailySuggestionLimit) {
      setMessageTone('error');
      setMessage('messages.dailyLimitReachedTitle');
      return;
    }

    setMessage('');
    setMessageTone('info');
    setIsSuggesting(true);
    setSuggestion(null);
    addMonitoringBreadcrumb('outfit', 'suggest:start', {
      occasion,
      season,
      accessTier: accessStatus.tier
    });

    try {
      const recentOutfits = outfitHistory.slice(0, 8).map(getOutfitSignature).filter(Boolean);
      const data = await getSuggestion(season, occasion, suggestionPreferences, recentOutfits);
      if (recentOutfits.includes(getOutfitSignature(data))) {
        setMessageTone('info');
        setMessage('messages.moreClothesForVariety');
      }
      setSuggestion(data);
      rememberOutfit(data);
      if (!accessStatus.canUseUnlimitedOutfits) {
        setDailySuggestionUsage(incrementDailySuggestionUsage());
      }
    } catch (error) {
      captureAppError(error, {
        area: 'outfit-suggestion',
        occasion,
        season,
        accessTier: accessStatus.tier
      });
      setSuggestion(null);
      setMessageTone('error');
      setMessage(error.message.startsWith('messages.') ? error.message : 'messages.suggestionUnavailable');
    } finally {
      setIsSuggesting(false);
    }
  }

  function handleSelectOutfitFromHistory(outfit, options = {}) {
    setMessage('');
    setMessageTone('info');
    setSuggestion(outfit);
    if (options.openSeeOnMe) {
      if (accessStatus.hasFullAccess) {
        setActiveStudioTool('see-on-me');
        setActivePage('studio');
      } else {
        openPaywall();
        setMessage('premium.availableInPremium');
      }
    }
  }

  function handleOutfitAnalysisComplete(analysis) {
    setReviewHistory((current) => [{ ...analysis, id: `${Date.now()}-${Math.random().toString(36).slice(2)}` }, ...current].slice(0, 6));
  }

  function handleSelectReviewFromHistory() {
    setActiveStudioTool('review');
    setActivePage('studio');
  }

  useEffect(() => {
    loadClothes();
    loadLikedOutfits();
    loadSavedLooks();
  }, []);

  useEffect(() => {
    async function syncPaymentState() {
      try {
        await syncPremiumFromBackend();
      } catch {
        // Payment status is helpful but should not block the local app.
      }
    }

    syncPaymentState();
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');

    if (!payment) return;

    async function handlePaymentReturn() {
      setIsCheckingPaymentReturn(true);
      if (payment === 'success') {
        try {
          const paymentStatus = await syncPremiumFromBackend();
          setMessageTone(paymentStatus.isPremium ? 'success' : 'error');
          setMessage(paymentStatus.isPremium ? 'messages.paymentSuccess' : 'messages.paymentPending');
        } catch {
          setMessageTone('error');
          setMessage('messages.paymentPending');
        }
      } else {
        setMessageTone('error');
        setMessage('messages.paymentFailed');
      }

      setIsCheckingPaymentReturn(false);
      if (!isPaymentResultPage) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    }

    handlePaymentReturn();
  }, []);

  useEffect(() => {
    document.title = t('app.name');
  }, [t]);

  useEffect(() => {
    addMonitoringBreadcrumb('navigation', 'tab-change', { activePage });
  }, [activePage]);

  useEffect(() => {
    if (!message) return undefined;

    const timeout = window.setTimeout(() => setMessage(''), messageTone === 'error' ? 6000 : 3500);
    return () => window.clearTimeout(timeout);
  }, [message, messageTone]);

  useEffect(() => {
    if (!isPaymentLoading) return undefined;

    const requestId = paymentRequestRef.current;
    const timeout = window.setTimeout(() => {
      if (!isCurrentPaymentRequest(paymentRequestRef.current, requestId)) {
        return;
      }

      paymentRequestRef.current += 1;
      setIsPaymentLoading(false);
      setMessageTone('error');
      setMessage('messages.applePurchaseTimeout');
    }, 25000);

    return () => window.clearTimeout(timeout);
  }, [isPaymentLoading]);

  function handleSavePreferences(nextPreferences) {
    setPreferences(savePreferences(nextPreferences));
    setMessageTone('success');
    setMessage('messages.preferencesSaved');
  }

  function handleSaveAppearanceProfile(nextProfile) {
    setAppearanceProfile(saveAppearanceProfile(nextProfile));
    setMessageTone('success');
    setMessage('messages.appearanceSaved');
  }

  async function handleResetPremiumState() {
    if (!canUsePaymentTestHelpers()) {
      return;
    }

    try {
      await resetPaymentStatus();
    } catch (error) {
      captureAppError(error, {
        area: 'payment-reset-test-helper',
        status: error.status
      });
    } finally {
      setIsPremium(saveIsPremium(false));
      setAccessStatus(getAccessStatus());
      setMessageTone('success');
      setMessage('messages.accessReset');
    }
  }

  function handleSavedLook(savedLook) {
    setSavedLooks((current) => [savedLook, ...current].slice(0, 24));
    setMessageTone('success');
    setMessage('seeOnMe.saved');
  }

  function openSavedLooks() {
    setProfileSectionRequest({ section: 'saved', requestedAt: Date.now() });
    setActivePage('profile');
  }

  function openPaywall() {
    setActivePage('profile');
    setPaywallRequestId((current) => current + 1);
  }

  function handleCompleteOnboarding(nextPreferences, nextAppearanceProfile) {
    setPreferences(savePreferences(nextPreferences));
    setAppearanceProfile(saveAppearanceProfile(nextAppearanceProfile));
    setIsOnboardingCompleted(setOnboardingCompleted());
    setMessageTone('success');
    setMessage('messages.preferencesSaved');
  }

  function handleSkipOnboarding() {
    setIsOnboardingCompleted(setOnboardingCompleted());
  }

  async function handleStartPremium(planId = defaultPremiumPlanId) {
    const requestId = paymentRequestRef.current + 1;
    paymentRequestRef.current = requestId;
    const selectedPlan = getPlanById(planId);
    setIsPaymentLoading(true);
    setMessageTone('info');
    setMessage('messages.applePurchaseStarting');
    addMonitoringBreadcrumb('payment', 'premium-click', { platform: paymentPlatform, planId: selectedPlan.id });

    try {
      if (!canUseAppleSubscriptions()) {
        throw new Error('messages.subscriptionsIosOnly');
      }

      const purchase = await withPaymentTimeout(() => purchaseAppleSubscription(selectedPlan.id));
      if (!isCurrentPaymentRequest(paymentRequestRef.current, requestId)) return;
      await activateApplePremiumFromTransaction(purchase, selectedPlan.id, 'messages.paymentSuccess');
    } catch (error) {
      if (!isCurrentPaymentRequest(paymentRequestRef.current, requestId)) return;

      if (!isApplePurchaseCancelled(error)) {
        try {
          setMessageTone('info');
          setMessage(isAppleAlreadyPurchased(error) ? 'messages.appleAlreadyPurchasedChecking' : 'messages.applePurchaseVerifying');
          const restored = await withPaymentTimeout(() => getActiveAppleSubscription(isAppleAlreadyPurchased(error) ? 'already-purchased' : 'purchase-recovery'), 20000);
          if (!isCurrentPaymentRequest(paymentRequestRef.current, requestId)) return;
          await activateApplePremiumFromTransaction(
            restored,
            selectedPlan.id,
            isAppleAlreadyPurchased(error) ? 'messages.appleAlreadyPurchasedRestored' : 'messages.applePurchaseRecovered'
          );
          return;
        } catch (restoreError) {
          captureAppError(restoreError, {
            area: 'premium-purchase-recovery-restore',
            platform: paymentPlatform,
            planId: selectedPlan.id
          });
        }
      }

      captureAppError(error, {
        area: 'premium-flow',
        platform: paymentPlatform
      });
      setMessageTone('error');
      setMessage(isApplePurchaseCancelled(error) ? 'messages.applePurchaseCancelled' : error.message?.startsWith('messages.') ? error.message : 'messages.applePurchaseFailed');
    } finally {
      if (isCurrentPaymentRequest(paymentRequestRef.current, requestId)) {
        setIsPaymentLoading(false);
      }
    }
  }

  async function handleRestorePurchases() {
    const requestId = paymentRequestRef.current + 1;
    paymentRequestRef.current = requestId;
    setIsPaymentLoading(true);
    setMessageTone('info');
    setMessage('messages.appleRestoreStarting');
    addMonitoringBreadcrumb('payment', 'apple-restore-click', { platform: paymentPlatform });

    try {
      if (!canUseAppleSubscriptions()) {
        throw new Error('messages.subscriptionsIosOnly');
      }

      const restored = await withPaymentTimeout(() => restoreAppleSubscriptions());
      if (!isCurrentPaymentRequest(paymentRequestRef.current, requestId)) return;
      await activateApplePremiumFromTransaction(restored, defaultPremiumPlanId, 'messages.appleRestoreSuccess');
    } catch (error) {
      if (!isCurrentPaymentRequest(paymentRequestRef.current, requestId)) return;

      if (!isApplePurchaseCancelled(error)) {
        captureAppError(error, {
          area: 'premium-restore',
          platform: paymentPlatform
        });
      }
      setMessageTone('error');
      setMessage(
        isApplePurchaseCancelled(error)
          ? 'messages.appleRestoreCancelled'
          : error.message?.startsWith('messages.')
            ? error.message
            : 'messages.appleRestoreFailed'
      );
    } finally {
      if (isCurrentPaymentRequest(paymentRequestRef.current, requestId)) {
        setIsPaymentLoading(false);
      }
    }
  }

  function handleCancelPremiumFlow() {
    paymentRequestRef.current += 1;
    setIsPaymentLoading(false);
    setMessage('');
  }

  async function activateApplePremiumFromTransaction(purchaseResult, fallbackPlanId, successMessageKey) {
    const transaction = purchaseResult?.transaction || {};
    const planId = purchaseResult?.planId || fallbackPlanId || defaultPremiumPlanId;
    const isXcodeStoreKitTransaction = isXcodeStoreKitEnvironment(transaction.environment);

    if (canUsePaymentTestHelpers()) {
      console.info('[apple-iap] activating premium from transaction', {
        fallbackPlanId,
        resolvedPlanId: planId,
        transactionId: transaction.transactionId,
        productIdentifier: transaction.productIdentifier,
        environment: transaction.environment,
        hasReceipt: Boolean(transaction.receipt),
        hasJwsRepresentation: Boolean(transaction.jwsRepresentation)
      });
    }

    if (isXcodeStoreKitTransaction) {
      const localPaymentStatus = {
        isPremium: true,
        premiumPlan: planId,
        premiumSource: 'iap-xcode-local',
        platform: 'ios'
      };

      setIsPremium(saveIsPremium(true, planId));
      setAccessStatus(getAccessStatus());
      setMessageTone('success');
      setMessage(successMessageKey);

      verifyApplePurchase({
        receipt: transaction.receipt,
        jwsRepresentation: transaction.jwsRepresentation,
        transactionId: transaction.transactionId,
        productIdentifier: transaction.productIdentifier,
        environment: transaction.environment,
        planId
      }).catch((error) => {
        if (canUsePaymentTestHelpers()) {
          console.error('[apple-iap] background backend activation failed', {
            message: error.message,
            status: error.status,
            requestUrl: error.requestUrl,
            payload: error.payload,
            responseBody: error.responseBody,
            planId,
            transactionId: transaction.transactionId,
            productIdentifier: transaction.productIdentifier,
            environment: transaction.environment
          });
        }
      });

      return localPaymentStatus;
    }

    let paymentStatus;

    try {
      setMessageTone('info');
      setMessage('messages.applePurchaseVerifying');
      paymentStatus = await withPaymentTimeout(() => verifyApplePurchase({
        receipt: transaction.receipt,
        jwsRepresentation: transaction.jwsRepresentation,
        transactionId: transaction.transactionId,
        productIdentifier: transaction.productIdentifier,
        environment: transaction.environment,
        planId
      }), 12000, 'messages.applePurchaseVerifyingTimeout');
    } catch (error) {
      if (canUsePaymentTestHelpers()) {
        console.error('[apple-iap] backend activation failed', {
          message: error.message,
          status: error.status,
          requestUrl: error.requestUrl,
          payload: error.payload,
          responseBody: error.responseBody,
          isXcodeStoreKitTransaction,
          planId,
          transactionId: transaction.transactionId,
          productIdentifier: transaction.productIdentifier,
          environment: transaction.environment
        });
      }

      throw error;
    }

    setIsPremium(saveIsPremium(Boolean(paymentStatus.isPremium), paymentStatus.premiumPlan || planId));
    setAccessStatus(getAccessStatus());
    setMessageTone('success');
    setMessage(successMessageKey);

    return paymentStatus;
  }

  function handleContinueAfterPayment() {
    window.history.replaceState({}, '', '/');
    setActivePage('home');
  }

  function handleSeeOnMe() {
    if (accessStatus.hasFullAccess) {
      setActiveStudioTool('see-on-me');
      setActivePage('studio');
      return;
    }

    openPaywall();
    setMessageTone('info');
    setMessage('premium.availableInPremium');
  }

  async function handleOutfitFeedback(rating) {
    if (!suggestion) return;

    setIsSavingFeedback(true);

    try {
      await addOutfitFeedback(suggestion, rating);
      setSuggestion((current) => (current ? { ...current, feedbackCount: (current.feedbackCount || 0) + 1 } : current));
      if (rating === 'like') {
        await loadLikedOutfits();
      }
      setMessageTone('success');
      setMessage(rating === 'like' ? 'messages.outfitLiked' : 'messages.outfitDisliked');
    } catch {
      setMessageTone('error');
      setMessage('messages.actionFailed');
    } finally {
      setIsSavingFeedback(false);
    }
  }

  const messageClasses = {
    error: 'border-rose-200 bg-rose-50 text-rose-800',
    success: 'border-teal-200 bg-teal-50 text-teal-900',
    info: 'border-amber-200 bg-amber-50 text-amber-800'
  };
  const isDailyLimitMessage = message === 'messages.dailyLimitReachedTitle';
  const hasEnoughWardrobe = hasEnoughWardrobeForOutfit(clothes);

  if (isPaymentResultPage) {
    return (
      <PaymentResultPage
        status={paymentReturnStatus === 'success' ? 'success' : 'failure'}
        isLoading={isCheckingPaymentReturn}
        onContinue={handleContinueAfterPayment}
      />
    );
  }

  if (!isOnboardingCompleted) {
    return (
      <OnboardingScreen
        preferences={preferences}
        appearanceProfile={appearanceProfile}
        onComplete={handleCompleteOnboarding}
        onSkip={handleSkipOnboarding}
      />
    );
  }

  return (
    <main className="app-shell aura-app">
      <div className="app-frame mx-auto flex h-full flex-col">
        <header className="safe-header aura-app-header">
          <div className="aura-wordmark">
            <span className="aura-wordmark-mark">OM</span>
            <div>
              <p>{t('app.name')}</p>
              <small>{t('app.eyebrow')}</small>
            </div>
          </div>
            <button type="button" onClick={accessStatus.hasFullAccess ? () => setActivePage('profile') : openPaywall} className={`aura-plan-pill ${accessStatus.hasFullAccess ? 'is-premium' : ''}`}>
              {accessStatus.isPremium
                ? t(accessStatus.subscriptionLabelKey)
                : accessStatus.isTrialActive
                  ? t('premium.trialStatus', { days: accessStatus.trialDaysLeft })
                  : t('premium.statusFree')}
            </button>
        </header>

        <div className="app-content aura-content">
          <div className={activePage === 'home' ? 'contents' : 'hidden'} aria-hidden={activePage !== 'home'}>
            <HomeTab
              outfitHistory={outfitHistory}
              reviewHistory={reviewHistory}
              suggestion={suggestion}
              accessStatus={accessStatus}
              onOpenPaywall={openPaywall}
              onSuggest={handleSuggest}
              onSeeOnMe={handleSeeOnMe}
              onSelectOutfit={handleSelectOutfitFromHistory}
              onSelectReview={handleSelectReviewFromHistory}
              onFeedback={handleOutfitFeedback}
              isFeedbackLoading={isSavingFeedback}
              isSuggesting={isSuggesting}
              hasEnoughWardrobe={hasEnoughWardrobe}
              onAddClothes={() => setActivePage('wardrobe')}
              onAnalyze={() => {
                setActiveStudioTool('review');
                setActivePage('studio');
              }}
            />
          </div>
          <div className={activePage === 'wardrobe' ? 'contents' : 'hidden'} aria-hidden={activePage !== 'wardrobe'}>
            <WardrobeTab
              clothes={clothes}
              isLoading={isLoadingClothes}
              onAdd={handleAdd}
              isAddingClothes={isAddingClothes}
              accessStatus={accessStatus}
              preferences={preferences}
              appearanceProfile={appearanceProfile}
              outfitHistory={outfitHistory}
            />
          </div>
          <div className={activePage === 'studio' ? 'contents' : 'hidden'} aria-hidden={activePage !== 'studio'}>
            <AiStudioTab
              accessStatus={accessStatus}
              onAdd={handleAdd}
              isAddingClothes={isAddingClothes}
              clothes={clothes}
              appearanceProfile={appearanceProfile}
              preferences={preferences}
              suggestion={suggestion}
              activeTool={activeStudioTool}
              onActiveToolChange={setActiveStudioTool}
              onSaveAppearance={handleSaveAppearanceProfile}
              onGenerateNewOutfit={handleSuggest}
              onSavedLook={handleSavedLook}
              onOpenSavedLooks={openSavedLooks}
              onAnalysisComplete={handleOutfitAnalysisComplete}
            />
          </div>
          <div className={activePage === 'profile' ? 'contents' : 'hidden'} aria-hidden={activePage !== 'profile'}>
            <ProfileTab
              preferences={preferences}
              accessStatus={accessStatus}
              appearanceProfile={appearanceProfile}
              paymentPlatform={paymentPlatform}
              isPaymentLoading={isPaymentLoading}
              paywallRequestId={paywallRequestId}
              requestedSection={profileSectionRequest}
              likedOutfits={likedOutfits}
              isLoadingLikedOutfits={isLoadingLikedOutfits}
              savedLooks={savedLooks}
              isLoadingSavedLooks={isLoadingSavedLooks}
              outfitHistory={outfitHistory}
              onStartPremium={handleStartPremium}
              onRestorePurchases={handleRestorePurchases}
              onCancelPremiumFlow={handleCancelPremiumFlow}
              onSavePreferences={handleSavePreferences}
              onSaveAppearance={handleSaveAppearanceProfile}
              onResetPremiumState={handleResetPremiumState}
            />
          </div>
        </div>

        <nav className="bottom-tabbar aura-tabbar">
          <div className="aura-tabbar-grid">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActivePage(tab.id)}
                className={activePage === tab.id ? 'is-active' : ''}
              >
                <tab.Icon aria-hidden="true" />
                <span>{t(tab.labelKey)}</span>
              </button>
            ))}
          </div>
        </nav>
      </div>

      {message ? (
        <div className="safe-toast fixed inset-x-0 z-50 mx-auto w-full max-w-xl px-4">
          <div role="alert" className={`rounded-2xl border p-4 text-sm shadow-lg ${isDailyLimitMessage ? 'border-amber-200 bg-amber-50 text-amber-950' : messageClasses[messageTone]}`}>
            {isDailyLimitMessage ? (
              <div className="grid gap-1">
                <p className="font-semibold">{t('messages.dailyLimitReachedTitle')}</p>
                <p>{t('messages.dailyLimitReachedDescription')}</p>
              </div>
            ) : (
              t(message)
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
