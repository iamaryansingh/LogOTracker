export type MemoryStyle = 'GEN_Z_CASUAL' | 'POETIC_MINIMAL' | 'NARRATIVE_STORY' | 'RAW_BULLETS';
export type VibeCategory = 'Cozy' | 'Exploratory' | 'Social' | 'Reflective' | 'Focus' | 'Transit';
export type WeatherCondition = 'SUNNY' | 'RAINY' | 'CLOUDY' | 'SNOWY' | 'CLEAR_NIGHT';

/** One raw fix from background location. Compact on purpose: thousands are kept. */
export interface LocationPoint {
  t: number; // epoch ms
  lat: number;
  lon: number;
  /** Horizontal accuracy in metres, when known. */
  acc?: number;
  /** GPS speed in m/s, when the fix had one. */
  s?: number;
}

export interface SpatialNode {
  id: string;
  latitude: number;
  longitude: number;
  placeName: string; // e.g. "Pike Place Market", "Cozy Corner Café"
  arrivalTime: string; // ISO
  departureTime: string; // ISO
  dwellTimeMinutes: number;
  photoUris?: string[];
  weather?: {
    tempC: number;
    condition: WeatherCondition;
  };
  energyLevelAtTime: number; // 1–5
  vibe: VibeCategory;
  /** The user's usual overnight place. */
  isHome?: boolean;
  /** Neighbourhood or district, for day titles. */
  locality?: string;
  /** City, for naming trips. */
  city?: string;
  /** Apple Maps category of the place, e.g. "Restaurant". */
  category?: string;
  /** What you were likely doing there, e.g. "Dinner at Olive Garden". */
  activity?: { label: string; emoji: string; kind: string };
  /** Whether you were really in the place (still, tight spot) or drifting through it. */
  presence?: { inside: boolean; movingShare: number };
}

/** Where the car was left on the way to a place. */
export interface ParkedCar {
  latitude: number;
  longitude: number;
  time: string; // ISO
  /** Metres walked (straight line) from the car to the place. */
  walkM: number;
  /** The place you walked to. */
  toNodeId?: string;
  toName?: string;
  /** The parking lot or garage, when Apple Maps knows one there. */
  name?: string;
}

export interface Insight {
  emoji: string;
  text: string;
}

/** Movement between two nodes. */
export interface TransitLeg {
  fromNodeId?: string;
  toNodeId?: string;
  startTime: string;
  endTime: string;
  distanceKm: number;
  mode: 'walk' | 'run' | 'cycle' | 'drive';
  /** The pieces of a mixed trip (walk → drive → walk), in order. */
  parts?: { mode: 'walk' | 'run' | 'cycle' | 'drive'; km: number; min: number }[];
  /** Set when it's a route you take on many days (a daily walk, the commute). */
  routine?: { label: string; days: number };
}

export interface DailyMemory {
  id: string;
  date: string; // YYYY-MM-DD
  title: string; // "A Rain-Kissed Afternoon in Pike Place"
  summaryNarrative: string;
  isPinned: boolean;
  styleApplied: MemoryStyle;
  primaryVibe: VibeCategory;
  tripId?: string;
  spatialNodes: SpatialNode[];
  transit: TransitLeg[];
  /** Simplified route for the map. */
  path: { latitude: number; longitude: number }[];
  distanceKm: number;
  coverPhotoUri?: string;
  userNote?: string;
  parking?: ParkedCar[];
  insights?: Insight[];
  /** Handwritten captions under each print, by photo URI. */
  photoNotes?: Record<string, string>;
  /** Walks and runs during the day that weren't travel between places (a loop, a wander). */
  walks?: MemoryWalk[];
}

export interface MemoryWalk {
  start: string; // ISO
  end: string;
  mode: 'walk' | 'run';
  /** 0 when only Apple Health saw it (no location trail). */
  km: number;
  source: 'location' | 'health';
  routine?: { label: string; days: number };
}

export interface Trip {
  id: string;
  title: string; // "Seattle Weekend Getaway"
  startDate: string; // YYYY-MM-DD
  endDate: string;
  coverPhotoUri?: string;
  dailyMemories: DailyMemory[];
}

/** What the user can change on a memory; everything else is generated. */
export interface MemoryOverride {
  isPinned?: boolean;
  userNote?: string;
  title?: string;
  style?: MemoryStyle;
  /** Handwritten captions under each print, by photo URI. */
  photoNotes?: Record<string, string>;
  /** Fixes to the day's timeline, by step key. */
  steps?: Record<string, StepOverride>;
}

/** A place a memory is pinned to: from a photo's location, a dropped pin, or somewhere you've been. */
export interface MemoryPlace {
  name: string;
  latitude: number;
  longitude: number;
  locality?: string;
  city?: string;
}

/** One step of a live memory, shown as a post-it in its timeline. */
export interface MemoryChapter {
  id: string;
  kind: 'stop' | 'parked' | 'move';
  start: string; // ISO
  end?: string;
  title: string;
  emoji: string;
  detail?: string;
  place?: MemoryPlace;
  category?: string;
  dwellMin?: number;
  /** Photo references (library URIs or stored file names). */
  photos?: string[];
  /** Moves: how you got around, and how far. */
  mode?: 'walk' | 'run' | 'cycle' | 'drive' | 'transit';
  km?: number;
  /** The user corrected this step; it's kept as they wrote it. */
  edited?: boolean;
}

/** A correction to one step of a day memory's timeline (a place, a move, a parking spot, a walk). */
export interface StepOverride {
  title?: string;
  emoji?: string;
  detail?: string;
  place?: MemoryPlace;
  mode?: 'walk' | 'run' | 'cycle' | 'drive' | 'transit';
  hidden?: boolean;
}

/** A memory the user made themselves from photos and a place, alongside the live daily ones. */
export interface CustomMemory {
  id: string;
  date: string; // YYYY-MM-DD
  /** When the moment happened, from the photos when they know. */
  takenAt?: string;
  title: string;
  caption: string;
  note?: string;
  /** File names in the app's own memories folder. */
  photos: string[];
  place?: MemoryPlace;
  vibe: VibeCategory;
  /** What Apple Vision saw in the photos, e.g. "beach", "food". */
  labels?: string[];
  /** "live" when recorded with Start/End; otherwise made by hand. */
  kind?: 'made' | 'live';
  startedAt?: string;
  endedAt?: string;
  /** Live memories: the stops, parking and moves in order. */
  chapters?: MemoryChapter[];
  insights?: Insight[];
  path?: { latitude: number; longitude: number }[];
  distanceKm?: number;
  /** Handwritten captions under each print, by photo reference. */
  photoNotes?: Record<string, string>;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
}
