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

  it("passes panelBorderLevels and panelNgonLevels through to the packer", () => {
    useCanvasStore.setState({
      items: [
        {
          id: "a1",
          type: "equation",
          x: 0,
          y: 0,
          width: 120,
          height: 60,
          zIndex: 1,
          latex: "a=1",
          title: "A1",
          folderId: "t1a",
        },
        {
          id: "a2",
          type: "equation",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          zIndex: 2,
          latex: "a=2",
          title: "A2",
          folderId: "t1a",
        },
        {
          id: "b1",
          type: "equation",
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          zIndex: 3,
          latex: "b=1",
          title: "B1",
          folderId: "t1b",
        },
      ],
      folders: [
        { id: "t1", name: "1. Topic", parentId: null, order: 0 },
        { id: "t1a", name: "1.1 Sub", parentId: "t1", order: 0 },
        { id: "t1b", name: "1.2 Sub", parentId: "t1", order: 1 },
      ],
      canvas: { ...DEFAULT_CANVAS },
      dirty: false,
    });
    useCanvasStore.getState().autoOrganize({
      density: "sm",
      groupChrome: "panels",
      panelShape: "polygon",
      panelGroupLevels: [1, 2],
      panelBorderLevels: [1, 2],
      panelNgonLevels: [2],
      panelPadding: 8,
      fitPrint: true,
      multiPage: true,
    });
    const panels = useCanvasStore.getState().canvas.layoutPanels ?? [];
    const L1 = panels.filter((p) => p.hierarchyLevel === 1);
    const L2 = panels.filter((p) => p.hierarchyLevel === 2);
    expect(L1.length).toBeGreaterThanOrEqual(1);
    expect(L2.length).toBeGreaterThanOrEqual(1);
    // Borders on both levels
    expect(L1.every((p) => p.showStroke !== false)).toBe(true);
    expect(L2.every((p) => p.showStroke !== false)).toBe(true);
    // N-gon only on L2; L1 stays rect
    expect(L1.every((p) => p.shape === "rect")).toBe(true);
    expect(L2.every((p) => p.shape === "polygon")).toBe(true);
    // Snapshot retains the per-level knobs
    const snap = useCanvasStore.getState().lastAutoLayout;
    expect(snap?.panelBorderLevels).toEqual([1, 2]);
    expect(snap?.panelNgonLevels).toEqual([2]);
  });
});

