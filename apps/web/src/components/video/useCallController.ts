'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Room } from 'livekit-client'
import { CallController, type CallControllerOptions, type CallRoomLike, type CallState } from './callController'

/** Binds a CallController to the LiveKit room for the lifetime of the call screen. */
export function useCallController(room: Room, opts: CallControllerOptions): { controller: CallController; state: CallState } {
  // Options are read once: the controller owns the call state afterwards
  const [controller] = useState(() => new CallController(room as unknown as CallRoomLike, opts))
  useEffect(() => {
    controller.start()
    return () => controller.dispose()
  }, [controller])
  const state = useSyncExternalStore(controller.subscribe, controller.getState, controller.getState)
  return { controller, state }
}
