import {
  ConnectionMode,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  ViewportPortal,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  useViewport,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type Viewport as FlowViewport,
} from '@xyflow/react';
import { useEffect, useRef, useState, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react';
import { cardPositionAtPointer, wheelAction, type Viewport } from '../../../shared/gestures';
import { MAX_ZOOM, MIN_ZOOM } from '../../../shared/limits';
import type { Board } from '../../../shared/model';
import { toEdges, toNodes } from '../flow';
import { columnAtPoint, insertionIndex } from '../../../shared/columns';
import { COLUMN_GAP, COLUMN_HEADER, COLUMN_PAD } from '../../../shared/limits';
import { BoardCardNode, ColumnCardNode, ImageCardNode, LinkCardNode, StickerCardNode, TextCardNode, TodoCardNode, setCardLookup, type CardLookup } from './cards';

const nodeTypes = {
  textCard: TextCardNode,
  imageCard: ImageCardNode,
  boardCard: BoardCardNode,
  stickerCard: StickerCardNode,
  columnCard: ColumnCardNode,
  todoCard: TodoCardNode,
  linkCard: LinkCardNode,
};

export type PlacementApi = {
  center: () => { x: number; y: number };
};

export function BoardCanvas(props: {
  board: Board;
  syncToken: number;
  selectRequest?: { token: number; ids: string[] | 'all' };
  editingId: string | null;
  focusId: string | null;
  connect: boolean;
  tool: 'select' | 'note' | 'heading' | 'subheading' | 'image' | 'column' | 'todo' | 'line' | 'subboard' | 'link' | 'connect';
  lookup: CardLookup;
  placementRef: MutableRefObject<PlacementApi | null>;
  onCreate: (tool: 'note' | 'heading' | 'subheading' | 'subboard' | 'column' | 'todo' | 'line' | 'link', point: { x: number; y: number }) => void;
  onPositions: (updates: { id: string; x: number; y: number }[]) => void;
  onSizes: (updates: { id: string; width: number; height: number }[]) => void;
  onDragStart: () => void;
  onDragStop: (id: string, pointer: { x: number; y: number }) => void;
  onDelete: (ids: string[]) => Promise<string[]>;
  onConnect: (connection: Connection) => void;
  onDeleteEdges: (ids: string[]) => void;
  onViewport: (viewport: Viewport) => void;
  onEdit: (id: string) => void;
  onSelection: (ids: string[]) => void;
  onDropTool: (tool: string, point: { x: number; y: number }) => void;
  onLinePoint: (point: { x: number; y: number }) => void;
  lines: { id: string; x1: number; y1: number; x2: number; y2: number; color: string; colorName: string; arrowhead: boolean; selected: boolean; sourceKind: string; targetKind: string }[];
  onSelectLine: (id: string | null) => void;
  onDrawLine: (start: { x: number; y: number }, end: { x: number; y: number }) => void;
  onLayoutSync: () => void;
  onDropFiles?: (files: File[], point: { x: number; y: number }) => void;
  onContextMenu?: (target: { kind: 'card'; id: string } | { kind: 'pane' }, screen: { x: number; y: number }, point: { x: number; y: number }) => void;
  onOpenCard?: (id: string) => boolean;
  onPointer?: (point: { x: number; y: number }) => void;
  onLineEndpoint?: (lineId: string, end: 'source' | 'target', point: { x: number; y: number }) => void;
  centerRequest?: { token: number; x: number; y: number };
}) {
  const boardRef = useRef(props.board);
  boardRef.current = props.board;
  const focusRef = useRef(props.focusId);
  focusRef.current = props.focusId;
  const [nodes, setNodes] = useState(() => toNodes(props.board, props.editingId, props.focusId, props.connect));
  const [edges, setEdges] = useState(() => toEdges(props.board));

  const appliedFocus = useRef(props.focusId);
  useEffect(() => {
    const focus = focusRef.current;
    const focusChanged = focus !== appliedFocus.current;
    appliedFocus.current = focus;
    setNodes((current) => {
      const next = toNodes(boardRef.current, props.editingId, focus, props.connect);
      // A newly focused card becomes the selection; otherwise a re-sync keeps whatever the user selected.
      if (focusChanged && focus) return next;
      const selected = new Set(current.filter((node) => node.selected).map((node) => node.id));
      return next.map((node) => ({ ...node, selected: selected.has(node.id) }));
    });
    setEdges(toEdges(boardRef.current));
  }, [props.syncToken, props.editingId, props.connect]);

  const onSelectionRef = useRef(props.onSelection);
  onSelectionRef.current = props.onSelection;
  useEffect(() => {
    const request = props.selectRequest;
    if (!request || request.token === 0) return;
    const wanted = request.ids === 'all' ? null : new Set(request.ids);
    setNodes((current) => current.map((node) => ({ ...node, selected: !node.hidden && (!wanted || wanted.has(node.id)) })));
    onSelectionRef.current(wanted ? [...wanted] : boardRef.current.cards.map((card) => card.id));
  }, [props.selectRequest?.token]);

  setCardLookup(props.lookup);

  return (
    <div className={`board-canvas tool-${props.tool}`}>
      <ReactFlowProvider>
        <FlowSurface
          {...props}
          nodes={nodes}
          edges={edges}
          setNodes={setNodes}
          setEdges={setEdges}
        />
      </ReactFlowProvider>
    </div>
  );
}

function FlowSurface(props: {
  board: Board;
  nodes: ReturnType<typeof toNodes>;
  edges: ReturnType<typeof toEdges>;
  setNodes: (value: ReturnType<typeof toNodes> | ((current: ReturnType<typeof toNodes>) => ReturnType<typeof toNodes>)) => void;
  setEdges: (value: ReturnType<typeof toEdges> | ((current: ReturnType<typeof toEdges>) => ReturnType<typeof toEdges>)) => void;
  editingId: string | null;
  connect: boolean;
  tool: 'select' | 'note' | 'heading' | 'subheading' | 'image' | 'column' | 'todo' | 'line' | 'subboard' | 'link' | 'connect';
  placementRef: MutableRefObject<PlacementApi | null>;
  onCreate: (tool: 'note' | 'heading' | 'subheading' | 'subboard' | 'column' | 'todo' | 'line' | 'link', point: { x: number; y: number }) => void;
  onPositions: (updates: { id: string; x: number; y: number }[]) => void;
  onSizes: (updates: { id: string; width: number; height: number }[]) => void;
  onDragStart: () => void;
  onDragStop: (id: string, pointer: { x: number; y: number }) => void;
  onDelete: (ids: string[]) => Promise<string[]>;
  onConnect: (connection: Connection) => void;
  onDeleteEdges: (ids: string[]) => void;
  onViewport: (viewport: Viewport) => void;
  onEdit: (id: string) => void;
  onSelection: (ids: string[]) => void;
  onDropTool: (tool: string, point: { x: number; y: number }) => void;
  onLinePoint: (point: { x: number; y: number }) => void;
  lines: { id: string; x1: number; y1: number; x2: number; y2: number; color: string; colorName: string; arrowhead: boolean; selected: boolean; sourceKind: string; targetKind: string }[];
  onSelectLine: (id: string | null) => void;
  onDrawLine: (start: { x: number; y: number }, end: { x: number; y: number }) => void;
  onLayoutSync: () => void;
  onDropFiles?: (files: File[], point: { x: number; y: number }) => void;
  onContextMenu?: (target: { kind: 'card'; id: string } | { kind: 'pane' }, screen: { x: number; y: number }, point: { x: number; y: number }) => void;
  onOpenCard?: (id: string) => boolean;
  onPointer?: (point: { x: number; y: number }) => void;
  onLineEndpoint?: (lineId: string, end: 'source' | 'target', point: { x: number; y: number }) => void;
  centerRequest?: { token: number; x: number; y: number };
}) {
  const rf = useReactFlow();
  const shellRef = useRef<HTMLDivElement>(null);
  const drawRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const columnOrigin = useRef<{ id: string; x: number; y: number; children: { id: string; x: number; y: number }[] } | null>(null);
  const [hint, setHint] = useState<{ x: number; y: number; w: number } | null>(null);
  const [endDrag, setEndDrag] = useState<{ lineId: string; end: 'source' | 'target'; x: number; y: number } | null>(null);

  useEffect(() => {
    const request = props.centerRequest;
    if (!request || request.token === 0) return;
    const zoom = Math.max(rf.getViewport().zoom, 0.8);
    void rf.setCenter(request.x, request.y, { zoom, duration: 0 }).then(() => onViewportRef.current(rf.getViewport()));
  }, [props.centerRequest?.token]);

  function startEndpointDrag(event: ReactPointerEvent, lineId: string, end: 'source' | 'target') {
    event.preventDefault();
    event.stopPropagation();
    const move = (next: PointerEvent) => {
      const point = rf.screenToFlowPosition({ x: next.clientX, y: next.clientY });
      setEndDrag({ lineId, end, x: point.x, y: point.y });
    };
    const up = (next: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setEndDrag(null);
      const point = rf.screenToFlowPosition({ x: next.clientX, y: next.clientY });
      props.onLineEndpoint?.(lineId, end, point);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }
  const onViewportRef = useRef(props.onViewport);
  onViewportRef.current = props.onViewport;
  const editingRef = useRef(props.editingId);
  editingRef.current = props.editingId;

  useEffect(() => {
    props.placementRef.current = {
      center() {
        const flow = shellRef.current?.querySelector('.react-flow');
        const bounds = flow?.getBoundingClientRect();
        if (!bounds) return { x: 160, y: 120 };
        return cardPositionAtPointer(
          rf.getViewport(),
          bounds.width / 2,
          bounds.height / 2,
        );
      },
    };
    return () => {
      props.placementRef.current = null;
    };
  }, [props.placementRef, rf]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const onWheel = (event: WheelEvent) => {
      const target = event.target;
      const overEditor =
        target instanceof Element && Boolean(target.closest('textarea, input, .nowheel, .card-editor'));
      const flow = shell.querySelector('.react-flow');
      const rect = flow?.getBoundingClientRect();
      if (!rect || overEditor) return;
      event.preventDefault();
      const result = wheelAction({
        ctrlKey: event.ctrlKey || event.metaKey,
        shiftKey: event.shiftKey,
        deltaX: event.deltaX,
        deltaY: event.deltaY,
        deltaMode: event.deltaMode,
        viewport: rf.getViewport(),
        paneX: event.clientX - rect.left,
        paneY: event.clientY - rect.top,
        overEditor: false,
      });
      if (result.type === 'ignore') return;
      void rf.setViewport(result.viewport, { duration: 0 });
      onViewportRef.current(result.viewport);
    };
    shell.addEventListener('wheel', onWheel, { passive: false });
    return () => shell.removeEventListener('wheel', onWheel);
  }, [rf]);

  function onNodesChange(changes: NodeChange[]) {
    const removals = changes.filter((change) => change.type === 'remove').map((change) => change.id);
    const rest = changes.filter((change) => change.type !== 'remove');
    props.setNodes((current) => applyNodeChanges(rest, current) as typeof current);
    const moves: { id: string; x: number; y: number }[] = [];
    const sizes: { id: string; width: number; height: number }[] = [];
    for (const change of rest) {
      if (change.type === 'position' && change.position && change.id !== editingRef.current) {
        moves.push({ id: change.id, x: change.position.x, y: change.position.y });
      }
      if (change.type === 'dimensions' && change.dimensions && change.resizing !== undefined) {
        sizes.push({ id: change.id, width: change.dimensions.width, height: change.dimensions.height });
      }
    }
    if (moves.length > 0) props.onPositions(moves);
    if (sizes.length > 0) props.onSizes(sizes);
    if (rest.some((change) => change.type === 'dimensions' && change.resizing === false)) props.onLayoutSync();
    if (removals.length > 0) {
      void props.onDelete(removals).then((removed) => {
        if (removed.length === 0) return;
        const gone = new Set(removed);
        props.setNodes((current) => current.filter((node) => !gone.has(node.id)));
        props.setEdges((current) => current.filter((edge) => !gone.has(edge.source) && !gone.has(edge.target)));
      });
    }
  }

  function onEdgesChange(changes: EdgeChange[]) {
    props.setEdges((current) => applyEdgeChanges(changes, current));
    const removed = changes.filter((change) => change.type === 'remove').map((change) => change.id);
    if (removed.length > 0) props.onDeleteEdges(removed);
  }

  function createFromPane(event: { clientX: number; clientY: number; detail?: number }) {
    const point = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    // Double-click on the empty pane is handled by onDoubleClick on the shell: React Flow swallows
    // the second click while it prepares a drag selection.
    if (props.tool === 'select') return;
    if ((event.detail ?? 1) > 1) return;
    if (props.tool === 'note' || props.tool === 'heading' || props.tool === 'subheading' || props.tool === 'subboard' || props.tool === 'column' || props.tool === 'todo' || props.tool === 'line' || props.tool === 'link') {
      props.onCreate(props.tool, point);
    }
  }

  return (
    <div
      ref={shellRef}
      className="flow-shell"
      data-testid="flow-shell"
      onMouseDown={(event) => {
        if (props.tool !== 'line' || event.button !== 0) return;
        drawRef.current = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      }}
      onMouseUp={(event) => {
        const start = drawRef.current;
        drawRef.current = null;
        if (!start || props.tool !== 'line') return;
        const end = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        if (Math.hypot(end.x - start.x, end.y - start.y) < 6) return;
        suppressClick.current = true;
        // Only the click fired by this very mouseup is swallowed, never a later real click.
        window.setTimeout(() => {
          suppressClick.current = false;
        }, 0);
        props.onDrawLine(start, end);
      }}
      onDoubleClick={(event) => {
        if (props.tool !== 'select' || !(event.target instanceof Element) || !event.target.classList.contains('react-flow__pane')) return;
        props.onCreate('note', rf.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
      }}
      onMouseMove={(event) => props.onPointer?.(rf.screenToFlowPosition({ x: event.clientX, y: event.clientY }))}
      onDragOver={(event) => {
        const types = [...event.dataTransfer.types];
        if (types.includes('application/x-whiteboard-tool') || types.includes('Files')) {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(event) => {
        const point = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        const toolName = event.dataTransfer.getData('application/x-whiteboard-tool');
        if (toolName) {
          event.preventDefault();
          props.onDropTool(toolName, point);
          return;
        }
        const files = [...event.dataTransfer.files];
        if (files.length > 0 && props.onDropFiles) {
          event.preventDefault();
          props.onDropFiles(files, point);
        }
      }}
    >
      <ReactFlow
        nodes={props.nodes}
        edges={props.edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={(connection) => {
          if (props.connect) props.onConnect(connection);
        }}
        onPaneClick={(event) => {
          if (suppressClick.current) {
            suppressClick.current = false;
            return;
          }
          if (props.tool === 'line') {
            props.onLinePoint(rf.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
            return;
          }
          // React Flow also reports a click on a line as a pane click; that click selected the line.
          if (event.target instanceof Element && event.target.closest('.line-layer')) return;
          props.onSelectLine(null);
          createFromPane(event);
        }}
        onNodeClick={() => props.onSelectLine(null)}
        onSelectionStart={() => props.onSelectLine(null)}
        onNodeDoubleClick={(_event, node) => {
          if (props.tool !== 'select') return;
          if (props.onOpenCard?.(node.id)) return;
          props.onEdit(node.id);
        }}
        onNodeDragStart={(_event, node) => {
          if (!editingRef.current) props.onDragStart();
          const card = props.board.cards.find((item) => item.id === node.id);
          if (card?.type === 'column') {
            columnOrigin.current = {
              id: card.id,
              x: card.x,
              y: card.y,
              children: card.childIds.flatMap((id) => {
                const child = props.board.cards.find((item) => item.id === id);
                return child ? [{ id, x: child.x, y: child.y }] : [];
              }),
            };
          }
        }}
        onNodeDrag={(event, node) => {
          const board = props.board;
          const origin = columnOrigin.current;
          if (origin && origin.id === node.id) {
            setHint(null);
            const dx = node.position.x - origin.x;
            const dy = node.position.y - origin.y;
            const placed = new Map(origin.children.map((child) => [child.id, child]));
            props.setNodes((current) =>
              current.map((item) => {
                const child = placed.get(item.id);
                return child ? { ...item, position: { x: child.x + dx, y: child.y + dy } } : item;
              }),
            );
            return;
          }
          if (!('clientX' in event)) return;
          const point = rf.screenToFlowPosition({ x: event.clientX, y: event.clientY });
          const target = columnAtPoint(board, point);
          if (!target) {
            setHint(null);
            return;
          }
          const index = insertionIndex(target, board, point.y);
          const kids = target.childIds
            .map((id) => board.cards.find((entry) => entry.id === id))
            .filter((entry) => entry && entry.type !== 'column');
          let y = target.y + COLUMN_HEADER;
          for (let i = 0; i < index && i < kids.length; i += 1) y += (kids[i]?.height ?? 0) + COLUMN_GAP;
          setHint({ x: target.x + COLUMN_PAD, y, w: target.width - COLUMN_PAD * 2 });
        }}
        onNodeDragStop={(event, node) => {
          setHint(null);
          columnOrigin.current = null;
          const pointer = 'clientX' in event ? rf.screenToFlowPosition({ x: event.clientX, y: event.clientY }) : node.position;
          props.onDragStop(node.id, pointer);
        }}
        onSelectionChange={({ nodes: selectedNodes }) => props.onSelection(selectedNodes.map((node) => node.id))}
        onPaneContextMenu={(event) => {
          event.preventDefault();
          props.onContextMenu?.({ kind: 'pane' }, { x: event.clientX, y: event.clientY }, rf.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
        }}
        onNodeContextMenu={(event, node) => {
          event.preventDefault();
          props.onContextMenu?.({ kind: 'card', id: node.id }, { x: event.clientX, y: event.clientY }, rf.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
        }}
        onSelectionContextMenu={(event, nodes) => {
          event.preventDefault();
          const first = nodes[0];
          if (first) props.onContextMenu?.({ kind: 'card', id: first.id }, { x: event.clientX, y: event.clientY }, rf.screenToFlowPosition({ x: event.clientX, y: event.clientY }));
        }}
        onMoveEnd={(_event, viewport: FlowViewport) => onViewportRef.current(viewport)}
        defaultViewport={props.board.viewport}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        panOnScroll={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        zoomOnDoubleClick={false}
        panOnDrag={[1]}
        panActivationKeyCode="Space"
        selectionOnDrag
        multiSelectionKeyCode="Shift"
        selectionKeyCode={null}
        deleteKeyCode={props.editingId ? null : ['Delete', 'Backspace']}
        nodesConnectable={props.connect}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={28}
        isValidConnection={(connection) => connection.source !== connection.target}
        proOptions={{ hideAttribution: false }}
        colorMode="light"
        nodesDraggable={props.tool !== 'connect'}
      >
        <ViewportPortal>
        {hint ? <div className="insert-line" style={{ left: hint.x, top: hint.y, width: hint.w }} /> : null}
        <svg className="line-layer">
          {props.lines.map((raw) => {
            const line =
              endDrag && endDrag.lineId === raw.id
                ? endDrag.end === 'source'
                  ? { ...raw, x1: endDrag.x, y1: endDrag.y }
                  : { ...raw, x2: endDrag.x, y2: endDrag.y }
                : raw;
            return (
            <g
              key={line.id}
              data-testid="canvas-line"
              data-source={line.sourceKind}
              data-target={line.targetKind}
              data-color={line.colorName}
              data-arrow={line.arrowhead ? '1' : '0'}
              data-selected={line.selected ? '1' : '0'}
              onClick={(event) => { event.stopPropagation(); props.onSelectLine(line.id); }}
            >
              <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="transparent" strokeWidth={14} />
              <line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke={line.color} strokeWidth={line.selected ? 4 : 2.5} markerEnd={line.arrowhead ? 'url(#arrow-head)' : undefined} />
              {line.selected
                ? (['source', 'target'] as const).map((end) => (
                    <circle
                      key={end}
                      className="line-end"
                      data-testid={`line-end-${end}`}
                      cx={end === 'source' ? line.x1 : line.x2}
                      cy={end === 'source' ? line.y1 : line.y2}
                      r={7}
                      onPointerDown={(event) => startEndpointDrag(event, line.id, end)}
                      onClick={(event) => event.stopPropagation()}
                    />
                  ))
                : null}
            </g>
            );
          })}
          <defs>
            <marker id="arrow-head" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0 0 L6 3 L0 6 Z" fill="context-stroke" />
            </marker>
          </defs>
        </svg>
        </ViewportPortal>
        <Panel position="bottom-right">
          <ZoomDock />
        </Panel>
      </ReactFlow>
    </div>
  );
}

function ZoomDock() {
  const { x, y, zoom } = useViewport();
  const rf = useReactFlow();
  return (
    <div className="zoom-dock" data-testid="zoom-dock">
      <button type="button" data-testid="zoom-out" onClick={() => void rf.zoomOut({ duration: 0 })}>
        −
      </button>
      <span data-testid="zoom-readout" data-zoom={zoom} data-vx={x} data-vy={y}>{Math.round(zoom * 100)} %</span>
      <button type="button" data-testid="zoom-in" onClick={() => void rf.zoomIn({ duration: 0 })}>
        +
      </button>
      <button type="button" data-testid="zoom-50" onClick={() => void rf.zoomTo(0.5, { duration: 0 })}>
        50 %
      </button>
      <button type="button" data-testid="zoom-100" onClick={() => void rf.zoomTo(1, { duration: 0 })}>
        100 %
      </button>
      <button type="button" data-testid="zoom-200" onClick={() => void rf.zoomTo(2, { duration: 0 })}>
        200 %
      </button>
      <button type="button" data-testid="zoom-fit" onClick={() => void rf.fitView({ duration: 0, padding: 0.12 })}>
        Alles
      </button>
    </div>
  );
}
