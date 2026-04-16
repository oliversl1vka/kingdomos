/**
 * AgentsPage — the reference agent visualisation page.
 *
 * Features demonstrated:
 *  - Animated agents roaming the map with full locomotion state machine
 *  - Click-to-move: click anywhere on the canvas to send the selected agent there
 *  - Depth sorting and perspective scale
 *  - Role-colour coded placeholders (drop in real sprites by updating manifests.ts)
 *  - Agent panel showing live status, phase, and direction
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAgentCanvas } from '../hooks/useAgentCanvas.ts';
import { DEFAULT_MANIFESTS } from '../assets/manifests.ts';
import type { Vec2 } from '../engine/NavigationEngine.ts';
import '../styles/agents.css';

// ---------------------------------------------------------------------------
// Demo agents
// ---------------------------------------------------------------------------

const DEMO_AGENTS = [
  { id: 'monarch-1',   role: 'monarch',   displayName: 'King Aldric',   color: '#c9a227', position: { x: 400, y: 280 } },
  { id: 'herald-1',    role: 'herald',    displayName: 'Herald Vorn',   color: '#4a90d9', position: { x: 250, y: 350 } },
  { id: 'knight-1',    role: 'knight',    displayName: 'Sir Cedric',    color: '#e05252', position: { x: 550, y: 380 } },
  { id: 'scribe-1',    role: 'scribe',    displayName: 'Scribe Elara',  color: '#7cbb5c', position: { x: 320, y: 420 } },
  { id: 'sentinel-1',  role: 'sentinel',  displayName: 'Sentinel Mira', color: '#9b59b6', position: { x: 480, y: 450 } },
  { id: 'alchemist-1', role: 'alchemist', displayName: 'Alch. Zephyr',  color: '#e67e22', position: { x: 200, y: 480 } },
  { id: 'sage-1',      role: 'sage',      displayName: 'Sage Orin',     color: '#1abc9c', position: { x: 620, y: 300 } },
];

const CANVAS_W = 800;
const CANVAS_H = 560;

export default function AgentsPage() {
  const [selectedId, setSelectedId] = useState<string>(DEMO_AGENTS[0].id);
  const [autoRoam, setAutoRoam] = useState(true);
  const roamRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { canvasRef, setTarget, addAgent } = useAgentCanvas({
    width: CANVAS_W,
    height: CANVAS_H,
    initialAgents: DEMO_AGENTS.map((a) => ({
      ...a,
      manifest: DEFAULT_MANIFESTS[a.role] ?? null,
    })),
  });

  // Auto-roam: periodically assign random destinations to all agents
  const startRoam = useCallback(() => {
    roamRef.current = setInterval(() => {
      for (const agent of DEMO_AGENTS) {
        const marginX = 80;
        const marginY = 60;
        const target: Vec2 = {
          x: marginX + Math.random() * (CANVAS_W - marginX * 2),
          y: CANVAS_H * 0.45 + marginY + Math.random() * (CANVAS_H * 0.55 - marginY * 2),
        };
        setTarget(agent.id, target);
      }
    }, 3500);
  }, [setTarget]);

  const stopRoam = useCallback(() => {
    if (roamRef.current !== null) {
      clearInterval(roamRef.current);
      roamRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (autoRoam) startRoam();
    else stopRoam();
    return stopRoam;
  }, [autoRoam, startRoam, stopRoam]);

  // Click-to-move for selected agent
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const scaleY = CANVAS_H / rect.height;
      const target: Vec2 = {
        x: (e.clientX - rect.left) * scaleX,
        y: (e.clientY - rect.top) * scaleY,
      };
      setTarget(selectedId, target);
    },
    [selectedId, setTarget]
  );

  return (
    <div className="agents-page">
      <div className="agents-header">
        <h1>Kingdom Agents</h1>
        <div className="agents-controls">
          <label className="roam-toggle">
            <input
              type="checkbox"
              checked={autoRoam}
              onChange={(e) => setAutoRoam(e.target.checked)}
            />
            Auto-roam
          </label>
          <span className="click-hint">
            {autoRoam ? 'Select an agent and click the map to send them somewhere.' : 'Click the map to move the selected agent.'}
          </span>
        </div>
      </div>

      <div className="agents-layout">
        {/* Agent list sidebar */}
        <aside className="agent-list">
          {DEMO_AGENTS.map((a) => (
            <button
              key={a.id}
              className={`agent-card ${selectedId === a.id ? 'selected' : ''}`}
              style={{ '--agent-color': a.color } as React.CSSProperties}
              onClick={() => setSelectedId(a.id)}
            >
              <span className="agent-card-dot" />
              <span className="agent-card-name">{a.displayName}</span>
              <span className="agent-card-role">{a.role}</span>
            </button>
          ))}
        </aside>

        {/* Canvas */}
        <div className="canvas-wrapper">
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className="agents-canvas"
            onClick={handleCanvasClick}
          />
          <div className="canvas-legend">
            Click map → move selected agent &nbsp;|&nbsp; Toggle Auto-roam to watch them wander
          </div>
        </div>
      </div>
    </div>
  );
}
