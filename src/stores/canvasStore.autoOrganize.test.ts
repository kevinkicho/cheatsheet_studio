import { describe, expect, it, beforeEach } from "vitest";
import { useCanvasStore } from "@/stores/canvasStore";
import { DEFAULT_CANVAS } from "@/types";

describe("autoOrganize store wiring", () => {
  beforeEach(() => {
    useCanvasStore.setState({
      items: [
        {
          id: "a",
          type: "equation",
          x: 500,
          y: 500,
          width: 280,
          height: 100,
          zIndex: 1,
          latex: "FV = PV(1+r)^n",
          title: "Future Value",
        },
        {
          id: "b",
          type: "equation",
          x: 600,
          y: 600,
          width: 280,
          height: 100,
          zIndex: 2,
          latex: "E[R]=R_f+\\\\beta(E[R_m]-R_f)",
          title: "CAPM",
        },
        {
          id: "h",
          type: "equation",
          x: 10,
          y: 10,
          width: 400,
          height: 40,
          zIndex: 0,
          latex: "\\\\text{1. TVM}",
          title: "1. TVM",
          showTitle: false,
        },
      ],
      canvas: { ...DEFAULT_CANVAS },
      folders: [],
      dirty: false,
    });
  });

  it("moves and resizes cards when autoOrganize is called", () => {
    const before = useCanvasStore.getState().items.map((i) => ({
      id: i.id,
      x: i.x,
      y: i.y,
      w: i.width,
      h: i.height,
    }));
    useCanvasStore.getState().autoOrganize({ density: "sm", fitPrint: true });
    const after = useCanvasStore.getState().items;
    expect(after.length).toBe(3);
    // At least one card should move or resize
    const changed = after.some((i) => {
      const b = before.find((x) => x.id === i.id)!;
      return b.x !== i.x || b.y !== i.y || b.w !== i.width || b.h !== i.height;
    });
    expect(changed).toBe(true);
    const fv = after.find((i) => i.id === "a")!;
    expect(fv.autoFit).toBe(false);
    // Export-19: equations natural size (not force-filled)
    expect(fv.contentFill).toBe(false);
    expect(fv.x).toBeLessThan(200);
    expect(fv.y).toBeLessThan(200);
  });

  it("works with no opts (toolbar path)", () => {
    useCanvasStore.getState().autoOrganize();
    const fv = useCanvasStore.getState().items.find((i) => i.id === "a")!;
    expect(fv.x).toBeLessThan(200);
    expect(fv.contentFill).toBe(false);
  });
});
