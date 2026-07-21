# Private AI — Privacy Policy

_Last updated: July 21, 2026_

Private AI is built so that we know as little about you as possible.

## What stays on your phone

- **Your chats.** Conversation history is stored only on your device. We run no
  account system and no chat database.
- **Your AI memory.** Facts the assistant learns about you are stored only on
  your device. You can view, delete individual memories, or erase them all at
  any time from the in-app memory screen.

## What leaves your phone

- **Messages you send** are transmitted to our inference backend to generate a
  response. Inference runs inside a confidential-computing environment
  (Privatemode), designed so that message content is encrypted in use and not
  readable by us or the infrastructure provider. Messages are not stored after
  the response is generated and are not used to train models.
- **Live lookups** (only when an answer needs fresh facts like news or scores) may
  send a short query to our search service. Lookups are not framed as leaving
  private mode, are not tied to your name or email, and are not used to build a
  profile.
- **A random device identifier.** Generated on install, used solely to enforce
  daily free-tier limits and rate limits. It contains no personal information
  and cannot be linked to you by name.

## What we don't do

- No accounts, no email, no phone number.
- No advertising, no trackers, no analytics SDKs.
- No selling or sharing of data with third parties.
- No training on your conversations.

## Subscriptions

Pro subscriptions are processed by Apple through your App Store account. We
receive only an anonymous receipt confirming entitlement — never your payment
details.

## Contact

Questions: open an issue at https://github.com/VedSoni-dev/privateaiapp/issues
