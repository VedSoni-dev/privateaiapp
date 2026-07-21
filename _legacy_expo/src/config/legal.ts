// Single source of truth for legal URLs — referenced from the paywall
// (App Store guideline 3.1.2), onboarding, and the message-report action
// (guideline 1.2 UGC/AI-content expectations: reporting + published contact).
export const PRIVACY_URL = 'https://github.com/VedSoni-dev/privateaiapp/blob/main/PRIVACY.md';
export const TERMS_URL = 'https://github.com/VedSoni-dev/privateaiapp/blob/main/TERMS.md';

const REPO = 'VedSoni-dev/privateaiapp';

// Reuses the public issue tracker already named as the contact channel in
// PRIVACY.md, rather than inventing a separate inbox — prefilled so the
// reporter doesn't have to explain what "report" means.
export function reportContentUrl(messageText: string): string {
  const title = 'Reported AI response';
  const snippet = messageText.length > 500 ? `${messageText.slice(0, 500)}…` : messageText;
  const body = `Flagged from the app — please review:\n\n---\n${snippet}\n---\n\n(What was wrong with it?)`;
  return `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}
