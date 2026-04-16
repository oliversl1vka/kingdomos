/**
 * Default animation manifests — used as placeholders until real art assets are added.
 *
 * Each entry maps a role to its AgentAnimationManifest.
 * Clip spriteSheetUrl paths are relative to `/public/sprites/` in the Vite project.
 *
 * When real sprite sheets are available, drop them into public/sprites/<skinId>/
 * and update these paths. The animation system requires no other changes.
 *
 * Current state: all clips point to a shared placeholder sprite sheet so the system
 * runs with visible agents immediately. Replace per-clip URLs as assets are created.
 */

import type { AgentAnimationManifest, AnimationClip, AnimationClipId } from '@kingdomos/core';

const PLACEHOLDER = 'placeholder.png'; // public/sprites/placeholder.png

function makeManifest(skinId: string, displayName: string): AgentAnimationManifest {
  const root = `/sprites/${skinId}`;

  const clip = (id: AnimationClipId, frameCount: number, fps: number, loop: boolean): AnimationClip => ({
    id,
    frameWidth: 48,
    frameHeight: 64,
    frameCount,
    fps,
    loop,
    spriteSheetUrl: PLACEHOLDER,
    mirrorable: id.endsWith('_side'),
  });

  return {
    skinId,
    displayName,
    assetRoot: root,
    clips: {
      idle_front: clip('idle_front', 4, 6, true),
      idle_back:  clip('idle_back',  4, 6, true),
      idle_side:  clip('idle_side',  4, 6, true),
      walk_front: clip('walk_front', 8, 10, true),
      walk_back:  clip('walk_back',  8, 10, true),
      walk_side:  clip('walk_side',  8, 10, true),
    },
  };
}

export const DEFAULT_MANIFESTS: Record<string, AgentAnimationManifest> = {
  monarch:   makeManifest('monarch',   'Monarch'),
  herald:    makeManifest('herald',    'Herald'),
  knight:    makeManifest('knight',    'Knight'),
  scribe:    makeManifest('scribe',    'Scribe'),
  sentinel:  makeManifest('sentinel',  'Sentinel'),
  alchemist: makeManifest('alchemist', 'Alchemist'),
  sage:      makeManifest('sage',      'Sage'),
};
