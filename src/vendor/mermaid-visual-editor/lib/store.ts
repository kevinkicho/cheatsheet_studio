import { create } from "zustand";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  MarkerType,
  reconnectEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeMarkerType,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import {
  clampPortCount,
  clampPortRadius,
  getPortLayout,
  normalizePortHandleId,
  pickFacingPortId,
  reconcileEdgeHandles,
} from "./portLayout";
import {
  applyMindmapTreeLayout,
  asMindmapEdges,
  asMindmapNodes,
  makeMindmapEdge,
  measureMindmapNodeSize,
  mindmapDescendantsOf,
  mindmapParentOf,
  mindmapPreviousSibling,
  mindmapRoots,
} from "./mindmap";

// ─── Node shape types ────────────────────────────────────────────────────────
export type NodeShape =
  | "rectangle"
  | "rounded"
  | "stadium"
  | "subroutine"
  | "cylinder"
  | "circle"
  | "double-circle"
  | "diamond"
  | "hexagon"
  | "parallelogram"
  | "parallelogram-alt"
  | "trapezoid"
  | "trapezoid-alt"
  | "asymmetric"
  /** Mermaid mindmap bang / explode: `id))text((` */
  | "bang"
  /** Mermaid mindmap cloud: `id)text(` */
  | "cloud";

// ─── Edge style types ─────────────────────────────────────────────────────────
export type EdgeStyle = "solid" | "dashed" | "thick";
/** @deprecated Prefer per-side EdgeMarkerKind via startMarker/endMarker */
export type ArrowType = "arrow" | "none" | "bidirectional" | "circle" | "cross";
/** Marker on one end of an edge (source or target). */
export type EdgeMarkerKind = "none" | "arrow" | "circle" | "cross";

// ─── Diagram-level settings ───────────────────────────────────────────────────
export type Direction = "TD" | "LR" | "BT" | "RL";
export type Theme = "default" | "dark" | "forest" | "neutral" | "base";
export type Look = "classic" | "handDrawn";
/** Process panel modes that use the interactive canvas (never Mermaid preview). */
export type DiagramKind = "flowchart" | "mindmap";
export type CurveStyle =
  | "basis"
  | "bumpX"
  | "bumpY"
  | "cardinal"
  | "catmullRom"
  | "linear"
  | "monotoneX"
  | "monotoneY"
  | "natural"
  | "step"
  | "stepAfter"
  | "stepBefore";

// ─── Data types ───────────────────────────────────────────────────────────────
export interface FlowNodeData extends Record<string, unknown> {
  label: string;
  shape: NodeShape;
  fillColor?: string;
  strokeColor?: string;
  textColor?: string;
  isSubgraph?: boolean;
  /** Mermaid mindmap `::icon(fa fa-*)` class string. */
  icon?: string;
  /**
   * Connection ports (flowchart). Count is evenly spaced around the shape;
   * radius / rotation / onPerimeter control placement.
   */
  portCount?: number;
  /** Distance from center (1 ≈ perimeter). */
  portRadius?: number;
  /** Degrees offset for the first port (−90 = top). */
  portRotation?: number;
  /** true = snap to shape perimeter; false = free circle around center. */
  portOnPerimeter?: boolean;
}

/** User-placed bend point on a flowchart edge (flow coordinates). */
export type EdgeWaypoint = {
  id: string;
  x: number;
  y: number;
};

export interface FlowEdgeData extends Record<string, unknown> {
  edgeStyle?: EdgeStyle;
  /** @deprecated Combined control — prefer startMarker + endMarker */
  arrowType?: ArrowType;
  /** Marker at the source (start) of the edge */
  startMarker?: EdgeMarkerKind;
  /** Marker at the target (end) of the edge */
  endMarker?: EdgeMarkerKind;
  strokeColor?: string;
  /**
   * Absolute SVG path from Mermaid's layout engine (RF flow coordinates).
   * Cleared when the user moves a node so free-form editing reverts to RF routing.
   * Ends are always re-snapped to live node borders for arrow accuracy.
   */
  mermaidPath?: string;
  /** Edge label position from Mermaid (RF flow coordinates). */
  mermaidLabelX?: number;
  mermaidLabelY?: number;
  /**
   * Manual bend dots along the edge. When set, path is start→waypoints→end
   * (orthogonal pipe). User can drag/delete each dot; count editable in Object Settings.
   */
  waypoints?: EdgeWaypoint[];
  /**
   * True when the user plugged ports (or re-plugged). Path anchors to those
   * ports. Mermaid/template edges leave this unset and use auto face-attach.
   */
  manualConnect?: boolean;
  /** User drag offset for edge label (Yes/No) from auto mid-path position. */
  labelOffsetX?: number;
  labelOffsetY?: number;
}

/** Resolve per-side markers, migrating legacy `arrowType` when needed. */
export function resolveEdgeMarkers(data: FlowEdgeData | undefined): {
  start: EdgeMarkerKind;
  end: EdgeMarkerKind;
} {
  if (data?.startMarker !== undefined || data?.endMarker !== undefined) {
    return {
      start: data?.startMarker ?? "none",
      end: data?.endMarker ?? "arrow",
    };
  }
  switch (data?.arrowType) {
    case "none":
      return { start: "none", end: "none" };
    case "bidirectional":
      return { start: "arrow", end: "arrow" };
    case "circle":
      return { start: "none", end: "circle" };
    case "cross":
      return { start: "none", end: "cross" };
    case "arrow":
    default:
      return { start: "none", end: "arrow" };
  }
}

function kindToRfMarker(
  kind: EdgeMarkerKind,
  color?: string,
): EdgeMarkerType | undefined {
  if (kind === "none" || kind === "circle" || kind === "cross") {
    // circle/cross rendered via custom SVG markers in FlowEdge
    return undefined;
  }
  return {
    type: MarkerType.ArrowClosed,
    width: 18,
    height: 18,
    color: color || "var(--edge-stroke, #a1a1aa)",
  };
}

// ─── History snapshot ─────────────────────────────────────────────────────────
type Snapshot = {
  nodes: Node<FlowNodeData>[];
  edges: Edge<FlowEdgeData>[];
};

const MAX_HISTORY = 50;
let nodeCounter = 1;

