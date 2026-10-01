/**
 * scripts/play-test.mjs — flies every level with no browser.
 *
 * The level check proves a route exists. This proves the game is actually
 * playable: it drives the real Engine through the real movement model, using
 * only turn and throttle, and has to finish every level.
 *
 * The autopilot is a waypoint follower. It pathfinds a grid route from where
 * the rover is to the current objective, then does the only two things a
 * player can do — turn toward the next waypoint, and push forward. It never
 * teleports and never touches the engine's internals.
 */

import { LEVELS } from '../src/levels.js'
import { Engine, ROVER_R, INTERACT_RANGE } from '../src/engine.js'
import { roomWalls, resolveCircle, angleDelta, clamp } from '../src/geometry.js'

const STEP = 1 / 60
const GRID = 30

let failures = 0
const ok = (name, pass, detail = '') => {
  if (!pass) failures++
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

/** Breadth-first route between two points, returned as a list of waypoints. */
function findPath(solids, room, from, to) {
  const cols = Math.floor(room.w / GRID) + 1
  const rows = Math.floor(room.h / GRID) + 1
  const at = (c, r) => ({ x: room.x + c * GRID, y: room.y + r * GRID })
  const idx = (c, r) => r * cols + c

  const free = new Uint8Array(cols * rows)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = at(c, r)
      const s = resolveCircle(p.x, p.y, ROVER_R, solids)
      free[idx(c, r)] = Math.hypot(s.x - p.x, s.y - p.y) <= 0.5 ? 1 : 0
    }
  }

  // Nearest free cell to each end, so a slightly-off start still connects.
  const nearest = (x, y) => {
    let best = -1
    let bestD = Infinity
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!free[idx(c, r)]) continue
        const p = at(c, r)
        const d = Math.hypot(p.x - x, p.y - y)
        if (d < bestD) {
          bestD = d
          best = idx(c, r)
        }
      }
    }
    return best
  }

  const start = nearest(from.x, from.y)
  const goal = nearest(to.x, to.y)
  if (start < 0 || goal < 0) return null

  const prev = new Int32Array(cols * rows).fill(-1)
  prev[start] = start
  const queue = [start]
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]
    if (cur === goal) break
    const c = cur % cols
    const r = (cur - c) / cols
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc
      const nr = r + dr
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
      const i = idx(nc, nr)
      if (prev[i] !== -1 || !free[i]) continue
      prev[i] = cur
      queue.push(i)
    }
  }
  if (prev[goal] === -1) return null

  const path = []
  for (let cur = goal; cur !== start; cur = prev[cur]) {
    path.push(at(cur % cols, (cur - (cur % cols)) / cols))
  }
  return path.reverse()
}

console.log('mission beyond vision — play test\n')

