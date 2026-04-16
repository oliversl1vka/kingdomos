/**
 * SpriteRenderer — low-level canvas drawing utilities for sprite-sheet animations.
 *
 * Responsibilities:
 *   - Load and cache sprite sheet images
 *   - Advance frame timers
 *   - Draw the correct frame with optional horizontal flip
 *   - Draw agent shadow and optional depth-based scale
 *
 * This module is pure functions + a mutable image cache — it has no React
 * dependencies so it can be unit-tested without a DOM.
 */

import type { AnimationClip } from '@kingdomos/core';

// ---------------------------------------------------------------------------
// Image cache
// ---------------------------------------------------------------------------

const imageCache = new Map<string, HTMLImageElement | 'loading' | 'error'>();

/**
 * Preload an image URL.  Returns the image if already cached, or kicks off
 * loading.  The renderer will skip drawing until the image is ready.
 */
export function preloadImage(url: string): HTMLImageElement | null {
  const cached = imageCache.get(url);
  if (cached instanceof HTMLImageElement) return cached;
  if (cached === 'loading' || cached === 'error') return null;

  imageCache.set(url, 'loading');
  const img = new Image();
  img.onload = () => imageCache.set(url, img);
  img.onerror = () => imageCache.set(url, 'error');
  img.src = url;
  return null;
}

export function getImage(url: string): HTMLImageElement | null {
  const cached = imageCache.get(url);
  return cached instanceof HTMLImageElement ? cached : null;
}

// ---------------------------------------------------------------------------
// Frame state
// ---------------------------------------------------------------------------

export interface SpriteFrameState {
  /** Accumulated time in this clip. */
  elapsed: number;
  /** Current frame index (0-based). */
  frame: number;
}

export function createFrameState(): SpriteFrameState {
  return { elapsed: 0, frame: 0 };
}

/**
 * Advance frame timer.
 * Returns new (immutable) frame state.
 */
export function advanceFrame(
  state: SpriteFrameState,
  clip: AnimationClip,
  dt: number,
  playbackRate = 1
): SpriteFrameState {
  const frameDuration = 1 / (clip.fps * playbackRate);
  const elapsed = state.elapsed + dt;

  if (elapsed >= frameDuration) {
    const framesAdvanced = Math.floor(elapsed / frameDuration);
    const newFrame = clip.loop
      ? (state.frame + framesAdvanced) % clip.frameCount
      : Math.min(state.frame + framesAdvanced, clip.frameCount - 1);
    return { elapsed: elapsed % frameDuration, frame: newFrame };
  }

  return { ...state, elapsed };
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

export interface DrawAgentOptions {
  ctx: CanvasRenderingContext2D;
  clip: AnimationClip;
  frameState: SpriteFrameState;
  /** World-space X center of the agent's feet. */
  x: number;
  /** World-space Y of the agent's feet (bottom of sprite). */
  y: number;
  /** Horizontal flip for mirroring side animations. */
  flipX?: boolean;
  /** Scale factor (used for depth perspective). Default 1. */
  scale?: number;
  /** Opacity 0–1 for fade transitions. Default 1. */
  alpha?: number;
  /** Shadow config. */
  shadow?: ShadowConfig;
  /** Base URL prefix (asset root). */
  assetRoot?: string;
}

export interface ShadowConfig {
  enabled: boolean;
  /** Horizontal stretch factor (ellipse x radius as fraction of sprite width). */
  radiusX: number;
  /** Vertical stretch factor (ellipse y radius as fraction of sprite height). */
  radiusY: number;
  color: string;
  /** Additional Y offset below feet. */
  offsetY: number;
}

const DEFAULT_SHADOW: ShadowConfig = {
  enabled: true,
  radiusX: 0.28,
  radiusY: 0.07,
  color: 'rgba(0,0,0,0.25)',
  offsetY: 2,
};

export function drawAgent(options: DrawAgentOptions): void {
  const {
    ctx, clip, frameState, x, y,
    flipX = false,
    scale = 1,
    alpha = 1,
    shadow = DEFAULT_SHADOW,
    assetRoot = '',
  } = options;

  const url = assetRoot ? `${assetRoot}/${clip.spriteSheetUrl}` : clip.spriteSheetUrl;
  const img = getImage(url) ?? (preloadImage(url), null);
  if (!img) return; // image not loaded yet — skip frame

  const w = clip.frameWidth * scale;
  const h = clip.frameHeight * scale;
  const drawX = x - w / 2;
  const drawY = y - h; // Y is feet position, sprite draws upward

  ctx.save();
  ctx.globalAlpha = alpha;

  // Shadow (drawn first, behind the sprite)
  if (shadow.enabled) {
    const sx = x;
    const sy = y + shadow.offsetY;
    ctx.beginPath();
    ctx.ellipse(sx, sy, w * shadow.radiusX, h * shadow.radiusY, 0, 0, Math.PI * 2);
    ctx.fillStyle = shadow.color;
    ctx.fill();
  }

  // Flip for mirrored side animations
  if (flipX) {
    ctx.translate(x, 0);
    ctx.scale(-1, 1);
    ctx.translate(-x, 0);
  }

  // Draw the sprite frame (horizontal strip sprite sheet)
  ctx.drawImage(
    img,
    frameState.frame * clip.frameWidth, 0,  // source x, y
    clip.frameWidth, clip.frameHeight,       // source w, h
    drawX, drawY,                            // dest x, y
    w, h                                     // dest w, h
  );

  ctx.restore();
}

/**
 * Draw a simple placeholder rectangle for agents whose sprite sheet isn't loaded yet.
 * Shows role initial and a direction indicator.
 */
export function drawPlaceholder(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  color: string,
  scale = 1,
  heading = 0
): void {
  const w = 32 * scale;
  const h = 48 * scale;
  const dx = x - w / 2;
  const dy = y - h;

  // Shadow
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x, y + 2, w * 0.4, h * 0.08, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fill();

  // Body
  ctx.beginPath();
  ctx.roundRect(dx, dy, w, h, 6 * scale);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Label
  ctx.font = `bold ${13 * scale}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(label.slice(0, 2).toUpperCase(), x, dy + h / 2);

  // Direction indicator dot
  const dotDist = h * 0.52;
  const dotX = x + Math.cos(heading) * dotDist;
  const dotY = (dy + h / 2) + Math.sin(heading) * dotDist;
  ctx.beginPath();
  ctx.arc(dotX, dotY, 4 * scale, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();

  ctx.restore();
}
