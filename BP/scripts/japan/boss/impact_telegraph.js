import { normalizeXZ, rotateXZ } from "./geometry.js";

function line(origin, direction, length, width, angleOffset) {
  return { kind: "line", origin: { ...origin }, direction: normalizeXZ(direction), length, width, ...(angleOffset === undefined ? {} : { angleOffset }) };
}
function cone(origin, direction, range, angle) {
  return { kind: "cone", origin: { ...origin }, direction: normalizeXZ(direction), range, angle };
}
function centeredLine(center, direction, length, width, angleOffset) {
  const forward = normalizeXZ(direction);
  const half = Math.max(0, Number(length) || 0) / 2;
  return line({
    x: Number(center.x) - forward.x * half,
    y: Number(center.y),
    z: Number(center.z) - forward.z * half,
  }, forward, half * 2, width, angleOffset);
}
function circle(center, radius) { return { kind: "circle", center: { ...center }, radius }; }
function ring(center, innerRadius, outerRadius) { return { kind: "ring", center: { ...center }, innerRadius, outerRadius }; }

function fanAngle(shape) {
  if (Number.isFinite(shape.angle)) return shape.angle;
  if (Number.isFinite(shape.halfWidth) && Number.isFinite(shape.range) && shape.range > 0) return Math.atan(shape.halfWidth / shape.range) * 360 / Math.PI;
  return 100;
}

export function impactTelegraphDescriptors(ability, plan, arenaCenter, impactIndex) {
  const shape = ability.shape ?? {};
  const type = shape.type;
  const activePose = shape.reposition ? (plan.impactPose ?? plan.pose) : plan.pose;
  const origin = activePose.origin;
  const view = normalizeXZ(activePose.view);
  const targets = plan.targetLocations ?? [];
  switch (type) {
    case "cone": case "fan": return [cone(origin, view, shape.range ?? 5, fanAngle(shape))];
    case "line": return [line(origin, view, shape.length ?? 12, shape.width ?? 2)];
    case "circle": return [circle(origin, shape.radius ?? 3)];
    case "target_circle": return [circle(shape.reposition ? origin : (targets[0] ?? origin), shape.radius ?? 2.5)];
    case "target_circles": case "arena_hazard_circles": return targets.map((target) => circle(target, shape.radius ?? 2.5));
    case "ring": {
      const outer = shape.outerRadius ?? shape.radius ?? 5;
      return [ring(arenaCenter, shape.innerRadius ?? Math.max(0, outer - 1.4), outer)];
    }
    case "cross_lines": {
      const directions = [
        rotateXZ({ x: 1, z: 0 }, 45),
        rotateXZ({ x: -1, z: 0 }, -45),
      ];
      const index = Math.max(0, Math.min(directions.length - 1, impactIndex));
      return [centeredLine(arenaCenter, directions[index], shape.length ?? 14, shape.width ?? 1.5)];
    }
    case "fan_rays": {
      const offsets = shape.rayAngles ?? [-28, 0, 28];
      const offset = offsets[Math.max(0, Math.min(offsets.length - 1, impactIndex))] ?? 0;
      return [line(origin, rotateXZ(view, offset), shape.length ?? 12, shape.width ?? 1.2, offset)];
    }
    case "alternating_lines": {
      const angle = impactIndex % 2 === 0 ? 32 : -32;
      return [line(arenaCenter, rotateXZ({ x: 0, z: -1 }, angle), shape.length ?? 12, shape.width ?? 1.5, angle)];
    }
    case "feint_lines": {
      const realAngle = -67.5 + impactIndex * 45;
      const feintAngle = realAngle + 22.5;
      const real = line(arenaCenter, rotateXZ({ x: 0, z: -1 }, realAngle), shape.length ?? 24, shape.width ?? 1.5, realAngle);
      const feint = line(arenaCenter, rotateXZ({ x: 0, z: -1 }, feintAngle), shape.length ?? 24, shape.width ?? 1.5, feintAngle);
      feint.feint = true;
      return [real, feint];
    }
    case "tether": {
      if (impactIndex > 0) return [cone(origin, view, shape.coneRange ?? 4, shape.coneAngle ?? 105)];
      const target = targets[0];
      if (!target) return [line(origin, view, shape.rayLength ?? 14, 0.7)];
      const delta = { x: target.x - origin.x, z: target.z - origin.z };
      return [line(origin, delta, Math.min(shape.rayLength ?? 14, Math.hypot(delta.x, delta.z)), 0.7)];
    }
    case "persistent_circle": return [circle(targets[0] ?? origin, shape.radius ?? 2.5)];
    case "expanding_rings": {
      const radii = shape.radii ?? [];
      if (impactIndex < radii.length) return [ring(arenaCenter, Math.max(0, radii[impactIndex] - 1.2), radii[impactIndex])];
      return [circle(arenaCenter, shape.finalRadius ?? 4)];
    }
    case "advancing_lines": {
      const shifted = { x: origin.x + view.x * impactIndex * 3, y: origin.y, z: origin.z + view.z * impactIndex * 3 };
      return [line(shifted, view, shape.length ?? 12, shape.width ?? 2)];
    }
    case "ring_then_circle": return impactIndex === 0
      ? [ring(arenaCenter, shape.innerSafeRadius ?? 3, shape.outerRadius ?? 6)]
      : [circle(arenaCenter, shape.innerSafeRadius ?? 3)];
    case "rotating_sectors": {
      const angle = impactIndex * (shape.stepDegrees ?? 58);
      return [cone(arenaCenter, rotateXZ({ x: 0, z: -1 }, angle), shape.radius ?? 24, shape.sectorAngle ?? 52)];
    }
    case "combo": {
      if (impactIndex === 1) return [line(origin, rotateXZ(view, 90), shape.sideLength ?? 8, 1.6, 90)];
      return [cone(origin, view, shape.range ?? 5, shape.angle ?? 100)];
    }
    case "counter_cone": return [];
    case "rotating_lines": {
      const angle = impactIndex * 55;
      return [line(arenaCenter, rotateXZ({ x: 0, z: -1 }, angle), shape.length ?? 15, shape.width ?? 1.5, angle)];
    }
    case "jade_ultimate": {
      if (impactIndex < 2) {
        const angle = impactIndex * 90;
        return [centeredLine(arenaCenter, rotateXZ({ x: 0, z: -1 }, angle), shape.lineLength ?? 48, shape.lineWidth ?? 2, angle)];
      }
      return [circle(arenaCenter, shape.finalRadius ?? 4)];
    }
    case "fivefold": {
      if (impactIndex === 0) return [
        centeredLine(arenaCenter, rotateXZ({ x: 0, z: -1 }, 45), 18, 1.5, 45),
        centeredLine(arenaCenter, rotateXZ({ x: 0, z: -1 }, -45), 18, 1.5, -45),
      ];
      if (impactIndex === 1) {
        const real = centeredLine(arenaCenter, rotateXZ({ x: 0, z: -1 }, 30), 18, 1.4, 30);
        const feint = centeredLine(arenaCenter, rotateXZ({ x: 0, z: -1 }, -30), 18, 1.4, -30);
        feint.feint = true;
        return [real, feint];
      }
      if (impactIndex === 2) return [ring(arenaCenter, 5, 7)];
      if (impactIndex === 3) return [cone(arenaCenter, rotateXZ({ x: 0, z: -1 }, 105), 22, 72)];
      return [cone(origin, view, 5, 100)];
    }
    default: return [];
  }
}
