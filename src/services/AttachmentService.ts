/**
 * AttachmentService
 *
 * Lets the user attach documents to a chat turn. Everything happens on-device:
 *   - Text-like files (.txt/.md/.csv/.json/code) are read directly via RNFS.
 *   - PDFs are parsed with the native iOS PDFKit extractor (NativeAudioModule).
 * The extracted text is injected into the prompt as context — nothing is
 * uploaded anywhere.
 */
import { NativeModules, Platform } from 'react-native';
import RNFS from 'react-native-fs';

// Lazily required so the JS bundle still loads on older dev-client binaries
// that predate this native module (it only resolves when actually used).
function getDocumentPicker(): typeof import('expo-document-picker') {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('expo-document-picker');
}

const { NativeAudioModule } = NativeModules;

// Per-file and total caps so we never blow past the model's context window.
const PER_FILE_CHARS = 4000;
const TOTAL_CHARS = 6000;

const TEXT_EXTENSIONS = [
  'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'xml', 'yaml', 'yml',
  'js', 'jsx', 'ts', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift',
  'c', 'h', 'cpp', 'cc', 'hpp', 'cs', 'php', 'sh', 'sql', 'html', 'css',
  'log', 'ini', 'conf', 'env', 'rtf',
];

export interface Attachment {
  id: string;
  name: string;
  kind: 'pdf' | 'text';
  /** Extracted plain text (already truncated for display safety). */
  text: string;
  /** Original character count before truncation. */
  chars: number;
  error?: string;
}

function extOf(name = ''): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : '';
}

function stripUri(uri: string): string {
  try {
    return decodeURIComponent(uri.replace(/^file:\/\//, ''));
  } catch {
    return uri.replace(/^file:\/\//, '');
  }
}

async function extractPdf(uri: string): Promise<string> {
  if (!NativeAudioModule?.extractPdfText) {
    throw new Error(
      Platform.OS === 'ios'
        ? 'PDF support needs the latest build of the app.'
        : 'PDF extraction is currently iOS-only.',
    );
  }
  const res = await NativeAudioModule.extractPdfText(uri);
  return String(res?.text ?? '').trim();
}

async function extractText(uri: string): Promise<string> {
  const path = stripUri(uri);
  const content = await RNFS.readFile(path, 'utf8');
  return content.trim();
}

let counter = 0;
function genId(): string {
  counter += 1;
  return `att_${Date.now()}_${counter}`;
}

/**
 * Open the system document picker and extract text from each chosen file.
 * Returns one Attachment per file (with an `error` set if it couldn't be read).
 */
export async function pickAndExtract(): Promise<Attachment[]> {
  const DocumentPicker = getDocumentPicker();
  const res = await DocumentPicker.getDocumentAsync({
    multiple: true,
    copyToCacheDirectory: true,
    type: ['application/pdf', 'text/*', 'application/json', 'application/xml'],
  });

  if (res.canceled || !res.assets?.length) return [];

  const out: Attachment[] = [];
  for (const asset of res.assets) {
    const name = asset.name || 'file';
    const ext = extOf(name);
    const isPdf = asset.mimeType === 'application/pdf' || ext === 'pdf';
    const isText =
      (asset.mimeType?.startsWith('text/') ?? false) ||
      asset.mimeType === 'application/json' ||
      asset.mimeType === 'application/xml' ||
      TEXT_EXTENSIONS.includes(ext);

    try {
      let raw = '';
      let kind: Attachment['kind'] = 'text';
      if (isPdf) {
        kind = 'pdf';
        raw = await extractPdf(asset.uri);
      } else if (isText) {
        kind = 'text';
        raw = await extractText(asset.uri);
      } else {
        throw new Error('Unsupported file type. Attach a PDF or text file.');
      }

      if (!raw) {
        out.push({
          id: genId(),
          name,
          kind,
          text: '',
          chars: 0,
          error: 'No readable text found in this file.',
        });
        continue;
      }

      out.push({
        id: genId(),
        name,
        kind,
        text: raw.slice(0, PER_FILE_CHARS),
        chars: raw.length,
      });
    } catch (e: any) {
      out.push({
        id: genId(),
        name,
        kind: isPdf ? 'pdf' : 'text',
        text: '',
        chars: 0,
        error: e?.message ? String(e.message) : 'Could not read this file.',
      });
    }
  }
  return out;
}

/** Build the prompt block describing the attached files' contents. */
export function buildAttachmentBlock(attachments: Attachment[]): string {
  const usable = attachments.filter(a => a.text && !a.error);
  if (usable.length === 0) return '';

  let budget = TOTAL_CHARS;
  const parts: string[] = [];
  for (const a of usable) {
    if (budget <= 0) break;
    const slice = a.text.slice(0, budget);
    const truncated = slice.length < a.chars;
    parts.push(
      `----- FILE: ${a.name} (${a.kind}, ${a.chars.toLocaleString()} chars` +
        `${truncated ? ', truncated' : ''}) -----\n${slice}\n----- END FILE -----`,
    );
    budget -= slice.length;
  }

  return (
    `\n\nThe user attached the following file(s). Use their contents to answer the question. ` +
    `If the answer isn't in the files, say so.\n\n${parts.join('\n\n')}`
  );
}
