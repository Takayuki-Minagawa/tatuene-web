import { describe, expect, it } from "vitest";
import {
  fitContain,
  imageCorners,
  scaleFromHandleDrag,
  rotationFromHandleDrag,
  normalizeAngle,
  MIN_SCALE,
  MAX_SCALE,
} from "./geometry";

const T0 = { x: 0, y: 0, scale: 1, rotation: 0 };

describe("fitContain", () => {
  it("横長画像を箱に収めて中央寄せする", () => {
    expect(fitContain(200, 100, 100, 100)).toEqual({ w: 100, h: 50, x: 0, y: 25 });
  });
  it("サイズ不明なら箱いっぱい", () => {
    expect(fitContain(0, 0, 80, 60)).toEqual({ w: 80, h: 60, x: 0, y: 0 });
  });
});

describe("imageCorners", () => {
  const fit = { x: 10, y: 20, w: 100, h: 50 };

  it("無変換ならフィット矩形そのまま", () => {
    const c = imageCorners(fit, T0);
    expect(c.tl).toEqual({ x: 10, y: 20 });
    expect(c.br).toEqual({ x: 110, y: 70 });
    expect(c.center).toEqual({ x: 60, y: 45 });
  });

  it("平行移動が中心と隅に反映される", () => {
    const c = imageCorners(fit, { ...T0, x: 5, y: -10 });
    expect(c.tl).toEqual({ x: 15, y: 10 });
    expect(c.center).toEqual({ x: 65, y: 35 });
  });

  it("拡大は中心固定", () => {
    const c = imageCorners(fit, { ...T0, scale: 2 });
    expect(c.center).toEqual({ x: 60, y: 45 });
    expect(c.tl).toEqual({ x: -40, y: -5 });
    expect(c.br).toEqual({ x: 160, y: 95 });
  });

  it("90°回転で隅が入れ替わる", () => {
    const c = imageCorners(fit, { ...T0, rotation: 90 });
    // tl(-50,-25 相対) → 回転後 (25,-50) 相対
    expect(c.tl.x).toBeCloseTo(60 + 25);
    expect(c.tl.y).toBeCloseTo(45 - 50);
    expect(c.br.x).toBeCloseTo(60 - 25);
    expect(c.br.y).toBeCloseTo(45 + 50);
  });
});

describe("scaleFromHandleDrag", () => {
  const center = { x: 0, y: 0 };
  it("中心からの距離比で拡縮する", () => {
    expect(scaleFromHandleDrag(center, { x: 10, y: 0 }, { x: 20, y: 0 }, 1)).toBeCloseTo(2);
    expect(scaleFromHandleDrag(center, { x: 10, y: 0 }, { x: 5, y: 0 }, 2)).toBeCloseTo(1);
  });
  it("上下限でクランプされる", () => {
    expect(scaleFromHandleDrag(center, { x: 10, y: 0 }, { x: 10000, y: 0 }, 1)).toBe(MAX_SCALE);
    expect(scaleFromHandleDrag(center, { x: 10, y: 0 }, { x: 0.001, y: 0 }, 1)).toBe(MIN_SCALE);
  });
  it("開始点が中心と一致する退化ケースは現状維持", () => {
    expect(scaleFromHandleDrag(center, { x: 0, y: 0 }, { x: 50, y: 0 }, 1.5)).toBe(1.5);
  });
});

describe("rotationFromHandleDrag", () => {
  const center = { x: 0, y: 0 };
  it("ポインタの角度差分を加算する", () => {
    // 真上(0,-10)→真右(10,0) は +90°、ただし吸着で 90
    expect(rotationFromHandleDrag(center, { x: 0, y: -10 }, { x: 10, y: 0 }, 0)).toBe(90);
    // 45°移動（吸着域外）
    const deg = rotationFromHandleDrag(center, { x: 0, y: -10 }, { x: 10, y: -10 }, 0);
    expect(deg).toBeCloseTo(45);
  });
  it("Shift で15°スナップ", () => {
    const deg = rotationFromHandleDrag(center, { x: 0, y: -10 }, { x: 10, y: -12 }, 0, true);
    expect(deg % 15).toBe(0);
  });
  it("0/±90/180 の近傍は吸着する", () => {
    expect(rotationFromHandleDrag(center, { x: 0, y: -10 }, { x: 0.3, y: -10 }, 0)).toBe(0);
  });
});

describe("normalizeAngle", () => {
  it("-180..180 に収める（180 を優先）", () => {
    expect(normalizeAngle(190)).toBe(-170);
    expect(normalizeAngle(-190)).toBe(170);
    expect(normalizeAngle(180)).toBe(180);
    expect(normalizeAngle(-180)).toBe(180);
    expect(normalizeAngle(360)).toBe(0);
  });
});
