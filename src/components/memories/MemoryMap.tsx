import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import type { SpatialNode } from '../../domain/memoryTypes';
import { radii, useTheme } from '../../theme';

export interface MemoryMapProps {
  path: { latitude: number; longitude: number }[];
  nodes: Pick<SpatialNode, 'id' | 'latitude' | 'longitude' | 'placeName' | 'isHome'>[];
  height?: number;
  interactive?: boolean;
}

/** The day's route on Apple Maps, with a pin at each place you stayed (home stays unpinned). */
export function MemoryMap({ path, nodes, height = 260, interactive = true }: MemoryMapProps) {
  const { colors, scheme } = useTheme();
  const pins = nodes.filter((n) => !n.isHome);

  const region = useMemo(() => {
    const coords = [...path, ...pins.map((n) => ({ latitude: n.latitude, longitude: n.longitude }))];
    if (!coords.length) return undefined;
    const lats = coords.map((c) => c.latitude);
    const lons = coords.map((c) => c.longitude);
    const [minLat, maxLat, minLon, maxLon] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.max((maxLat - minLat) * 1.4, 0.01),
      longitudeDelta: Math.max((maxLon - minLon) * 1.4, 0.01),
    };
  }, [path, pins]);

  if (!region) return null;
  return (
    <View style={[styles.wrap, { height, borderColor: colors.borderSubtle }]}>
      <MapView
        style={StyleSheet.absoluteFill}
        initialRegion={region}
        userInterfaceStyle={scheme}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        showsPointsOfInterests
        accessibilityLabel={`Map of the day, ${pins.length} place${pins.length === 1 ? '' : 's'}`}
      >
        {path.length > 1 && <Polyline coordinates={path} strokeColor={colors.memory.accentPin} strokeWidth={3} lineCap="round" lineJoin="round" />}
        {pins.map((n) => (
          <Marker key={n.id} coordinate={{ latitude: n.latitude, longitude: n.longitude }} title={n.placeName} pinColor={colors.memory.accentPin} />
        ))}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.card,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
