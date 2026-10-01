/**
 * Scope.jsx — the visible 2D plane.
 *
 * This is the part a sighted player looks at and the part the BLIND MODE button
 * switches off. It reads engine state and draws it; it never changes the game.
 * Hiding it must not change one thing about how the game plays, which is the
 * whole promise of the audio design.
 */

'use client'

import { useEffect, useRef } from 'react'

const BG = '#07090f'
const WALL_EDGE = '#3d4a6b'
const ROOM = '#4a5a80'
const DONE = '#2f6b4f'
const LIVE = '#ffd166'
const EXIT_OPEN = '#7ee0a0'
const EXIT_SHUT = '#5a4a6b'

/** Tints match the pitch each material answers a ping with, so a sighted
 *  player learns the same mapping a blind player learns by ear. */
const MAT_COLOR = {
  hull: '#2b3550',
  grate: '#31405e',
  crate: '#3a3350',
  rock: '#2f3a44',
  ice: '#2b4a5c',
}

export default function Scope({ engine, width = 620, height = 460 }) {
  const canvasRef = useRef(null)
  const engineRef = useRef(engine)
  engineRef.current = engine

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let raf = 0

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const e = engineRef.current
      if (!e) return

      const { room } = e.level
      // Fit the whole level into the canvas, letterboxed.
      const scale = Math.min(width / room.w, height / room.h)
      const ox = (width - room.w * scale) / 2
      const oy = (height - room.h * scale) / 2
      const X = (x) => ox + (x - room.x) * scale
      const Y = (y) => oy + (y - room.y) * scale

      ctx.fillStyle = BG
      ctx.fillRect(0, 0, width, height)

      // --- hull ---
      ctx.strokeStyle = ROOM
      ctx.lineWidth = 3
      ctx.strokeRect(X(room.x), Y(room.y), room.w * scale, room.h * scale)

      // --- interior blocks ---
      for (const w of e.solids) {
        if (w.outer) continue // the room outline above already covers these
        ctx.fillStyle = MAT_COLOR[w.mat] || MAT_COLOR.hull
        ctx.fillRect(X(w.x), Y(w.y), w.w * scale, w.h * scale)
        ctx.strokeStyle = WALL_EDGE
        ctx.lineWidth = 1
        ctx.strokeRect(X(w.x), Y(w.y), w.w * scale, w.h * scale)
      }

      // --- ping rings: the echoes, drawn as they would sound ---
      for (const ping of e.pings) {
        const age = e.time - ping.born
        const life = (ping.range * 0.0024) + 0.5
        const t = age / life
        if (t < 0 || t > 1) continue
        ctx.strokeStyle = `rgba(120, 200, 255, ${0.5 * (1 - t)})`
        ctx.lineWidth = 2
        for (const hit of ping.hits) {
          const d = hit.dist * scale * t
          ctx.beginPath()
          ctx.arc(X(e.player.x), Y(e.player.y), d, hit.world - 0.09, hit.world + 0.09)
          ctx.stroke()
        }
      }

      // --- objectives ---
      for (const o of e.objectives) {
        const cx = X(o.x)
        const cy = Y(o.y)
        ctx.beginPath()
        ctx.arc(cx, cy, 9, 0, Math.PI * 2)
        ctx.fillStyle = o.done ? DONE : o.index === e.index ? LIVE : '#7a6a3a'
        ctx.fill()
        if (o.index === e.index && !o.done) {
          // A ring around whatever you are being sent to next.
          ctx.strokeStyle = LIVE
          ctx.lineWidth = 2
          ctx.beginPath()
          ctx.arc(cx, cy, 16 + Math.sin(e.time * 4) * 3, 0, Math.PI * 2)
          ctx.stroke()
        }
      }

      // --- exit ---
      const ex = X(e.exit.x)
      const ey = Y(e.exit.y)
      ctx.strokeStyle = e.exit.open ? EXIT_OPEN : EXIT_SHUT
      ctx.lineWidth = 3
      ctx.strokeRect(ex - 10, ey - 10, 20, 20)
      if (e.exit.open) {
        ctx.fillStyle = EXIT_OPEN
        ctx.font = '11px system-ui, sans-serif'
        ctx.textAlign = 'center'
        ctx.fillText(e.exit.label, ex, ey - 18)
      }

      // --- the rover, pointing where it faces ---
      const px = X(e.player.x)
      const py = Y(e.player.y)
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(e.player.angle)
      ctx.fillStyle = e.player.bump > 0.2 ? '#ff8a6b' : '#8fd3ff'
      ctx.beginPath()
      ctx.moveTo(14, 0)
      ctx.lineTo(-9, 8)
      ctx.lineTo(-5, 0)
      ctx.lineTo(-9, -8)
      ctx.closePath()
      ctx.fill()
      ctx.restore()

      // --- the cone it is about to sweep ---
      ctx.strokeStyle = 'rgba(143, 211, 255, 0.25)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(px, py)
      ctx.arc(px, py, 70 * scale * 1.6, e.player.angle - 0.5, e.player.angle + 0.5)
      ctx.closePath()
      ctx.stroke()
    }

    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [engine, width, height])

  return <canvas ref={canvasRef} width={width} height={height} style={{ display: 'block', borderRadius: 8, maxWidth: '100%' }} />
}
