import type {
  AIDifficulty,
  CueStyleId,
  EnvironmentId,
  TableClothId,
  TableSurfaceStyleId,
} from './types.ts';

// 9-Foot Tournament Pool Table dimensions (meters, centered at origin)
// Playing surface inside cushion noses: 2.54m (X) x 1.27m (Z)
export const TABLE_LENGTH = 2.54;
export const TABLE_WIDTH = 1.27;
export const HALF_LENGTH = TABLE_LENGTH / 2; // 1.27m
export const HALF_WIDTH = TABLE_WIDTH / 2; // 0.635m

// Standard 2.25" pool ball: diameter 57.15mm -> radius 0.028575m
export const BALL_RADIUS = 0.028575;
export const BALL_DIAMETER = BALL_RADIUS * 2;
export const BALL_MASS = 0.17; // 170g

// Table height from floor (y=0) to slate playing surface
export const SLATE_Y = 0.78;
export const BALL_REST_Y = SLATE_Y + BALL_RADIUS;

// Cushion and Pocket geometry
export const CUSHION_HEIGHT = 0.0365;
export const RAIL_WIDTH = 0.145;
export const FRAME_HEIGHT = 0.16;

// Pocket centers slightly recessed into the rail corners & sides
export const CORNER_POCKET_OFFSET = 0.012;
export const SIDE_POCKET_OFFSET = 0.024;
export const CORNER_POCKET_CAPTURE_RADIUS = 0.062;
export const SIDE_POCKET_CAPTURE_RADIUS = 0.064;

export interface PocketDef {
  index: number;
  x: number;
  z: number;
  radius: number;
  isCorner: boolean;
}

export const POCKETS: PocketDef[] = [
  { index: 0, x: -HALF_LENGTH - CORNER_POCKET_OFFSET, z: -HALF_WIDTH - CORNER_POCKET_OFFSET, radius: CORNER_POCKET_CAPTURE_RADIUS, isCorner: true },
  { index: 1, x: 0, z: -HALF_WIDTH - SIDE_POCKET_OFFSET, radius: SIDE_POCKET_CAPTURE_RADIUS, isCorner: false },
  { index: 2, x: HALF_LENGTH + CORNER_POCKET_OFFSET, z: -HALF_WIDTH - CORNER_POCKET_OFFSET, radius: CORNER_POCKET_CAPTURE_RADIUS, isCorner: true },
  { index: 3, x: -HALF_LENGTH - CORNER_POCKET_OFFSET, z: HALF_WIDTH + CORNER_POCKET_OFFSET, radius: CORNER_POCKET_CAPTURE_RADIUS, isCorner: true },
  { index: 4, x: 0, z: HALF_WIDTH + SIDE_POCKET_OFFSET, radius: SIDE_POCKET_CAPTURE_RADIUS, isCorner: false },
  { index: 5, x: HALF_LENGTH + CORNER_POCKET_OFFSET, z: HALF_WIDTH + CORNER_POCKET_OFFSET, radius: CORNER_POCKET_CAPTURE_RADIUS, isCorner: true },
];

// Head string (break line) at -0.635m (1/4 table from left end), Foot spot at +0.635m
export const HEAD_STRING_X = -HALF_LENGTH / 2;
export const FOOT_SPOT_X = HALF_LENGTH / 2;

// Physics constants
export const FIXED_DT = 1 / 120;
export const MAX_SHOT_SPEED = 8.4; // m/s (strong pro break shot)
export const MIN_SHOT_SPEED = 0.38; // m/s

export const BALL_COLORS: Record<number, { hex: string; name: string; isStripe: boolean }> = {
  0: { hex: '#F7F3E8', name: 'Cue Ball', isStripe: false },
  1: { hex: '#EAB308', name: '1 Yellow', isStripe: false },
  2: { hex: '#2563EB', name: '2 Blue', isStripe: false },
  3: { hex: '#DC2626', name: '3 Red', isStripe: false },
  4: { hex: '#7C3AED', name: '4 Purple', isStripe: false },
  5: { hex: '#EA580C', name: '5 Orange', isStripe: false },
  6: { hex: '#15803D', name: '6 Green', isStripe: false },
  7: { hex: '#7F1D1D', name: '7 Maroon', isStripe: false },
  8: { hex: '#141517', name: '8 Black', isStripe: false },
  9: { hex: '#EAB308', name: '9 Yellow Stripe', isStripe: true },
  10: { hex: '#2563EB', name: '10 Blue Stripe', isStripe: true },
  11: { hex: '#DC2626', name: '11 Red Stripe', isStripe: true },
  12: { hex: '#7C3AED', name: '12 Purple Stripe', isStripe: true },
  13: { hex: '#EA580C', name: '13 Orange Stripe', isStripe: true },
  14: { hex: '#15803D', name: '14 Green Stripe', isStripe: true },
  15: { hex: '#7F1D1D', name: '15 Maroon Stripe', isStripe: true },
};

