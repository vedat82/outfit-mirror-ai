export const pricingConfig = {
  currency: 'TRY',
  trialDays: 3,
  plans: {
    monthly: {
      id: 'premium-monthly',
      productIds: {
        ios: 'com.vedat.outfitmirrorai.premium.monthly',
        android: 'premium_monthly',
        web: 'premium-monthly'
      },
      amount: process.env.PREMIUM_MONTHLY_PRICE_TRY || '299.00',
      interval: 'month'
    },
    yearly: {
      id: 'premium-yearly',
      productIds: {
        ios: 'com.vedat.outfitmirrorai.premium.yearly',
        android: 'premium_yearly',
        web: 'premium-yearly'
      },
      amount: process.env.PREMIUM_YEARLY_PRICE_TRY || '1999.00',
      interval: 'year'
    }
  }
};

export function getPlanById(planId) {
  return Object.values(pricingConfig.plans).find((plan) => plan.id === planId) || pricingConfig.plans.monthly;
}
