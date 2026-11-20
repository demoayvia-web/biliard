import type { DailyChallengeDef } from './types.ts';

export function getTodayDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getPreviousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return getTodayDateKey(new Date(Date.now() - 86400000));
  }
  const prevUtc = new Date(Date.UTC(y, m - 1, d) - 86400000);
  const py = prevUtc.getUTCFullYear();
  const pm = String(prevUtc.getUTCMonth() + 1).padStart(2, '0');
  const pd = String(prevUtc.getUTCDate()).padStart(2, '0');
  return `${py}-${pm}-${pd}`;
}

export function formatDateKeyDisplay(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return dateKey;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function getMsUntilNextDay(now: Date = new Date()): number {
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(0, nextMidnight.getTime() - now.getTime());
}

export const DAILY_CHALLENGES: DailyChallengeDef[] = [
  {
    id: 'dc_back_cut_corner',
    title: 'Razor Back-Cut',
    category: 'Precision Cut',
    difficulty: 'Hard',
    description:
      'The 8-ball sits tight on the corner line with the 3-ball guarding the inside lane. Slice a crisp thin cut and hold cue ball control.',
    objectiveLabel: 'Clear both balls (#3 & #8) in 2 shots without scratching',
    hint: 'Pocket the 3-ball cleanly first with top-left spin to open a softer angle on the 8-ball.',
    maxShots: 2,
    xpReward: 240,
    initialPower: 0.62,
    balls: [
      { id: 0, x: -0.68, z: -0.18 },
      { id: 3, x: 0.36, z: -0.26 },
      { id: 8, x: 0.88, z: -0.44 },
    ],
  },
  {
    id: 'dc_cross_side_bank',
    title: 'Cross-Side Bank Shot',
    category: 'Bank & Spin',
    difficulty: 'Expert',
    description:
      'Channel classic pool-hall mastery: drive the 8-ball off the top rail cleanly across the center line into the bottom side pocket.',
    objectiveLabel: 'Pocket #8 in 1 shot using a cushion bank or kick',
    hint: 'Aim just right of center on the 8-ball with medium-firm speed (68%) so it rebounds off the top cushion toward the bottom side.',
    maxShots: 1,
    xpReward: 300,
    initialPower: 0.68,
    requireRailBeforePot: true,
    balls: [
      { id: 0, x: -0.52, z: 0.32 },
      { id: 8, x: -0.02, z: -0.24 },
    ],
  },
  {
    id: 'dc_diamond_three',
    title: 'Three-Ball Precision Runout',
    category: 'Tactical Runout',
    difficulty: 'Hard',
    description:
      'Three balls spread across opposite quadrants of the felt. Zero misses allowed — every shot must drop and set up the next.',
    objectiveLabel: 'Pocket #1, #5, and #9 in 3 shots',
    hint: 'Start with #1 into the top-left or side pocket using gentle follow so the cue drifts toward mid-table for #5 and #9.',
    maxShots: 3,
    xpReward: 250,
    initialPower: 0.54,
    balls: [
      { id: 0, x: -0.82, z: 0.14 },
      { id: 1, x: -0.24, z: -0.34 },
      { id: 5, x: 0.42, z: 0.32 },
      { id: 9, x: 0.94, z: -0.26 },
    ],
  },
  {
    id: 'dc_rail_kick_escape',
    title: 'The Snooker Escape',
    category: 'Bank & Spin',
    difficulty: 'Expert',
    description:
      'Trapped behind the 4-ball and 7-ball wall, clear the table in three crisp strokes using rail geometry and cue ball spin.',
    objectiveLabel: 'Clear all 3 object balls (#4, #7, #9) in 3 shots',
    hint: 'Curve off the top rail with right English (+X) to clip the 9-ball first or stun onto #4 into the bottom corner.',
    maxShots: 3,
    xpReward: 280,
    initialPower: 0.64,
    balls: [
      { id: 0, x: -0.88, z: 0.02 },
      { id: 4, x: -0.22, z: -0.08 },
      { id: 7, x: -0.18, z: 0.12 },
      { id: 9, x: 0.78, z: 0.38 },
    ],
  },
  {
    id: 'dc_frozen_cushion_needle',
    title: 'Frozen Rail Gauntlet',
    category: 'Precision Cut',
    difficulty: 'Master',
    description:
      'Both object balls hug the long rails with razor-thin pocket windows. Thread both down the cushions in just two shots.',
    objectiveLabel: 'Pocket #6 and #8 in 2 shots without scratching',
    hint: 'Use soft pace (~42%) and slight draw (-Y) on the 6-ball down the top rail so the cue stays central for the 8-ball.',
    maxShots: 2,
    xpReward: 340,
    initialPower: 0.44,
    balls: [
      { id: 0, x: 0.08, z: 0.04 },
      { id: 6, x: 0.68, z: -0.54 },
      { id: 8, x: -0.66, z: 0.54 },
    ],
  },
  {
    id: 'dc_double_combo_carom',
    title: 'The Foot-Spot Combo',
    category: 'Trick Shot',
    difficulty: 'Expert',
    description:
      'A wired 2-into-9 combination sits near the foot spot. Strike cleanly to sink both or send the 9-ball straight home in one stroke.',
    objectiveLabel: 'Clear #2 and #9 in 2 shots (combo the 9 on shot 1!)',
    hint: 'Clip the #2 slightly thin on its left side so it drives the #9 directly into the bottom-right corner.',
    maxShots: 2,
    xpReward: 290,
    initialPower: 0.65,
    balls: [
      { id: 0, x: -0.74, z: -0.08 },
      { id: 2, x: 0.48, z: 0.12 },
      { id: 9, x: 0.86, z: 0.34 },
    ],
  },
  {
    id: 'dc_draw_back_double',
    title: 'Power Draw Corridor',
    category: 'Bank & Spin',
    difficulty: 'Hard',
    description:
      'Sink the 4-ball into the top side pocket and pull heavy backspin to bring the cue straight back for the 8-ball in the head corner.',
    objectiveLabel: 'Clear #4 and #8 in 2 shots',
    hint: 'Apply full bottom spin (-Y = -0.85) at 70% power on the 4-ball to spin the cue ball back across the center line.',
    maxShots: 2,
    xpReward: 250,
    initialPower: 0.7,
    initialSpin: { x: 0, y: -0.8 },
    balls: [
      { id: 0, x: 0.18, z: 0.12 },
      { id: 4, x: 0.05, z: -0.38 },
      { id: 8, x: -0.92, z: -0.38 },
    ],
  },
  {
    id: 'dc_four_ball_blitz',
    title: 'Four-Ball Blitz',
    category: 'Tactical Runout',
    difficulty: 'Expert',
    description:
      'A wide-open four-ball championship layout with zero room for safety errors. Clear every ball in four crisp strokes.',
    objectiveLabel: 'Clear #1, #3, #7, and #9 in 4 shots',
    hint: 'Work from the head half of the table toward the foot rail (#1 → #3 → #7 → #9) with natural follow.',
    maxShots: 4,
    xpReward: 310,
    initialPower: 0.55,
    balls: [
      { id: 0, x: -0.94, z: -0.24 },
      { id: 1, x: -0.42, z: -0.36 },
      { id: 3, x: -0.04, z: 0.28 },
      { id: 7, x: 0.54, z: -0.28 },
      { id: 9, x: 0.96, z: 0.24 },
    ],
  },
  {
    id: 'dc_long_table_sniper',
    title: 'Full-Table Corner Sniper',
    category: 'Precision Cut',
    difficulty: 'Hard',
    description:
      'Over two meters of emerald separate the cue ball and the 9-ball from the far corner pocket. One chance to bury the shot.',
    objectiveLabel: 'Pocket #9 in 1 shot without scratching',
    hint: 'Take your time aligning the thin cut into the top-right corner; use medium speed (58%) to keep pocket jaws forgiving.',
    maxShots: 1,
    xpReward: 230,
    initialPower: 0.58,
    balls: [
      { id: 0, x: -1.04, z: 0.32 },
      { id: 9, x: 0.62, z: -0.26 },
    ],
  },
  {
    id: 'dc_split_cluster_carom',
    title: 'Two-Ball Carom Split',
    category: 'Trick Shot',
    difficulty: 'Master',
    description:
      'Two balls sit offset near center table — fire one explosive stun shot to split them into opposite corners!',
    objectiveLabel: 'Pocket both #1 and #8 in 2 shots (or 1 double!)',
    hint: 'Attack the gap at 72% power; sinking one immediately gives you a clean follow-up shot on the second.',
    maxShots: 2,
    xpReward: 350,
    initialPower: 0.72,
    balls: [
      { id: 0, x: -0.78, z: 0.0 },
      { id: 1, x: 0.24, z: -0.14 },
      { id: 8, x: 0.36, z: 0.16 },
    ],
  },
  {
    id: 'dc_rail_bank_nine',
    title: 'Championship Cushion Bank',
    category: 'Bank & Spin',
    difficulty: 'Expert',
    description:
      'No direct pocket lane exists without touching rubber. Bank the 9-ball off the foot rail or kick off the side rail to win in one.',
    objectiveLabel: 'Pocket #9 in 1 shot with at least 1 cushion contact',
    hint: 'Bank the 9-ball softly off the top cushion or cut it off the foot rail toward the bottom-right corner.',
    maxShots: 1,
    xpReward: 320,
    initialPower: 0.64,
    requireRailBeforePot: true,
    balls: [
      { id: 0, x: -0.35, z: 0.25 },
      { id: 9, x: 0.32, z: -0.22 },
    ],
  },
  {
    id: 'dc_five_ball_masters',
    title: 'Five-Ball Master Clearance',
    category: 'Tactical Runout',
    difficulty: 'Master',
    description:
      'The ultimate consistency test: five balls staged across the 9-foot tournament slate, five shots maximum, zero fouls.',
    objectiveLabel: 'Clear #1, #2, #4, #6, and #8 in 5 shots',
    hint: 'Pocket the two side-pocket candidates early to simplify cue ball travel around the center spot.',
    maxShots: 5,
    xpReward: 380,
    initialPower: 0.56,
    balls: [
      { id: 0, x: -0.84, z: 0.0 },
      { id: 1, x: -0.36, z: -0.4 },
      { id: 2, x: -0.1, z: 0.42 },
      { id: 4, x: 0.38, z: -0.18 },
      { id: 6, x: 0.76, z: 0.36 },
      { id: 8, x: 0.96, z: -0.28 },
    ],
  },
  {
    id: 'dc_side_pocket_thread',
    title: 'Side-Pocket Thread',
    category: 'Precision Cut',
    difficulty: 'Hard',
    description:
      'Thread the 7-ball cleanly through the narrow side-pocket entrance, then follow down table for the 11-ball corner.',
    objectiveLabel: 'Pocket #7 and #11 in 2 shots',
    hint: 'Hit #7 at 50% speed with slight topspin (+Y) to glide forward into position on #11.',
    maxShots: 2,
    xpReward: 240,
    initialPower: 0.52,
    balls: [
      { id: 0, x: -0.58, z: -0.05 },
      { id: 7, x: -0.04, z: -0.36 },
      { id: 11, x: 0.84, z: 0.28 },
    ],
  },
  {
    id: 'dc_corner_pocket_finale',
    title: 'Golden Nine Finale',
    category: 'Tactical Runout',
    difficulty: 'Expert',
    description:
      'Three tournament balls guard the corners. Clear the felt in three decisive strokes with zero wasted motion.',
    objectiveLabel: 'Pocket #3, #7, and #9 in 3 shots',
    hint: 'Pot #3 in the bottom-left corner with draw, then work up table to #7 and finish on #9.',
    maxShots: 3,
    xpReward: 290,
    initialPower: 0.58,
    balls: [
      { id: 0, x: -0.34, z: 0.08 },
      { id: 3, x: -0.86, z: 0.38 },
      { id: 7, x: 0.28, z: -0.38 },
      { id: 9, x: 0.92, z: 0.36 },
    ],
  },
];

function hashDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d)) {
    const epochDays = Math.floor(Date.UTC(y, m - 1, d) / 86400000);
    return Math.abs(epochDays);
  }
  let h = 0;
  for (let i = 0; i < dateKey.length; i++) {
    h = (h * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function getDailyChallengeForDate(dateKey: string = getTodayDateKey()): {
  dateKey: string;
  challenge: DailyChallengeDef;
  dayNumber: number;
} {
  const dayNum = hashDateKey(dateKey);
  // Cycle cleanly across all curated challenges without consecutive repeats
  const idx = dayNum % DAILY_CHALLENGES.length;
  return {
    dateKey,
    challenge: DAILY_CHALLENGES[idx],
    dayNumber: (dayNum % 365) + 1,
  };
}