export const TABLE_CLOTHS: Record<
  TableClothId,
  { name: string; clothColor: string; cushionColor: string; woodColor: string; accentColor: string }
> = {
  emerald: {
    name: 'Classic Emerald',
    clothColor: '#0E5B3A',
    cushionColor: '#0B4D31',
    woodColor: '#4A2511',
    accentColor: '#D4AF37',
  },
  tournament_blue: {
    name: 'Championship Blue',
    clothColor: '#164E78',
    cushionColor: '#124063',
    woodColor: '#2B1B12',
    accentColor: '#C9D1D9',
  },
  burgundy: {
    name: 'Royal Burgundy',
    clothColor: '#5F1622',
    cushionColor: '#4B111B',
    woodColor: '#3B2316',
    accentColor: '#D4AF37',
  },
  obsidian: {
    name: 'Carbon Obsidian',
    clothColor: '#1E242B',
    cushionColor: '#171C22',
    woodColor: '#141619',
    accentColor: '#10B981',
  },
};

export interface TableSurfaceStyleDef {
  id: TableSurfaceStyleId;
  name: string;
  description: string;
  clothFrictionMultiplier: number;
  cushionElasticityMultiplier: number;
}

export const TABLE_SURFACE_STYLES: Record<TableSurfaceStyleId, TableSurfaceStyleDef> = {
  tournament: {
    id: 'tournament',
    name: 'Professional Tournament',
    description: 'Fast worsted wool cloth & lively tournament rubber rails',
    clothFrictionMultiplier: 0.84,
    cushionElasticityMultiplier: 1.08,
  },
  club: {
    id: 'club',
    name: 'Club Table',
    description: 'Classic napped club felt & balanced commercial cushions',
    clothFrictionMultiplier: 1.24,
    cushionElasticityMultiplier: 0.88,
  },
  vintage: {
    id: 'vintage',
    name: 'Vintage Baize',
    description: 'Heavy high-nap pub baize & softer cushioned rebound',
    clothFrictionMultiplier: 1.5,
    cushionElasticityMultiplier: 0.78,
  },
};

export const CUE_STYLES: Record<
  CueStyleId,
  {
    name: string;
    shaftColor: string;
    buttColor: string;
    wrapColor: string;
    inlayColor: string;
    powerBonus: number;
    controlLabel: string;
  }
> = {
  maple_classic: {
    name: 'Heritage Maple',
    shaftColor: '#E5C69B',
    buttColor: '#5C2B18',
    wrapColor: '#1C1A19',
    inlayColor: '#E2D4B7',
    powerBonus: 1.0,
    controlLabel: 'Balanced Tour Taper',
  },
  ebony_pro: {
    name: 'Ebony Master',
    shaftColor: '#EAD5B5',
    buttColor: '#18181B',
    wrapColor: '#27272A',
    inlayColor: '#D4AF37',
    powerBonus: 1.02,
    controlLabel: 'Low-Deflection Pro',
  },
  emerald_carbon: {
    name: 'Nexorum Carbon',
    shaftColor: '#262B30',
    buttColor: '#111615',
    wrapColor: '#064E3B',
    inlayColor: '#10B981',
    powerBonus: 1.05,
    controlLabel: 'Carbon Fiber Break/Play',
  },
  gold_imperial: {
    name: 'Imperial Brass',
    shaftColor: '#ECD8B8',
    buttColor: '#3D1E12',
    wrapColor: '#5C1B1B',
    inlayColor: '#EAB308',
    powerBonus: 1.04,
    controlLabel: 'Signature Inlaid Cue',
  },
};

export const ENVIRONMENTS: Record<
  EnvironmentId,
  {
    name: string;
    subtitle: string;
    bgHex: string;
    fogHex: string;
    fogDensity: number;
    keyColor: string;
    keyIntensity: number;
    hemiSky: string;
    hemiGround: string;
    hemiIntensity: number;
    floorColor: string;
    wallColor: string;
    accentHex: string;
  }
