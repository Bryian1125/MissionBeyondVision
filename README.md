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

**Echolocation is a measurement, not a raycast.** A ping does not fire a fan of
rays around the rover. It asks a single question: *what is out there, and how far
is it?* Every wall, every objective and the exit are targets. For each one the
engine computes

- **distance** — straight-line from the rover to it. This becomes the **delay**
  before its tone arrives. Later = further away.
- **bearing** — the angle to it measured from wherever the rover is *facing*.
  This becomes the **side the tone is panned to**. Behind you = centre, hard
  left = full left, and so on around the circle.

A wall answers from the point on it **nearest the rover**, not from its centre,
because the centre of a block is inside solid geometry. Walls answer at their
material pitch — hull, grating, crate, rock and ice each have their own — so you
learn the room by ear. Objectives and the exit answer **bright and pure, a
semitone higher with each objective**, so they can never be mistaken for more
hull and you can tell which one is calling.

Anything with solid geometry between it and the rover **does not answer at all**.
That is what makes this a sonar rather than a map: a wall behind a wall is
silent, and you have to fly round to find out what is in there.

Because you can only move where you are pointing, "turn until the echo is dead
ahead, then hold forward" is a complete navigation method. That is the whole game.

On top of that, a tick repeats toward the objective on a beat that speeds up as
you close, panned by bearing — so the tick alone tells you both which way to turn
and whether to keep going. **Ping and the chirp answers back differently when you
are standing on the objective**, which is how you know you are in range. Being in
range is the interaction — there is no button to press.

> The tick is radar — it always tells you the way and rough range. The ping is
> sonar — it tells you what is actually around you right now. They answer
> different questions, so an objective can be ticketing away on the far side of
> a bulkhead while staying silent until you fly round to it.

## Every sound, and what it means

| Sound | Meaning |
|---|---|
| **Chirp** | a ping went out |
| **Bright rising pair instead of the chirp** | you are *on* the objective; it is used automatically |
| **A tone arriving later** | something is that far away. Each one is a real, separate thing |
| **Tone panned left or right** | that thing is that way, relative to your facing |
| **Low rough tone** | a wall, at that material's pitch |
| **High pure tone** | an objective or the exit. Semitone higher each objective, so you know which |
| **Silence where you expected a tone** | something solid is in the way |
| **Click every 50 units on the way out** | a ruler — count the clicks before a tone arrives to judge distance |
| **Ticks while you drive** | distance to the objective. The beat **speeds up as you close** — nothing to count. Panned, so it also tells you which way to turn |
| **Ticks at a flutter** | you are essentially there |
| **Low dull thud** | you are pressed against a wall. Repeats every 0.25s while you stay on it, and gets harder with throttle |
| **Rising two-note chime, pitched higher each time** | objective used. The pitch climbs with each one, so you know how many are left by ear alone |
| **Low steady hum** | engine. Rises with throttle. Only sounds *during* a mission — it fades out the moment you finish, quit, or bail to the menu, and starts from silence on the next launch |
| **Rising four-note fanfare** | level complete |
| **Static bed while holding listen** | swells as you close on the objective. Cuts off the instant you release, and at the end of a mission |

Nothing important is carried by pitch alone — every cue has its own rhythm and
timing as well, so it survives a player who cannot separate two tones.

## Controls

| | Gamepad | Keyboard |
|---|---|---|
| Turn (attitude) | D-pad left/right | Left / Right arrows, or A / D |
| Drive | D-pad up/down | Up / Down arrows, or W / S |
| Ping | B, X or right trigger | Space |
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
  brief: 'Four corners. Each one calls you in before the turn.',
  spawn: { x: 130, y: 490, angle: 0 },   // angle in radians, 0 = right
  room:  { x: 60, y: 60, w: 1100, h: 560 },  // the walkable rectangle
  walls: [                                // axis-aligned solid blocks
    { x: 300, y: 60, w: 70, h: 300, mat: 'crate' },
  ],
  objectives: [                           // reached in order
    { x: 430, y: 490, label: 'power panel' },
  ],
  exit: { x: 1100, y: 490, label: 'airlock' },  // active once all done
}
```

Add it to the `LEVELS` array and it appears in the menu. That is the whole
process.

### How a level is laid out, and why

Every level in this game is the same shape: a route made of straight runs and
90-degree turns, with **an objective sitting in every turn**. That is the whole
navigation system. The objective is the signpost — you hear it ticking while you
are still in the corridor leading up, so you know to turn instead of sailing
past into a wall.

So the rules are:

1. **Put an objective in every turn.** Never past one. If you cannot see the
   next objective from the one you are standing at, you will fly a corridor in
   silence and only find out what was waiting at the far end once there is
   nothing to do about it.
2. **No dead ends, ever.** Nothing in a pocket you have to reverse out of. Use
   through-corridors: a divider that stops short of both the floor and the
   ceiling leaves a header at each end, which turns two dead ends into two
   junctions. Every level here is built that way.
3. **Corridors stay wide.** The rover is 28 units across. Leave at least 140
   units of clearance on the route so there is room to turn around.
4. **Do not put a block in the middle of a ring corridor.** A block sitting in a
   corridor splits it into two gaps that together are no wider than the
   corridor, so one of them will be a trap. Make it a notch that reaches out of
   a wall instead. Keep notches clear of the straight sightlines between
   objectives, or they will hide the next one from the last.

### Checking your work

```bash
npm run check     # are the levels solvable?
npm run playtest  # can a rover actually fly them?
npm test          # both
```

`check` flood-fills the level with the rover's size and proves every objective
and the exit are reachable, in order. It then repeats the fill with the rover
inflated to 40 units and fails if any required leg has a squeeze narrower than
80 units — that is fairness rule 3, enforced. Two more checks cover the other
rules:

- **nowhere to get stranded** floods from *each* objective at that same inflated
  size and requires the way back to the spawn to be inside the fill, so nothing
  can seal you in behind a gap you would struggle to fly out of.
- **each objective announces the next** walks the route and requires clear line
  of sight from every objective to the one after it, and from the last one to
  the exit. That is rule 1, enforced.

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
| `src/geometry.js` | raycasts, collision, line of sight, the flood fill. No game rules. |
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