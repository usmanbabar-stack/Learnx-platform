"use client"

import { useEffect } from "react"

export function MouseTrail() {
  useEffect(() => {
    const createTrail = (e: MouseEvent) => {
      const trail = document.createElement("div")
      trail.className = "mouse-trail"
      trail.style.left = e.clientX - 4 + "px"
      trail.style.top = e.clientY - 4 + "px"

      document.body.appendChild(trail)

      setTimeout(() => {
        if (trail.parentNode) {
          trail.parentNode.removeChild(trail)
        }
      }, 800)
    }

    let throttleTimer: NodeJS.Timeout | null = null
    const throttledCreateTrail = (e: MouseEvent) => {
      if (throttleTimer === null) {
        throttleTimer = setTimeout(() => {
          createTrail(e)
          throttleTimer = null
        }, 16) // ~60fps
      }
    }

    document.addEventListener("mousemove", throttledCreateTrail)

    return () => {
      document.removeEventListener("mousemove", throttledCreateTrail)
      if (throttleTimer) {
        clearTimeout(throttleTimer)
      }
    }
  }, [])

  return null
}
