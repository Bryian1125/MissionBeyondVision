/**
 * audio.js — every sound in the game.
 *
 * Three ideas do all the work:
 *
 *  1. PING + ECHO. A ping is a short chirp. It is followed by one returning
 *     tone per surface it hit. The further away a wall is, the later its echo
 *     arrives, so distance is *time*. A click sounds every RANGE_STEP units on
 *     the way out, so you can count how far away something is without a
 *     number ever being spoken.
 *
 *  2. BEARING IS PAN. Every returning tone is panned by which side of your
 *     facing it came from. Because you can only move where you are facing,
 *     "turn until the echo is dead ahead" is a complete navigation verb.
 *
 *  3. PITCH IS MATERIAL. Each surface type has its own pitch, so you learn to
 *     recognise the room by ear instead of by eye.
 *
 * Nothing here allocates on a per-frame basis: continuous voices are built once
 * and only their parameters move.
 */

import { matOf } from './levels.js'

/** How long one world unit of distance takes to come back as an echo. */
const SEC_PER_UNIT = 0.0024
/** A click sounds every this many units — your mental ruler. */
const RANGE_STEP = 50
/** How far a ping reaches. */
export const PING_RANGE = 560

export class Audio {
  constructor() {
    this.ctx = null
    this.ready = false
    this.muted = false
  }

