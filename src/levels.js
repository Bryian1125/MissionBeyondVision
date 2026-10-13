/**
 * LEVELS — the whole game content lives in this file.
 *
 * A level is a plain object. There is no editor and no format to learn:
 *
 *   room        the outer hull. { x, y, w, h } is the walkable rectangle.
 *   walls       solid blocks inside it. { x, y, w, h, mat } — axis-aligned only.
 *   objectives  things you must reach, IN ORDER. { x, y, label }
 *   exit        where you go once every objective is done. { x, y, label }
 *   spawn       { x, y, angle } — angle in radians, 0 = +x (right).
 *
 * How these are laid out, and why:
 *
 *   1. Every objective sits IN a corner or T-junction, never past one. It is
 *      the signpost for the turn. You hear it ticking while you are still in
 *      the corridor leading up, which is what tells you to turn instead of
 *      sailing straight past into a wall. `npm run check` fails the build if
 *      any objective cannot be seen from a comfortable drive out.
 *   2. Nothing is ever in a dead end. Every route is a corridor you can drive
 *      through, so there is no point on the map where you have to reverse out
 *      blind. The check measures how many different ways there are to leave
 *      each objective and fails if it is only one.
 *   3. Corridors are wide — 140 units or more against a rover 28 across.
 *      There is always room to turn around inside one.
 *   4. Each objective is reachable from the one before it, proven with a
 *      breadth-first search.
 *
 * `mat` picks the pitch you hear when you ping that surface, so you can tell
 * a hull wall from a rock wall without looking.
 */

export const MAT = {
  hull: { hz: 196, name: 'hull' },
  grate: { hz: 262, name: 'grating' },
  crate: { hz: 165, name: 'crate' },
  rock: { hz: 131, name: 'rock' },
  ice: { hz: 330, name: 'ice' },
}

/** Fallback so a typo in `mat` still returns a sensible pitch. */
export const matOf = (name) => MAT[name] || MAT.hull

/**
 * How far a ping reaches, in world units.
 * It lives here with the world data because the ping is now defined in terms
 * of the level's own geometry, not in terms of the audio layer.
 */
export const PING_RANGE = 560

