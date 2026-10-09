import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  createActivity,
  DOMAINS,
  domainDefaultTitle,
  durationHours,
  flowForOutcome,
  flowOf,
  outcomeOf,
  type EnergyFlow,
  OUTCOMES,
  type Outcome,
} from '../../domain/events';
import { acceptedItems, parseNote } from '../../domain/notes';
import type { DomainCategory, SignalEvent } from '../../domain/types';
import { useNoteActions } from '../../services/noteActions';
import { radii, screenPadding, spacing, typography, useTheme, type StateToken } from '../../theme';
import { haptics } from '../../utils/haptics';
import { formatClock, formatHours, fromISODate, toISODate } from '../../utils/time';
import { Button, PressableScale, SegmentedTabs, SelectablePill, Text } from '../primitives';
import { NoteHints } from './NoteHints';
import { VoiceButton } from './VoiceButton';
import { NoteSuggestions } from './NoteSuggestions';

const DURATION_PRESETS = [5, 10, 15, 30, 60, 120, 240, 480];
const STEP_MINUTES = 5;
const MIN_MINUTES = 1;
const MAX_MINUTES = 16 * 60;

const FLOWS = ['PRODUCER', 'NEUTRAL', 'CONSUMER'] as const satisfies readonly EnergyFlow[];
const flowLabels: Record<EnergyFlow, string> = { PRODUCER: 'Gave energy', NEUTRAL: 'Neutral', CONSUMER: 'Took energy' };

const outcomeToken: Record<Outcome, StateToken> = {
  Energized: 'energy',
  Focused: 'focus',
  Calm: 'calm',
  Neutral: 'neutral',
  Drained: 'stressLow',
  Stressed: 'stressLow',
  Overwhelmed: 'stressHigh',
};

export interface LogTarget {
  /** YYYY-MM-DD the new entry belongs to; defaults to today. */
  day?: string;
  /** Entry being edited. */
  event?: SignalEvent;
}

function initialForm({ day, event }: LogTarget) {
  if (event) {
    return {
      domain: event.domain,
      title: event.title === domainDefaultTitle[event.domain] ? '' : event.title,
      start: new Date(event.timestampStart),
      minutes: Math.max(MIN_MINUTES, Math.round(durationHours(event) * 60)),
      outcome: outcomeOf(event) as Outcome | null,
      flow: flowOf(event) as EnergyFlow | null,
      note: event.note ?? '',
    };
  }
  const minutes = 60;
  const isToday = !day || day === toISODate(new Date());
  // Today: an activity that just finished. Earlier days: a mid-morning placeholder to adjust.
  const start = isToday ? new Date(Date.now() - minutes * 60_000) : new Date(fromISODate(day ?? toISODate(new Date())).setHours(9, 0, 0, 0));
  return { domain: 'Work' as DomainCategory, title: '', start, minutes, outcome: null as Outcome | null, flow: null as EnergyFlow | null, note: '' };
}