// ─── Store interface ──────────────────────────────────────────────────────────
interface FlowState {
  nodes: Node<FlowNodeData>[];
  edges: Edge<FlowEdgeData>[];
  direction: Direction;
  theme: Theme;
  look: Look;
  curveStyle: CurveStyle;
  /** flowchart | mindmap — drives serialize / import format. */
  diagramKind: DiagramKind;
  /**
   * Chart canvas chrome (UI + snapshot paint). Not undo history.
   */
  chartBackground: string;
  chartShowGrid: boolean;
  chartGridColor: string;
  /** Fallback edge stroke when an edge has no per-edge color. */
  chartEdgeColor: string;
  /** Lateral gap between multi-edges (Yes/No pairs), px. */
  multiEdgeSpacing: number;
  /**
   * When true, Auto Layout / direction change rewires edges from Mermaid.
   * When false (default), re-layout only moves nodes and keeps existing
   * links; user adds more by plugging ports. Templates still show their lines.
   */
  autoConnectEdges: boolean;
  /**
   * When true (default), pipe bend handles stick to node edges/centers/ports
   * and other bend points while dragging (CAD-style snap).
   */
  pipeSnapEnabled: boolean;
  /** Sticky distance in flow px (default 12). */
  pipeSnapThreshold: number;
  setChartBackground: (hex: string) => void;
  setChartShowGrid: (show: boolean) => void;
  setChartGridColor: (hex: string) => void;
  setChartEdgeColor: (hex: string) => void;
  setMultiEdgeSpacing: (px: number) => void;
  setAutoConnectEdges: (on: boolean) => void;
  setPipeSnapEnabled: (on: boolean) => void;
  setPipeSnapThreshold: (px: number) => void;
  /**
   * Bumped after mindmap auto-layout so the canvas can fitView.
   * Not part of undo history.
   */
  layoutEpoch: number;
  /**
   * Request zoom-fit onto a specific node (e.g. after add shape / group).
   * Canvas watches `token` changes and calls fitView for `nodeId`.
   */
  focusNodeRequest: { nodeId: string; token: number } | null;
  /**
   * Floating tool chrome orientation (UI only — not undo history).
   * horizontal: top + bottom bars; vertical: left + right rails.
   */
  chromeLayout: "horizontal" | "vertical";
  setChromeLayout: (layout: "horizontal" | "vertical") => void;
  toggleChromeLayout: () => void;
  past: Snapshot[];
  future: Snapshot[];

  // React Flow change handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  /** Re-plug an existing edge onto new handles/nodes. */
  onReconnect: (oldEdge: Edge<FlowEdgeData>, newConnection: Connection) => void;
  /** Drop edge if reconnect ended without a valid target. */
  removeEdgeById: (id: string) => void;

  // Node operations
  addNode: (shape?: NodeShape) => void;
  addNodeAtPosition: (
    position: { x: number; y: number },
    shape?: NodeShape,
    width?: number,
    height?: number,
  ) => void;
  /**
   * Drop a connection on empty canvas: place a rectangle and wire it.
   * Single undo step; does not fit-view (keeps viewport stable).
   */
  addConnectedNodeAtPosition: (opts: {
    position: { x: number; y: number };
    /** Node the drag started from */
    fromNodeId: string;
    fromHandleId?: string | null;
    /** 'source' = fromNode is source; 'target' = fromNode is target */
    fromHandleType?: "source" | "target" | null;
    shape?: NodeShape;
    width?: number;
    height?: number;
  }) => string | null;
  updateNodeLabel: (id: string, label: string) => void;
  updateNodeShape: (id: string, shape: NodeShape) => void;
  updateNodeStyle: (
    id: string,
    style: Partial<
      Pick<FlowNodeData, "fillColor" | "strokeColor" | "textColor">
    >,
  ) => void;
  /** Batch style update (single history entry; keeps selection). */
  updateNodesStyle: (
    ids: string[],
    style: Partial<
      Pick<FlowNodeData, "fillColor" | "strokeColor" | "textColor">
    >,
  ) => void;
  updateNodesShape: (ids: string[], shape: NodeShape) => void;
  updateNodesLabel: (ids: string[], label: string) => void;
  updateNodesIcon: (ids: string[], icon: string | undefined) => void;
  /** Connection-port layout (count / radius / rotation / perimeter). */
  updateNodesPortLayout: (
    ids: string[],
    layout: Partial<
      Pick<
        FlowNodeData,
        "portCount" | "portRadius" | "portRotation" | "portOnPerimeter"
      >
    >,
  ) => void;
  /** Add one connection port (recalculates radial positions). */
  addNodePort: (ids: string[]) => void;
  /** Remove one connection port (min 1). */
  removeNodePort: (ids: string[]) => void;

  // Mind map hierarchy operations
  addMindmapChild: (parentId?: string) => void;
  addMindmapSibling: (nodeId?: string) => void;
  reparentMindmapNodes: (
    nodeIds: string[],
    newParentId: string | null,
  ) => void;
  promoteMindmapNodes: (nodeIds?: string[]) => void;
  demoteMindmapNodes: (nodeIds?: string[]) => void;
  deleteMindmapSubtree: (nodeIds?: string[]) => void;
  /**
   * Radial equal-slice layout for mindmap.
   * @param opts.fit — when true, bump layoutEpoch so canvas fitView runs (Auto layout / import only).
   *   Hierarchy edits should pass `fit: false` to keep the user’s zoom.
   */
  layoutMindmap: (opts?: { fit?: boolean }) => void;

  setNodes: (nodes: Node<FlowNodeData>[]) => void;
  loadDiagram: (
    nodes: Node<FlowNodeData>[],
    edges: Edge<FlowEdgeData>[],
  ) => void;
  importDiagram: (
    nodes: Node<FlowNodeData>[],
    edges: Edge<FlowEdgeData>[],
    settings: {
      direction: Direction;
      theme: Theme;
      look: Look;
      curveStyle: CurveStyle;
      diagramKind?: DiagramKind;
      /** Skip facing-port rewrite (processFlow restore must keep plugs). */
      skipHandleReconcile?: boolean;
    },
  ) => void;

  // Subgraph operations
  addSubgraph: (title?: string) => void;
  assignToSubgraph: (nodeIds: string[], subgraphId: string | null) => void;

  // Edge operations
  updateEdgeLabel: (id: string, label: string) => void;
  updateEdgeType: (id: string, updates: Partial<FlowEdgeData>) => void;
  /** Set / replace waypoints on an edge (clears mermaidPath when non-empty). */
  setEdgeWaypoints: (id: string, waypoints: EdgeWaypoint[]) => void;
  /** Replace waypoints while dragging (no history — pushHistory on pointer up). */
  setEdgeWaypointsLive: (id: string, waypoints: EdgeWaypoint[]) => void;
  addEdgeWaypoint: (id: string, at?: { x: number; y: number }) => void;
  removeEdgeWaypoint: (edgeId: string, waypointId: string) => void;
  updateEdgeWaypoint: (
    edgeId: string,
    waypointId: string,
    pos: { x: number; y: number },
  ) => void;
  /** Live label drag (no history — pushHistory on pointer up). */
  updateEdgeLabelOffsetLive: (
    id: string,
    offset: { labelOffsetX: number; labelOffsetY: number },
  ) => void;
  /** Currently selected bend dot (for Delete key / inspector). */
  selectedWaypoint: { edgeId: string; waypointId: string } | null;
  setSelectedWaypoint: (
    sel: { edgeId: string; waypointId: string } | null,
  ) => void;

  // Diagram settings
  setDirection: (direction: Direction) => void;
  setTheme: (theme: Theme) => void;
  setLook: (look: Look) => void;
  setCurveStyle: (curveStyle: CurveStyle) => void;
  setDiagramKind: (kind: DiagramKind) => void;

