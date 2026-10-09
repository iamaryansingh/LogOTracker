import { useRef, useState, type ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InputSourceCard } from '../components/composite/InputSourceCard';
import { Button, Card, Text } from '../components/primitives';
import { INPUT_SOURCES } from '../data/inputSources';
import { useAppStore } from '../state/AppStore';
import { screenPadding, spacing, useTheme } from '../theme';
import { haptics } from '../utils/haptics';

function Page({ width, children }: { width: number; children: ReactNode }) {
  return <View style={[styles.page, { width }]}>{children}</View>;
}

function Title({ eyebrow, title, body }: { eyebrow: string; title: string; body: string }) {
  return (
    <View style={styles.titleBlock}>
      <Text variant="caption" tone="secondary">
        {eyebrow}
      </Text>
      <Text variant="headerLarge">{title}</Text>
      <Text variant="body" tone="secondary">
        {body}
      </Text>
    </View>
  );
}

function Point({ title, body }: { title: string; body: string }) {
  return (
    <View style={styles.point}>
      <Text variant="bodyMedium">{title}</Text>
      <Text variant="body" tone="secondary">
        {body}
      </Text>
    </View>
  );
}

const PAGE_COUNT = 5;

export function OnboardingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { setOnboarded } = useAppStore();
  const scroller = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const goTo = (i: number) => {
    scroller.current?.scrollTo({ x: i * width, animated: true });
    setIndex(i);
    haptics.selection();
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setIndex(Math.round(e.nativeEvent.contentOffset.x / width));

  const finish = () => {
    haptics.success();
    setOnboarded(true);
  };

  const isLast = index === PAGE_COUNT - 1;

  return (
    <View style={[styles.screen, { backgroundColor: colors.bgSurface, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}>
      <View style={styles.topBar}>
        {!isLast && (
          <Button label="Skip" variant="ghost" style={styles.skip} onPress={() => goTo(PAGE_COUNT - 1)} />
        )}
      </View>

      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.pager}
      >
        <Page width={width}>
          <Title
            eyebrow="Welcome"
            title="A quiet mirror for your days"
            body="Self Mirror notices the shape of your day and reflects it back gently, so you can see what lifts you and what wears you down."
          />
        </Page>

        <Page width={width}>
          <Title eyebrow="How it works" title="Log in seconds, see patterns over time" body="Everything here comes from you." />
          <View style={styles.points}>
            <Point title="Log what you did" body="Work, sleep, exercise, time with people. Add how long, and how it left you." />
            <Point title="Rate your day" body="Three quick taps for energy, focus and stress." />
            <Point title="Journal on iPad" body="Write or handwrite about any entry on your iPad, then read it on your iPhone." />
            <Point title="Patterns, gently" body="After a few days, it points out what tends to lift you or wear you down." />
          </View>
        </Page>

        <Page width={width}>
          <Title
            eyebrow="Your data"
            title="Yours, and only yours"
            body="Entries and journals live on your devices and in your private iCloud. There’s no Self Mirror account or server."
          />
          <Card style={styles.promise}>
            <Text variant="body">You choose each input, and you can turn it off at any time in the Privacy Center.</Text>
            <Text variant="body">Deleting your data removes it completely, straight away.</Text>
          </Card>
        </Page>

        <Page width={width}>
          <ScrollView contentContainerStyle={styles.permissions} showsVerticalScrollIndicator={false}>
            <Title
              eyebrow="Inputs"
              title="Choose what it can learn from"
              body="All optional, and each asks your phone only when you switch it on. Motion adds your step count to Today. The rest prepare automatic suggestions, which aren't built yet."
            />
            {INPUT_SOURCES.map((info) => (
              <InputSourceCard key={info.source} info={info} showDetails={false} />
            ))}
          </ScrollView>
        </Page>

        <Page width={width}>
          <Title
            eyebrow="You’re set"
            title="Start with how you feel"
            body="Whenever you like, tap “How are you feeling?”. It takes about five seconds and helps the patterns make sense."
          />
        </Page>
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots} accessibilityLabel={`Step ${index + 1} of ${PAGE_COUNT}`}>
          {Array.from({ length: PAGE_COUNT }, (_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === index ? colors.textPrimary : colors.borderSubtle }]} />
          ))}
        </View>
        <Button label={isLast ? 'Begin' : 'Continue'} onPress={isLast ? finish : () => goTo(index + 1)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  topBar: {
    height: 44,
    paddingHorizontal: screenPadding,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  skip: {
    minHeight: 36,
    paddingHorizontal: spacing.xs,
  },
  pager: {
    flex: 1,
  },
  page: {
    paddingHorizontal: screenPadding,
    paddingTop: spacing.xl,
    gap: spacing.lg,
  },
  titleBlock: {
    gap: spacing.sm,
  },
  points: {
    gap: spacing.md,
  },
  point: {
    gap: spacing.xxs,
  },
  promise: {
    gap: spacing.sm,
  },
  permissions: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  footer: {
    paddingHorizontal: screenPadding,
    gap: spacing.md,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
});