  /**
   * Must be called from a real user gesture — browsers will not start an
   * AudioContext any other way. Safe to call more than once.
   */
  async start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume()
      return
    }
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return // no Web Audio: the game still runs, it is just silent
    this.ctx = new Ctx()
    if (this.ctx.state === 'suspended') await this.ctx.resume()

    const ctx = this.ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0.9
    this.master.connect(ctx.destination)

    // --- engine hum: one oscillator, running for the whole session ---
    this.humGain = ctx.createGain()
    this.humGain.gain.value = 0
    this.humFilter = ctx.createBiquadFilter()
    this.humFilter.type = 'lowpass'
    this.humFilter.frequency.value = 320
    this.humOsc = ctx.createOscillator()
    this.humOsc.type = 'sawtooth'
    this.humOsc.frequency.value = 62
    this.humOsc.connect(this.humFilter)
    this.humFilter.connect(this.humGain)
    this.humGain.connect(this.master)
    this.humOsc.start()

    // --- listen static: filtered noise, swells as you near a target ---
    this.noise = ctx.createBufferSource()
    this.noise.buffer = this._noiseBuffer(2)
    this.noise.loop = true
    this.noiseFilter = ctx.createBiquadFilter()
    this.noiseFilter.type = 'bandpass'
    this.noiseFilter.frequency.value = 900
    this.noiseFilter.Q.value = 1.4
    this.noiseGain = ctx.createGain()
    this.noiseGain.gain.value = 0
    this.noise.connect(this.noiseFilter)
    this.noiseFilter.connect(this.noiseGain)
    this.noiseGain.connect(this.master)
    this.noise.start()

    this.ready = true
  }

  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds)
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    return buf
  }

  get now() {
    return this.ctx ? this.ctx.currentTime : 0
  }

  setMuted(m) {
    this.muted = m
    if (this.master) this.master.gain.value = m ? 0 : 0.9
  }

  /** Engine note follows throttle, so you can hear how fast you are moving. */
  setThrottle(t) {
    if (!this.ready) return
    const now = this.now
    this.humGain.gain.setTargetAtTime(0.035 + t * 0.05, now, 0.08)
    this.humOsc.frequency.setTargetAtTime(58 + t * 26, now, 0.1)
  }

  /** Static swells as the current objective gets closer. 0 = far, 1 = on it. */
  setListen(level, distance) {
    if (!this.ready) return
    const now = this.now
    const near = Math.max(0, 1 - distance / 420)
    this.noiseGain.gain.setTargetAtTime(level * 0.05 * near, now, 0.12)
    this.noiseFilter.frequency.setTargetAtTime(500 + near * 1800, now, 0.15)
  }

  /**
   * The chirp itself. Call this, then hand the echoes to `echoes()`.
   *
   * `onTarget` swaps the normal descending sweep for a bright rising pair. The
   * player learns they are in range by pinging and hearing the ping answer back
   * differently, so this doubles as the "you are on it" cue.
   */
  ping(onTarget = false) {
    if (!this.ready) return
    const t = this.now
    if (onTarget) {
      this._blip(t, 880, 0.09, 0.16, 0, 'sine')
      this._blip(t + 0.07, 1318.5, 0.16, 0.16, 0, 'sine')
      return
    }
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(1180, t)
    osc.frequency.exponentialRampToValueAtTime(520, t + 0.07)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.22, t + 0.008)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
    osc.connect(gain)
    gain.connect(this.master)
    osc.start(t)
    osc.stop(t + 0.12)
  }

  /**
   * Schedule one returning tone per hit, plus the range clicks.
   * `hits` is [{ dist, bearing, mat }] with bearing relative to facing.
   */
  echoes(hits) {
    if (!this.ready) return
    const t0 = this.now + 0.06

    // The ruler: one click per RANGE_STEP of travel.
    for (let d = RANGE_STEP; d < PING_RANGE; d += RANGE_STEP) {
      this._blip(t0 + d * SEC_PER_UNIT, 2400, 0.03, 0.05, 0)
    }

    for (const hit of hits) {
      const mat = matOf(hit.mat)
      const when = t0 + hit.dist * SEC_PER_UNIT
      const near = Math.max(0, 1 - hit.dist / PING_RANGE)
      // Louder and brighter when close, so proximity is obvious.
      this._blip(when, mat.hz, 0.16 + near * 0.1, 0.05 + near * 0.16, hit.bearing)
    }
  }

  /**
   * One short tone. `pan` is -1 (left) to 1 (right).
   * `type` lets callers ask for a triangle instead of a sine.
   */
  _blip(when, hz, dur, vol, pan, type = 'triangle') {
    const ctx = this.ctx
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null

    osc.type = type
    osc.frequency.value = hz
    // Short attack, exponential tail — nothing clicks or pops.
    gain.gain.setValueAtTime(0.0001, when)
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), when + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, when + dur)

    osc.connect(gain)
    if (panner) {
      panner.pan.value = Math.max(-1, Math.min(1, pan))
      gain.connect(panner)
      panner.connect(this.master)
    } else {
      gain.connect(this.master)
    }
    osc.start(when)
    osc.stop(when + dur + 0.02)
  }

  /**
   * One soft tick toward the objective, panned by bearing. The engine decides
   * when ticks fire and how fast — the gap between them shrinks as you close,
   * so the player is reading the rhythm, not a number.
   *
   * `distance` only shapes the brightness here; the timing carries the distance.
   */
  approachTick(bearing, distance) {
    if (!this.ready) return
    const near = Math.max(0, 1 - distance / 700)
    this._blip(this.now, 620 + near * 380, 0.055, 0.05 + near * 0.045, Math.sin(bearing), 'sine')
  }

  /**
   * You are against a solid surface. Low, dull and noise-based so it cannot be
   * mistaken for the refusal chime, and loudness follows how hard you hit it.
   * This is deliberately a different sound from `deny()`: pressing into a wall
   * is not the same event as failing to reach an objective.
   */
  thud(strength = 1) {
    if (!this.ready) return
    const t = this.now
    const vol = Math.min(0.22, 0.06 + strength * 0.16)

    const src = this.ctx.createBufferSource()
    src.buffer = this._noiseBuffer(0.12)
    const filter = this.ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 340
    const gain = this.ctx.createGain()
    gain.gain.setValueAtTime(vol, t)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    src.start(t)
    src.stop(t + 0.15)

    // A low body under the noise so it has weight.
    this._blip(t, 88, 0.11, vol * 0.8, 0, 'triangle')
  }

  /** Rising pair: something was accepted. */
  confirm(step = 1) {
    if (!this.ready) return
    const t = this.now
    this._blip(t, 523.25 * Math.pow(1.122, step), 0.12, 0.14, 0)
    this._blip(t + 0.09, 783.99 * Math.pow(1.122, step), 0.22, 0.14, 0)
  }

  /** Falling pair: you tried to use something that was out of reach. */
  deny() {
    if (!this.ready) return
    const t = this.now
    this._blip(t, 300, 0.1, 0.11, 0, 'square')
    this._blip(t + 0.08, 210, 0.18, 0.11, 0, 'square')
  }

  /** Neutral tick for menu movement. */
  tick() {
    if (!this.ready) return
    this._blip(this.now, 880, 0.05, 0.07, 0)
  }

  /** Nailed it — the level is done. */
  fanfare() {
    if (!this.ready) return
    const t = this.now
    ;[523.25, 659.25, 783.99, 1046.5].forEach((hz, i) => {
      this._blip(t + i * 0.12, hz, 0.4, 0.13, 0)
    })
  }
}
