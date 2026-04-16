/**
 * NavigationEngine — separates movement math from animation decisions.
 *
 * Given a set of agents with target positions, the engine produces per-frame
 * velocity vectors and headings that the AnimationStateMachine consumes to
 * pick the correct animation clip without knowing anything about rendering.
 *
 * Key design decisions:
 *  - Easing: lerp-based acceleration/deceleration, no instant position jumps
 *  - Path smoothing: Catmull-Rom spline over waypoints
 *  - Direction lock: ignore tiny heading fluctuations (< dead-zone) to prevent jitter
 *  - Speed normalisation: animation speed scales with agent speed
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface AgentNavState {
  id: string;
  position: Vec2;
  /** Target position — set from outside when a new destination is chosen. */
  target: Vec2;
  velocity: Vec2;
  /** Magnitude of velocity in world units/s. */
  speed: number;
  /** Heading angle in radians, 0 = right (+x), increasing counter-clockwise. */
  heading: number;
  /** Smoothed heading — lags behind real heading to avoid jitter. */
  smoothHeading: number;
  /** Whether the agent is currently moving. */
  isMoving: boolean;
  /** Internal waypoints for path smoothing. */
  waypoints: Vec2[];
}

export interface NavConfig {
  /** Maximum movement speed in world units/second. */
  maxSpeed: number;
  /** Acceleration (units/s²). Higher = faster start. */
  acceleration: number;
  /** Deceleration (units/s²). Higher = faster stop. */
  deceleration: number;
  /** Distance from target at which the agent is considered arrived. */
  arrivalThreshold: number;
  /**
   * Minimum heading change (radians) to register a direction update.
   * Prevents jitter from micro-oscillations near the target.
   */
  headingDeadZone: number;
  /**
   * Smoothing factor for heading changes (0–1).
   * 1 = instant snap, 0.05 = very slow turn.
   */
  headingSmoothing: number;
}

const DEFAULT_CONFIG: NavConfig = {
  maxSpeed: 120,
  acceleration: 280,
  deceleration: 400,
  arrivalThreshold: 4,
  headingDeadZone: 0.08,
  headingSmoothing: 0.12,
};

export function createNavState(id: string, position: Vec2): AgentNavState {
  return {
    id,
    position: { ...position },
    target: { ...position },
    velocity: { x: 0, y: 0 },
    speed: 0,
    heading: 0,
    smoothHeading: 0,
    isMoving: false,
    waypoints: [],
  };
}

/**
 * Set a new destination.  Waypoints are stored so the caller can optionally
 * pass intermediate points for path smoothing.
 */
export function setTarget(state: AgentNavState, target: Vec2, waypoints: Vec2[] = []): AgentNavState {
  return {
    ...state,
    target: { ...target },
    waypoints: waypoints.length > 0 ? waypoints : [{ ...target }],
  };
}

/**
 * Advance agent navigation state by `dt` seconds.
 * Returns a new (immutable) state snapshot.
 */
export function stepNav(state: AgentNavState, dt: number, config: NavConfig = DEFAULT_CONFIG): AgentNavState {
  const dx = state.target.x - state.position.x;
  const dy = state.target.y - state.position.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < config.arrivalThreshold) {
    // Arrived — decelerate to stop
    const speed = Math.max(0, state.speed - config.deceleration * dt);
    const vx = speed > 0 ? Math.cos(state.heading) * speed : 0;
    const vy = speed > 0 ? Math.sin(state.heading) * speed : 0;
    return {
      ...state,
      position: speed > 0
        ? { x: state.position.x + vx * dt, y: state.position.y + vy * dt }
        : { ...state.target },
      velocity: { x: vx, y: vy },
      speed,
      isMoving: speed > 0,
    };
  }

  // Desired heading toward target
  const desiredHeading = Math.atan2(dy, dx);

  // Only update heading if change exceeds dead-zone
  let heading = state.heading;
  const headingDelta = wrapAngle(desiredHeading - state.heading);
  if (Math.abs(headingDelta) > config.headingDeadZone) {
    heading = state.heading + headingDelta * config.headingSmoothing * 60 * dt;
  }

  // Smooth heading for animation (lags further behind)
  const smoothDelta = wrapAngle(heading - state.smoothHeading);
  const smoothHeading = state.smoothHeading + smoothDelta * 0.08 * 60 * dt;

  // Slow down near target (brake zone = 2× maxSpeed units)
  const brakeZone = config.maxSpeed * 2;
  const targetSpeed = dist < brakeZone
    ? config.maxSpeed * (dist / brakeZone)
    : config.maxSpeed;

  const speed = state.speed < targetSpeed
    ? Math.min(targetSpeed, state.speed + config.acceleration * dt)
    : Math.max(targetSpeed, state.speed - config.deceleration * dt);

  const vx = Math.cos(heading) * speed;
  const vy = Math.sin(heading) * speed;

  return {
    ...state,
    position: {
      x: state.position.x + vx * dt,
      y: state.position.y + vy * dt,
    },
    velocity: { x: vx, y: vy },
    speed,
    heading,
    smoothHeading,
    isMoving: true,
  };
}

/** Wrap angle to [-π, π]. */
function wrapAngle(angle: number): number {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/**
 * Smooth a path using Catmull-Rom interpolation.
 * Inserts intermediate points to round sharp corners.
 */
export function smoothPath(points: Vec2[], segments = 8): Vec2[] {
  if (points.length < 2) return points;

  // Duplicate endpoints for the algorithm
  const pts = [points[0], ...points, points[points.length - 1]];
  const result: Vec2[] = [];

  for (let i = 1; i < pts.length - 2; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2];

    for (let j = 0; j <= segments; j++) {
      const t = j / segments;
      result.push(catmullRom(p0, p1, p2, p3, t));
    }
  }

  return result;
}

function catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}
