import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { ActivityIndicator, Linking, StyleSheet, TextInput, View } from 'react-native';

import { dwellLabel } from '../../domain/narrative';
import { connectWhoop, disconnectWhoop, saveWhoopApp, WHOOP_REDIRECT, type WhoopSnapshot } from '../../services/health/whoop';
import { radii, spacing, typography, useTheme } from '../../theme';
import { haptics } from '../../utils/haptics';
import { Button, Card, Chip, PressableScale, Text } from '../primitives';
import { ScoreRing } from './ScoreRing';
import { StageBar } from './StageBar';

const clock = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** Step-by-step: make a WHOOP developer app, paste its keys, sign in. */
function ConnectWhoop({ status, onConnected }: { status: 'none' | 'app'; onConnected: () => void }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(status === 'app');
  const [clientId, setClientId] = useState('');
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const input = [typography.body, styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle, backgroundColor: colors.bgSurface }];

  const connect = async () => {
    setProblem(null);
    setBusy(true);
    try {
      if (clientId.trim() && secret.trim()) await saveWhoopApp(clientId, secret);
      const r = await connectWhoop();
      if (r.ok) {
        haptics.success();
        onConnected();
      } else setProblem(r.reason);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <Card style={styles.gap}>
        <Text variant="bodyMedium">Get live numbers from WHOOP</Text>
        <Text variant="body" tone="secondary">
          Connect your WHOOP account for its exact Recovery, Strain and Sleep, updated while this page is open.
        </Text>
        <Button label="Connect WHOOP" onPress={() => setOpen(true)} />
      </Card>
    );
  }

  return (
    <Card style={styles.gap}>
      <Text variant="bodyMedium">Connect WHOOP</Text>
      <Text variant="body" tone="secondary">
        WHOOP only lets registered apps read your data, so make a free one for yourself (2 minutes, once):
      </Text>
      <Text variant="body">1. Open the WHOOP developer dashboard and sign in with your WHOOP account.</Text>
      <Button label="Open developer-dashboard.whoop.com" variant="secondary" onPress={() => Linking.openURL('https://developer-dashboard.whoop.com')} />
      <Text variant="body">2. Create an app. Tick every scope, and add this Redirect URL:</Text>
      <PressableScale
        onPress={async () => {
          await Clipboard.setStringAsync(WHOOP_REDIRECT);
          setCopied(true);
        }}
        accessibilityLabel="Copy redirect URL"
        style={[styles.code, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}
      >
        <Text variant="bodyMedium">{WHOOP_REDIRECT}</Text>
        <Text variant="caption" tone={copied ? 'calm' : 'focus'}>
          {copied ? 'Copied ✓' : 'Copy'}
        </Text>
      </PressableScale>
      <Text variant="body">3. Paste the app’s Client ID and Client Secret here:</Text>
      <TextInput value={clientId} onChangeText={setClientId} placeholder="Client ID" placeholderTextColor={colors.textSecondary} autoCapitalize="none" autoCorrect={false} style={input} />
      <TextInput value={secret} onChangeText={setSecret} placeholder="Client Secret" placeholderTextColor={colors.textSecondary} autoCapitalize="none" autoCorrect={false} secureTextEntry style={input} />
      <Text variant="caption" tone="secondary">
        Kept in this iPhone’s Keychain. Self Mirror only reads from WHOOP.
      </Text>
      {busy ? (
        <ActivityIndicator color={colors.textSecondary} />
      ) : (
        <Button label="4. Sign in to WHOOP" disabled={status === 'none' && (!clientId.trim() || !secret.trim())} onPress={connect} />
      )}
      {problem && (
        <Text variant="caption" tone="stressLow">
          {problem}
        </Text>
      )}
    </Card>
  );
}

