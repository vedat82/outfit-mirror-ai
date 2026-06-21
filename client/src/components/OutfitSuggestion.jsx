import { useI18n } from '../i18n/I18nProvider.jsx';

const seasons = ['all', 'spring', 'summer', 'fall', 'winter'];
const occasions = ['daily', 'work', 'date', 'first date', 'picnic', 'dinner', 'wedding', 'engagement', 'formal event', 'casual meetup'];

function OutfitItem({ label, item }) {
  const { optionLabel } = useI18n();

  return (
    <div className="min-h-28 rounded-md border border-slate-200 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold capitalize text-slate-950">{optionLabel('colors', item.color)}</p>
      <p className="text-sm capitalize text-slate-500">
        {optionLabel('types', item.type)} · {optionLabel('seasons', item.season)}
      </p>
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
    <article className="rounded-md border border-slate-200 bg-white p-3">
      <div className="grid gap-2">
        {items.map(([label, item]) => (
          <div key={label} className="flex items-center justify-between gap-3 text-sm">
            <span className="font-medium text-slate-500">{label}</span>
            <span className="text-right font-semibold capitalize text-slate-900">
              {optionLabel('colors', item.color)} {optionLabel('types', item.type)}
            </span>
          </div>
        ))}
      </div>
    </article>
  );
}

function LikedOutfits({ likedOutfits, isLoading }) {
  const { t } = useI18n();

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">{t('likedOutfits.title')}</h3>
          <p className="mt-1 text-sm text-slate-500">{t('likedOutfits.description')}</p>
        </div>
        <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-600">
          {t('likedOutfits.count', { count: likedOutfits.length })}
        </span>
      </div>

      {isLoading ? (
        <p className="mt-4 rounded-md bg-white p-3 text-sm text-slate-500">{t('likedOutfits.loading')}</p>
      ) : likedOutfits.length ? (
        <div className="mt-4 max-h-56 overflow-y-auto pr-1">
        <div className="grid gap-3 md:grid-cols-2">
          {likedOutfits.map((outfit) => (
            <LikedOutfitCard key={outfit.id} outfit={outfit} />
          ))}
        </div>
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
          {t('likedOutfits.empty')}
        </p>
      )}
    </div>
  );
}