  // History
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Selection operations
  duplicateSelected: () => void;
  clipboard: { nodes: Node<FlowNodeData>[]; edges: Edge<FlowEdgeData>[] } | null;
  copySelected: () => void;
  pasteClipboard: () => void;

  // Draw mode
  drawingShape: NodeShape | null;
  setDrawingShape: (shape: NodeShape | null) => void;
  /** Ask canvas to zoom-fit so `nodeId` is visible (chrome padding applied). */
  requestFocusNode: (nodeId: string) => void;

  /**
   * Canvas interaction when not drawing:
   * - select: left-drag marquee / move nodes; middle+right pan
   * - pan: left-drag pans the viewport (hand tool)
   */
  interactionMode: "select" | "pan";
  setInteractionMode: (mode: "select" | "pan") => void;
}

// ─── Helper: RF arrow markers from per-side kinds (circle/cross via FlowEdge) ─
function computeMarkersFromData(data: FlowEdgeData | undefined): {
  markerEnd?: EdgeMarkerType;
  markerStart?: EdgeMarkerType;
} {
  const { start, end } = resolveEdgeMarkers(data);
  const color = data?.strokeColor;
  return {
    markerStart: kindToRfMarker(start, color),
    markerEnd: kindToRfMarker(end, color),
  };
}

