/**
 * engine.js — the rules. No rendering, no React, no Web Audio calls.
 *
 * `step()` is the whole game: it takes an input snapshot and advances the
 * world by dt seconds. Everything else is presentation, so you can test the
 * game by calling step() in a loop with no browser at all (see
 * scripts/check-levels.mjs).
 *
 * Control model, deliberately tiny:
 *   turn      -1..1   rotate left/right (right stick X)
 *   throttle  -1..1   drive along the direction you are FACING
 *   ping               one echolocation pulse
 *   interact           use the objective you are next to
 *   listen    0..1    hold to swell the static as you close on the objective
 *
 * Because throttle is applied along the facing vector and nothing else, a
 * player only has to learn one idea: turn to face a thing, then hold forward.
 */

import { castRay, resolveCircle, angleDelta, clamp, roomWalls } from './geometry.js'
import { PING_RANGE } from './audio.js'

export const ROVER_R = 14
const SPEED = 170
const TURN_RATE = 2.8
/** Radians of turn per second at full stick. */
const PING_RAYS = 36
/** Echoes closer together than this in bearing are merged into one tone. */
const SECTOR = Math.PI / 6
const PING_COOLDOWN = 0.35
/** How close you must be to use an objective. */
export const INTERACT_RANGE = 48

// --- approach ticks: the primary way to find the target ---
// A soft tick repeats on a beat that speeds up as you close on the objective.
// Nothing to count and nothing to remember, so it works at any skill level.
const TICK_SLOW = 1.2 // seconds between ticks at maximum range
const TICK_FAST = 0.14 // ...and when you are on it
const TICK_RANGE = 700 // distance at which the ticking is at its slowest

/** Minimum gap between wall-contact sounds while grinding along a wall. */
const BUMP_COOLDOWN = 0.25

let uid = 0

export class Engine {
  constructor(level) {
    this.level = level
    this.id = ++uid
    this.solids = [...roomWalls(level.room), ...level.walls]
    this.objectives = level.objectives.map((o, i) => ({ ...o, index: i, done: false }))
    this.exit = { ...level.exit, open: false }
    this.time = 0
    this.pings = [] // recent pulses, for drawing only
    this._nextTickAt = 0
    this._nextBumpAt = 0
    this._nextPingAt = 0
    this.events = [] // this step's events; read them after step() returns
    this.reset()
  }

  reset() {
    const s = this.level.spawn
    this.player = { x: s.x, y: s.y, angle: s.angle || 0, throttle: 0, bump: 0 }
    // Which objective is next. Named `index` rather than `step` so it does not
    // collide with the step() method below.
    this.index = 0
    this.finished = false
    this.time = 0
    this.pings = []
    this.events = []
    this._nextTickAt = 0
    this._nextBumpAt = 0
    for (const o of this.objectives) o.done = false
    this.exit.open = false
    this.emit('start', { level: this.level })
    return this
  }

  emit(type, data) {
    this.events.push({ type, ...data })
  }

  /** The thing the player is being told to go to right now. */
  get target() {
    return this.index < this.objectives.length ? this.objectives[this.index] : this.exit
  }

  get targetDistance() {
    const t = this.target
    return t ? Math.hypot(t.x - this.player.x, t.y - this.player.y) : Infinity
  }

  /** Signed bearing to the target, relative to facing. -PI is behind you. */
  get targetBearing() {
    const t = this.target
    if (!t) return 0
    return angleDelta(this.player.angle, Math.atan2(t.y - this.player.y, t.x - this.player.x))
  }

  /** True when the player is close enough to use the current target. */
  get inRange() {
    return this.targetDistance <= INTERACT_RANGE
  }

