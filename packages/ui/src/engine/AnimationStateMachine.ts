/**
 * AnimationStateMachine — translates navigation state into animation decisions.
 *
 * Each agent has one ASM instance. The ASM:
 *   1. Receives nav state (speed, smoothHeading) every frame
 *   2. Determines the desired animation state (idle vs walk, direction)
 *   3. Handles transitions (start_walk, stop_walk) with blend timers
 *   4. Exposes the current clip ID + playback parameters for the renderer
 *
 * The ASM is intentionally decoupled from the asset system — it only emits
 * clip IDs (strings), not actual sprite data. The renderer resolves them.
 */

import type { AnimationClipId } from '@kingdomos/core';

// ---------------------------------------------------------------------------
// Direction from heading
// ---------------------------------------------------------------------------

export type FacingDirection = 'front' | 'back' | 'side_right' | 'side_left';

/**
 * Convert a heading angle (radians, 0 = right, π/2 = down in screen space)
 * to a facing direction.
 *
 * Sector boundaries (using screen convention where +y = down):
 *   back       → heading near -π/2  (upward on screen)
 *   front      → heading near  π/2  (downward on screen)
 *   side_right → heading near   0   (rightward)
 *   side_left  → heading near  ±π   (leftward)
 *
 * 67.5° sector per direction for clean 4-way mapping.
 */
export function headingToDirection(heading: number): FacingDirection {
  // Normalise to [0, 2π)
  const h = ((heading % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  // In screen-space (y down): 0=right, π/2=down(front), π=left, 3π/2=up(back)
  if (h >= 0 && h < Math.PI / 8) return 'side_right';
  if (h >= Math.PI / 8 && h < (3 * Math.PI) / 8) return 'front';
  if (h >= (3 * Math.PI) / 8 && h < (5 * Math.PI) / 8) return 'front';
  if (h >= (5 * Math.PI) / 8 && h < (7 * Math.PI) / 8) return 'side_left';
  if (h >= (7 * Math.PI) / 8 && h < (9 * Math.PI) / 8) return 'side_left';
  if (h >= (9 * Math.PI) / 8 && h < (11 * Math.PI) / 8) return 'back';
  if (h >= (11 * Math.PI) / 8 && h < (13 * Math.PI) / 8) return 'back';
  if (h >= (13 * Math.PI) / 8 && h < (15 * Math.PI) / 8) return 'side_right';
  return 'side_right';
}

// ---------------------------------------------------------------------------
// ASM state
// ---------------------------------------------------------------------------

export type AnimPhase =
  | 'idle'
  | 'start_walk'   // brief transition into walking
  | 'walk'
  | 'stop_walk';   // brief transition back to idle

export interface ASMState {
  phase: AnimPhase;
  direction: FacingDirection;
  /** Whether the side clip should be flipped horizontally. */
  flipX: boolean;
  /** Current clip that should play. */
  clipId: AnimationClipId;
  /** Playback speed multiplier (1 = normal, 0.5 = slow, 2 = fast). */
  playbackRate: number;
  /** Time in current phase (seconds). */
  phaseTime: number;
}

const TRANSITION_DURATION = 0.12; // seconds — length of start/stop walk transitions
const SPEED_TO_WALK_THRESHOLD = 8; // world units/s — below this, agent is considered idle
const SPEED_SCALE_REF = 80;        // world units/s — speed at which playbackRate === 1

function directionToClipSuffix(dir: FacingDirection): '_front' | '_back' | '_side' {
  switch (dir) {
    case 'front':      return '_front';
    case 'back':       return '_back';
    case 'side_right':
    case 'side_left':  return '_side';
  }
}

function buildClipId(phase: AnimPhase, dir: FacingDirection): AnimationClipId {
  const suffix = directionToClipSuffix(dir);
  switch (phase) {
    case 'start_walk':  return `start_walk${suffix}` as AnimationClipId;
    case 'walk':        return `walk${suffix}` as AnimationClipId;
    case 'stop_walk':   return `stop_walk${suffix}` as AnimationClipId;
    case 'idle':
    default:            return `idle${suffix}` as AnimationClipId;
  }
}

export function createASMState(): ASMState {
  return {
    phase: 'idle',
    direction: 'front',
    flipX: false,
    clipId: 'idle_front',
    playbackRate: 1,
    phaseTime: 0,
  };
}

/**
 * Advance the ASM by one frame.
 * @param state   Current ASM state (immutable — returns new state)
 * @param speed   Current movement speed (world units/s) from NavigationEngine
 * @param heading Smooth heading from NavigationEngine
 * @param dt      Delta time in seconds
 */
export function stepASM(
  state: ASMState,
  speed: number,
  heading: number,
  dt: number
): ASMState {
  const desiredDirection = headingToDirection(heading);
  const flipX = desiredDirection === 'side_left';
  // Normalise direction for clip lookup (side_left uses side clip, flipped)
  const clipDirection: FacingDirection =
    desiredDirection === 'side_left' ? 'side_right' : desiredDirection;

  const wantsWalk = speed > SPEED_TO_WALK_THRESHOLD;
  const phaseTime = state.phaseTime + dt;

  let phase = state.phase;

  // Phase transitions
  switch (state.phase) {
    case 'idle':
      if (wantsWalk) phase = 'start_walk';
      break;

    case 'start_walk':
      if (!wantsWalk) {
        phase = 'idle';
      } else if (phaseTime >= TRANSITION_DURATION) {
        phase = 'walk';
      }
      break;

    case 'walk':
      if (!wantsWalk) phase = 'stop_walk';
      break;

    case 'stop_walk':
      if (wantsWalk) {
        phase = 'start_walk';
      } else if (phaseTime >= TRANSITION_DURATION) {
        phase = 'idle';
      }
      break;
  }

  const resetPhaseTime = phase !== state.phase;
  const playbackRate = wantsWalk
    ? Math.max(0.5, Math.min(2, speed / SPEED_SCALE_REF))
    : 1;

  const clipId = buildClipId(phase, clipDirection);

  return {
    phase,
    direction: desiredDirection,
    flipX,
    clipId,
    playbackRate,
    phaseTime: resetPhaseTime ? 0 : phaseTime,
  };
}