export function LogActivityForm({ target, onDone }: { target: LogTarget; onDone: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const commitNote = useNoteActions();
  const [form, setForm] = useState(() => initialForm(target));
  const [off, setOff] = useState<Set<string>>(new Set());
  const [customOpen, setCustomOpen] = useState(() => !DURATION_PRESETS.includes(form.minutes));
  // Until the user picks one, the flow follows the outcome (a draining activity is a consumer).
  const flow: EnergyFlow = form.flow ?? (form.outcome ? flowForOutcome(form.outcome) : 'NEUTRAL');
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const isSleep = form.domain === 'Sleep';
  const end = new Date(form.start.getTime() + form.minutes * 60_000);

  const update = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  const pickDomain = (domain: DomainCategory) => {
    if (domain === 'Sleep' && !target.event) {
      // Sleep defaults to a night ending at 07:00 on the chosen day.
      const wake = new Date(fromISODate(target.day ?? toISODate(new Date())).setHours(7, 0, 0, 0));
      update({ domain, minutes: 480, start: new Date(wake.getTime() - 480 * 60_000) });
    } else {
      update({ domain });
    }
  };

  // For sleep the anchor is wake-up time, so changing duration moves bedtime, not wake time.
  const setMinutes = (minutes: number) => {
    const m = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(minutes)));
    if (isSleep) update({ minutes: m, start: new Date(end.getTime() - m * 60_000) });
    else update({ minutes: m });
  };

  const onTime = (_: unknown, picked: Date) => {
    setShowAndroidPicker(false);
    const anchor = new Date(isSleep ? end : form.start);
    anchor.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
    update({ start: isSleep ? new Date(anchor.getTime() - form.minutes * 60_000) : anchor });
  };

  const logTitle = form.title.trim() || domainDefaultTitle[form.domain];
  const noteItems = useMemo(() => parseNote(form.note, { logTitle }), [form.note, logTitle]);

  const save = () => {
    if (!form.outcome) return;
    const entry = createActivity(
      { domain: form.domain, title: form.title, start: form.start, minutes: form.minutes, outcome: form.outcome, flow, note: form.note },
      target.event?.id,
    );
    void commitNote(
      { ...entry, links: target.event?.links },
      acceptedItems(noteItems, off),
    );
    haptics.success();
    onDone();
  };

  const pickerValue = isSleep ? end : form.start;

  return (
    <BottomSheetScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}
    >
      <Text variant="sectionTitle">{target.event ? 'Edit entry' : 'Log an activity'}</Text>

      <View style={styles.field}>
        <Text variant="caption" tone="secondary">
          What kind
        </Text>
        <View style={styles.wrap}>
          {DOMAINS.map((d) => (
            <SelectablePill key={d} label={d} selected={form.domain === d} onPress={() => pickDomain(d)} />
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <Text variant="caption" tone="secondary">
          Name (optional)
        </Text>
        <BottomSheetTextInput
          value={form.title}
          onChangeText={(title) => update({ title })}
          placeholder={domainDefaultTitle[form.domain]}
          placeholderTextColor={colors.textSecondary}
          returnKeyType="done"
          maxLength={60}
          style={[
            typography.body,
            styles.input,
            { color: colors.textPrimary, backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle },
          ]}
        />
      </View>

      <View style={styles.row}>
        <Text variant="body">{isSleep ? 'Woke up at' : 'Started at'}</Text>
        {Platform.OS === 'ios' ? (
          <DateTimePicker value={pickerValue} mode="time" display="compact" onValueChange={onTime} />
        ) : (
          <>
            <Button label={formatClock(pickerValue.toISOString())} variant="secondary" style={styles.timeButton} onPress={() => setShowAndroidPicker(true)} />
            {showAndroidPicker && (
              <DateTimePicker value={pickerValue} mode="time" onValueChange={onTime} onDismiss={() => setShowAndroidPicker(false)} />
            )}
          </>
        )}
      </View>

      <View style={styles.field}>
        <View style={styles.row}>
          <Text variant="body">How long</Text>
          <View style={styles.stepper}>
            <StepButton label="−" onPress={() => setMinutes(form.minutes - STEP_MINUTES)} />
            <Text variant="bodyMedium" style={styles.durationText}>
              {formatHours(form.minutes / 60)}
            </Text>
            <StepButton label="+" onPress={() => setMinutes(form.minutes + STEP_MINUTES)} />
          </View>
        </View>
        <View style={styles.wrap}>
          {DURATION_PRESETS.map((m) => (
            <SelectablePill
              key={m}
              label={formatHours(m / 60)}
              selected={!customOpen && form.minutes === m}
              onPress={() => {
                setCustomOpen(false);
                setMinutes(m);
              }}
            />
          ))}
          <SelectablePill label="Custom" selected={customOpen} onPress={() => setCustomOpen((o) => !o)} />
        </View>
        {customOpen && (
          <View style={styles.customRow}>
            <DurationField label="h" value={Math.floor(form.minutes / 60)} max={16} onChange={(h) => setMinutes(h * 60 + (form.minutes % 60))} />
            <DurationField label="min" value={form.minutes % 60} max={59} onChange={(m) => setMinutes(Math.floor(form.minutes / 60) * 60 + m)} />
            <Text variant="caption" tone="secondary" style={styles.customHint}>
              Any length, from 1 minute
            </Text>
          </View>
        )}
        <Text variant="caption" tone="secondary">
          {isSleep
            ? `In bed from ${formatClock(form.start.toISOString())}`
            : `${formatClock(form.start.toISOString())} – ${formatClock(end.toISOString())}`}
        </Text>
      </View>

      <View style={styles.field}>
        <Text variant="caption" tone="secondary">
          How did it leave you?
        </Text>
        <View style={styles.wrap} accessibilityRole="radiogroup">
          {OUTCOMES.map((o) => (
            <SelectablePill
              key={o}
              label={o}
              color={colors.state[outcomeToken[o]]}
              selected={form.outcome === o}
              onPress={() => update({ outcome: o })}
            />
          ))}
        </View>
      </View>

      <View style={styles.field}>
        <Text variant="caption" tone="secondary">
          Did it give you energy or take it?
        </Text>
        <SegmentedTabs options={FLOWS} value={flow} onChange={(f) => update({ flow: f })} labels={flowLabels} />
        <Text variant="caption" tone="secondary">
          {flow === 'PRODUCER'
            ? 'A producer: something that fills you up.'
            : flow === 'CONSUMER'
              ? 'A consumer: something that drains you.'
              : 'Neither gave nor took much.'}
          {form.flow === null && form.outcome ? ' Suggested from how it left you.' : ''}
        </Text>
      </View>

      <View style={styles.field}>
        <View style={styles.row}>
          <Text variant="caption" tone="secondary">
            Notes (optional)
          </Text>
          <VoiceButton value={form.note} onChange={(note) => update({ note })} />
        </View>
        <BottomSheetTextInput
          value={form.note}
          onChangeText={(note) => update({ note })}
          placeholder="What happened, what’s next…"
          placeholderTextColor={colors.textSecondary}
          multiline
          style={[
            typography.body,
            styles.input,
            styles.noteInput,
            { color: colors.textPrimary, backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle },
          ]}
        />
        <NoteHints onUse={(t) => update({ note: form.note.trim() ? `${form.note.trimEnd()}\n${t}` : t })} />
        <NoteSuggestions
          items={noteItems}
          off={off}
          handled={target.event?.links?.handledLines}
          onToggle={(line) =>
            setOff((prev) => {
              const next = new Set(prev);
              if (next.has(line)) next.delete(line);
              else next.add(line);
              return next;
            })
          }
        />
      </View>

      <Button label={form.outcome ? 'Save' : 'Pick how it left you'} disabled={!form.outcome} onPress={save} />
    </BottomSheetScrollView>
  );
}

function DurationField({ label, value, max, onChange }: { label: string; value: number; max: number; onChange: (v: number) => void }) {
  const { colors } = useTheme();
  const [text, setText] = useState(String(value));
  // Keep the field in step when the stepper or a preset changes the duration.
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setText(String(value));
  }
  return (
    <View style={styles.customField}>
      <BottomSheetTextInput
        value={text}
        onChangeText={(t) => {
          const digits = t.replace(/[^0-9]/g, '').slice(0, 2);
          setText(digits);
          const n = Math.min(max, Number(digits || 0));
          setShown(n);
          onChange(n);
        }}
        keyboardType="number-pad"
        selectTextOnFocus
        maxLength={2}
        accessibilityLabel={label === 'h' ? 'Hours' : 'Minutes'}
        style={[typography.bodyMedium, styles.customInput, { color: colors.textPrimary, backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}
      />
      <Text variant="body" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

function StepButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <PressableScale
      haptic
      pressedScale={0.9}
      onPress={onPress}
      accessibilityLabel={label === '+' ? 'Add 5 minutes' : 'Remove 5 minutes'}
      style={[styles.step, { borderColor: colors.borderSubtle, backgroundColor: colors.bgSurface }]}
    >
      <Text variant="sectionTitle">{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xs,
    gap: spacing.lg,
  },
  field: {
    gap: spacing.xs,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radii.chip,
    paddingHorizontal: spacing.sm,
  },
  customRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  customField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  customInput: {
    width: 56,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radii.chip,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  customHint: {
    flex: 1,
  },
  noteInput: {
    minHeight: 96,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  timeButton: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  durationText: {
    minWidth: 84,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  step: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
