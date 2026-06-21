import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '../i18n/I18nProvider.jsx';
import { formatPlanPrice, pricingConfig } from '../config/pricing.js';
import { loadAppleSubscriptionProducts } from '../api/applePurchases.js';
import { canUseAppleSubscriptions } from '../utils/platform.js';

function getTrialText(product, t) {
  const intro = product?.introductoryPrice;

  if (!intro) {
    return t('paywall.trialIncluded');
  }

  const units = intro.subscriptionPeriod?.numberOfUnits || pricingConfig.trialDays;
  const unit = intro.subscriptionPeriod?.unitString || 'day';

  if (intro.price === 0) {
    return t('paywall.storeTrial', { count: units, unit: t(`paywall.periodUnits.${unit}`) });
  }

  return t('paywall.storeIntroOffer', {
    price: intro.priceString,
    count: units,
    unit: t(`paywall.periodUnits.${unit}`)
  });
}

export default function PaywallScreen({ accessStatus, paymentPlatform = 'web', isPaymentLoading, onStartPremium, onRestorePurchases, onCancelPayment, onMaybeLater }) {
  const { t } = useI18n();
  const [isConfirming, setIsConfirming] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState(pricingConfig.plans.yearly.id);
  const [appleProducts, setAppleProducts] = useState([]);
  const [isLoadingAppleProducts, setIsLoadingAppleProducts] = useState(false);
  const [appleProductsError, setAppleProductsError] = useState('');
  const canUseAppleBilling = canUseAppleSubscriptions();
  const benefits = [
    'paywall.benefits.unlimitedOutfits',
    'paywall.benefits.aiFeedback',
    'paywall.benefits.clothesUpload',
    'paywall.benefits.appearanceStyle',
    'paywall.benefits.adFree'
  ];
  const plans = [pricingConfig.plans.monthly, pricingConfig.plans.yearly];
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) || pricingConfig.plans.yearly;
  const productsByPlanId = useMemo(() => new Map(appleProducts.map((product) => [product.planId, product])), [appleProducts]);
  const selectedProduct = productsByPlanId.get(selectedPlan.id);
  const canStartSelectedPlan = canUseAppleBilling && !isLoadingAppleProducts && !appleProductsError && Boolean(selectedProduct);

  useEffect(() => {
    if (accessStatus.isPremium) {
      setIsConfirming(false);
    }
  }, [accessStatus.isPremium]);

  useEffect(() => {
    if (!canUseAppleBilling) {
      return;
    }

    let isMounted = true;
    setIsLoadingAppleProducts(true);
    setAppleProductsError('');

    loadAppleSubscriptionProducts()
      .then((products) => {
        if (!isMounted) return;
        setAppleProducts(products);
        if (products.some((product) => product.planId === pricingConfig.plans.yearly.id)) {
          setSelectedPlanId(pricingConfig.plans.yearly.id);
        } else if (products[0]) {
          setSelectedPlanId(products[0].planId);
        }
      })
      .catch((error) => {
        if (!isMounted) return;
        setAppleProductsError(error.message?.startsWith('messages.') ? error.message : 'messages.appleProductsUnavailable');
      })
      .finally(() => {
        if (isMounted) setIsLoadingAppleProducts(false);
      });

    return () => {
      isMounted = false;
    };
  }, [canUseAppleBilling]);

  return (
    <section className="mx-auto grid w-full max-w-3xl min-w-0 gap-5 overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="grid gap-3 text-center sm:text-left">
        <p className="w-fit justify-self-center rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-teal-700 sm:justify-self-start">{t('paywall.socialProof')}</p>
        <div>
          <h2 className="text-3xl font-bold tracking-normal text-slate-950 sm:text-4xl">{t('paywall.title')}</h2>
          <p className="mt-2 text-base leading-7 text-slate-600">{t('paywall.subtitle')}</p>
        </div>
        {accessStatus.isTrialEnded ? (
          <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            {t('premium.trialEndedPaywall')}
          </p>
        ) : null}
        <p className="rounded-2xl border border-teal-100 bg-teal-50 p-3 text-sm font-semibold leading-6 text-teal-900">
          {canUseAppleBilling ? t('paywall.platformMessages.ios') : t('paywall.iosOnlyMessage')}
        </p>
        {canUseAppleBilling && isLoadingAppleProducts ? (
          <p className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-semibold text-slate-600">{t('paywall.loadingProducts')}</p>
        ) : null}
        {appleProductsError ? (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">{t(appleProductsError)}</p>
        ) : null}
      </div>

      <div className="grid gap-2">
        {benefits.map((benefit) => (
          <div key={benefit} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm font-medium text-slate-800">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-800" aria-hidden="true">
              ✓
            </span>
            <span>{t(benefit)}</span>
          </div>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {plans.map((plan) => {
          const isYearly = plan.id === pricingConfig.plans.yearly.id;
          const isSelected = selectedPlanId === plan.id;
          const storeProduct = productsByPlanId.get(plan.id);
          const displayedPrice = canUseAppleBilling ? storeProduct?.priceString || t('paywall.priceUnavailable') : formatPlanPrice(plan);

          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelectedPlanId(plan.id)}
              className={`min-w-0 rounded-3xl border p-4 text-left transition ${isSelected ? 'border-teal-600 bg-teal-50 shadow-sm ring-2 ring-teal-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-950">{t(isYearly ? 'paywall.yearlyPlan' : 'paywall.monthlyPlan')}</p>
                <span className={`rounded-full px-2 py-1 text-xs font-semibold ${isYearly ? 'bg-slate-950 text-white' : 'bg-white text-teal-800'}`}>
                  {t(isYearly ? 'paywall.yearlyDiscount' : 'paywall.monthlyBadge')}
                </span>
              </div>
              <p className="mt-3 text-3xl font-bold text-slate-950">
                {displayedPrice}
                <span className="ml-1 text-sm font-semibold text-slate-500">/ {t(isYearly ? 'paywall.yearUnit' : 'paywall.monthUnit')}</span>
              </p>
              <p className="mt-2 text-sm font-semibold text-teal-800">
                {canUseAppleBilling ? getTrialText(storeProduct, t) : t('paywall.trialIncluded')}
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">{t(isYearly ? 'paywall.yearlyDescription' : 'paywall.monthlyDescription')}</p>
              {canUseAppleBilling && storeProduct?.title ? (
                <p className="mt-2 text-xs font-medium text-slate-400">{storeProduct.title}</p>
              ) : null}
            </button>
          );
        })}
      </div>

      {isConfirming ? (
        <div className="grid gap-4 rounded-3xl border border-teal-200 bg-teal-50 p-4">
          <div>
            <h3 className="text-base font-semibold text-slate-950">{t('paywall.confirmTitle')}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {canUseAppleBilling ? t('paywall.confirmDescriptionIos') : t('paywall.iosOnlyMessage')}
            </p>
            <p className="mt-2 text-sm font-semibold text-teal-900">
              {t('paywall.selectedPlan', {
                plan: t(selectedPlan.id === pricingConfig.plans.yearly.id ? 'paywall.yearlyPlan' : 'paywall.monthlyPlan'),
                price: selectedProduct?.priceString || formatPlanPrice(selectedPlan)
              })}
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onStartPremium(selectedPlan.id)}
              disabled={isPaymentLoading || !canStartSelectedPlan}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isPaymentLoading ? t('buttons.redirectingPayment') : t('buttons.confirmPremium')}
            </button>
            <button
              type="button"
              onClick={() => {
                onCancelPayment?.();
                setIsConfirming(false);
                onMaybeLater();
              }}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              {t('buttons.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <div className="grid gap-2">
            <button
              type="button"
              onClick={() => setIsConfirming(true)}
              disabled={isPaymentLoading || !canStartSelectedPlan}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {isPaymentLoading ? t('buttons.redirectingPayment') : t('buttons.startPremium')}
            </button>
            {canUseAppleBilling ? (
              <button
                type="button"
                onClick={onRestorePurchases}
                disabled={isPaymentLoading}
                className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {t('buttons.restorePurchases')}
              </button>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
            <p className="text-xs leading-5 text-slate-500">{t('paywall.cancelAnytime')}</p>
            <button
              type="button"
              onClick={() => {
                onCancelPayment?.();
                onMaybeLater();
              }}
              className="text-sm font-semibold text-slate-500 transition hover:text-slate-900"
            >
              {t('buttons.maybeLater')}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