export const LEVELS = [
  {
    id: 'bay3',
    name: 'Bay 3',
    brief: 'Four corners. Each one calls you in before the turn.',
    spawn: { x: 130, y: 490, angle: 0 },
    room: { x: 60, y: 60, w: 1100, h: 560 },
    walls: [
      // Three bulkheads, each stopping short of the opposite hull so you go
      // under the first, over the second, under the third. Every passage is
      // 260 units — you cannot miss one, and you cannot get wedged in one.
      { x: 300, y: 60, w: 70, h: 300, mat: 'crate' },
      { x: 620, y: 320, w: 70, h: 300, mat: 'grate' },
      { x: 940, y: 60, w: 70, h: 300, mat: 'hull' },
    ],
    // One per corner, on the turn itself.
    objectives: [
      { x: 430, y: 490, label: 'power panel' },
      { x: 430, y: 190, label: 'coolant tap' },
      { x: 740, y: 190, label: 'fuel valve' },
      { x: 740, y: 490, label: 'hatch release' },
    ],
    exit: { x: 1100, y: 490, label: 'airlock' },
  },

  {
    id: 'spine',
    name: 'Service Spine',
    brief: 'Six junctions. Every one of them is announced before you reach it.',
    spawn: { x: 130, y: 700, angle: 0 },
    room: { x: 60, y: 60, w: 1180, h: 820 },
    walls: [
      // Four bulkheads, alternating over and under, so the route is a clean
      // staircase of right-angle turns. Passages are 280 units and the
      // vertical shafts are 170 — both far wider than the rover.
      { x: 260, y: 60, w: 70, h: 380, mat: 'hull' },
      { x: 500, y: 340, w: 70, h: 540, mat: 'grate' },
      { x: 740, y: 60, w: 70, h: 540, mat: 'crate' },
      { x: 980, y: 340, w: 70, h: 540, mat: 'ice' },
    ],
    objectives: [
      { x: 430, y: 700, label: 'breaker' },
      { x: 430, y: 200, label: 'coolant tap' },
      { x: 620, y: 200, label: 'pressure valve' },
      { x: 620, y: 700, label: 'pump housing' },
      { x: 900, y: 700, label: 'hatch release' },
      { x: 900, y: 200, label: 'nav relay' },
    ],
    exit: { x: 1180, y: 200, label: 'service lift' },
  },

  {
    id: 'ring',
    name: 'Reactor Ring',
    brief: 'Go around the block. It calls you at each corner of the ring.',
    spawn: { x: 180, y: 400, angle: -Math.PI / 2 },
    room: { x: 60, y: 60, w: 800, h: 800 },
    walls: [
      // Solid core in the middle — you must use the ring corridor around it.
      { x: 300, y: 300, w: 320, h: 320, mat: 'rock' },
      // Two notches that reach out of the core. They narrow the ring on one
      // side instead of splitting it in two, so there is always a wide way
      // past — a block in the middle of a ring would leave two gaps that
      // together are no wider than the corridor, and one would be a trap.
      //
      // They deliberately stop short of the corner sightlines. A notch anywhere
      // along the top or bottom corridor would hide the next objective from the
      // one before it, and a notch in the left or right corridor would do the
      // same to the pair either side of it — the whole point is that the
      // objective calls you into the next turn.
      { x: 230, y: 420, w: 70, h: 160, mat: 'rock' },
      { x: 620, y: 220, w: 50, h: 160, mat: 'rock' },
    ],
    // One at each corner of the ring, which is also each corner of the route.
    objectives: [
      { x: 180, y: 180, label: 'coolant loop' },
      { x: 680, y: 180, label: 'rod sensor' },
      { x: 680, y: 680, label: 'shutdown lever' },
      { x: 180, y: 680, label: 'containment seal' },
    ],
    exit: { x: 180, y: 780, label: 'containment door' },
  },

  {
    id: 'gallery',
    name: 'The Dark Gallery',
    brief: 'A long gallery. Five plinths, and a plinth at every turn.',
    spawn: { x: 190, y: 130, angle: Math.PI / 2 },
    room: { x: 60, y: 60, w: 940, h: 820 },
    walls: [
      // Two full-height dividers with open headers top and bottom. That makes
      // three corridors joined at both ends — a serpentine with no dead ends
      // anywhere. Nothing here can trap you: every corridor is a through route.
      { x: 380, y: 200, w: 70, h: 540, mat: 'ice' },
      { x: 660, y: 200, w: 70, h: 540, mat: 'ice' },
    ],
    objectives: [
      { x: 190, y: 810, label: 'plinth one' },
      { x: 555, y: 810, label: 'plinth two' },
      { x: 555, y: 130, label: 'plinth three' },
      { x: 865, y: 130, label: 'plinth four' },
      { x: 865, y: 810, label: 'gallery store' },
    ],
    exit: { x: 950, y: 400, label: 'cargo lift' },
  },

  {
    id: 'homeward',
    name: 'Homeward',
    brief: 'Six systems to wake, all on the corners of the long way home.',
    spawn: { x: 190, y: 130, angle: Math.PI / 2 },
    room: { x: 60, y: 60, w: 1140, h: 900 },
    walls: [
      // Three dividers, so four corridors woven end to end. The long haul.
      { x: 320, y: 200, w: 70, h: 620, mat: 'hull' },
      { x: 600, y: 200, w: 70, h: 620, mat: 'grate' },
      { x: 880, y: 200, w: 70, h: 620, mat: 'crate' },
    ],
    objectives: [
      { x: 190, y: 890, label: 'reactor restart' },
      { x: 495, y: 890, label: 'life support' },
      { x: 495, y: 130, label: 'nav beacon' },
      { x: 775, y: 130, label: 'airlock cycle' },
      { x: 775, y: 890, label: 'fuel cell' },
      { x: 1065, y: 890, label: 'dock clamp' },
    ],
    exit: { x: 1140, y: 130, label: 'home dock' },
  },
]

export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[0]