function PremiumSection({ isPremium, onOpenPaywall }) {
  const { t } = useI18n();

  if (isPremium) {
    return null;
  }

  const benefits = [
    'premium.benefits.unlimitedOutfits',
    'premium.benefits.smarterMatching',
    'premium.benefits.personalizedRecommendations'
  ];

  return (
    <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{t('premium.lockedFeature')}</p>
          <h3 className="mt-1 text-base font-semibold text-slate-950">{t('premium.goTitle')}</h3>
          <p className="mt-1 text-sm text-slate-600">{t('premium.goDescription')}</p>
        </div>
        <span className="rounded-md bg-white px-2 py-1 text-sm" aria-hidden="true">
          🔒
        </span>
      </div>

      <ul className="mt-4 grid gap-2 text-sm text-slate-700">
        {benefits.map((benefit) => (
          <li key={benefit} className="flex items-center gap-2">
            <span className="text-amber-700" aria-hidden="true">🔒</span>
            <span>{t(benefit)}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onOpenPaywall}
        className="mt-4 rounded-md bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
      >
        {t('buttons.openPaywall')}
      </button>
    </div>
  );
}

function WeatherLine({ weather }) {
  const { t } = useI18n();

  if (!weather || weather.unavailable) {
    return null;
  }

  return (
    <p className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-600">
      {t('outfit.weather', {
        temperature: Math.round(weather.temperatureC),
        condition: weather.rainy ? t('outfit.rainy') : t('outfit.dry'),
        city: weather.city
      })}
    </p>
  );
}

function PreferencesLine({ preferences }) {
  const { t, optionLabel } = useI18n();

  if (!preferences) {
    return null;
  }

  const colors = preferences.preferredColors.length
    ? preferences.preferredColors.map((color) => optionLabel('colors', color)).join(', ')
    : t('outfit.noColorPreference');

  return (
    <p className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-600">
      {t('outfit.preferences', {
        style: optionLabel('styles', preferences.preferredStyle),
        colors,
        gender: optionLabel('genders', preferences.gender),
        bodyType: optionLabel('bodyTypes', preferences.bodyType),
        height: optionLabel('heights', preferences.height),
        styleGoal: optionLabel('styleGoals', preferences.styleGoal)
      })}
    </p>
  );
}

function OccasionLine({ occasion }) {
  const { t, optionLabel } = useI18n();

  if (!occasion) {
    return null;
  }

  return (
    <p className="mt-4 rounded-md bg-slate-50 p-4 text-sm text-slate-600">
      {t('outfit.occasionLine', { occasion: optionLabel('occasions', occasion) })}
    </p>
  );
}

function getWeatherNoteKey(suggestion) {
  const weather = suggestion?.weather;

  if (!weather || weather.unavailable) {
    return 'outfit.notes.noWeather';
  }

  if (typeof weather.temperatureC === 'number' && weather.temperatureC < 15) {
    return suggestion.jacket ? 'outfit.notes.coldWithJacket' : 'outfit.notes.coldWithoutJacket';
  }

  if (typeof weather.temperatureC === 'number' && weather.temperatureC > 25) {
    return 'outfit.notes.hot';
  }

  if (weather.rainy) {
    return 'outfit.notes.rainy';
  }

  return 'outfit.notes.mild';
}

export default function OutfitSuggestion({
  className = '',
  suggestion,
  season,
  occasion,
  onSeasonChange,
  onOccasionChange,
  onSuggest,
  onToday,
  isLoading,
  isFeedbackLoading,
  isPremium,
  onOpenPaywall,
  likedOutfits,
  isLoadingLikedOutfits,
  onFeedback
}) {
  const { t, optionLabel } = useI18n();
  const weatherNoteKey = getWeatherNoteKey(suggestion);

  return (
    <section className={`flex flex-col rounded-md border border-teal-200 bg-white p-4 shadow-sm ring-1 ring-teal-50 ${className}`}>
      <div className="shrink-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">{t('outfit.eyebrow')}</p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950">{t('outfit.title')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('outfit.description')}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={onToday}
            disabled={isLoading}
            className="rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:bg-teal-300"
          >
            {isLoading ? t('buttons.checking') : t('buttons.todaysOutfit')}
          </button>
          <select
            value={occasion}
            onChange={(event) => onOccasionChange(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm capitalize text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            disabled={isLoading}
            aria-label={t('outfit.occasion')}
          >
            {occasions.map((option) => (
              <option key={option} value={option}>
                {optionLabel('occasions', option)}
              </option>
            ))}
          </select>
          <select
            value={season}
            onChange={(event) => onSeasonChange(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm capitalize text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
            disabled={isLoading}
          >
            {seasons.map((option) => (
              <option key={option} value={option}>
                {optionLabel('seasons', option)}
              </option>
            ))}
          </select>
          <button
            onClick={onSuggest}
            disabled={isLoading}
            className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {t('buttons.suggest')}
          </button>
        </div>
      </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      {suggestion ? (
        <>
          <div className="mt-5 rounded-md bg-slate-50 p-3">
            <div className="grid gap-3 sm:grid-cols-4">
            <OutfitItem label={t('outfit.labels.top')} item={suggestion.top} />
            <OutfitItem label={t('outfit.labels.bottom')} item={suggestion.bottom} />
            <OutfitItem label={t('outfit.labels.shoes')} item={suggestion.shoes} />
            {suggestion.jacket ? <OutfitItem label={t('outfit.labels.jacket')} item={suggestion.jacket} /> : null}
            </div>
          </div>
          <WeatherLine weather={suggestion.weather} />
          <OccasionLine occasion={suggestion.occasion} />
          <PreferencesLine preferences={suggestion.preferences} />
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={() => onFeedback('like')}
              disabled={isFeedbackLoading}
              className="rounded-md border border-teal-200 bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-900 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('buttons.like')}
            </button>
            <button
              onClick={() => onFeedback('dislike')}
              disabled={isFeedbackLoading}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('buttons.dislike')}
            </button>
          </div>
          <p className="mt-4 rounded-md bg-amber-50 p-4 text-sm text-amber-900">{t(weatherNoteKey)}</p>
          <p className="mt-4 rounded-md bg-teal-50 p-4 text-sm text-teal-900">{t('outfit.ruleSummary')}</p>
          <PremiumSection isPremium={isPremium} onOpenPaywall={onOpenPaywall} />
          <LikedOutfits likedOutfits={likedOutfits} isLoading={isLoadingLikedOutfits} />
        </>
      ) : (
        <div className="mt-5 rounded-md border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
          <p className="text-sm font-semibold text-slate-800">{t('outfit.emptyTitle')}</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
            {t('outfit.emptyDescription')}
          </p>
        </div>
      )}
      {!suggestion ? <PremiumSection isPremium={isPremium} onOpenPaywall={onOpenPaywall} /> : null}
      {!suggestion ? <LikedOutfits likedOutfits={likedOutfits} isLoading={isLoadingLikedOutfits} /> : null}
      </div>
    </section>
  );
}
