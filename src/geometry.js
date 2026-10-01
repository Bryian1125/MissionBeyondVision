/**
 * geometry.js — the only maths the game needs.
 *
 * Everything is 2D axis-aligned rectangles plus the rover as a circle. That is
 * the smallest set of primitives that still lets you build mazes, and it keeps
 * raycasts and collision exact instead of approximate.
 */

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)

/** Shortest signed difference between two angles, in (-PI, PI]. */
export function angleDelta(from, to) {
  let d = (to - from) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d <= -Math.PI) d += Math.PI * 2
  return d
}

/**
 * Distance from a point to the boundary of an axis-aligned rect along a ray.
 * Returns null if the ray misses, or `dist` if the rect starts behind us.
 */
function rayRect(ox, oy, dx, dy, r) {
  let tmin = -Infinity
  let tmax = Infinity

  // x slab
  if (Math.abs(dx) < 1e-9) {
    if (ox < r.x || ox > r.x + r.w) return null
  } else {
    let t1 = (r.x - ox) / dx
    let t2 = (r.x + r.w - ox) / dx
    if (t1 > t2) [t1, t2] = [t2, t1]
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return null
  }

  // y slab
  if (Math.abs(dy) < 1e-9) {
    if (oy < r.y || oy > r.y + r.h) return null
  } else {
    let t1 = (r.y - oy) / dy
    let t2 = (r.y + r.h - oy) / dy
    if (t1 > t2) [t1, t2] = [t2, t1]
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return null
  }

  if (tmax < 0) return null
  // Starting inside the rect means we only ever meet the far face.
  return tmin >= 0 ? tmin : tmax
}

/**
 * Nearest solid surface along a ray.
 * `solids` is a list of { x, y, w, h, mat }.
 */
export function castRay(ox, oy, dx, dy, maxDist, solids) {
  let best = maxDist
  let hit = null
  for (const s of solids) {
    const t = rayRect(ox, oy, dx, dy, s)
    if (t === null || t >= best) continue
    best = t
    hit = s
  }
  return hit ? { dist: best, rect: hit, mat: hit.mat } : null
}

/**
 * Push a circle out of every rect it overlaps.
 * Resolving each rect independently is enough here: levels are built from
 * blocks that do not overlap each other, so there is no corner case to solve.
 */
export function resolveCircle(x, y, r, solids) {
  for (const s of solids) {
    const nearX = clamp(x, s.x, s.x + s.w)
    const nearY = clamp(y, s.y, s.y + s.h)
    const dx = x - nearX
    const dy = y - nearY
    const d2 = dx * dx + dy * dy
    if (d2 >= r * r) continue

    if (d2 > 1e-9) {
      const d = Math.sqrt(d2)
      x = nearX + (dx / d) * r
      y = nearY + (dy / d) * r
    } else {
      // Dead centre inside the block: leave by the nearest face.
      const left = x - s.x
      const right = s.x + s.w - x
      const top = y - s.y
      const bottom = s.y + s.h - y
      const m = Math.min(left, right, top, bottom)
      if (m === left) x = s.x - r
      else if (m === right) x = s.x + s.w + r
      else if (m === top) y = s.y - r
      else y = s.y + s.h + r
    }
  }
  return { x, y }
}

/**
 * The four outer hull walls of a level, as solid rects.
 * They are tagged `outer` so the renderer can draw the room as one outline
 * instead of guessing which hull blocks are really the room edge.
 */
export function roomWalls(room, thickness = 40) {
  return [
    { x: room.x - thickness, y: room.y - thickness, w: room.w + thickness * 2, h: thickness, mat: 'hull', outer: true },
    { x: room.x - thickness, y: room.y + room.h, w: room.w + thickness * 2, h: thickness, mat: 'hull', outer: true },
    { x: room.x - thickness, y: room.y, w: thickness, h: room.h, mat: 'hull', outer: true },
    { x: room.x + room.w, y: room.y, w: thickness, h: room.h, mat: 'hull', outer: true },
  ]
}

/**
 * Breadth-first search over free space, on a grid.
 * Used by `npm run check` to prove every level is actually solvable.
 * Returns the set of reachable cells, or null if the start is stuck.
 */
export function reachable(room, solids, start, r, step = 20) {
  const cols = Math.floor(room.w / step) + 1
  const rows = Math.floor(room.h / step) + 1
  const idx = (c, rIdx) => rIdx * cols + c

  const free = new Uint8Array(cols * rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x = room.x + col * step
      const y = room.y + row * step
      const p = resolveCircle(x, y, r, solids)
      free[idx(col, row)] = p.x === x && p.y === y ? 1 : 0
    }
  }

  const startCol = Math.round((start.x - room.x) / step)
  const startRow = Math.round((start.y - room.y) / step)
  if (!free[idx(startCol, startRow)]) return null

  const seen = new Uint8Array(cols * rows)
  const queue = [idx(startCol, startRow)]
  seen[queue[0]] = 1
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head]
    const col = cur % cols
    const row = (cur - col) / cols
    const push = (c, rr) => {
      if (c < 0 || rr < 0 || c >= cols || rr >= rows) return
      const i = idx(c, rr)
      if (seen[i] || !free[i]) return
      seen[i] = 1
      queue.push(i)
    }
    push(col + 1, row)
    push(col - 1, row)
    push(col, row + 1)
    push(col, row - 1)
  }
  return { seen, cols, rows, step, room, idx }
}

/** Is a point standing in the reachable set? */
export function isReachable(field, x, y, slack = 1) {
  const col = Math.round((x - field.room.x) / field.step)
  const row = Math.round((y - field.room.y) / field.step)
  for (let dr = -slack; dr <= slack; dr++) {
    for (let dc = -slack; dc <= slack; dc++) {
      const c = col + dc
      const r = row + dr
      if (c < 0 || r < 0 || c >= field.cols || r >= field.rows) continue
      if (field.seen[field.idx(c, r)]) return true
    }
  }
  return false
}
