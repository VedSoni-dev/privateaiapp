/**
 * PurchaseService — RevenueCat (react-native-purchases) wrapper.
 *
 * Expo Go-safe by design: the native module is lazily required, so in Expo Go
 * (where it doesn't exist) every function degrades gracefully and the rest of
 * the app keeps working. Real purchases only function in dev-client/TestFlight
 * builds AND once REVENUECAT_IOS_KEY below is set to a real key.
 *
 * Setup checklist (user-side, one time — full walkthrough in LAUNCH.md):
 *  1. App Store Connect → create auto-renewing subscription (e.g. `pro_monthly`, $19.99)
 *  2. revenuecat.com → new project → add iOS app → paste App Store Connect
 *     App-Specific Shared Secret → create entitlement `pro` attached to the product
 *  3. Copy the public Apple API key (starts with `appl_`) into REVENUECAT_IOS_KEY
 *  4. RevenueCat → Integrations → Webhooks → URL
 *     https://private-ai-backend.onrender.com/v1/rc-webhook with an
 *     Authorization header matching Render's RC_WEBHOOK_AUTH env var — that
 *     webhook is what flips `ent:{deviceId}` server-side (see server/index.js).
 */
import { activatePro, deactivatePro } from './UsageService';
import { getDeviceId } from './DeviceId';

// RevenueCat dashboard → Project settings → API keys → Apple.
// Public key, safe to embed in the binary.
const REVENUECAT_IOS_KEY = 'appl_YotdLyLjfToEZpkucfDKgWajTYT';
const ENTITLEMENT_ID = 'pro';

let PurchasesModule: any = null;

function native(): any | null {
  if (PurchasesModule) return PurchasesModule;
  try {
    // Lazy require: crashes at import time in Expo Go, so never import at top level.
    PurchasesModule = require('react-native-purchases').default;
    return PurchasesModule;
  } catch {
    return null;
  }
}

function configured(): boolean {
  return !REVENUECAT_IOS_KEY.includes('REPLACE');
}

/** True when running in a build that contains the StoreKit native module. */
export function isAvailable(): boolean {
  return native() != null;
}

let initialized = false;

async function syncEntitlement(customerInfo: any): Promise<boolean> {
  const active = Boolean(customerInfo?.entitlements?.active?.[ENTITLEMENT_ID]);
  if (active) await activatePro();
  else await deactivatePro();
  return active;
}

/** Call once at app boot. No-op in Expo Go or while the key is unset. */
export async function initPurchases(): Promise<void> {
  const P = native();
  if (!P || !configured() || initialized) return;
  initialized = true;
  try {
    // appUserID = this app's device id, so RevenueCat webhook events carry an
    // app_user_id the server can map straight onto its ent:{deviceId} keys.
    const deviceId = await getDeviceId();
    P.configure({ apiKey: REVENUECAT_IOS_KEY, appUserID: deviceId });
    P.addCustomerInfoUpdateListener((info: any) => {
      void syncEntitlement(info);
    });
    const info = await P.getCustomerInfo();
    await syncEntitlement(info);
  } catch (e) {
    console.warn('[Purchases] init failed:', e);
  }
}

/**
 * Localized price string from StoreKit (e.g. "$19.99", "19,99 €"), or null in
 * Expo Go / before the key is set. The paywall falls back to the US price.
 */
export async function getProPriceString(): Promise<string | null> {
  const P = native();
  if (!P || !configured()) return null;
  try {
    const offerings = await P.getOfferings();
    return offerings?.current?.availablePackages?.[0]?.product?.priceString ?? null;
  } catch {
    return null;
  }
}

export interface PurchaseResult {
  ok: boolean;
  /** User-facing explanation when ok is false; undefined for silent cancel. */
  message?: string;
}

export async function purchasePro(): Promise<PurchaseResult> {
  const P = native();
  if (!P) {
    return { ok: false, message: 'Purchases need the installed app build — they are not available in Expo Go.' };
  }
  if (!configured()) {
    return { ok: false, message: 'Purchases are not configured yet. Check back in the next update.' };
  }
  try {
    const offerings = await P.getOfferings();
    const pkg = offerings?.current?.availablePackages?.[0];
    if (!pkg) {
      return { ok: false, message: 'Subscription is not available right now. Please try again later.' };
    }
    const { customerInfo } = await P.purchasePackage(pkg);
    const active = await syncEntitlement(customerInfo);
    return active ? { ok: true } : { ok: false, message: 'Purchase did not activate. Try Restore Purchases.' };
  } catch (e: any) {
    if (e?.userCancelled) return { ok: false }; // silent — the user changed their mind
    console.warn('[Purchases] purchase failed:', e);
    return { ok: false, message: 'Purchase failed. You were not charged — please try again.' };
  }
}

export async function restorePurchases(): Promise<PurchaseResult> {
  const P = native();
  if (!P) {
    return { ok: false, message: 'Restore needs the installed app build — it is not available in Expo Go.' };
  }
  if (!configured()) {
    return { ok: false, message: 'Purchases are not configured yet.' };
  }
  try {
    const info = await P.restorePurchases();
    const active = await syncEntitlement(info);
    return active
      ? { ok: true }
      : { ok: false, message: 'No previous purchase found for this Apple ID.' };
  } catch (e) {
    console.warn('[Purchases] restore failed:', e);
    return { ok: false, message: 'Restore failed. Please try again.' };
  }
}