  /**
   * Advance one frame.
   * `input` is { turn, throttle, ping, interact, listen }.
   */
  step(dt, input = {}) {
    // Clear last frame's events here, at the TOP, not at the bottom. The
    // presentation layer reads engine.events after step() returns, so anything
    // cleared on the way out would be thrown away before it was ever seen —
    // which is exactly what used to happen, and why the game was silent.
    this.events.length = 0
    this.time += dt
    const p = this.player

    // --- turn ---
    const turn = clamp(input.turn || 0, -1, 1)
    p.angle = angleDelta(0, p.angle + turn * TURN_RATE * dt)

    // --- drive along the facing vector ---
    // This is the whole movement model. Facing left and pushing forward moves
    // you left, because forward is always (cos angle, sin angle).
    const want = clamp(input.throttle || 0, -1, 1)
    p.throttle += (want - p.throttle) * Math.min(1, dt * 8)
    const speed = SPEED * p.throttle
    const nx = p.x + Math.cos(p.angle) * speed * dt
    const ny = p.y + Math.sin(p.angle) * speed * dt

    const prevX = p.x
    const prevY = p.y
    const solved = resolveCircle(nx, ny, ROVER_R, this.solids)
    // Keep the rover inside the hull even if a level is edited badly.
    solved.x = clamp(solved.x, this.level.room.x + ROVER_R, this.level.room.x + this.level.room.w - ROVER_R)
    solved.y = clamp(solved.y, this.level.room.y + ROVER_R, this.level.room.y + this.level.room.h - ROVER_R)
    p.x = solved.x
    p.y = solved.y

    // Wall contact: did the rover travel as far as it was told to?
    //
    // The comparison must be against where it actually started, not against the
    // position it was aiming for. The solver pushes the rover back out along
    // the surface every frame, so measuring from the target makes a wall look
    // like one frame of travel and contact never registers while you are
    // leaning on it — which is exactly when the player most needs to hear it.
    const intended = Math.abs(speed * dt)
    const travelled = Math.hypot(p.x - prevX, p.y - prevY)
    const touching = intended > 0.05 && travelled < intended * 0.4 && Math.abs(p.throttle) > 0.3
    if (touching) {
      p.bump = Math.min(1, p.bump + dt * 4)
      if (this.time >= this._nextBumpAt) {
        this._nextBumpAt = this.time + BUMP_COOLDOWN
        this.emit('bump', { strength: Math.abs(p.throttle) })
      }
    } else {
      p.bump = Math.max(0, p.bump - dt * 4)
    }

    // --- echolocation ---
    if (input.ping && this.time >= this._nextPingAt) this.ping()
    if (input.listen) this.emit('listen', { level: input.listen, distance: this.targetDistance })

    // --- approach ticks: faster the closer you are to the objective ---
    // Panned by bearing, so this one sound tells you which way to turn and
    // whether to keep going. It replaces the old slow beacon, which asked the
    // player to judge pitch and volume by ear at long range.
    const far = clamp(this.targetDistance / TICK_RANGE, 0, 1)
    if (this.time >= this._nextTickAt) {
      this._nextTickAt = this.time + TICK_FAST + (TICK_SLOW - TICK_FAST) * far
      this.emit('approach', { bearing: this.targetBearing, distance: this.targetDistance })
    }

    if (input.interact) this.interact()

    return this
  }

  /**
   * Echolocation. Casts rays all the way round, keeps the nearest surface in
   * each 30-degree sector, and hands the result to the audio layer.
   *
   * Merging matters: a bare wall straight ahead would otherwise return a dozen
   * near-identical tones and turn into mush. One tone per sector means every
   * sound you hear is a distinct direction.
   */
  ping() {
    const p = this.player
    this._nextPingAt = this.time + PING_COOLDOWN

    const sectors = new Map()
    for (let i = 0; i < PING_RAYS; i++) {
      const world = p.angle - Math.PI + (i / (PING_RAYS - 1)) * Math.PI * 2
      const hit = castRay(p.x, p.y, Math.cos(world), Math.sin(world), PING_RANGE, this.solids)
      if (!hit) continue
      const rel = angleDelta(p.angle, world)
      const key = Math.round(rel / SECTOR)
      const prev = sectors.get(key)
      if (!prev || hit.dist < prev.dist) {
        sectors.set(key, { dist: hit.dist, bearing: rel, mat: hit.mat, world })
      }
    }

    const hits = [...sectors.values()].sort((a, b) => a.dist - b.dist)
    this.pings.push({ born: this.time, hits, range: PING_RANGE })
    if (this.pings.length > 3) this.pings.shift()
    // `onTarget` travels with the ping so the audio layer can make the chirp
    // itself sound different when you are standing on the objective. That is
    // how the player learns they are in range: ping, and the ping answers back
    // differently.
    this.emit('ping', { hits, onTarget: this.inRange })
    return hits
  }

  /** Use the objective you are next to. No penalty for missing. */
  interact() {
    if (this.finished) return false
    const t = this.target
    if (!t) return false
    if (!this.inRange) {
      this.emit('denied', { target: t, distance: this.targetDistance, bearing: this.targetBearing })
      return false
    }

    if (this.index < this.objectives.length) {
      t.done = true
      this.index++
      this.emit('objective', { index: t.index, label: t.label, remaining: this.objectives.length - this.index })
      if (this.index >= this.objectives.length) {
        this.exit.open = true
        this.emit('exitOpen', { exit: this.exit })
      }
    } else {
      this.finished = true
      this.emit('complete', { level: this.level })
    }
    return true
  }
}
