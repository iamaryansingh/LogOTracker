import * as chrono from 'chrono-node';

/**
 * Reads a free-text note and finds what it's implicitly asking for:
 *  - "event": a line that mentions a date (and maybe a time) → a calendar event
 *  - "task":  a line phrased as something to do → a to-do, due on any date it mentions
 *  - "note":  everything else stays as written
 * Runs entirely on device; the user confirms each suggestion before anything is created.
 */

/** Key for the combined "save the note-like lines to Apple Notes" choice. */
export const NOTES_ROW = '__apple-notes__';

/** The items the user kept: switched-off lines are dropped, and note lines when Apple Notes is switched off. */
export function acceptedItems(items: NoteItem[], off: Set<string>): NoteItem[] {
  return items.filter((i) => !off.has(i.line) && !(i.kind === 'note' && off.has(NOTES_ROW)));
}

export type NoteItem =
  | { kind: 'alarm'; line: string; title: string; at: Date }
  | { kind: 'event'; line: string; title: string; start: Date; allDay: boolean }
  | { kind: 'task'; line: string; text: string; due?: Date; dueHasTime: boolean }
  | { kind: 'note'; line: string };

interface FoundDate {
  date: Date;
  hasTime: boolean;
  /** The words that expressed the date, removed when building a title. */
  matched: string[];
}

const TASK_PREFIX = /^\s*(?:[-*•]\s*)?(?:\[\s?\]\s*|(?:todo|to-do|to do)\b[:\s-]*)/i;
// Phrases that say "this is mine to do" outright; these always make a reminder.
const TASK_CUE = /\b(?:need to|needs to|have to|has to|must|remember to|remind me(?: to)?|don'?t forget(?: to)?|should|gotta)\b/i;
const IMPERATIVE =
  /^\s*(?:[-*•]\s*)?(?:send|call|email|e-mail|text|buy|book|finish|prepare|review|submit|pay|schedule|write|fix|ask|check|share|update|reply|follow up|read|order|pick up|drop off|renew|cancel|clean|draft|plan|confirm)\b/i;
// "Wake me up at 6", "alarm 7:30 tomorrow", "set an alarm for 5:45am".
const ALARM_CUE = /\b(?:alarm|wake me(?: up)?|wake-up call)\b/i;
const ALARM_WORDS = /\b(?:set|an|a|my|alarm|clock|wake me up|wake me|wake-up call|please|for|to)\b/gi;
const MEETING_WORDS = /\b(?:meet|meeting|session|catch ?up|sync|call|1:1|one[- ]to[- ]one|follow[- ]?up|appointment|chat)\b/i;
// "on 26", "the 26th", "by the 3rd", "26th" — day-of-month forms chrono doesn't read on their own.
const BARE_DAY = /\b(?:(?:on|by|for|the|before)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)?|(\d{1,2})(?:st|nd|rd|th))\b(?!\s*(?:am|pm|:|\.\d|min|mins|minutes|h\b|hrs?|hours|%|kg|km|x\b))/i;

function bareDay(text: string, ref: Date): { date: Date; matched: string } | null {
  const m = text.match(BARE_DAY);
  if (!m) return null;
  const day = Number(m[1] ?? m[2]);
  if (day < 1 || day > 31) return null;
  const candidate = (monthOffset: number) => {
    const d = new Date(ref.getFullYear(), ref.getMonth() + monthOffset, day, 9, 0, 0, 0);
    return d.getDate() === day ? d : null; // rejects e.g. the 31st in a 30-day month
  };
  // The next time that day comes round: this month if it hasn't passed, otherwise next month.
  const thisMonth = day >= ref.getDate() ? candidate(0) : null;
  const date = thisMonth ?? candidate(1) ?? candidate(2);
  return date ? { date, matched: m[0] } : null;
}

function findDate(text: string, ref: Date, opts: { afternoonGuess?: boolean } = {}): FoundDate | null {
  // A bare duration ("30 min cooldown", "2 hours") describes length, not when; only "in 30 min" is a time.
  const results = chrono
    .parse(text, ref, { forwardDate: true })
    .filter((r) => !/^\d+(?:\.\d+)?\s*(?:s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?|days?|weeks?)$/i.test(r.text.trim()));
  const bare = bareDay(text, ref);
  const withDay = results.find((r) => r.start.isCertain('day') || r.start.isCertain('weekday'));
  const withTime = results.find((r) => r.start.isCertain('hour'));

  let date: Date | null = null;
  let hasTime = false;
  const matched: string[] = [];

  if (withDay) {
    date = withDay.start.date();
    hasTime = withDay.start.isCertain('hour');
    matched.push(withDay.text);
  } else if (bare) {
    date = bare.date;
    matched.push(bare.matched);
  }
  if (withTime && withTime !== withDay) {
    const t = withTime.start.date();
    date = date ?? t;
    date = new Date(date.getFullYear(), date.getMonth(), date.getDate(), t.getHours(), t.getMinutes());
    hasTime = true;
    matched.push(withTime.text);
  }
  if (!date) return null;

  // "at 3" or "4:30" with no am/pm almost always means the afternoon.
  const timeText = (withTime ?? withDay)?.text ?? '';
  if ((opts.afternoonGuess ?? true) && hasTime && !/\b(?:am|pm|a\.m\.|p\.m\.)\b|\b(?:morning|evening|tonight|noon|midnight)\b/i.test(timeText)) {
    const h = date.getHours();
    if (h >= 1 && h <= 7) date = new Date(date.getTime() + 12 * 3_600_000);
  }
  return { date, hasTime, matched };
}

