/**
 * AnimationContract — the canonical set of animation clips every agent skin must provide.
 *
 * The UI renderer will validate that all required clips are present before displaying
 * an agent. Missing clips fall back to the nearest available animation rather than
 * showing nothing or crashing.
 *
 * Directional coverage:
 *   front  → agent facing camera (walking towards viewer)
 *   back   → agent facing away from camera
 *   side   → agent facing right; mirrored programmatically for left
 *
 * This gives 4-direction movement (front / back / side-right / side-left) with
 * only 3 sprite sets. Add _northeast/_northwest etc. for 8-way if assets allow.
 */

export type AnimationClipId =
  // Required idle clips
  | 'idle_front'
  | 'idle_back'
  | 'idle_side'
  // Required walk clips
  | 'walk_front'
  | 'walk_back'
  | 'walk_side'
  // Optional transition clips (graceful-degrade to nearest idle/walk)
  | 'start_walk_front'
  | 'start_walk_back'
  | 'start_walk_side'
  | 'stop_walk_front'
  | 'stop_walk_back'
  | 'stop_walk_side'
  // Optional turn-in-place
  | 'turn_left'
  | 'turn_right'
  // Optional interact
  | 'interact_front'
  | 'interact_back'
  | 'interact_side';

export const REQUIRED_CLIPS: AnimationClipId[] = [
  'idle_front',
  'idle_back',
  'idle_side',
  'walk_front',
  'walk_back',
  'walk_side',
];

/** A single animation clip — a slice of a sprite sheet or a list of frame URLs. */
export interface AnimationClip {
  id: AnimationClipId;
  /** Width of a single frame in pixels. */
  frameWidth: number;
  /** Height of a single frame in pixels. */
  frameHeight: number;
  /** Total number of frames in this clip. */
  frameCount: number;
  /** Playback speed in frames per second. */
  fps: number;
  /** Whether the clip loops. Walk/idle loop; transition clips typically don't. */
  loop: boolean;
  /**
   * Sprite sheet URL relative to the agent's asset root.
   * The renderer expects horizontal strips: frame 0 starts at x=0.
   */
  spriteSheetUrl: string;
  /**
   * When true, the renderer flips this clip horizontally to cover the mirrored direction.
   * e.g. 'walk_side' covers both right AND left — set flip=true for leftward movement.
   */
  mirrorable?: boolean;
}

/** Complete animation manifest for one agent skin/type. */
export interface AgentAnimationManifest {
  /** Matches AgentProfile.role or a custom skin identifier. */
  skinId: string;
  /** Display name, e.g. "Knight – Blue". */
  displayName: string;
  /** Base path for resolving spriteSheetUrl values. */
  assetRoot: string;
  clips: Partial<Record<AnimationClipId, AnimationClip>>;
}

/**
 * Validates that all REQUIRED_CLIPS are present in a manifest.
 * Returns the list of missing clip IDs (empty array = valid).
 */
export function validateManifest(manifest: AgentAnimationManifest): AnimationClipId[] {
  return REQUIRED_CLIPS.filter((id) => !manifest.clips[id]);
}

/**
 * Resolves the best available clip for a desired animation, with graceful fallback.
 * Fallback chain:
 *   start_walk_* → walk_*
 *   stop_walk_*  → idle_*
 *   turn_*       → idle_front
 *   interact_*   → idle_*
 *   missing walk/idle direction → idle_front (last resort)
 */
export function resolveClip(
  manifest: AgentAnimationManifest,
  desired: AnimationClipId
): AnimationClip | null {
  if (manifest.clips[desired]) return manifest.clips[desired]!;

  const fallbacks: Partial<Record<AnimationClipId, AnimationClipId>> = {
    start_walk_front: 'walk_front',
    start_walk_back: 'walk_back',
    start_walk_side: 'walk_side',
    stop_walk_front: 'idle_front',
    stop_walk_back: 'idle_back',
    stop_walk_side: 'idle_side',
    turn_left: 'idle_front',
    turn_right: 'idle_front',
    interact_front: 'idle_front',
    interact_back: 'idle_back',
    interact_side: 'idle_side',
    walk_back: 'walk_front',
    walk_side: 'walk_front',
    idle_back: 'idle_front',
    idle_side: 'idle_front',
  };

  const next = fallbacks[desired];
  if (next && manifest.clips[next]) return manifest.clips[next]!;
  // Final fallback
  return manifest.clips['idle_front'] ?? null;
}