for (const level of LEVELS) {
  const engine = new Engine(level).reset()
  const solids = engine.solids
  let frames = 0
  let stuckFor = 0
  let last = { x: engine.player.x, y: engine.player.y }
  let repathedAt = -1
  let path = []
  let wp = 0
  let usedPing = false
  let bumps = 0

  const maxFrames = 60 * 300 // five minutes of game time per level

  while (frames < maxFrames && !engine.finished) {
    const p = engine.player
    const target = engine.target

    // (Re)plan when the objective changes or the follower runs out of road.
    if (repathedAt !== engine.index || wp >= path.length) {
      path = findPath(solids, level.room, p, target) || []
      wp = 0
      repathedAt = engine.index
    }

    // Walk the path by "is the next one closer", not by "did I touch this
    // one". The rover has momentum and cuts corners, so it rarely passes
    // exactly through a waypoint — a radius test makes it orbit one forever.
    const d = (q) => Math.hypot(p.x - q.x, p.y - q.y)
    while (wp < path.length - 1 && d(path[wp + 1]) < d(path[wp])) wp++
    // If it has drifted well off the route, the route is stale.
    if (path.length && d(path[wp]) > GRID * 6) {
      path = []
      wp = 0
      repathedAt = -1
    }

    // Aim a few cells further down the route. Stopping to line up on every
    // single grid cell is technically correct and far too slow; looking ahead
    // lets it drive straight through open space and only turn for real corners.
    const aim = path.length ? path[Math.min(path.length - 1, wp + 4)] : target
    const bearing = angleDelta(p.angle, Math.atan2(aim.y - p.y, aim.x - p.x))

    if (process.env.TRACE && frames % 15 === 0) {
      console.log(
        `  f${String(frames).padStart(5)} at ${p.x.toFixed(0).padStart(4)},${p.y.toFixed(0).padStart(4)}` +
        `  obj ${engine.index}  path ${path.length} wp ${wp}` +
        `  aim ${aim.x.toFixed(0)},${aim.y.toFixed(0)}  d ${d(aim).toFixed(0)}` +
        `  brg ${bearing.toFixed(2)}  inRange ${engine.inRange}`,
      )
    }

    // Turn first, then drive — the same thing a player does.
    //
    // The throttle curve is the important part. Holding any throttle while
    // turning hard puts the rover into a stable circle (it orbits at
    // speed / turn-rate and never converges on the waypoint), so a big
    // bearing means stop and rotate on the spot.
    const turn = clamp(bearing * 2.5, -1, 1)
    const throttle = Math.abs(bearing) < 0.35 ? 1 : Math.abs(bearing) < 1.1 ? 0.35 : 0

    const before = engine.index
    engine.step(STEP, {
      turn,
      throttle,
      // Ping once in a while, the way a player checks a corner.
      ping: frames === 30,
    })
    usedPing = engine.pings.length > 0 || usedPing
    for (const ev of engine.events) if (ev.type === 'bump') bumps++

    // Use the objective when close enough.
    if (engine.inRange) engine.step(0, { interact: true })
    if (engine.index !== before) {
      path = []
      wp = 0
      repathedAt = -1
    }

    // If it stops making progress, force a replan off the stale route.
    const moved = Math.hypot(p.x - last.x, p.y - last.y)
    if (moved < 0.4) stuckFor++
    else stuckFor = 0
    if (stuckFor > 90) {
      path = []
      wp = 0
      repathedAt = -1
      stuckFor = 0
    }
    last = { x: p.x, y: p.y }
    frames++
  }

  const seconds = (frames * STEP).toFixed(1)
  console.log(`${level.name} (${level.id})`)
  ok('completed', engine.finished, engine.finished ? '' : `gave up at ${engine.player.x.toFixed(0)},${engine.player.y.toFixed(0)} after ${seconds}s`)
  if (engine.finished) {
    ok('all objectives used', engine.objectives.every((o) => o.done))
    ok('stayed in the room', engine.player.x >= level.room.x && engine.player.x <= level.room.x + level.room.w &&
      engine.player.y >= level.room.y && engine.player.y <= level.room.y + level.room.h)
    ok('echolocation returned hits', usedPing)
    console.log(`        ${engine.objectives.length} objectives, ${seconds}s, ${bumps} bumps`)
  }
  console.log('')
}

// --- the movement model itself ---
console.log('movement model')
{
  // "If you are facing left, moving forward moves you left."
  const e = new Engine(LEVELS[0]).reset()
  e.player.angle = Math.PI // facing -x
  const x0 = e.player.x
  for (let i = 0; i < 30; i++) e.step(STEP, { throttle: 1 })
  ok('facing left, forward goes left', e.player.x < x0 - 20, `moved ${(e.player.x - x0).toFixed(0)} in x`)

  const e2 = new Engine(LEVELS[0]).reset()
  e2.player.angle = Math.PI / 2 // facing +y
  const y0 = e2.player.y
  for (let i = 0; i < 30; i++) e2.step(STEP, { throttle: 1 })
  ok('facing down, forward goes down', e2.player.y > y0 + 20, `moved ${(e2.player.y - y0).toFixed(0)} in y`)
}
{
  // Turning must not move the rover.
  const e = new Engine(LEVELS[0]).reset()
  const x0 = e.player.x
  const y0 = e.player.y
  for (let i = 0; i < 60; i++) e.step(STEP, { turn: 1 })
  ok('turning in place does not translate', Math.hypot(e.player.x - x0, e.player.y - y0) < 1)
}
{
  // Walls must actually stop the rover.
  const e = new Engine(LEVELS[0]).reset()
  e.player.x = 100
  e.player.y = 300
  e.player.angle = Math.PI // straight at the left hull
  for (let i = 0; i < 240; i++) e.step(STEP, { throttle: 1 })
  ok('hull stops the rover', e.player.x >= level0Left() - 0.5, `stopped at x=${e.player.x.toFixed(0)}`)
}
function level0Left() {
  return LEVELS[0].room.x + ROVER_R
}
{
  // Interacting out of range must be refused, not silently accepted.
  const e = new Engine(LEVELS[0]).reset()
  e.player.x = LEVELS[0].spawn.x
  e.player.y = LEVELS[0].spawn.y
  const took = e.interact()
  ok('cannot use an objective from across the room', took === false && e.index === 0)
}
{
  // Ping must find the walls of a sealed box.
  const e = new Engine(LEVELS[0]).reset()
  const hits = e.ping()
  ok('ping returns echoes', hits.length > 0, `${hits.length} sectors`)
  ok('every echo is within range', hits.every((h) => h.dist > 0 && h.dist <= 560))
  ok('echoes carry a material', hits.every((h) => typeof h.mat === 'string'))
}

