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
 * Two rules keep every level fair for a player who cannot see:
 *   1. Corridors are at least 120 units wide. The rover is 28 across, so
 *      there is always room to turn around inside one.
 *   2. The objective you are told to go to is always reachable from the one
 *      before it. `npm run check` proves this with a breadth-first search and
 *      fails the build if it is ever false.
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

export const LEVELS = [
  {
    id: 'bay3',
    name: 'Bay 3',
    brief: 'Two panels, then the airlock. Ping to find the room.',
    spawn: { x: 110, y: 300, angle: 0 },
    room: { x: 60, y: 60, w: 680, h: 480 },
    walls: [
      { x: 250, y: 190, w: 130, h: 70, mat: 'crate' },
      { x: 250, y: 340, w: 130, h: 70, mat: 'crate' },
    ],
    objectives: [
      { x: 620, y: 150, label: 'power panel' },
      { x: 620, y: 450, label: 'fuel valve' },
    ],
    exit: { x: 700, y: 300, label: 'airlock' },
  },

  {
    id: 'spine',
    name: 'Service Spine',
    brief: 'Three junctions. The corridor turns, so ping before you commit.',
    spawn: { x: 100, y: 300, angle: 0 },
    room: { x: 60, y: 60, w: 880, h: 480 },
    walls: [
      // Two long shelves with a gap you have to line up with.
      { x: 240, y: 60, w: 60, h: 170, mat: 'hull' },
      { x: 240, y: 370, w: 60, h: 170, mat: 'hull' },
      { x: 470, y: 60, w: 60, h: 250, mat: 'grate' },
      { x: 470, y: 420, w: 60, h: 120, mat: 'grate' },
      { x: 700, y: 170, w: 60, h: 370, mat: 'hull' },
    ],
    objectives: [
      { x: 350, y: 300, label: 'breaker' },
      { x: 600, y: 380, label: 'coolant pump' },
      { x: 860, y: 300, label: 'hatch release' },
    ],
    exit: { x: 880, y: 120, label: 'service lift' },
  },

  {
    id: 'ring',
    name: 'Reactor Ring',
    brief: 'Go around the block. Everything is on the far side of it.',
    spawn: { x: 200, y: 400, angle: 0 },
    room: { x: 60, y: 60, w: 680, h: 680 },
    walls: [
      // Solid core in the middle — you must use the ring corridor around it.
      { x: 260, y: 260, w: 280, h: 280, mat: 'rock' },
      // Two notches that reach out of the core. They narrow the ring to 130
      // units on one side instead of splitting it in two, so there is always a
      // wide way past — a block in the middle of a ring would leave two gaps
      // that together are no wider than the corridor, and one would be a trap.
      { x: 420, y: 190, w: 130, h: 70, mat: 'rock' },
      { x: 270, y: 540, w: 130, h: 70, mat: 'rock' },
    ],
    objectives: [
      { x: 150, y: 150, label: 'coolant loop' },
      { x: 650, y: 150, label: 'rod sensor' },
      { x: 650, y: 650, label: 'shutdown lever' },
    ],
    exit: { x: 150, y: 650, label: 'containment door' },
  },

  {
    id: 'gallery',
    name: 'The Dark Gallery',
    brief: 'Four exhibits, each in an alcove. Every alcove is a dead end — back out.',
    spawn: { x: 250, y: 400, angle: 0 },
    room: { x: 60, y: 60, w: 880, h: 680 },
    walls: [
      // One block in the middle. Everything is reached by going around it.
      { x: 380, y: 320, w: 180, h: 180, mat: 'crate' },

      // Alcoves are two blocks with a gap between them, roofed by the hull.
      // Top-left: pocket is x 130-300, y 60-200, opening to the south.
      { x: 80, y: 60, w: 50, h: 140, mat: 'ice' },
      { x: 300, y: 60, w: 50, h: 140, mat: 'ice' },
      // Top-right: pocket is x 640-810, y 60-200.
      { x: 590, y: 60, w: 50, h: 140, mat: 'ice' },
      { x: 810, y: 60, w: 50, h: 140, mat: 'ice' },
      // Bottom-left: pocket is x 130-300, y 600-740, opening to the north.
      { x: 80, y: 600, w: 50, h: 140, mat: 'ice' },
      { x: 300, y: 600, w: 50, h: 140, mat: 'ice' },
      // Bottom-right: pocket is x 640-810, y 600-740.
      { x: 590, y: 600, w: 50, h: 140, mat: 'ice' },
      { x: 810, y: 600, w: 50, h: 140, mat: 'ice' },
    ],
    objectives: [
      { x: 215, y: 130, label: 'specimen one' },
      { x: 725, y: 130, label: 'specimen two' },
      { x: 725, y: 670, label: 'specimen three' },
      { x: 215, y: 670, label: 'specimen four' },
    ],
    exit: { x: 460, y: 620, label: 'cargo lift' },
  },

  {
    id: 'homeward',
    name: 'Homeward',
    brief: 'Four systems to wake, then a long run for the dock.',
    spawn: { x: 120, y: 120, angle: 0 },
    room: { x: 60, y: 60, w: 1080, h: 760 },
    walls: [
      // A staggered comb you weave through.
      { x: 200, y: 60, w: 60, h: 300, mat: 'hull' },
      { x: 200, y: 480, w: 60, h: 340, mat: 'hull' },
      { x: 400, y: 60, w: 60, h: 380, mat: 'grate' },
      { x: 400, y: 560, w: 60, h: 260, mat: 'grate' },
      { x: 600, y: 200, w: 60, h: 620, mat: 'hull' },
      { x: 800, y: 60, w: 60, h: 420, mat: 'crate' },
      { x: 800, y: 600, w: 60, h: 220, mat: 'crate' },
      { x: 1000, y: 60, w: 60, h: 300, mat: 'ice' },
      { x: 1000, y: 480, w: 60, h: 340, mat: 'ice' },
    ],
    objectives: [
      { x: 300, y: 400, label: 'reactor restart' },
      { x: 700, y: 150, label: 'life support' },
      { x: 900, y: 700, label: 'nav beacon' },
      { x: 1080, y: 400, label: 'airlock cycle' },
    ],
    exit: { x: 1080, y: 120, label: 'home dock' },
  },
]

export const levelById = (id) => LEVELS.find((l) => l.id === id) || LEVELS[0]
