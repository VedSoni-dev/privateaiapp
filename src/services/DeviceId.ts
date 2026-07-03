/**
 * DeviceId — a random, persistent per-install identifier.
 * Used only for backend rate limiting; carries no personal information.
 */
import RNFS from 'react-native-fs';

const FILE = `${RNFS.DocumentDirectoryPath}/device_id.txt`;

let cached: string | null = null;

function randomId(): string {
  const bytes = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    if (await RNFS.exists(FILE)) {
      cached = (await RNFS.readFile(FILE, 'utf8')).trim();
      if (cached) return cached;
    }
  } catch {}
  cached = randomId();
  try { await RNFS.writeFile(FILE, cached, 'utf8'); } catch {}
  return cached;
}