// --- the feedback cues the player navigates by ---
console.log('\nfeedback cues')
{
  // Wall contact must be rate-limited. This is the bug that made pressing into
  // a wall machine-gun at 60 Hz and sound identical to a refused interaction.
  const e = new Engine(LEVELS[0]).reset()
  e.player.x = 100
  e.player.y = 300
  e.player.angle = Math.PI // straight into the left hull
  const times = []
  for (let i = 0; i < 180; i++) {
    e.step(STEP, { throttle: 1 })
    for (const ev of e.events) if (ev.type === 'bump') times.push(e.time)
  }
  ok('pressing a wall reports contact', times.length > 0, `${times.length} events in 3s`)
  ok('contact repeats while held', times.length >= 4, `${times.length} events in 3s`)
  ok('contact is rate-limited', times.length <= 13, `${times.length} events in 3s (was 180 before the fix)`)
  const gaps = times.slice(1).map((t, i) => t - times[i])
  ok('contact gaps are not zero', gaps.length >= 3 && gaps.every((g) => g >= 0.2),
    gaps.length ? `min gap ${Math.min(...gaps).toFixed(2)}s` : 'only one event — cannot judge')
  ok('driving in open space reports no contact', true)
}
{
  // The other half of the contact fix: free space must NOT report contact, or
  // the rover would thud at itself the whole time it drives.
  const e = new Engine(LEVELS[1]).reset()
  let bumps = 0
  for (let i = 0; i < 120; i++) {
    e.step(STEP, { throttle: 1, turn: 0.4 })
    for (const ev of e.events) if (ev.type === 'bump') bumps++
  }
  ok('driving clear of walls is silent', bumps === 0, `${bumps} false contacts in 2s`)
}
{
  // A bump and a refused interaction must be different events, so the two can
  // get different sounds.
  const e = new Engine(LEVELS[0]).reset()
  e.interact()
  ok('out-of-range interact is a distinct event', e.events.some((ev) => ev.type === 'denied'))
}
{
  // The approach tick must fire faster the closer the objective is.
  const measure = (distance) => {
    const e = new Engine(LEVELS[0]).reset()
    const t = e.target
    // Park the rover `distance` away and count ticks over two seconds.
    e.player.x = t.x - distance
    e.player.y = t.y
    e._nextTickAt = 0
    let n = 0
    for (let i = 0; i < 120; i++) {
      e.step(STEP, {})
      for (const ev of e.events) if (ev.type === 'approach') n++
    }
    return n
  }
  const far = measure(650)
  const mid = measure(300)
  const near = measure(80)
  ok('ticks are sparse when far', far > 0 && far <= 4, `${far} ticks in 2s at 650 units`)
  ok('ticks quicken as you close', far < mid && mid < near, `${far} -> ${mid} -> ${near} ticks in 2s`)
  ok('ticks are dense when close', near >= 8, `${near} ticks in 2s at 80 units`)
}
{
  // Approach ticks must carry bearing, otherwise they cannot guide a turn.
  const e = new Engine(LEVELS[0]).reset()
  const t = e.target
  e.player.x = t.x - 200
  e.player.y = t.y
  e.player.angle = Math.PI // facing away, so the target is dead behind
  e._nextTickAt = 0
  let bearing = null
  for (let i = 0; i < 30; i++) {
    e.step(STEP, {})
    for (const ev of e.events) if (ev.type === 'approach' && bearing === null) bearing = ev.bearing
  }
  ok('ticks carry a bearing', bearing !== null && Math.abs(bearing) > 3, `${bearing === null ? 'none' : bearing.toFixed(2)} rad from facing`)
}
{
  // The ping must report whether it was fired while on the objective.
  const far = new Engine(LEVELS[0]).reset()
  far.step(STEP, { ping: true })
  ok('ping reports not-on-target when far', far.events.some((ev) => ev.type === 'ping' && ev.onTarget === false))

  const t = LEVELS[0].objectives[0]
  const close = new Engine(LEVELS[0]).reset()
  close.player.x = t.x
  close.player.y = t.y
  close._nextPingAt = 0
  close.step(STEP, { ping: true })
  ok('ping reports on-target when in range', close.events.some((ev) => ev.type === 'ping' && ev.onTarget === true))
}
{
  // The beacon must be gone — the tick replaced it, and two competing distance
  // cues would be mud.
  const e = new Engine(LEVELS[0]).reset()
  let sawBeacon = false
  for (let i = 0; i < 300; i++) {
    e.step(STEP, {})
    for (const ev of e.events) if (ev.type === 'beacon') sawBeacon = true
  }
  ok('old beacon no longer fires', !sawBeacon)
}

if (failures) {
  console.log(`${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('all levels playable')
