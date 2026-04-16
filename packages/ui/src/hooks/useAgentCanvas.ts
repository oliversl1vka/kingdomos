/**
 * useAgentCanvas — React hook that owns the full per-frame update loop.
 *
 * Responsibilities:
 *  - Manage a list of agent runtime states (nav + ASM + frame state)
 *  - Run the rAF game loop (nav step → ASM step → render)
 *  - Depth-sort agents by Y position each frame (painter's algorithm)
 *  - Accept external commands: setTarget, addAgent, removeAgent
 *
 * Returns a ref to attach to a <canvas> element plus control functions.
 */

import { useRef, useEffect, useCallback } from 'react';
import {
  createNavState,
  stepNav,
  type AgentNavState,
  type Vec2,
} from '../engine/NavigationEngine.ts';
import {
  createASMState,
  stepASM,
  type ASMState,
} from '../engine/AnimationStateMachine.ts';
import {
  createFrameState,
  advanceFrame,
  drawAgent,
  drawPlaceholder,
  type SpriteFrameState,
} from '../engine/SpriteRenderer.ts';
import type { AgentAnimationManifest as Manifest } from '@kingdomos/core';
import { resolveClip } from '@kingdomos/core';

// ---------------------------------------------------------------------------
// Runtime agent record
// ---------------------------------------------------------------------------

export interface AgentRuntimeState {
  id: string;
  role: string;
  displayName: string;
  color: string;
  manifest: Manifest | null;
  nav: AgentNavState;
  asm: ASMState;
  frame: SpriteFrameState;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

interface UseAgentCanvasOptions {
  width: number;
  height: number;
  initialAgents?: Array<{
    id: string;
    role: string;
    displayName: string;
    color: string;
    position: Vec2;
    manifest?: Manifest;
  }>;
}

const ROLE_COLORS: Record<string, string> = {
  monarch:   '#c9a227',
  herald:    '#4a90d9',
  knight:    '#e05252',
  scribe:    '#7cbb5c',
  sentinel:  '#9b59b6',
  alchemist: '#e67e22',
  sage:      '#1abc9c',
};

export function useAgentCanvas({ width, height, initialAgents = [] }: UseAgentCanvasOptions) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const agentsRef = useRef<Map<string, AgentRuntimeState>>(new Map());
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // Initialise agents
  useEffect(() => {
    const map = agentsRef.current;
    for (const a of initialAgents) {
      map.set(a.id, {
        id: a.id,
        role: a.role,
        displayName: a.displayName,
        color: a.color ?? ROLE_COLORS[a.role] ?? '#888',
        manifest: a.manifest ?? null,
        nav: createNavState(a.id, a.position),
        asm: createASMState(),
        frame: createFrameState(),
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Game loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    function loop(timestamp: number) {
      const dt = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05); // cap at 50ms
      lastTimeRef.current = timestamp;

      ctx!.clearRect(0, 0, width, height);

      // Draw background
      drawBackground(ctx!, width, height);

      // Update + collect agents for depth sort
      const agents = [...agentsRef.current.values()];

      for (const agent of agents) {
        agent.nav = stepNav(agent.nav, dt);
        agent.asm = stepASM(agent.asm, agent.nav.speed, agent.nav.smoothHeading, dt);
      }

      // Depth sort by Y (painter's algorithm: lower Y = further back = drawn first)
      agents.sort((a, b) => a.nav.position.y - b.nav.position.y);

      // Perspective scale: agents near bottom of screen appear larger
      for (const agent of agents) {
        const depthT = agent.nav.position.y / height; // 0 = top, 1 = bottom
        const scale = 0.65 + depthT * 0.55; // range 0.65–1.2

        if (agent.manifest) {
          const clip = resolveClip(agent.manifest, agent.asm.clipId);
          if (clip) {
            agent.frame = advanceFrame(agent.frame, clip, dt, agent.asm.playbackRate);
            drawAgent({
              ctx: ctx!,
              clip,
              frameState: agent.frame,
              x: agent.nav.position.x,
              y: agent.nav.position.y,
              flipX: agent.asm.flipX,
              scale,
              assetRoot: agent.manifest.assetRoot,
            });
          } else {
            drawPlaceholder(ctx!, agent.nav.position.x, agent.nav.position.y, agent.role, agent.color, scale, agent.nav.smoothHeading);
          }
        } else {
          drawPlaceholder(ctx!, agent.nav.position.x, agent.nav.position.y, agent.role, agent.color, scale, agent.nav.smoothHeading);
        }

        // Name label
        drawLabel(ctx!, agent.nav.position.x, agent.nav.position.y, agent.displayName, scale);
      }

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [width, height]);

  // ---------------------------------------------------------------------------
  // Control API
  // ---------------------------------------------------------------------------

  const setTarget = useCallback((agentId: string, target: Vec2) => {
    const agent = agentsRef.current.get(agentId);
    if (!agent) return;
    agent.nav = { ...agent.nav, target: { ...target } };
  }, []);

  const addAgent = useCallback((params: {
    id: string;
    role: string;
    displayName: string;
    color?: string;
    position: Vec2;
    manifest?: Manifest;
  }) => {
    agentsRef.current.set(params.id, {
      id: params.id,
      role: params.role,
      displayName: params.displayName,
      color: params.color ?? ROLE_COLORS[params.role] ?? '#888',
      manifest: params.manifest ?? null,
      nav: createNavState(params.id, params.position),
      asm: createASMState(),
      frame: createFrameState(),
    });
  }, []);

  const removeAgent = useCallback((agentId: string) => {
    agentsRef.current.delete(agentId);
  }, []);

  return { canvasRef, setTarget, addAgent, removeAgent };
}

// ---------------------------------------------------------------------------
// Canvas background helpers
// ---------------------------------------------------------------------------

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  // Sky gradient
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.45);
  sky.addColorStop(0, '#1a1a2e');
  sky.addColorStop(1, '#2d3561');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h * 0.45);

  // Ground gradient
  const ground = ctx.createLinearGradient(0, h * 0.45, 0, h);
  ground.addColorStop(0, '#2e4a1e');
  ground.addColorStop(1, '#1a2d11');
  ctx.fillStyle = ground;
  ctx.fillRect(0, h * 0.45, w, h * 0.55);

  // Horizon line
  ctx.beginPath();
  ctx.moveTo(0, h * 0.45);
  ctx.lineTo(w, h * 0.45);
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Perspective grid lines
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 1;
  const horizonY = h * 0.45;
  const vp = { x: w / 2, y: horizonY };
  const numLines = 12;
  for (let i = 0; i <= numLines; i++) {
    const groundX = (i / numLines) * w;
    ctx.beginPath();
    ctx.moveTo(vp.x, vp.y);
    ctx.lineTo(groundX, h);
    ctx.stroke();
  }
  // Horizontal rows
  for (let i = 1; i <= 6; i++) {
    const t = i / 6;
    const rowY = horizonY + (h - horizonY) * (t * t); // quadratic spacing for perspective
    ctx.beginPath();
    ctx.moveTo(0, rowY);
    ctx.lineTo(w, rowY);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  scale: number
): void {
  const fontSize = Math.round(10 * scale);
  ctx.save();
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const metrics = ctx.measureText(label);
  const pad = 3 * scale;
  const bw = metrics.width + pad * 2;
  const bh = fontSize + pad * 2;
  const bx = x - bw / 2;
  const by = y + 4 * scale;

  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, 3);
  ctx.fill();

  ctx.fillStyle = '#e8e8e8';
  ctx.fillText(label, x, by + pad);
  ctx.restore();
}
