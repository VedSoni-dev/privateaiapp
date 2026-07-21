/**
 * AppLockService — optional Face ID / Touch ID / passcode gate over the app.
 *
 * The private-AI promise is weak if anyone holding the phone can open the
 * chat history, so this lets the user require biometric auth on every app
 * open and foreground. Expo Go-safe per the app convention: the native
 * module is lazily required and everything degrades to "no lock available".
 *
 * Fail-open on genuine unavailability (module missing, no hardware, no
 * enrolled biometrics): a user who breaks Face ID enrollment must not be
 * permanently locked out of their own chats — the OS passcode fallback
 * (disableDeviceFallback: false) covers the normal path.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const LOCK_KEY = '@privateai/app_lock';

let LocalAuthModule: any = null;

function native(): any | null {
  if (LocalAuthModule) return LocalAuthModule;
  try {
    // Lazy require: keeps Expo Go bootable if the module were ever absent.
    LocalAuthModule = require('expo-local-authentication');
    return LocalAuthModule;
  } catch {
    return null;
  }
}

/** True when the device can actually authenticate (hardware + enrollment). */
export async function isLockAvailable(): Promise<boolean> {
  const mod = native();
  if (!mod) return false;
  try {
    const [hasHardware, isEnrolled] = await Promise.all([
      mod.hasHardwareAsync(),
      mod.isEnrolledAsync(),
    ]);
    return Boolean(hasHardware && isEnrolled);
  } catch {
    return false;
  }
}

export async function isLockEnabled(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(LOCK_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setLockEnabled(enabled: boolean): Promise<void> {
  try {
    if (enabled) await AsyncStorage.setItem(LOCK_KEY, '1');
    else await AsyncStorage.removeItem(LOCK_KEY);
  } catch {
    /* preference write failed — worst case the toggle doesn't stick */
  }
}

/**
 * Prompt the user to authenticate. Resolves true on success OR when no
 * authenticator is available (fail-open — see module comment).
 */
export async function authenticate(): Promise<boolean> {
  const mod = native();
  if (!mod) return true;
  try {
    if (!(await isLockAvailable())) return true;
    const result = await mod.authenticateAsync({
      promptMessage: 'Unlock Private AI',
      disableDeviceFallback: false, // allow OS passcode as fallback
      cancelLabel: 'Cancel',
    });
    return Boolean(result?.success);
  } catch {
    return true;
  }
}
