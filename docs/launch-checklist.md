# Outfit Mirror AI - Launch Checklist

Last reviewed: 2026-06-20

## Blocking

- [ ] Hosting details are available: provider, server access, deployment target, and DNS plan.
- [ ] Initialize Git, push the repository, and create an automated deploy pipeline.
- [ ] Publish the frontend and backend over HTTPS.
- [ ] Configure `app.veerapps.com` and `api.veerapps.com`.
- [ ] Set the production iOS build's `VITE_API_BASE_URL` to `https://api.veerapps.com`.
- [ ] Restrict backend CORS to production frontend/native origins.
- [ ] Store SQLite on a persistent volume and enable automatic backups.
- [ ] Move user and generated images out of SQLite/base64 storage to object storage.
- [ ] Complete the in-app Privacy section and publish a privacy policy URL.
- [ ] Complete the in-app Help section with support contact, FAQs, restore, and subscription management.
- [ ] Add data deletion/privacy choices flow for the anonymous local user ID.
- [ ] Configure App Store Server Notifications V2 for renewals, cancellations, refunds, and expiration.
- [ ] Verify production Apple purchase, restore, renewal, cancellation, and expiration behavior.

## Advertising

- [ ] Create the AdMob app and iOS ad units.
- [ ] Integrate a Capacitor 8 compatible native AdMob plugin.
- [ ] Add consent management before requesting ads.
- [ ] Decide whether ATT is needed; if used, add the usage description and consent flow.
- [ ] Show ads only to Free users; Trial and Premium remain ad-free.
- [ ] Start with one adaptive banner placement that does not cover navigation or AI actions.
- [ ] Use test ad IDs in development and production IDs only in release builds.
- [ ] Update App Store privacy answers after the ad SDK is integrated.

## Production Readiness

- [ ] Configure production secrets on the server, never in the frontend bundle.
- [ ] Verify Sentry frontend and backend events in production.
- [ ] Confirm AI quotas, budget guards, timeouts, and maintenance switches.
- [ ] Add server health monitoring and alerts.
- [ ] Test camera/photo permissions, denied permissions, offline behavior, and weak networks on a real iPhone.
- [ ] Test Free, Trial, Monthly, Yearly, restored, expired, and cancelled subscription states.
- [ ] Complete App Store metadata, screenshots, age rating, privacy labels, support URL, and terms.

## Open Product Decisions

- [ ] Final ad placement and frequency.
- [ ] Support email address.
- [ ] Privacy policy, terms, and support page URLs.
- [ ] Image retention period and deletion policy.
- [ ] Whether the first release includes web access or only the iOS application.