function stripDate(text: string, matched: string[]): string {
  let out = text;
  for (const m of matched) out = out.replace(m, ' ');
  // Drop words left dangling once the date is gone ("is on", "at", "by").
  out = out.replace(/\s+/g, ' ').trim();
  let prev = '';
  while (prev !== out) {
    prev = out;
    out = out.replace(/(?:\s|^)(?:is|are|on|at|by|the|for|will be|be|scheduled)\s*$/i, '').replace(/[\s,.;:–-]+$/, '').trim();
  }
  return out;
}

const capitalize = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function segments(text: string): string[] {
  return text
    .replace(/([.;!?])\s+(?=[A-Z0-9\-*•[])/g, '$1\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseNote(text: string, context: { logTitle?: string; ref?: Date } = {}): NoteItem[] {
  const ref = context.ref ?? new Date();
  return segments(text).map((line): NoteItem => {
    // Alarms first: a time with alarm wording. Alarm times aren't nudged to the afternoon ("alarm 6:30" is 6:30 am),
    // and a time already gone today means tomorrow.
    if (ALARM_CUE.test(line)) {
      const when = findDate(line, ref, { afternoonGuess: false });
      if (when?.hasTime) {
        let at = when.date;
        while (at.getTime() <= ref.getTime()) at = new Date(at.getTime() + 24 * 3_600_000);
        const label = stripDate(line, when.matched).replace(ALARM_WORDS, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:the|my)\s+/i, '');
        return { kind: 'alarm', line, title: label ? capitalize(label) : /wake/i.test(line) ? 'Wake up' : 'Alarm', at };
      }
    }

    const found = findDate(line, ref);
    // Decide where the line belongs:
    //  1. Explicit to-do wording → reminder, even with a time ("remind me to take meds at 9pm").
    //  2. Starts with an action → reminder, due on any date mentioned ("call mom Oct 3"),
    //     unless it's a meeting with someone ("call with Priya Friday 3pm").
    //  3. A date still ahead → calendar event; all-day when no time ("Mom's birthday on the 12th").
    //     Past or same-day dates without a time ("felt better today") are reflection, not plans.
    //  4. Otherwise it's a note.
    const explicitTask = TASK_PREFIX.test(line) || TASK_CUE.test(line);
    const meetingWithSomeone = MEETING_WORDS.test(line) && (/\bwith\b/i.test(line) || !IMPERATIVE.test(line));
    const isTask = explicitTask || (IMPERATIVE.test(line) && !meetingWithSomeone);
    const ahead =
      !!found &&
      (found.hasTime
        ? found.date.getTime() > ref.getTime() - 5 * 60_000
        : new Date(found.date).setHours(0, 0, 0, 0) > new Date(ref).setHours(0, 0, 0, 0));

    if (isTask) {
      const body = found ? stripDate(line, found.matched) : line;
      const cleaned = body
        .replace(TASK_PREFIX, '')
        .replace(/^(?:i\s+|we\s+)?(?:need to|needs to|have to|has to|must|remember to|remind me(?: to)?|don'?t forget(?: to)?|should|gotta)\s+/i, '')
        .replace(/^[-*•]\s*/, '')
        .trim();
      return { kind: 'task', line, text: capitalize(cleaned || body), due: found?.date, dueHasTime: found?.hasTime ?? false };
    }

    if (found && ahead) {
      const rest = stripDate(line, found.matched).replace(/^(?:next|our|my|the)\s+/i, '');
      // "next meet is on 26" inside a "1:1 with James" log → the event is the next one of those.
      const title =
        context.logTitle && (rest === '' || (MEETING_WORDS.test(rest) && rest.split(' ').length <= 4))
          ? context.logTitle
          : capitalize(rest) || context.logTitle || 'Event';
      return { kind: 'event', line, title, start: found.date, allDay: !found.hasTime };
    }

    return { kind: 'note', line };
  });
}

export type NoteDestination = 'Reminders' | 'Calendar' | 'Notes' | 'Alarm';

/** Example lines shown under note fields, each paired with where it will go. Keep in step with `parseNote`. */
export const NOTE_EXAMPLES: { text: string; goesTo: NoteDestination }[] = [
  { text: 'Remind me to call mom at 6pm', goesTo: 'Reminders' },
  { text: 'Next meet with James on the 26th at 3pm', goesTo: 'Calendar' },
  { text: 'Felt calmer after the walk', goesTo: 'Notes' },
  { text: 'Wake me up at 6:30am', goesTo: 'Alarm' },
  { text: 'Need to send the Q3 deck by Friday', goesTo: 'Reminders' },
  { text: 'Mom’s birthday on the 12th', goesTo: 'Calendar' },
  { text: 'James seemed stressed about the launch', goesTo: 'Notes' },
  { text: '- [ ] Book a room for the offsite', goesTo: 'Reminders' },
  { text: 'Lunch with Priya next Tuesday 1pm', goesTo: 'Calendar' },
  { text: 'Buy flowers for Sam', goesTo: 'Reminders' },
  { text: 'Alarm 5:45 for the gym', goesTo: 'Alarm' },
  { text: 'Dentist tomorrow at 4:30pm', goesTo: 'Calendar' },
];
