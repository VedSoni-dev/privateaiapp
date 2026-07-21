/**
 * CalendarService — adds events using the OS's own native "create event"
 * dialog (EventKitUI on iOS), so there's no custom date/time picker to
 * build or ship. Write-only access (see app.json's expo-calendar config):
 * Private AI only ever adds what you explicitly ask it to, never reads
 * your existing calendar.
 *
 * Lazily required + defensive, consistent with this app's other native
 * service wrappers.
 */
let Calendar: any = null;

function native(): any | null {
  if (Calendar) return Calendar;
  try {
    Calendar = require('expo-calendar');
    return Calendar;
  } catch {
    return null;
  }
}

export async function requestPermission(): Promise<boolean> {
  const C = native();
  if (!C) return false;
  try {
    const response = await C.requestCalendarPermissionsAsync();
    return Boolean(response.granted);
  } catch (e) {
    console.warn('[Calendar] permission request failed:', e);
    return false;
  }
}

export interface NewCalendarEvent {
  title: string;
  notes?: string;
  startDate: Date;
  endDate: Date;
}

export type AddEventResult = 'saved' | 'cancelled' | 'unavailable';

/** Shows the native "Add Event" screen pre-filled with the given details. */
export async function addEventToCalendar(event: NewCalendarEvent): Promise<AddEventResult> {
  const C = native();
  if (!C) return 'unavailable';
  const granted = await requestPermission();
  if (!granted) return 'unavailable';
  try {
    const result = await C.createEventInCalendarAsync({
      title: event.title,
      notes: event.notes,
      startDate: event.startDate,
      endDate: event.endDate,
    });
    return result.action === 'saved' ? 'saved' : 'cancelled';
  } catch (e) {
    console.warn('[Calendar] create event failed:', e);
    return 'unavailable';
  }
}
