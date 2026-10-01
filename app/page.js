/**
 * app/page.js — the whole app.
 *
 * Three screens, held in one piece of state: menu, playing, done.
 * The game loop is a plain requestAnimationFrame that reads Input, calls
 * Engine.step(), and pushes whatever the engine emitted into Audio.
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LEVELS } from '@/levels'
import { Engine } from '@/engine'
import { Audio } from '@/audio'
import { Input } from '@/input'
import Scope from '@/Scope'

const SCREEN = { MENU: 'menu', PLAY: 'play', DONE: 'done' }

/** How the game narrates itself. Text only — no speech synthesis, so it never
 *  fights a screen reader the player is already running. */
function bearingWords(bearing) {
  const deg = Math.round((bearing * 180) / Math.PI)
  if (Math.abs(deg) < 12) return 'dead ahead'
  const side = deg < 0 ? 'left' : 'right'
  const amount = Math.abs(deg)
  if (amount > 150) return 'behind you'
  if (amount > 100) return `behind you, ${side}`
  if (amount < 40) return `slightly ${side}`
  if (amount < 75) return `${side}`
  return `hard ${side}`
}

export default function Page() {
  const [screen, setScreen] = useState(SCREEN.MENU)
  const [levelIndex, setLevelIndex] = useState(0)
  const [blind, setBlind] = useState(false)
  const [hud, setHud] = useState(null)
  const [cursor, setCursor] = useState(0)
  const [muted, setMuted] = useState(false)

  const audioRef = useRef(null)
  const inputRef = useRef(null)
  const engineRef = useRef(null)
  const rafRef = useRef(0)

  if (!audioRef.current) audioRef.current = new Audio()
  if (!inputRef.current) inputRef.current = new Input()

  // --- start a level ---
  const launch = useCallback(async (index) => {
    await audioRef.current.start()
    engineRef.current = new Engine(LEVELS[index]).reset()
    setLevelIndex(index)
    setScreen(SCREEN.PLAY)
  }, [])

  // --- the loop ---
  useEffect(() => {
    if (screen !== SCREEN.PLAY) return
    const input = inputRef.current
    const audio = audioRef.current
    let last = performance.now()

    const frame = (now) => {
      rafRef.current = requestAnimationFrame(frame)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      const engine = engineRef.current
      if (!engine) return

      input.poll()
      const edges = input.consume()
      const before = engine.index

      engine.step(dt, {
        turn: input.turn,
        throttle: input.throttle,
        listen: input.listen,
        ping: edges.ping,
        interact: edges.interact,
      })

      // --- react to what the engine emitted ---
      for (const ev of engine.events) {
        if (ev.type === 'ping') {
          audio.ping(ev.onTarget)
          audio.echoes(ev.hits)
        } else if (ev.type === 'approach') {
          audio.approachTick(ev.bearing, ev.distance)
        } else if (ev.type === 'listen') {
          audio.setListen(ev.level, ev.distance)
        } else if (ev.type === 'bump') {
          audio.thud(ev.strength)
        } else if (ev.type === 'denied') {
          audio.deny()
        } else if (ev.type === 'objective') {
          audio.confirm(ev.remaining)
        } else if (ev.type === 'exitOpen') {
          audio.confirm(3)
        } else if (ev.type === 'complete') {
          audio.fanfare()
        }
      }
      audio.setThrottle(Math.abs(engine.player.throttle))

      // --- the on-screen readout (hidden in blind mode) ---
      if (engine.index !== before || engine.time % 0.1 < dt) {
        const t = engine.target
        setHud({
          index: engine.index,
          total: engine.objectives.length,
          label: t ? t.label : '',
          distance: Math.round(engine.targetDistance),
          bearing: bearingWords(engine.targetBearing),
          done: engine.finished,
        })
      }

      if (engine.finished) {
        setScreen(SCREEN.DONE)
        setHud((h) => ({ ...h, done: true }))
      }
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(rafRef.current)
  }, [screen])

  // --- menu keyboard nav ---
  useEffect(() => {
    if (screen !== SCREEN.MENU) return
    const onKey = (e) => {
      if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        setCursor((c) => (c + 1) % LEVELS.length)
        audioRef.current.tick()
      } else if (e.code === 'ArrowUp' || e.code === 'KeyW') {
        setCursor((c) => (c - 1 + LEVELS.length) % LEVELS.length)
        audioRef.current.tick()
      } else if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault()
        launch(cursor)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [screen, cursor, launch])

  // --- input lives for the whole session, on every screen ---
  useEffect(() => {
    const input = inputRef.current
    input.attach()
    input.onEscape = () => setScreen((s) => (s === SCREEN.PLAY ? SCREEN.MENU : s))
    input.onMute = () => setMuted((m) => !m)
    return () => input.detach()
  }, [])

  const toggleMute = () => setMuted((m) => !m)

  // One place where mute actually reaches the audio graph, so the M key, the
  // button and the initial state can never disagree.
  useEffect(() => {
    audioRef.current.setMuted(muted)
  }, [muted])

  // ===================== MENU =====================
  if (screen === SCREEN.MENU) {
    return (
      <main className="wrap">
        <h1>mission beyond vision</h1>
        <p className="sub">A space mission you fly with your ears.</p>

        <div className="panel">
          <p className="hint">Choose a mission — arrow keys, then Enter.</p>
          <ul className="levels">
            {LEVELS.map((l, i) => (
              <li key={l.id}>
                <button
                  className={i === cursor ? 'level sel' : 'level'}
                  onClick={() => setCursor(i)}
                  onDoubleClick={() => launch(i)}
                >
                  <strong>{l.name}</strong>
                  <span>{l.brief}</span>
                </button>
              </li>
            ))}
          </ul>
          <button className="go" onClick={() => launch(cursor)}>
            Launch {LEVELS[cursor].name}
          </button>
        </div>

        <Controls />
      </main>
    )
  }

  // ===================== DONE =====================
  if (screen === SCREEN.DONE) {
    const next = levelIndex + 1
    return (
      <main className="wrap">
        <h1>mission complete</h1>
        <p className="sub">{LEVELS[levelIndex].name} — done.</p>
        <div className="panel">
          {next < LEVELS.length ? (
            <button className="go" onClick={() => launch(next)}>
              Next: {LEVELS[next].name}
            </button>
          ) : (
            <p className="hint">That was the last one. Nice flying.</p>
          )}
          <button className="ghost" onClick={() => setScreen(SCREEN.MENU)}>
            Mission list
          </button>
        </div>
      </main>
    )
  }

  // ===================== PLAYING =====================
  return (
    <main className="wrap play">
      {!blind && (
        <>
          <Scope engine={engineRef.current} width={640} height={480} />
          {hud && (
            <div className="hud">
              <span>
                Objective {Math.min(hud.index + 1, hud.total)} of {hud.total} — {hud.label}
              </span>
              <span>
                {hud.distance} units, {hud.bearing}
              </span>
            </div>
          )}
        </>
      )}

      <div className="bar">
        <button className="ghost" onClick={() => setBlind((b) => !b)} aria-pressed={blind}>
          {blind ? 'Show scope' : 'Blind mode'}
        </button>
        <button className="ghost" onClick={toggleMute}>
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <button className="ghost" onClick={() => setScreen(SCREEN.MENU)}>
          Quit
        </button>
      </div>

      {blind && <p className="hint">Scope hidden. Fly by ear — Space to ping, E to interact.</p>}
    </main>
  )
}

function Controls() {
  return (
    <div className="panel controls">
      <h2>Controls</h2>
      <div className="cols">
        <div>
          <h3>Gamepad</h3>
          <ul>
            <li>Right stick left/right — turn</li>
            <li>Left stick up/down — drive forward / back</li>
            <li>B or right trigger — ping</li>
            <li>A — interact</li>
            <li>Left bumper — hold to listen</li>
          </ul>
        </div>
        <div>
          <h3>Keyboard</h3>
          <ul>
            <li>Left / Right arrows — turn</li>
            <li>Up / Down arrows — drive</li>
            <li>Space — ping</li>
            <li>E or Enter — interact</li>
            <li>Shift — hold to listen</li>
            <li>M — mute</li>
          </ul>
        </div>
      </div>
      <p className="hint">
        You only move where you are facing. Ping sends out a chirp; each wall
        answers with a tone — later means further away, and the tone is panned
        to the side it came from.
      </p>
    </div>
  )
}
