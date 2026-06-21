import { useI18n } from '../i18n/I18nProvider.jsx';
import { canUsePaymentTestHelpers } from '../utils/paymentFlow.js';

const languages = [
  { code: 'tr', flag: '🇹🇷', labelKey: 'language.turkish' },
  { code: 'en', flag: '🇬🇧', labelKey: 'language.english' }
];

export default function PreferencesPanel({ accessStatus, onOpenPaywall, onResetPremiumState }) {
  const { language, setLanguage, t } = useI18n();
  const canShowTestReset = canUsePaymentTestHelpers();

  return (
    <section className="grid w-full max-w-full min-w-0 gap-5 overflow-hidden rounded-md border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_180px] sm:items-start">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">{t('preferences.title')}</h2>
          <p className="mt-1 text-sm text-slate-500">{t('preferences.description')}</p>
        </div>

        <label className="grid gap-2 text-sm font-medium text-slate-700">
          {t('language.label')}
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-950 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          >
            {languages.map((item) => (
              <option key={item.code} value={item.code}>
                {item.flag} {t(item.labelKey)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex min-w-0 flex-col gap-4 rounded-md border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{t('premium.title')}</p>
          <p className="mt-1 text-sm text-slate-500">{t('premium.description')}</p>
          {accessStatus ? (
            <p className="mt-2 text-sm font-semibold text-teal-700">
              {accessStatus.isPremium
                ? t(accessStatus.subscriptionLabelKey)
                : accessStatus.isTrialActive
                  ? t('premium.trialStatus', { days: accessStatus.trialDaysLeft })
                  : accessStatus.isTrialEnded
                    ? t('premium.trialEnded')
                    : t('premium.statusFree')}
            </p>
          ) : null}
        </div>
        {!accessStatus?.isPremium ? (
          <div className="grid w-full min-w-0 gap-3 sm:w-auto sm:shrink-0 sm:justify-items-end">
            <button
              type="button"
              onClick={onOpenPaywall}
              className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-50"
            >
              {t('buttons.openPaywall')}
            </button>
          </div>
        ) : (
          <div className="grid w-full min-w-0 gap-2 sm:w-auto sm:shrink-0 sm:justify-items-end">
            <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-semibold text-teal-800">
              {t('premium.statusPremium')}
            </div>
            {canShowTestReset && onResetPremiumState ? (
              <button
                type="button"
                onClick={onResetPremiumState}
                className="rounded-md border border-rose-200 bg-white px-3 py-2 text-sm font-semibold text-rose-700 transition hover:bg-rose-50"
              >
                {t('buttons.resetPremium')}
              </button>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
