# mission beyond vision

A space mission you fly with your ears.

You pilot a small rover around a 2D space station in total darkness. There is no
up and no down — just distance and direction, both of which you feel through
sound instead of sight. Work through the objectives in order, and when the last
one is done, get to the airlock.

There is a visible scope on screen so a sighted player can see what is going on.
The **Blind mode** button switches it off and the game plays exactly the same
way. Nothing visible is required.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
```

Deploying to Vercel: import the repo, leave every setting at its default. It is a
stock Next.js app with no environment variables and no server side of its own.

## How you know where you are

Three ideas do all the work.

**Echolocation.** A ping is a short chirp. Every surface it hits answers with a
tone. A tone that arrives *later* came from something *further away*. On the way
out a click sounds every 50 units, so you can count the clicks before an echo
arrives and know roughly how far away it is, without a number ever being spoken.

**Panning is direction.** Each returning tone is panned to the side of your
facing that it came from. Because you can only move where you are pointing,
"turn until the echo is dead ahead, then hold forward" is a complete navigation
method. That is the whole game.

**Pitch is material.** Hull, grating, crates, rock and ice each answer a ping at
their own pitch. After a few rooms you recognise the station by ear.

On top of those three, a tick repeats toward the objective on a beat that speeds
up as you close, panned by bearing — so the tick alone tells you both which way
to turn and whether to keep going. **Ping and the chirp answers back differently
when you are standing on the objective**, which is how you know you are in range.
Press **interact** to use it.

## Every sound, and what it means

| Sound | Meaning |
|---|---|
| **Chirp** | a ping went out |
| **Bright rising pair instead of the chirp** | you are *on* the objective — press interact |
| **Delayed tones after the chirp** | echoes. Later = further away, panned to the side it came from, pitch = what it is made of |
| **Ticks while you drive** | distance to the objective. The beat **speeds up as you close** — nothing to count. Panned, so it also tells you which way to turn |
| **Ticks at a flutter** | you are essentially there |
| **Low dull thud** | you are pressed against a wall. Repeats every 0.25s while you stay on it, and gets harder with throttle. This is a *different* sound from the refusal chime |
| **Rising two-note chime, pitched higher each time** | objective used. The pitch climbs with each one, so you know how many are left by ear alone |
| **Falling square pair** | you tried to use something that was out of range |
| **Low steady hum** | engine. Rises with throttle |
| **Rising four-note fanfare** | level complete |
| **Static bed while holding listen** | swells as you close on the objective |

Nothing important is carried by pitch alone — every cue has its own rhythm and
timing as well, so it survives a player who cannot separate two tones.

## Controls

| | Gamepad | Keyboard |
|---|---|---|
| Turn (attitude) | right stick left/right | Left / Right arrows, or A / D |
| Drive | left stick up/down | Up / Down arrows, or W / S |
| Ping | B, X or right trigger | Space |
| Interact | A | E or Enter |
| Listen (hold) | left bumper | Shift |
| Mute | — | M |
| Back to mission list | — | Escape |

You only move where you are facing. That is deliberate: it is one idea instead
of four, and it makes the whole world navigable with hearing alone.

## Building levels

All the content is in `src/levels.js`. A level is a plain object. There is no
editor and no file format to learn.

```js
{
  id: 'bay3',
  name: 'Bay 3',
  brief: 'Two panels, then the airlock.',
  spawn: { x: 110, y: 300, angle: 0 },   // angle in radians, 0 = right
  room:  { x: 60, y: 60, w: 680, h: 480 },  // the walkable rectangle
  walls: [                                // axis-aligned solid blocks
    { x: 250, y: 190, w: 130, h: 70, mat: 'crate' },
  ],
  objectives: [                           // reached in order
    { x: 620, y: 150, label: 'power panel' },
  ],
  exit: { x: 700, y: 300, label: 'airlock' },  // active once all done
}
```

Add it to the `LEVELS` array and it appears in the menu. That is the whole
process.

### Two rules that keep a level fair to play without sight

1. **Corridors stay wide.** The rover is 28 units across. Leave at least 120
   units of clearance on the route so there is room to turn around.
2. **Do not put a block in the middle of a ring corridor.** A block sitting in a
   corridor splits it into two gaps that together are no wider than the
   corridor, so one of them will be a trap. Make it a notch that reaches out of
   a wall instead, so there is always one wide way past.

### Checking your work

```bash
npm run check     # are the levels solvable?
npm run playtest  # can a rover actually fly them?
npm test          # both
```

`check` flood-fills the level with the rover's size and proves every objective
and the exit are reachable, in order. It then repeats the fill with the rover
inflated to 40 units and fails if any required leg has a squeeze narrower than
80 units — that is the fairness rule above, enforced.

`playtest` drives the real engine through the real movement model with nothing
but turn and throttle, following a grid route, and has to finish every level.
It also checks the movement model itself: that forward goes where you face, that
turning does not translate, and that the hull stops you.

Both are plain Node scripts with no dependencies. `TRACE=1 npm run playtest`
prints the autopilot's frame-by-frame decisions when something fails.

## The files

| | |
|---|---|
| `src/levels.js` | the content. Plain data, easy to edit. |
| `src/geometry.js` | raycasts, collision, the flood fill. No game rules. |
| `src/engine.js` | the rules and the 2D loop. No rendering, no audio, no React. |
| `src/audio.js` | Web Audio: ping, echoes, approach ticks, wall thud, engine hum, listen static. |
| `src/input.js` | keyboard and gamepad collapsed into one snapshot. |
| `src/Scope.jsx` | the visible 2D plane. The blind mode button hides this. |
| `app/page.js` | screens, the frame loop, and wiring. |

`engine.js` imports nothing from React or the browser, which is why the tests can
fly the game headlessly.

## Adding to it

A few things that are deliberately left out, in rough order of how easy they
are:

- **Reverb.** A `ConvolverNode` on a send bus from `master` would give the
  station a sense of size. Each level could carry its own impulse.
- **More echo detail.** `ping()` currently keeps only the nearest hit per 30°
  sector. Returning every hit, or splitting a sector into near and far, would let
  you hear a doorway through a wall.
- **A compass that speaks.** `bearingWords()` in `app/page.js` already turns a
  bearing into text. Passing it through `speechSynthesis` would make the game
  work alongside a screen reader rather than instead of one — which is the
  mistake *Papa Sangre* made.
- **Hazards.** A surface that pushes the rover back, or costs time. The collision
  code is already the only place that knows about walls.