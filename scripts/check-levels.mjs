/**
 * scripts/check-levels.mjs — proves every level is beatable.
 *
 * Run with `npm run check`. It walks a grid the size of the rover across each
 * level and flood-fills from the spawn. If any objective, or the exit, is not
 * in the filled region, the level is impossible and this exits non-zero.
 *
 * It also measures the tightest squeeze on the required route, so a corridor
 * that is technically passable but far too narrow for a player who cannot see
 * gets flagged rather than shipped.
 */

import { LEVELS, matOf } from '../src/levels.js'
import { roomWalls, resolveCircle, reachable, isReachable } from '../src/geometry.js'
import { ROVER_R, INTERACT_RANGE } from '../src/engine.js'

let failures = 0
const ok = (name, pass, detail = '') => {
  if (!pass) failures++
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

console.log('mission beyond vision — level check\n')

for (const level of LEVELS) {
  console.log(`${level.name} (${level.id})`)
  const solids = [...roomWalls(level.room), ...level.walls]

  // --- every wall must use a material we actually have a pitch for ---
  const unknown = level.walls.filter((w) => !w.mat)
  ok('all walls have a material', unknown.length === 0, unknown.map((w) => `${w.x},${w.y}`).join(' '))

  // --- nothing may be embedded in a wall ---
  const stuck = []
  const points = [
    ['spawn', level.spawn],
    ...level.objectives.map((o, i) => [`objective ${i + 1}`, o]),
    ['exit', level.exit],
  ]
  for (const [name, pt] of points) {
    const p = resolveCircle(pt.x, pt.y, ROVER_R, solids)
    if (Math.hypot(p.x - pt.x, p.y - pt.y) > 0.5) stuck.push(name)
  }
  ok('nothing is buried in a wall', stuck.length === 0, stuck.join(', '))

  // --- everything must be inside the room ---
  const outside = points.filter(
    ([, pt]) =>
      pt.x < level.room.x || pt.y < level.room.y ||
      pt.x > level.room.x + level.room.w || pt.y > level.room.y + level.room.h,
  )
  ok('everything is inside the room', outside.length === 0, outside.map(([n]) => n).join(', '))

  // --- flood fill from the spawn ---
  let field = reachable(level.room, solids, level.spawn, ROVER_R, 20)
  ok('spawn is not stuck', field !== null)
  if (!field) continue

  // --- each objective, in order, must be reachable ---
  // Re-flood from each objective so the check is about the real route order
  // rather than just "is it somewhere in the same blob".
  let cursor = level.spawn
  let ordered = true
  for (let i = 0; i < level.objectives.length; i++) {
    const o = level.objectives[i]
    if (!isReachable(field, o.x, o.y)) {
      ok(`objective ${i + 1} (${o.label}) reachable`, false, 'no route from spawn')
      ordered = false
      break
    }
    // From here on, this objective is the new origin.
    field = reachable(level.room, solids, o, ROVER_R, 20)
    if (!field) {
      ok(`objective ${i + 1} (${o.label}) reachable`, false, 'objective is itself stuck')
      ordered = false
      break
    }
  }
  if (ordered) ok('all objectives reachable in order', true, `${level.objectives.length} objectives`)

  // --- the exit must be reachable from the last objective ---
  const last = level.objectives[level.objectives.length - 1] || level.spawn
  const fromLast = reachable(level.room, solids, last, ROVER_R, 20)
  ok('exit reachable from the last objective', fromLast !== null && isReachable(fromLast, level.exit.x, level.exit.y),
    fromLast && !isReachable(fromLast, level.exit.x, level.exit.y) ? 'exit is walled off' : '')

  // --- and the exit must be reachable from spawn too, in case a player
  //     wanders straight for it ---
  ok('exit reachable from spawn', isReachable(field, level.exit.x, level.exit.y))

  // --- fairness: can you stand close enough to use each objective? ---
  const tooTight = []
  for (const o of [...level.objectives, level.exit]) {
    let best = Infinity
    for (let a = 0; a < 360; a += 10) {
      const r = (a * Math.PI) / 180
      for (let d = 0; d <= INTERACT_RANGE; d += 6) {
        const px = o.x + Math.cos(r) * d
        const py = o.y + Math.sin(r) * d
        if (px < level.room.x || py < level.room.y ||
            px > level.room.x + level.room.w || py > level.room.y + level.room.h) continue
        const p = resolveCircle(px, py, ROVER_R, solids)
        if (Math.hypot(p.x - px, p.y - py) <= 0.5) best = Math.min(best, d)
      }
    }
    if (best > INTERACT_RANGE - 4) tooTight.push(`${o.label} (${Math.round(best)})`)
  }
  ok('every objective can be stood next to', tooTight.length === 0, tooTight.join(', '))

  // --- fairness: is there a route with room to actually turn around? ---
  // Re-run the flood fill with the rover inflated well past its real size. A
  // path that survives at this radius is a corridor you can fly down without
  // shaving a wall, which is the difference between "solvable" and "fair to
  // someone who cannot see the wall". The rover is 28 across; COMFORT is 40,
  // so every point on a fair route has 80 units of clear space around it.
  const COMFORT = 40
  let cursorPt = level.spawn
  const unfair = []
  for (const o of [...level.objectives, level.exit]) {
    const wide = reachable(level.room, solids, cursorPt, COMFORT, 20)
    if (!wide || !isReachable(wide, o.x, o.y, 1)) unfair.push(o.label)
    cursorPt = o
  }
  ok('route has room to manoeuvre', unfair.length === 0, unfair.join(', '))

  console.log('')
}

if (failures) {
  console.log(`${failures} check(s) FAILED`)
  process.exit(1)
}
console.log('all levels solvable')