// ─── Store ────────────────────────────────────────────────────────────────────
export const useFlowStore = create<FlowState>((set, get) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withHistory = <T extends (...args: any[]) => void>(fn: T): T => {
    return ((...args: Parameters<T>) => {
      const { nodes: beforeNodes, edges: beforeEdges } = get();

      fn(...args);

      const { nodes: afterNodes, edges: afterEdges, past } = get();

      if (beforeNodes !== afterNodes || beforeEdges !== afterEdges) {
        const snapshot: Snapshot = {
          nodes: beforeNodes.map((n) => ({ ...n, data: { ...n.data } })),
          edges: beforeEdges.map((e) => ({
            ...e,
            data: { ...(e.data ?? {}) } as FlowEdgeData,
          })),
        };
        set({
          past: [...past.slice(-(MAX_HISTORY - 1)), snapshot],
          future: [],
        });
      }
    }) as T;
  };

  return {
    nodes: [],
    edges: [],
    direction: "TD",
    theme: "dark",
    look: "classic",
    curveStyle: "basis",
    diagramKind: "flowchart",
    chartBackground: "#12141a",
    chartShowGrid: true,
    chartGridColor: "#2a2d36",
    chartEdgeColor: "#a1a1aa",
    // Mermaid reverse edges sit ~14px off the forward corridor
    multiEdgeSpacing: 14,
    autoConnectEdges: false,
    pipeSnapEnabled: true,
    pipeSnapThreshold: 12,
    setChartBackground: (hex) => set({ chartBackground: hex }),
    setChartShowGrid: (show) => set({ chartShowGrid: show }),
    setChartGridColor: (hex) => set({ chartGridColor: hex }),
    setChartEdgeColor: (hex) => set({ chartEdgeColor: hex }),
    setMultiEdgeSpacing: (px) =>
      set({
        multiEdgeSpacing: Math.min(48, Math.max(8, Math.round(px))),
      }),
    setAutoConnectEdges: (on) => set({ autoConnectEdges: on }),
    setPipeSnapEnabled: (on) => set({ pipeSnapEnabled: on }),
    setPipeSnapThreshold: (px) =>
      set({
        pipeSnapThreshold: Math.min(40, Math.max(4, Math.round(px))),
      }),
    layoutEpoch: 0,
    focusNodeRequest: null,
    requestFocusNode: (nodeId) =>
      set((s) => ({
        focusNodeRequest: {
          nodeId,
          token: (s.focusNodeRequest?.token ?? 0) + 1,
        },
      })),
    chromeLayout: "vertical",
    setChromeLayout: (layout) => set({ chromeLayout: layout }),
    toggleChromeLayout: () =>
      set((s) => ({
        chromeLayout:
          s.chromeLayout === "horizontal" ? "vertical" : "horizontal",
      })),
    past: [],
    future: [],
    clipboard: null,
    drawingShape: null,
    setDrawingShape: (shape) =>
      set(
        shape
          ? { drawingShape: shape, interactionMode: "select" }
          : { drawingShape: null },
      ),
    interactionMode: "select",
    setInteractionMode: (mode) =>
      set({ interactionMode: mode, drawingShape: null }),

    pushHistory: () => {
      const { nodes, edges, past } = get();
      const snapshot: Snapshot = {
        nodes: nodes.map((n) => ({ ...n, data: { ...n.data } })),
        edges: edges.map((e) => ({
          ...e,
          data: { ...(e.data ?? {}) } as FlowEdgeData,
        })),
      };
      set({ past: [...past.slice(-(MAX_HISTORY - 1)), snapshot], future: [] });
    },

    undo: () => {
      const { past, nodes, edges, future } = get();
      if (past.length === 0) return;
      const prev = past[past.length - 1];
      const current: Snapshot = { nodes, edges };
      set({
        nodes: prev.nodes,
        edges: prev.edges,
        past: past.slice(0, -1),
        future: [current, ...future.slice(0, MAX_HISTORY - 1)],
      });
    },

    redo: () => {
      const { past, nodes, edges, future } = get();
      if (future.length === 0) return;
      const next = future[0];
      const current: Snapshot = { nodes, edges };
      set({
        nodes: next.nodes,
        edges: next.edges,
        past: [...past.slice(-(MAX_HISTORY - 1)), current],
        future: future.slice(1),
      });
    },

    onNodesChange: (changes) => {
      const nodes = applyNodeChanges(
        changes,
        get().nodes,
      ) as Node<FlowNodeData>[];
      // Free-form drag invalidates exact Mermaid edge paths — live router takes over
      const userDragged = changes.some(
        (c) =>
          c.type === "position" &&
          (c.dragging === true || c.dragging === false),
      );
      if (userDragged && get().diagramKind !== "mindmap") {
        const movedIds = new Set(
          changes
            .filter((c) => c.type === "position")
            .map((c) => (c as { id: string }).id),
        );
        const edges = get().edges.map((e) => {
          if (!movedIds.has(e.source) && !movedIds.has(e.target)) return e;
          if (!e.data?.mermaidPath) return e;
          const {
            mermaidPath: _p,
            mermaidLabelX: _x,
            mermaidLabelY: _y,
            ...rest
          } = e.data;
          return { ...e, data: rest as FlowEdgeData };
        });
        set({ nodes, edges });
        return;
      }
      set({ nodes });
    },

    onEdgesChange: (changes) =>
      set({
        edges: applyEdgeChanges(changes, get().edges) as Edge<FlowEdgeData>[],
      }),

    onConnect: withHistory((connection) => {
      // Absolute: never reassign connection.source / connection.target
      const sourceId = connection.source;
      const targetId = connection.target;
      if (!sourceId || !targetId) return;

      const isMm = get().diagramKind === "mindmap";

      // Mind map: straight radial spokes (center handles) — not orthogonal pipes
      if (isMm) {
        const edgeData: FlowEdgeData = {
          edgeStyle: "solid",
          startMarker: "none",
          endMarker: "none",
          arrowType: "none",
        };
        set({
          edges: addEdge(
            {
              source: sourceId,
              target: targetId,
              sourceHandle: "center",
              targetHandle: "center-target",
              type: "mindmapEdge",
              data: edgeData,
              reconnectable: false,
            } as Connection,
            get().edges,
          ) as Edge<FlowEdgeData>[],
        });
        return;
      }

      const edgeData: FlowEdgeData = {
        edgeStyle: "solid",
        startMarker: "none",
        endMarker: "arrow",
        arrowType: "arrow",
        // User dragged this wire — pin to the ports they used
        manualConnect: true,
      };
      const markers = computeMarkersFromData(edgeData);

      // Prefer the exact handles RF reports from the drag
      let sourceHandle =
        normalizePortHandleId(connection.sourceHandle) ??
        connection.sourceHandle ??
        null;
      let targetHandle =
        normalizePortHandleId(connection.targetHandle) ??
        connection.targetHandle ??
        null;

      // Only if a handle id is missing: fill a port on THAT connected node
      // facing its partner — never pick a different node.
      {
        const nodes = get().nodes as Node<FlowNodeData>[];
        const src = nodes.find((n) => n.id === sourceId);
        const tgt = nodes.find((n) => n.id === targetId);
        if (src && tgt) {
          if (!sourceHandle) sourceHandle = pickFacingPortId(src, tgt);
          if (!targetHandle) targetHandle = pickFacingPortId(tgt, src);
        }
      }

      set({
        edges: addEdge(
          {
            source: sourceId,
            target: targetId,
            sourceHandle,
            targetHandle,
            type: "flowEdge",
            ...markers,
            data: edgeData,
            reconnectable: true,
          } as Connection,
          get().edges,
        ) as Edge<FlowEdgeData>[],
      });
    }),

    onReconnect: withHistory((oldEdge, newConnection) => {
      // Mindmap spokes are not re-pluggable (straight radial geometry)
      if (get().diagramKind === "mindmap") return;
      // Absolute: use the new connection's source/target only (what user re-plugged)
      const sourceId = newConnection.source ?? oldEdge.source;
      const targetId = newConnection.target ?? oldEdge.target;
      if (!sourceId || !targetId) return;

      let sourceHandle =
        normalizePortHandleId(newConnection.sourceHandle) ??
        newConnection.sourceHandle ??
        null;
      let targetHandle =
        normalizePortHandleId(newConnection.targetHandle) ??
        newConnection.targetHandle ??
        null;

      // Fill missing handles on the re-plugged pair only
      const nodes = get().nodes as Node<FlowNodeData>[];
      const src = nodes.find((n) => n.id === sourceId);
      const tgt = nodes.find((n) => n.id === targetId);
      if (src && tgt) {
        if (!sourceHandle) sourceHandle = pickFacingPortId(src, tgt);
        if (!targetHandle) targetHandle = pickFacingPortId(tgt, src);
      }

      const next = reconnectEdge(
        oldEdge,
        {
          source: sourceId,
          target: targetId,
          sourceHandle,
          targetHandle,
        },
        get().edges,
      ) as Edge<FlowEdgeData>[];
      // Re-plug counts as a manual connection (same edge id)
      set({
        edges: next.map((e) =>
          e.id === oldEdge.id
            ? {
                ...e,
                source: sourceId,
                target: targetId,
                sourceHandle,
                targetHandle,
                data: { ...(e.data ?? {}), manualConnect: true },
              }
            : e,
        ),
      });
    }),

    removeEdgeById: withHistory((id) => {
      set({
        edges: get().edges.filter((e) => e.id !== id),
      });
    }),

    addNode: withHistory((shape: NodeShape = "rectangle") => {
      const id = `node_${nodeCounter++}`;
      const offset = (nodeCounter * 30) % 200;
      // Explicit size so the shape paints even after deselect (RF won't leave 0×0)
      const w = 140;
      const h = 48;
      const newNode: Node<FlowNodeData> = {
        id,
        type: "flowNode",
        position: { x: 150 + offset, y: 100 + offset },
        width: w,
        height: h,
        style: { width: w, height: h },
        data: {
          label: "Node",
          shape,
          portCount: 4,
          portOnPerimeter: true,
          portRadius: 1,
          portRotation: 0,
        },
        selected: true,
      };
      const { focusNodeRequest } = get();
      set({
        nodes: [
          ...get().nodes.map((n) =>
            n.selected ? { ...n, selected: false } : n,
          ),
          newNode,
        ],
        focusNodeRequest: {
          nodeId: id,
          token: (focusNodeRequest?.token ?? 0) + 1,
        },
      });
    }),

    addNodeAtPosition: withHistory(
      (position, shape: NodeShape = "rectangle", width?: number, height?: number) => {
        const id = `node_${nodeCounter++}`;
        const w = width && width > 8 ? width : 140;
        const h = height && height > 8 ? height : 48;
        const newNode: Node<FlowNodeData> = {
          id,
          type: "flowNode",
          position,
          width: w,
          height: h,
          style: { width: w, height: h },
          data: {
            label: "Node",
            shape,
            portCount: 4,
            portOnPerimeter: true,
            portRadius: 1,
            portRotation: 0,
          },
          selected: true,
        };
        const { focusNodeRequest } = get();
        set({
          nodes: [
            ...get().nodes.map((n) =>
              n.selected ? { ...n, selected: false } : n,
            ),
            newNode,
          ],
          focusNodeRequest: {
            nodeId: id,
            token: (focusNodeRequest?.token ?? 0) + 1,
          },
        });
      },
    ),

    addConnectedNodeAtPosition: withHistory(
      (opts: {
        position: { x: number; y: number };
        fromNodeId: string;
        fromHandleId?: string | null;
        fromHandleType?: "source" | "target" | null;
        shape?: NodeShape;
        width?: number;
        height?: number;
      }) => {
        const isMm = get().diagramKind === "mindmap";
        if (!opts.fromNodeId || !get().nodes.some((n) => n.id === opts.fromNodeId)) {
          return null;
        }

        const id = `node_${nodeCounter++}`;
        const shape = opts.shape ?? (isMm ? "circle" : "rectangle");
        const mmSize = isMm
          ? measureMindmapNodeSize("New topic", {
              isHub: false,
              shape: shape === "circle" ? "circle" : shape,
            })
          : null;
        const w =
          opts.width && opts.width > 8
            ? opts.width
            : (mmSize?.width ?? 140);
        const h =
          opts.height && opts.height > 8
            ? opts.height
            : (mmSize?.height ?? 48);
        // Center the new shape on the drop point
        const position = {
          x: opts.position.x - w / 2,
          y: opts.position.y - h / 2,
        };
        const newNode: Node<FlowNodeData> = {
          id,
          type: "flowNode",
          position,
          width: w,
          height: h,
          style: { width: w, height: h },
          data: {
            label: isMm ? "New topic" : "Node",
            shape,
            portCount: 4,
            portOnPerimeter: true,
            portRadius: 1,
            portRotation: 0,
          },
          selected: true,
        };

        if (isMm) {
          // Straight mindmap spoke to new topic
          set({
            nodes: [
              ...get().nodes.map((n) =>
                n.selected ? { ...n, selected: false } : n,
              ),
              newNode,
            ],
            edges: addEdge(
              {
                source: opts.fromNodeId,
                target: id,
                sourceHandle: "center",
                targetHandle: "center-target",
                type: "mindmapEdge",
                data: {
                  edgeStyle: "solid",
                  startMarker: "none",
                  endMarker: "none",
                  arrowType: "none",
                },
                reconnectable: false,
              } as Connection,
              get().edges,
            ) as Edge<FlowEdgeData>[],
          });
          return id;
        }

        const edgeData: FlowEdgeData = {
          edgeStyle: "solid",
          startMarker: "none",
          endMarker: "arrow",
          arrowType: "arrow",
          manualConnect: true,
        };
        const markers = computeMarkersFromData(edgeData);
        const fromHandle =
          normalizePortHandleId(opts.fromHandleId) ??
          opts.fromHandleId ??
          undefined;

        // Dragging from a source handle → from is source; from a target → from is target
        const fromIsSource = opts.fromHandleType !== "target";
        const connection: Connection = fromIsSource
          ? {
              source: opts.fromNodeId,
              target: id,
              sourceHandle: fromHandle ?? null,
              targetHandle: null,
            }
          : {
              source: id,
              target: opts.fromNodeId,
              sourceHandle: null,
              targetHandle: fromHandle ?? null,
            };

        set({
          nodes: [
            ...get().nodes.map((n) =>
              n.selected ? { ...n, selected: false } : n,
            ),
            newNode,
          ],
          edges: addEdge(
            {
              ...connection,
              type: "flowEdge",
              ...markers,
              data: edgeData,
              reconnectable: true,
            } as Connection,
            get().edges,
          ) as Edge<FlowEdgeData>[],
        });
        return id;
      },
    ),

    updateNodeLabel: withHistory((id, label) => {
      const isMm = get().diagramKind === "mindmap";
      const edges = get().edges;
      set({
        nodes: get().nodes.map((n) => {
          if (n.id !== id) return n;
          if (!isMm) return { ...n, data: { ...n.data, label } };
          // Auto-grow topic so the new label fits
          const isHub = !edges.some((e) => e.target === id);
          const fitted = measureMindmapNodeSize(label, {
            isHub,
            shape: n.data?.shape,
          });
          const oldW =
            (typeof n.style?.width === "number" ? n.style.width : undefined) ??
            (typeof n.width === "number" ? n.width : fitted.width);
          const oldH =
            (typeof n.style?.height === "number" ? n.style.height : undefined) ??
            (typeof n.height === "number" ? n.height : fitted.height);
          const cx = n.position.x + oldW / 2;
          const cy = n.position.y + oldH / 2;
          // Grow to fit; never shrink on edit (avoids jumping when shortening text)
          const width = Math.max(fitted.width, oldW);
          const height = Math.max(fitted.height, oldH);
          return {
            ...n,
            position: { x: cx - width / 2, y: cy - height / 2 },
            width,
            height,
            style: { ...n.style, width, height },
            data: { ...n.data, label },
          };
        }),
      });
    }),

    updateNodeShape: withHistory((id, shape) => {
      set({
        nodes: get().nodes.map((n) =>
          n.id === id
            ? {
                ...n,
                type: "flowNode",
                data: { ...n.data, shape },
              }
            : n,
        ),
      });
    }),

    updateNodeStyle: withHistory((id, style) => {
      set({
        nodes: get().nodes.map((n) =>
          n.id === id ? { ...n, selected: true, data: { ...n.data, ...style } } : n,
        ),
      });
    }),

    updateNodesStyle: withHistory((ids, style) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      set({
        nodes: get().nodes.map((n) =>
          idSet.has(n.id)
            ? {
                ...n,
                selected: true,
                type: "flowNode",
                data: { ...n.data, ...style },
              }
            : n,
        ),
      });
    }),

    updateNodesShape: withHistory((ids, shape) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const isMm = get().diagramKind === "mindmap";
      // Flowchart inspector must never write mindmap-only shapes
      const safeShape: NodeShape =
        !isMm && (shape === "bang" || shape === "cloud")
          ? "rounded"
          : shape;
      set({
        nodes: get().nodes.map((n) =>
          idSet.has(n.id)
            ? {
                ...n,
                selected: true,
                type: "flowNode",
                data: { ...n.data, shape: safeShape },
              }
            : n,
        ),
      });
    }),

    updateNodesLabel: withHistory((ids, label) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      set({
        nodes: get().nodes.map((n) =>
          idSet.has(n.id)
            ? { ...n, selected: true, data: { ...n.data, label } }
            : n,
        ),
      });
    }),

    updateNodesIcon: withHistory((ids, icon) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      set({
        nodes: get().nodes.map((n) =>
          idSet.has(n.id)
            ? {
                ...n,
                selected: true,
                data: {
                  ...n.data,
                  icon: icon && icon.trim() ? icon.trim() : undefined,
                },
              }
            : n,
        ),
      });
    }),

    updateNodesPortLayout: withHistory((ids, layout) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const nodes = get().nodes.map((n) => {
        if (!idSet.has(n.id) || n.data.isSubgraph) return n;
        const next: FlowNodeData = { ...n.data };
        if (layout.portCount !== undefined) {
          next.portCount = clampPortCount(layout.portCount);
        }
        if (layout.portRadius !== undefined) {
          next.portRadius = clampPortRadius(layout.portRadius);
        }
        if (layout.portRotation !== undefined) {
          next.portRotation = layout.portRotation;
        }
        if (layout.portOnPerimeter !== undefined) {
          next.portOnPerimeter = layout.portOnPerimeter;
        }
        return { ...n, selected: true, data: next };
      });
      // Re-snap edges to valid ports after layout change
      set({
        nodes,
        edges: reconcileEdgeHandles(nodes, get().edges),
      });
    }),

    addNodePort: withHistory((ids) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const nodes = get().nodes.map((n) => {
        if (!idSet.has(n.id) || n.data.isSubgraph) return n;
        const cur = getPortLayout(n.data);
        return {
          ...n,
          selected: true,
          data: {
            ...n.data,
            portCount: clampPortCount(cur.count + 1),
          },
        };
      });
      set({
        nodes,
        edges: reconcileEdgeHandles(nodes, get().edges),
      });
    }),

    removeNodePort: withHistory((ids) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const nodes = get().nodes.map((n) => {
        if (!idSet.has(n.id) || n.data.isSubgraph) return n;
        const cur = getPortLayout(n.data);
        return {
          ...n,
          selected: true,
          data: {
            ...n.data,
            portCount: clampPortCount(cur.count - 1),
          },
        };
      });
      set({
        nodes,
        edges: reconcileEdgeHandles(nodes, get().edges),
      });
    }),

    addMindmapChild: withHistory((parentId) => {
      const { nodes, edges } = get();
      const selected = nodes.filter((n) => n.selected);
      const parent =
        parentId ??
        selected[0]?.id ??
        mindmapRoots(nodes, edges)[0]?.id ??
        null;
      const id = `mm_${nodeCounter++}`;
      const parentNode = parent ? nodes.find((n) => n.id === parent) : null;
      const offset = parentNode
        ? {
            x: parentNode.position.x + 200,
            y: parentNode.position.y + selected.length * 40,
          }
        : { x: 150, y: 100 };
      const leafSize = measureMindmapNodeSize("New topic", {
        isHub: false,
        shape: "circle",
      });
      const newNode: Node<FlowNodeData> = {
        id,
        type: "flowNode",
        position: offset,
        width: leafSize.width,
        height: leafSize.height,
        selected: true,
        data: {
          label: "New topic",
          shape: "circle",
          portCount: 4,
          portOnPerimeter: true,
          portRadius: 1,
          portRotation: 0,
        },
        style: { width: leafSize.width, height: leafSize.height },
      };
      const nextNodes: Node<FlowNodeData>[] = [
        ...nodes.map((n) => ({ ...n, selected: false as const })),
        newNode,
      ];
      const nextEdges = parent
        ? [...edges, makeMindmapEdge(parent, id)]
        : edges;
      set({ nodes: nextNodes, edges: nextEdges });
    }),

    addMindmapSibling: withHistory((nodeId) => {
      const { nodes, edges } = get();
      const selected = nodes.filter((n) => n.selected);
      const refId = nodeId ?? selected[0]?.id;
      if (!refId) {
        // No selection → add a new root
        const id = `mm_${nodeCounter++}`;
        const hubSize = measureMindmapNodeSize("New topic", {
          isHub: true,
          shape: "circle",
        });
        const rootNode: Node<FlowNodeData> = {
          id,
          type: "flowNode",
          position: { x: 40, y: 40 + nodes.length * 88 },
          width: hubSize.width,
          height: hubSize.height,
          selected: true,
          data: {
            label: "New topic",
            shape: "circle",
            portCount: 4,
            portOnPerimeter: true,
            portRadius: 1,
            portRotation: 0,
          },
          style: { width: hubSize.width, height: hubSize.height },
        };
        set({
          nodes: [
            ...nodes.map((n) => ({ ...n, selected: false as const })),
            rootNode,
          ],
        });
        return;
      }
      const parent = mindmapParentOf(refId, edges);
      const ref = nodes.find((n) => n.id === refId);
      const id = `mm_${nodeCounter++}`;
      const leafSize = measureMindmapNodeSize("New topic", {
        isHub: false,
        shape: "circle",
      });
      const newNode: Node<FlowNodeData> = {
        id,
        type: "flowNode",
        position: {
          x: (ref?.position.x ?? 40) + (parent ? 0 : 40),
          y: (ref?.position.y ?? 40) + 88,
        },
        width: leafSize.width,
        height: leafSize.height,
        selected: true,
        data: {
          label: "New topic",
          shape: "circle",
          portCount: 4,
          portOnPerimeter: true,
          portRadius: 1,
          portRotation: 0,
        },
        style: { width: leafSize.width, height: leafSize.height },
      };
      const nextNodes: Node<FlowNodeData>[] = [
        ...nodes.map((n) => ({ ...n, selected: false as const })),
        newNode,
      ];
      const nextEdges = parent
        ? [...edges, makeMindmapEdge(parent, id)]
        : edges;
      set({ nodes: nextNodes, edges: nextEdges });
    }),

    reparentMindmapNodes: withHistory((nodeIds, newParentId) => {
      if (nodeIds.length === 0) return;
      const { nodes, edges } = get();
      const moving = new Set(nodeIds);
      // Prevent cycles: cannot parent under self or descendant
      if (newParentId) {
        for (const id of nodeIds) {
          if (id === newParentId) return;
          const desc = mindmapDescendantsOf(id, edges);
          if (desc.has(newParentId)) return;
        }
      }
      const nextEdges = edges.filter((e) => !moving.has(e.target));
      if (newParentId) {
        for (const id of nodeIds) {
          nextEdges.push(makeMindmapEdge(newParentId, id));
        }
      }
      set({
        edges: nextEdges,
        nodes: nodes.map((n) =>
          moving.has(n.id) ? { ...n, selected: true } : n,
        ),
      });
    }),

    /**
     * Outdent: become sibling of parent, inserted *immediately after* parent
     * among grandparent’s children so Demote (indent under previous sibling)
     * returns to the original parent.
     */
    promoteMindmapNodes: withHistory((nodeIds) => {
      const { nodes, edges } = get();
      const ids =
        nodeIds && nodeIds.length > 0
          ? nodeIds
          : nodes.filter((n) => n.selected).map((n) => n.id);
      if (ids.length === 0) return;
      let nextEdges = [...edges];
      for (const id of ids) {
        const parent = mindmapParentOf(id, nextEdges);
        if (!parent) continue;
        const grand = mindmapParentOf(parent, nextEdges);
        nextEdges = nextEdges.filter(
          (e) => !(e.target === id && e.source === parent),
        );
        if (grand) {
          const newEdge = makeMindmapEdge(grand, id);
          // Place right after grand→parent so previous sibling on demote = parent
          const parentEdgeIdx = nextEdges.findIndex(
            (e) => e.source === grand && e.target === parent,
          );
          if (parentEdgeIdx >= 0) {
            nextEdges = [
              ...nextEdges.slice(0, parentEdgeIdx + 1),
              newEdge,
              ...nextEdges.slice(parentEdgeIdx + 1),
            ];
          } else {
            nextEdges.push(newEdge);
          }
        }
        // else: becomes a root (no incoming edge) — demote uses previous root
      }
      set({
        edges: nextEdges,
        nodes: nodes.map((n) =>
          ids.includes(n.id) ? { ...n, selected: true } : n,
        ),
      });
    }),

    /**
     * Indent: become last? No — become child of previous sibling (edge order).
     * Inverse of promote when promote inserted after former parent.
     */
    demoteMindmapNodes: withHistory((nodeIds) => {
      const { nodes, edges } = get();
      const ids =
        nodeIds && nodeIds.length > 0
          ? nodeIds
          : nodes.filter((n) => n.selected).map((n) => n.id);
      if (ids.length === 0) return;
      let nextEdges = [...edges];
      for (const id of ids) {
        const prev = mindmapPreviousSibling(id, nextEdges, nodes);
        if (!prev) continue;
        // Remove current parent edge (if any)
        nextEdges = nextEdges.filter((e) => e.target !== id);
        // Attach under previous sibling (as its last child in edge order)
        nextEdges.push(makeMindmapEdge(prev, id));
      }
      set({
        edges: nextEdges,
        nodes: nodes.map((n) =>
          ids.includes(n.id) ? { ...n, selected: true } : n,
        ),
      });
    }),

    deleteMindmapSubtree: withHistory((nodeIds) => {
      const { nodes, edges } = get();
      const ids =
        nodeIds && nodeIds.length > 0
          ? nodeIds
          : nodes.filter((n) => n.selected).map((n) => n.id);
      if (ids.length === 0) return;
      const remove = new Set<string>();
      for (const id of ids) {
        remove.add(id);
        for (const d of mindmapDescendantsOf(id, edges)) remove.add(d);
      }
      set({
        nodes: nodes.filter((n) => !remove.has(n.id)),
        edges: edges.filter(
          (e) => !remove.has(e.source) && !remove.has(e.target),
        ),
      });
    }),

    layoutMindmap: (opts) => {
      const fit = opts?.fit === true;
      const { nodes, edges, direction, past, layoutEpoch } = get();
      if (nodes.length === 0) return;
      // Snapshot for undo
      const snapshot = {
        nodes: nodes.map((n) => ({ ...n, data: { ...n.data } })),
        edges: edges.map((e) => ({
          ...e,
          data: { ...(e.data ?? {}) } as FlowEdgeData,
        })),
      };
      const laidOut = applyMindmapTreeLayout(
        nodes,
        edges,
        direction || "TD",
      );
      // Ensure circular mindmap nodes + radial edge types
      const mmNodes = asMindmapNodes(laidOut, edges);
      const mmEdges = asMindmapEdges(edges);
      set({
        nodes: mmNodes,
        edges: mmEdges,
        diagramKind: "mindmap",
        past: [...past.slice(-(MAX_HISTORY - 1)), snapshot],
        future: [],
        // Only Auto layout / import should re-fit and change zoom
        layoutEpoch: fit ? layoutEpoch + 1 : layoutEpoch,
      });
    },

    updateEdgeLabel: withHistory((id, label) => {
      set({
        edges: get().edges.map((e) => (e.id === id ? { ...e, label } : e)),
      });
    }),

    selectedWaypoint: null,
    setSelectedWaypoint: (sel) => set({ selectedWaypoint: sel }),

    setEdgeWaypoints: withHistory((id, waypoints) => {
      set({
        edges: get().edges.map((e) => {
          if (e.id !== id) return e;
          const data: FlowEdgeData = {
            ...(e.data ?? {}),
            waypoints,
          };
          // Custom bends replace frozen Mermaid path
          if (waypoints.length > 0) {
            delete data.mermaidPath;
            delete data.mermaidLabelX;
            delete data.mermaidLabelY;
          }
          return { ...e, data };
        }),
        selectedWaypoint: null,
      });
    }),

    setEdgeWaypointsLive: (id, waypoints) => {
      set({
        edges: get().edges.map((e) => {
          if (e.id !== id) return e;
          const data: FlowEdgeData = {
            ...(e.data ?? {}),
            waypoints,
          };
          if (waypoints.length > 0) {
            delete data.mermaidPath;
            delete data.mermaidLabelX;
            delete data.mermaidLabelY;
          }
          return { ...e, data };
        }),
      });
    },

    addEdgeWaypoint: withHistory((id, at) => {
      set({
        edges: get().edges.map((e) => {
          if (e.id !== id) return e;
          const prev = e.data?.waypoints ?? [];
          const wp = {
            id: `wp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            x: at?.x ?? 0,
            y: at?.y ?? 0,
          };
          // If no position given, place at midpoint of current path ends later in UI
          const data: FlowEdgeData = {
            ...(e.data ?? {}),
            waypoints: [...prev, wp],
          };
          delete data.mermaidPath;
          delete data.mermaidLabelX;
          delete data.mermaidLabelY;
          return { ...e, data };
        }),
      });
    }),

    removeEdgeWaypoint: withHistory((edgeId, waypointId) => {
      const prevSel = get().selectedWaypoint;
      const clearSel =
        prevSel?.edgeId === edgeId && prevSel?.waypointId === waypointId;
      set({
        edges: get().edges.map((e) => {
          if (e.id !== edgeId) return e;
          const wps = (e.data?.waypoints ?? []).filter(
            (w) => w.id !== waypointId,
          );
          return {
            ...e,
            data: { ...(e.data ?? {}), waypoints: wps },
          };
        }),
        selectedWaypoint: clearSel ? null : prevSel,
      });
    }),

    updateEdgeWaypoint: (edgeId, waypointId, pos) => {
      // No history spam while dragging — pushHistory on pointer up from UI
      set({
        edges: get().edges.map((e) => {
          if (e.id !== edgeId) return e;
          const wps = (e.data?.waypoints ?? []).map((w) =>
            w.id === waypointId
              ? { ...w, x: pos.x, y: pos.y }
              : w,
          );
          return {
            ...e,
            data: { ...(e.data ?? {}), waypoints: wps },
          };
        }),
      });
    },

    updateEdgeLabelOffsetLive: (id, offset) => {
      set({
        edges: get().edges.map((e) =>
          e.id === id
            ? {
                ...e,
                data: {
                  ...(e.data ?? {}),
                  labelOffsetX: offset.labelOffsetX,
                  labelOffsetY: offset.labelOffsetY,
                },
              }
            : e,
        ),
      });
    },

    updateEdgeType: withHistory((id, updates) => {
      set({
        edges: get().edges.map((e) => {
          if (e.id !== id) return e;
          const data: FlowEdgeData = {
            ...(e.data ?? {}),
            ...updates,
          };
          // Keep legacy arrowType roughly in sync for serializers that still read it
          if (
            updates.startMarker !== undefined ||
            updates.endMarker !== undefined
          ) {
            const { start, end } = resolveEdgeMarkers(data);
            if (start === "none" && end === "none") data.arrowType = "none";
            else if (start === "arrow" && end === "arrow")
              data.arrowType = "bidirectional";
            else if (start === "none" && end === "circle")
              data.arrowType = "circle";
            else if (start === "none" && end === "cross")
              data.arrowType = "cross";
            else if (start === "none" && end === "arrow")
              data.arrowType = "arrow";
            else data.arrowType = "arrow";
          } else if (updates.arrowType !== undefined) {
            const m = resolveEdgeMarkers({ arrowType: updates.arrowType });
            data.startMarker = m.start;
            data.endMarker = m.end;
          }
          const markerUpdates = computeMarkersFromData(data);
          return {
            ...e,
            markerStart: markerUpdates.markerStart,
            markerEnd: markerUpdates.markerEnd,
            data,
          };
        }),
      });
    }),

    setNodes: withHistory((nodes) => {
      set({ nodes });
    }),

    loadDiagram: withHistory((nodes, edges) => {
      const stampedNodes = nodes.map((n) => ({ ...n, type: "flowNode" }));
      const stampedEdges = edges.map((e) => ({
        ...e,
        type: "flowEdge",
        reconnectable: true,
      })) as Edge<FlowEdgeData>[];
      set({ nodes: stampedNodes, edges: stampedEdges });
    }),

    importDiagram: withHistory((nodes, edges, settings) => {
      const kind = settings.diagramKind ?? get().diagramKind;
      const stampedNodes =
        kind === "mindmap"
          ? asMindmapNodes(nodes, edges)
          : nodes.map((n) => ({ ...n, type: "flowNode" }));
      let stampedEdges =
        kind === "mindmap"
          ? asMindmapEdges(edges)
          : (edges.map((e) => ({
              ...e,
              type: "flowEdge",
              reconnectable: true,
            })) as Edge<FlowEdgeData>[]);
      // processFlow restore: never re-pick ports (would change pipe geometry).
      // Mindmap uses center handles + straight spokes — never face-port rewrite.
      if (kind !== "mindmap" && settings.skipHandleReconcile !== true) {
        stampedEdges = reconcileEdgeHandles(
          stampedNodes as Node<FlowNodeData>[],
          stampedEdges,
        );
      }
      // Advance nodeCounter to avoid ID collisions with imported nodes
      const maxId = stampedNodes.reduce((max, n) => {
        const m = n.id.match(/(\d+)$/);
        return m ? Math.max(max, parseInt(m[1], 10)) : max;
      }, 0);
      if (maxId >= nodeCounter) nodeCounter = maxId + 1;
      set({
        nodes: stampedNodes,
        edges: stampedEdges,
        direction: settings.direction,
        theme: settings.theme,
        look: settings.look,
        curveStyle: settings.curveStyle,
        ...(settings.diagramKind ? { diagramKind: settings.diagramKind } : {}),
      });
    }),

    addSubgraph: withHistory((title = "Group") => {
      const id = `sg_${nodeCounter++}`;
      const offset = (nodeCounter * 30) % 200;
      const newNode: Node<FlowNodeData> = {
        id,
        type: "flowNode",
        position: { x: 200 + offset, y: 150 + offset },
        data: { label: title, shape: "rectangle", isSubgraph: true },
        style: { width: 320, height: 220 },
        zIndex: -1,
        selected: true,
      };
      const { focusNodeRequest } = get();
      set({
        nodes: [
          ...get().nodes.map((n) =>
            n.selected ? { ...n, selected: false } : n,
          ),
          newNode,
        ],
        focusNodeRequest: {
          nodeId: id,
          token: (focusNodeRequest?.token ?? 0) + 1,
        },
      });
    }),

    assignToSubgraph: withHistory((nodeIds, subgraphId) => {
      const { nodes } = get();
      set({
        nodes: nodes.map((n) => {
          if (!nodeIds.includes(n.id)) return n;
          if (subgraphId === null) {
            // Remove from subgraph: restore absolute position
            const parent = n.parentId ? nodes.find((p) => p.id === n.parentId) : null;
            const absPos = parent
              ? { x: parent.position.x + n.position.x, y: parent.position.y + n.position.y }
              : n.position;
            return { ...n, parentId: undefined, extent: undefined, position: absPos };
          }
          // Assign to subgraph: convert to relative position
          const parent = nodes.find((p) => p.id === subgraphId);
          const relPos = parent
            ? { x: n.position.x - parent.position.x, y: n.position.y - parent.position.y }
            : n.position;
          return { ...n, parentId: subgraphId, position: relPos };
        }),
      });
    }),

    setDirection: (direction) => set({ direction }),
    setTheme: (theme) => set({ theme }),
    setLook: (look) => set({ look }),
    setCurveStyle: (curveStyle) => set({ curveStyle }),
    setDiagramKind: (diagramKind) => set({ diagramKind }),

    copySelected: () => {
      const { nodes, edges } = get();
      const selectedNodes = nodes.filter((n) => n.selected);
      if (selectedNodes.length === 0) return;
      const selectedIds = new Set(selectedNodes.map((n) => n.id));
      const selectedEdges = edges.filter(
        (e) => selectedIds.has(e.source) && selectedIds.has(e.target),
      );
      set({ clipboard: { nodes: selectedNodes, edges: selectedEdges } });
    },

    pasteClipboard: withHistory(() => {
      const { clipboard, nodes, edges } = get();
      if (!clipboard || clipboard.nodes.length === 0) return;

      const idMap = new Map<string, string>();

      const newNodes = clipboard.nodes.map((n) => {
        const newId = `node_${nodeCounter++}`;
        idMap.set(n.id, newId);
        return {
          ...n,
          id: newId,
          selected: true,
          position: { x: n.position.x + 40, y: n.position.y + 40 },
          parentId: n.parentId && idMap.has(n.parentId) ? idMap.get(n.parentId) : undefined,
        };
      });

      const newEdges = clipboard.edges
        .filter((e) => idMap.has(e.source) && idMap.has(e.target))
        .map((e) => ({
          ...e,
          id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          source: idMap.get(e.source)!,
          target: idMap.get(e.target)!,
          selected: true,
        }));

      set({
        nodes: [...nodes.map((n) => ({ ...n, selected: false })), ...newNodes],
        edges: [...edges.map((e) => ({ ...e, selected: false })), ...newEdges],
      });
    }),

    duplicateSelected: withHistory(() => {
      const { nodes, edges } = get();
      const selectedNodes = nodes.filter((n) => n.selected);
      if (selectedNodes.length === 0) return;
      const idMap = new Map<string, string>();

      // Duplicate the selected nodes themselves
      const newNodes = selectedNodes.map((n) => {
        const newId = `node_${nodeCounter++}`;
        idMap.set(n.id, newId);
        const label = n.data.isSubgraph ? `Copy of ${n.data.label}` : n.data.label;
        return {
          ...n,
          id: newId,
          data: { ...n.data, label },
          position: { x: n.position.x + 30, y: n.position.y + 30 },
          selected: true,
        };
      });

      // For each duplicated subgraph, also duplicate its children
      const childNodes: Node<FlowNodeData>[] = [];
      for (const n of selectedNodes) {
        if (!n.data.isSubgraph) continue;
        const newParentId = idMap.get(n.id)!;
        for (const child of nodes.filter((c) => c.parentId === n.id)) {
          const newChildId = `node_${nodeCounter++}`;
          idMap.set(child.id, newChildId);
          childNodes.push({ ...child, id: newChildId, parentId: newParentId, selected: true });
        }
      }

      // Duplicate edges where both endpoints were duplicated
      const newEdges = edges
        .filter((e) => idMap.has(e.source) && idMap.has(e.target))
        .map((e) => ({
          ...e,
          id: `edge_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          source: idMap.get(e.source)!,
          target: idMap.get(e.target)!,
        }));

      set({
        nodes: [...nodes.map((n) => ({ ...n, selected: false })), ...newNodes, ...childNodes],
        edges: [...edges, ...newEdges],
      });
    }),
  };
});
