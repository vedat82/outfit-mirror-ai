export const subscriptionStates = {
  free: 'FREE',
  trial: 'TRIAL',
  premiumMonthly: 'PREMIUM_MONTHLY',
  premiumYearly: 'PREMIUM_YEARLY'
};

export const pricingConfig = {
  currency: 'TRY',
  currencySymbol: 'TL',
  trialDays: 3,
  plans: {
    monthly: {
      id: 'premium-monthly',
      state: subscriptionStates.premiumMonthly,
      productIds: {
        ios: 'com.vedat.outfitmirrorai.premium.monthly',
        android: 'premium_monthly',
        web: 'premium-monthly'
      },
      amount: 299,
      interval: 'month'
    },
    yearly: {
      id: 'premium-yearly',
      state: subscriptionStates.premiumYearly,
      productIds: {
        ios: 'com.vedat.outfitmirrorai.premium.yearly',
        android: 'premium_yearly',
        web: 'premium-yearly'
      },
      amount: 1999,
      interval: 'year'
    }
  }
};

export const defaultPremiumPlanId = pricingConfig.plans.monthly.id;

export function getPlanById(planId) {
  return Object.values(pricingConfig.plans).find((plan) => plan.id === planId) || pricingConfig.plans.monthly;
}

export function getPlanByState(subscriptionState) {
  return Object.values(pricingConfig.plans).find((plan) => plan.state === subscriptionState) || null;
}

export function formatPlanPrice(plan) {
  return `${plan.amount} ${pricingConfig.currencySymbol}`;
}
