import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { Board } from '../../shared/model';

export type FlowData = {
  editing: boolean;
  connect: boolean;
};

export function toNodes(board: Board, editingId: string | null, focusId: string | null, connect: boolean): Node<FlowData>[] {
  return board.cards.map((card) => ({
    id: card.id,
    type:
      card.type === 'text'
        ? 'textCard'
        : card.type === 'image'
          ? 'imageCard'
          : card.type === 'sticker'
            ? 'stickerCard'
            : card.type === 'column'
              ? 'columnCard'
              : card.type === 'todo'
                ? 'todoCard'
                : card.type === 'link'
                  ? 'linkCard'
                  : card.type === 'sketch'
                    ? 'sketchCard'
                    : 'boardCard',
    hidden: board.cards.some((item) => item.type === 'column' && item.collapsed && item.childIds.includes(card.id)),
    zIndex: card.type === 'column' ? 0 : 2,
    dragHandle: card.type === 'column' ? '.column-handle' : undefined,
    position: { x: card.x, y: card.y },
    width: card.width,
    height: card.height,
    selected: card.id === focusId,
    draggable: card.id !== editingId,
    style: { width: card.width, height: card.height },
    data: { editing: card.id === editingId, connect },
  }));
}

const marker = { type: MarkerType.ArrowClosed, width: 18, height: 18, color: '#241c14' };

export function toEdges(board: Board): Edge[] {
  return board.connectors.map((connector) => ({
    id: connector.id,
    source: connector.source,
    target: connector.target,
    sourceHandle: connector.sourceHandle,
    targetHandle: connector.targetHandle,
    type: 'smoothstep',
    markerEnd: marker,
    style: { stroke: '#241c14', strokeWidth: 2.25 },
    interactionWidth: 16,
  }));
}