/** WHOOP's own numbers, live: recovery, strain, sleep, vitals and today's workouts. */
export function WhoopPanel({
  status,
  data,
  error,
  onChange,
  strainLog = [],
}: {
  status: 'loading' | 'none' | 'app' | 'connected';
  data: WhoopSnapshot | null;
  error: string | null;
  onChange: () => void;
  strainLog?: { t: number; strain: number }[];
}) {
  const { colors } = useTheme();
  if (status === 'loading') return null;
  if (status !== 'connected') return <ConnectWhoop status={status} onConnected={onChange} />;
  if (!data) return <ActivityIndicator color={colors.textSecondary} />;

  const r = data.recovery;
  const recoveryColor = !r ? colors.state.neutral : r.score >= 67 ? colors.state.calm : r.score >= 34 ? colors.state.energy : colors.state.stressHigh;
  const s = data.sleep;
  const asleep = s ? s.light + s.deep + s.rem : 0;

  return (
    <View style={styles.gap}>
      <View style={styles.row}>
        <View style={[styles.liveDot, { backgroundColor: error ? colors.state.stressLow : colors.state.calm }]} />
        <Text variant="caption" tone="secondary" style={styles.flex}>
          {error ? error : `Live from WHOOP${data.firstName ? ` · ${data.firstName}` : ''} · updated ${clock(data.fetchedAt)}`}
        </Text>
        <PressableScale
          onPress={async () => {
            await disconnectWhoop();
            onChange();
          }}
          hitSlop={8}
          accessibilityLabel="Disconnect WHOOP"
        >
          <Text variant="caption" tone="secondary">
            Disconnect
          </Text>
        </PressableScale>
      </View>

      <Card style={styles.rings}>
        {r && <ScoreRing fraction={r.score / 100} color={recoveryColor} value={`${r.score}%`} label={r.calibrating ? 'Recovery (calibrating)' : 'Recovery'} />}
        {data.cycle && <ScoreRing fraction={data.cycle.strain / 21} color={colors.state.focus} value={data.cycle.strain.toFixed(1)} label="Day strain" />}
        {s?.performance !== undefined && <ScoreRing fraction={s.performance / 100} color={colors.memory.vibeSocial} value={`${Math.round(s.performance)}%`} label="Sleep" />}
      </Card>

      {strainLog.length >= 2 && (
        <Text variant="caption" tone="secondary">
          Strain is live: {strainLog[0].strain.toFixed(1)} → {strainLog[strainLog.length - 1].strain.toFixed(1)} since{' '}
          {new Date(strainLog[0].t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
        </Text>
      )}

      {r && (
        <Card style={styles.grid}>
          <Stat label="HRV" value={`${r.hrvMs} ms`} />
          <Stat label="Resting HR" value={`${r.restingHr} bpm`} />
          {r.spo2 !== undefined && <Stat label="Blood oxygen" value={`${r.spo2.toFixed(1)}%`} />}
          {r.skinTempC !== undefined && <Stat label="Skin temp" value={`${r.skinTempC.toFixed(1)}°C`} />}
          {s?.respiratoryRate !== undefined && <Stat label="Respiratory" value={`${s.respiratoryRate.toFixed(1)} rpm`} />}
          {data.cycle && <Stat label="Calories" value={`${Math.round(data.cycle.kilojoule / 4.184)} kcal`} />}
          {data.cycle && <Stat label="Avg / max HR" value={`${data.cycle.averageHr} / ${data.cycle.maxHr}`} />}
        </Card>
      )}

      {s && (
        <Card style={styles.gap}>
          <Text variant="caption" tone="secondary">
            Last night · {clock(s.start)} – {clock(s.end)}
          </Text>
          <Text variant="sectionTitle">
            {dwellLabel(asleep)} asleep{s.needMin ? <Text variant="caption" tone="secondary">{` of ${dwellLabel(s.needMin)} needed`}</Text> : null}
          </Text>
          <StageBar label="Awake" minutes={s.awake} total={s.inBed} color={colors.state.stressLow} />
          <StageBar label="REM" minutes={s.rem} total={s.inBed} color={colors.memory.vibeSocial} />
          <StageBar label="Light" minutes={s.light} total={s.inBed} color={colors.state.focus} />
          <StageBar label="Deep (SWS)" minutes={s.deep} total={s.inBed} color={colors.state.calm} />
          <View style={styles.chips}>
            {s.efficiency !== undefined && <Chip label={`Efficiency ${Math.round(s.efficiency)}%`} color={colors.state.neutral} />}
            {s.consistency !== undefined && <Chip label={`Consistency ${Math.round(s.consistency)}%`} color={colors.state.neutral} />}
            {s.disturbances !== undefined && <Chip label={`${s.disturbances} disturbances`} color={colors.state.neutral} />}
          </View>
        </Card>
      )}

      {data.workouts.length > 0 && (
        <Card style={styles.gap}>
          <Text variant="caption" tone="secondary">
            Recent workouts
          </Text>
          {data.workouts.slice(0, 4).map((w) => (
            <View key={w.start} style={styles.row}>
              <Text variant="body" style={styles.flex}>
                {w.sport.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())}
              </Text>
              <Text variant="caption" tone="secondary">
                {new Date(w.start).toLocaleDateString(undefined, { weekday: 'short' })} {clock(w.start)}
                {w.strain !== undefined ? ` · strain ${w.strain.toFixed(1)}` : ''}
              </Text>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="bodyMedium">{value}</Text>
      <Text variant="caption" tone="secondary">
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gap: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  rings: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.md,
  },
  stat: {
    width: '33%',
    gap: 2,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xxs,
  },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: radii.chip,
    paddingHorizontal: spacing.sm,
  },
  code: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm,
    borderRadius: radii.chip,
    borderWidth: 1,
  },
});
