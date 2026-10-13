/**
 * input.js — keyboard and gamepad collapsed into one snapshot.
 *
 * The game only ever asks for five things, so this file only ever produces
 * five things. The D-pad is the control: left and right rotate the rover, up
 * and down is throttle, and throttle is applied along the direction you are
 * facing.
 */

const KEY_TURN = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 }
const KEY_THROTTLE = { ArrowUp: 1, KeyW: 1, ArrowDown: -1, KeyS: -1 }

/** Standard gamepad mapping: A/B/X/Y, bumpers, triggers, d-pad. */
const BTN = {
  interact: 0, // A
  ping: 1, // B
  pingAlt: 7, // right trigger
  altPing: 2, // X
  listen: 4, // left bumper
  back: 8,
  up: 12, // d-pad up
  down: 13, // d-pad down
  left: 14, // d-pad left
  right: 15, // d-pad right
}

export class Input {
  constructor() {
    this.keys = new Set()
    this.turn = 0
    this.throttle = 0
    this.listen = 0
    this._ping = false
    this._interact = false
    this._handlers = null
    this.padIndex = null
    this.padName = ''
  }

  attach() {
    if (this._handlers) return
    const down = (e) => {
      if (e.repeat) return
      this.keys.add(e.code)
      if (e.code === 'Space') {
        e.preventDefault()
        this._ping = true
      }
      if (e.code === 'Enter' || e.code === 'KeyE') {
        e.preventDefault()
        this._interact = true
      }
      if (e.code === 'Escape' || e.code === 'Backspace') this.onEscape?.()
      if (e.code === 'KeyM') this.onMute?.()
    }
    const up = (e) => this.keys.delete(e.code)
    // A key held while the tab loses focus would otherwise stick forever.
    const blur = () => this.keys.clear()

    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    this._handlers = { down, up, blur }
  }

  detach() {
    if (!this._handlers) return
    const { down, up, blur } = this._handlers
    window.removeEventListener('keydown', down)
    window.removeEventListener('keyup', up)
    window.removeEventListener('blur', blur)
    this._handlers = null
    this.keys.clear()
  }

  _pad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null
    const pads = navigator.getGamepads()
    if (this.padIndex !== null && pads[this.padIndex]) return pads[this.padIndex]
    for (const p of pads) {
      if (p && p.connected) {
        this.padIndex = p.index
        this.padName = p.id
        return p
      }
    }
    this.padIndex = null
    this.padName = ''
    return null
  }

  /** Build this frame's snapshot. Call once per frame, then `consume()`. */
  poll() {
    let turn = 0
    let throttle = 0
    let listen = 0

    for (const code of this.keys) {
      if (code in KEY_TURN) turn += KEY_TURN[code]
      if (code in KEY_THROTTLE) throttle += KEY_THROTTLE[code]
      if (code === 'ShiftLeft' || code === 'ShiftRight') listen = 1
    }

    const pad = this._pad()
    if (pad) {
      const held = (i) => {
        const b = pad.buttons[i]
        return !!b && (b.pressed || b.value > 0.5)
      }
      // The D-pad drives. Left and right turn, up and down is throttle, and up
      // means forward.
      if (held(BTN.left)) turn -= 1
      if (held(BTN.right)) turn += 1
      if (held(BTN.up)) throttle += 1
      if (held(BTN.down)) throttle -= 1

      if (held(BTN.listen)) listen = 1
      if (held(BTN.interact)) this._interact = true
      if (held(BTN.ping) || held(BTN.pingAlt)) this._ping = true
      if (held(BTN.altPing)) this._ping = true
    }

    this.turn = Math.max(-1, Math.min(1, turn))
    this.throttle = Math.max(-1, Math.min(1, throttle))
    this.listen = listen
    return this
  }

  /** Read and clear the edge-triggered actions. */
  consume() {
    const out = { ping: this._ping, interact: this._interact }
    this._ping = false
    this._interact = false
    return out
  }
}