> = {
  classic_club: {
    name: 'Classic Billiard Club',
    subtitle: 'Warm mahogany hall with brass pendant lighting',
    bgHex: '#100C09',
    fogHex: '#100C09',
    fogDensity: 0.055,
    keyColor: '#FFE8C2',
    keyIntensity: 2.4,
    hemiSky: '#8DA4B8',
    hemiGround: '#2D1A10',
    hemiIntensity: 0.65,
    floorColor: '#24150E',
    wallColor: '#1C130E',
    accentHex: '#D4AF37',
  },
  luxury_lounge: {
    name: 'Luxury Billiard Lounge',
    subtitle: 'Architectural slate lounge with champagne glow',
    bgHex: '#0C0F12',
    fogHex: '#0C0F12',
    fogDensity: 0.05,
    keyColor: '#FFF1DB',
    keyIntensity: 2.3,
    hemiSky: '#A3B8CC',
    hemiGround: '#1B1F24',
    hemiIntensity: 0.72,
    floorColor: '#14171A',
    wallColor: '#1A1F24',
    accentHex: '#E5C384',
  },
  championship_arena: {
    name: 'Championship Arena',
    subtitle: 'Broadcast-lit tournament center stage',
    bgHex: '#070B10',
    fogHex: '#070B10',
    fogDensity: 0.045,
    keyColor: '#F5FAFF',
    keyIntensity: 2.7,
    hemiSky: '#9DC4EB',
    hemiGround: '#101924',
    hemiIntensity: 0.7,
    floorColor: '#0E141B',
    wallColor: '#121A24',
    accentHex: '#38BDF8',
  },
  neon_room: {
    name: 'Futuristic Neon Room',
    subtitle: 'Obsidian studio with precision emerald light strips',
    bgHex: '#060A09',
    fogHex: '#060A09',
    fogDensity: 0.05,
    keyColor: '#E6FFF7',
    keyIntensity: 2.3,
    hemiSky: '#6EE7B7',
    hemiGround: '#0A1311',
    hemiIntensity: 0.68,
    floorColor: '#0B100F',
    wallColor: '#0E1514',
    accentHex: '#10B981',
  },
};

export const AI_DIFFICULTIES: Record<
  AIDifficulty,
  {
    label: string;
    angleJitterDeg: number;
    powerJitter: number;
    comboSkill: number;
    safetySkill: number;
    thinkMs: number;
  }
> = {
  beginner: {
    label: 'Beginner',
    angleJitterDeg: 4.8,
    powerJitter: 0.18,
    comboSkill: 0.0,
    safetySkill: 0.0,
    thinkMs: 900,
  },
  easy: {
    label: 'Easy',
    angleJitterDeg: 2.6,
    powerJitter: 0.12,
    comboSkill: 0.2,
    safetySkill: 0.1,
    thinkMs: 1000,
  },
  medium: {
    label: 'Medium',
    angleJitterDeg: 1.35,
    powerJitter: 0.07,
    comboSkill: 0.5,
    safetySkill: 0.45,
    thinkMs: 1100,
  },
  hard: {
    label: 'Hard',
    angleJitterDeg: 0.55,
    powerJitter: 0.04,
    comboSkill: 0.8,
    safetySkill: 0.8,
    thinkMs: 1200,
  },
  professional: {
    label: 'Professional',
    angleJitterDeg: 0.18,
    powerJitter: 0.02,
    comboSkill: 1.0,
    safetySkill: 1.0,
    thinkMs: 1300,
  },
};

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  xpReward: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_pot', title: 'First Drop', description: 'Pocket your first object ball.', xpReward: 50 },
  { id: 'break_pot', title: 'Opening Thunder', description: 'Pocket a ball cleanly on the break shot.', xpReward: 100 },
  { id: 'first_win', title: 'Rack Winner', description: 'Win your first full match.', xpReward: 150 },
  { id: 'nine_ball_gold', title: 'Nine-Ball Tactician', description: 'Win a 9-Ball match.', xpReward: 200 },
  { id: 'pro_slayer', title: 'Master of the Felt', description: 'Defeat the Hard or Professional AI.', xpReward: 350 },
  { id: 'practice_streak_5', title: 'Rhythm & Cue', description: 'Sink 5 consecutive balls in Practice mode.', xpReward: 120 },
  { id: 'online_victor', title: 'Club Contender', description: 'Win an online multiplayer match.', xpReward: 300 },
  { id: 'veteran_10', title: 'Seasoned Cueist', description: 'Complete 10 matches across any mode.', xpReward: 250 },
  { id: 'daily_victor', title: 'Daily Challenger', description: 'Complete a Daily Challenge scenario.', xpReward: 150 },
  { id: 'daily_streak_3', title: 'Three-Day Precision', description: 'Complete Daily Challenges on 3 consecutive days.', xpReward: 300 },
];
