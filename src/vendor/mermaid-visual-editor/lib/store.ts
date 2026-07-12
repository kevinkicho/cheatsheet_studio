import { create } from "zustand";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  MarkerType,
  type Connection,
  type Edge,
  type EdgeChange,
  type EdgeMarkerType,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import {
  applyMindmapTreeLayout,
  asMindmapEdges,
  asMindmapNodes,
  makeMindmapEdge,
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
export type ArrowType = "arrow" | "none" | "bidirectional" | "circle" | "cross";

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
}

export interface FlowEdgeData extends Record<string, unknown> {
  edgeStyle?: EdgeStyle;
  arrowType?: ArrowType;
  strokeColor?: string;
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
   * Bumped after mindmap auto-layout so the canvas can fitView.
   * Not part of undo history.
   */
  layoutEpoch: number;
  past: Snapshot[];
  future: Snapshot[];

  // React Flow change handlers
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  // Node operations
  addNode: (shape?: NodeShape) => void;
  addNodeAtPosition: (
    position: { x: number; y: number },
    shape?: NodeShape,
    width?: number,
    height?: number,
  ) => void;
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
    },
  ) => void;

  // Subgraph operations
  addSubgraph: (title?: string) => void;
  assignToSubgraph: (nodeIds: string[], subgraphId: string | null) => void;

  // Edge operations
  updateEdgeLabel: (id: string, label: string) => void;
  updateEdgeType: (id: string, updates: Partial<FlowEdgeData>) => void;

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

  /**
   * Canvas interaction when not drawing:
   * - select: left-drag marquee / move nodes; middle+right pan
   * - pan: left-drag pans the viewport (hand tool)
   */
  interactionMode: "select" | "pan";
  setInteractionMode: (mode: "select" | "pan") => void;
}

// ─── Helper: compute edge markers based on arrowType ─────────────────────────
function computeMarkers(arrowType: ArrowType): {
  markerEnd?: EdgeMarkerType;
  markerStart?: EdgeMarkerType;
} {
  if (arrowType === "none") return {};
  if (arrowType === "bidirectional") {
    return {
      markerEnd: { type: MarkerType.ArrowClosed },
      markerStart: { type: MarkerType.ArrowClosed },
    };
  }
  return { markerEnd: { type: MarkerType.ArrowClosed } };
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
    layoutEpoch: 0,
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

    onNodesChange: (changes) =>
      set({
        nodes: applyNodeChanges(changes, get().nodes) as Node<FlowNodeData>[],
      }),

    onEdgesChange: (changes) =>
      set({
        edges: applyEdgeChanges(changes, get().edges) as Edge<FlowEdgeData>[],
      }),

    onConnect: withHistory((connection) => {
      // Mind map edges are undirected parent→child lines (no arrow heads)
      const isMm = get().diagramKind === "mindmap";
      const arrowType: ArrowType = isMm ? "none" : "arrow";
      const markers = isMm ? {} : computeMarkers(arrowType);
      set({
        edges: addEdge(
          {
            ...connection,
            type: isMm ? "mindmapEdge" : "flowEdge",
            ...(isMm
              ? {
                  sourceHandle: connection.sourceHandle ?? "center",
                  targetHandle: connection.targetHandle ?? "center-target",
                }
              : markers),
            data: { edgeStyle: "solid", arrowType },
          },
          get().edges,
        ) as Edge<FlowEdgeData>[],
      });
    }),

    addNode: withHistory((shape: NodeShape = "rectangle") => {
      const id = `node_${nodeCounter++}`;
      const offset = (nodeCounter * 30) % 200;
      const newNode: Node<FlowNodeData> = {
        id,
        type: "flowNode",
        position: { x: 150 + offset, y: 100 + offset },
        data: { label: "Node", shape },
      };
      set({ nodes: [...get().nodes, newNode] });
    }),

    addNodeAtPosition: withHistory(
      (position, shape: NodeShape = "rectangle", width?: number, height?: number) => {
        const id = `node_${nodeCounter++}`;
        const newNode: Node<FlowNodeData> = {
          id,
          type: "flowNode",
          position,
          data: { label: "Node", shape },
          ...(width && height ? { style: { width, height } } : {}),
        };
        set({ nodes: [...get().nodes, newNode] });
      },
    ),

    updateNodeLabel: withHistory((id, label) => {
      set({
        nodes: get().nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, label } } : n,
        ),
      });
    }),

    updateNodeShape: withHistory((id, shape) => {
      const isMm = get().diagramKind === "mindmap";
      set({
        nodes: get().nodes.map((n) =>
          n.id === id
            ? {
                ...n,
                // Always match diagram kind so flowchart never stays on mindmapNode
                type: isMm ? "mindmapNode" : "flowNode",
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
                // Keep mindmap circular node type when styling
                type:
                  get().diagramKind === "mindmap" ? "mindmapNode" : n.type,
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
                type: isMm ? "mindmapNode" : "flowNode",
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
      const newNode: Node<FlowNodeData> = {
        id,
        type: "mindmapNode",
        position: offset,
        selected: true,
        data: { label: "New topic", shape: "circle" },
        style: { width: 96, height: 96 },
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
        const rootNode: Node<FlowNodeData> = {
          id,
          type: "mindmapNode",
          position: { x: 40, y: 40 + nodes.length * 88 },
          selected: true,
          data: { label: "New topic", shape: "circle" },
          style: { width: 120, height: 120 },
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
      const newNode: Node<FlowNodeData> = {
        id,
        type: "mindmapNode",
        position: {
          x: (ref?.position.x ?? 40) + (parent ? 0 : 40),
          y: (ref?.position.y ?? 40) + 88,
        },
        selected: true,
        data: { label: "New topic", shape: "circle" },
        style: { width: 96, height: 96 },
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

    updateEdgeType: withHistory((id, updates) => {
      const arrowType = updates.arrowType;
      const markerUpdates =
        arrowType !== undefined ? computeMarkers(arrowType) : {};
      set({
        edges: get().edges.map((e) =>
          e.id === id
            ? {
                ...e,
                ...markerUpdates,
                data: { ...(e.data ?? {}), ...updates } as FlowEdgeData,
              }
            : e,
        ),
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
      })) as Edge<FlowEdgeData>[];
      set({ nodes: stampedNodes, edges: stampedEdges });
    }),

    importDiagram: withHistory((nodes, edges, settings) => {
      const kind = settings.diagramKind ?? get().diagramKind;
      const stampedNodes =
        kind === "mindmap"
          ? asMindmapNodes(nodes, edges)
          : nodes.map((n) => ({ ...n, type: "flowNode" }));
      const stampedEdges =
        kind === "mindmap"
          ? asMindmapEdges(edges)
          : (edges.map((e) => ({
              ...e,
              type: "flowEdge",
            })) as Edge<FlowEdgeData>[]);
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
      };
      set({ nodes: [...get().nodes, newNode] });
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
