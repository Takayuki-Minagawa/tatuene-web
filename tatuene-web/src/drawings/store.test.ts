/**
 * 図面ストアの現状動作を固定化するテスト（リファクタリングの安全網）。
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  getSlot,
  setImage,
  setTransform,
  addAnnotation,
  removeAnnotation,
  nextId,
  nextNumber,
  clearSlot,
  clearAll,
  collectMeta,
  collectImages,
  restore,
  type Annotation,
} from "./store";

const PNG_DATAURL = "data:image/png;base64,AAAA";

function putImage(id: string) {
  setImage(id, { dataUrl: PNG_DATAURL, name: "plan.png", type: "image/png", natW: 800, natH: 600 });
}

beforeEach(() => {
  clearAll();
});

describe("setImage", () => {
  it("画像情報を保持し transform を初期化する", () => {
    setTransform("s1", { x: 10, y: 20, scale: 2, rotation: 45 });
    putImage("s1");
    const s = getSlot("s1");
    expect(s.imageDataUrl).toBe(PNG_DATAURL);
    expect(s.imageName).toBe("plan.png");
    expect(s.natW).toBe(800);
    expect(s.transform).toEqual({ x: 0, y: 0, scale: 1, rotation: 0 });
  });
});

describe("setTransform", () => {
  it("部分更新をマージする", () => {
    putImage("s1");
    setTransform("s1", { scale: 1.5 });
    setTransform("s1", { rotation: 90 });
    expect(getSlot("s1").transform).toMatchObject({ x: 0, y: 0, scale: 1.5, rotation: 90 });
  });
});

describe("annotations", () => {
  it("追加・削除と nextNumber の採番", () => {
    expect(nextNumber("s1")).toBe(1);
    addAnnotation("s1", { id: nextId(), type: "number", x: 1, y: 2, value: 1, color: "#000", size: 18 });
    addAnnotation("s1", { id: nextId(), type: "number", x: 3, y: 4, value: 5, color: "#000", size: 18 });
    expect(nextNumber("s1")).toBe(6);
    const ids = getSlot("s1").annotations.map((a) => a.id);
    removeAnnotation("s1", ids[0]);
    expect(getSlot("s1").annotations).toHaveLength(1);
  });
});

describe("collectMeta / collectImages / restore", () => {
  it("保存→復元の往復で状態が一致する", () => {
    putImage("slot_genzai");
    setTransform("slot_genzai", { x: 5, y: -3, scale: 1.2, rotation: 15 });
    const ann: Annotation = { id: nextId(), type: "line", x1: 0, y1: 0, x2: 10, y2: 10, color: "#d32f2f", width: 3 };
    addAnnotation("slot_genzai", ann);
    addAnnotation("slot_kaishu", { id: nextId(), type: "text", x: 1, y: 1, text: "メモ", color: "#000", size: 16 });

    const meta = collectMeta();
    const images = collectImages();
    expect(meta.slot_genzai.imageFile).toBe("assets/slot_genzai.png");
    expect(images["assets/slot_genzai.png"]).toBe(PNG_DATAURL);
    expect(meta.slot_kaishu.imageFile).toBeUndefined();

    clearAll();
    restore(JSON.parse(JSON.stringify(meta)), images);

    const s = getSlot("slot_genzai");
    expect(s.imageDataUrl).toBe(PNG_DATAURL);
    expect(s.transform).toMatchObject({ x: 5, y: -3, scale: 1.2, rotation: 15 });
    expect(s.annotations).toEqual([ann]);
    expect(getSlot("slot_kaishu").annotations).toHaveLength(1);
  });

  it("空スロットは保存対象に含めない", () => {
    getSlot("empty");
    expect(collectMeta()).toEqual({});
  });

  it("拡張フィールド（反転・透明度・crop）も往復で保持される", () => {
    putImage("s1");
    setTransform("s1", { flipH: true, opacity: 0.7, brightness: 1.4, crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } });
    const meta = collectMeta();
    const images = collectImages();
    clearAll();
    restore(JSON.parse(JSON.stringify(meta)), images);
    expect(getSlot("s1").transform).toMatchObject({
      flipH: true,
      opacity: 0.7,
      brightness: 1.4,
      crop: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
    });
  });

  it("transform を欠いた旧メタは既定値で復元される", () => {
    restore(
      { s1: { annotations: [] } as unknown as Parameters<typeof restore>[0][string] },
      {}
    );
    expect(getSlot("s1").transform).toEqual({ x: 0, y: 0, scale: 1, rotation: 0 });
  });

  it("restore 後の nextId は復元済みIDと衝突しない", () => {
    restore(
      {
        s1: {
          transform: { x: 0, y: 0, scale: 1, rotation: 0 },
          annotations: [{ id: "a999", type: "text", x: 0, y: 0, text: "t", color: "#000", size: 16 }],
        },
      },
      {}
    );
    expect(nextId()).toBe("a1000");
  });
});

describe("clearSlot", () => {
  it("画像と注釈を削除し transform を初期化する", () => {
    putImage("s1");
    addAnnotation("s1", { id: nextId(), type: "text", x: 0, y: 0, text: "x", color: "#000", size: 16 });
    clearSlot("s1");
    const s = getSlot("s1");
    expect(s.imageDataUrl).toBeUndefined();
    expect(s.annotations).toEqual([]);
    expect(s.transform).toEqual({ x: 0, y: 0, scale: 1, rotation: 0 });
  });
});
