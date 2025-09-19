import { Injectable } from '@angular/core';
import { NodeFactory } from '../core/node.factory';
import { GFlowLink, GFlowNode, JsonValue, PortKind, PortRef } from '../core/gflow.types';

@Injectable()
export class GflowStateService {
  private nodesStore: GFlowNode[] = [];
  private linksStore: GFlowLink[] = [];
  private nextLinkId = 1;

  get nodes(): GFlowNode[] {
    return this.nodesStore;
  }

  get links(): GFlowLink[] {
    return this.linksStore;
  }

  addNode(node: GFlowNode): void {
    this.nodesStore.push(node);
  }

  removeNode(nodeId: string): void {
    this.nodesStore = this.nodesStore.filter((node) => node.id !== nodeId);
    this.linksStore = this.linksStore.filter(
      (link) => link.src.nodeId !== nodeId && link.dst.nodeId !== nodeId,
    );
  }

  hasStartNode(): boolean {
    return this.nodesStore.some((node) => node.type === 'start');
  }

  setFocusedNode(nodeId: string | null): void {
    this.nodesStore.forEach((node) => {
      node.focused = node.id === nodeId;
    });
  }

  nodeName(nodeId: string): string {
    return this.nodesStore.find((node) => node.id === nodeId)?.name || nodeId;
  }

  inputLinksFor(nodeId: string, inputIndex: number): GFlowLink[] {
    return this.linksStore.filter(
      (link) =>
        link.relation === 'io' &&
        link.dst.nodeId === nodeId &&
        link.dst.kind === 'in' &&
        link.dst.portIndex === inputIndex,
    );
  }

  outputLinksFor(nodeId: string, outputIndex: number): GFlowLink[] {
    return this.linksStore.filter(
      (link) =>
        link.relation === 'io' &&
        link.src.nodeId === nodeId &&
        link.src.kind === 'out' &&
        link.src.portIndex === outputIndex,
    );
  }

  parentAgentGroupsOf(childId: string): string[] {
    const ids = new Set<string>();
    for (const link of this.linksStore) {
      if (link.relation === 'entry-exit' && link.dst.nodeId === childId && link.dst.kind === 'exit') {
        ids.add(link.src.nodeId);
      }
    }
    return Array.from(ids);
  }

  createLink(data: { src: PortRef; dst: PortRef; relation: 'io' | 'entry-exit'; map?: JsonValue }): GFlowLink {
    const link: GFlowLink = {
      id: String(this.nextLinkId++),
      src: { ...data.src },
      dst: { ...data.dst },
      relation: data.relation,
      map: data.map ? this.cloneValue(data.map) : undefined,
    };
    this.linksStore.push(link);
    return link;
  }

  removeLink(linkId: string): GFlowLink | null {
    const index = this.linksStore.findIndex((link) => link.id === linkId);
    if (index === -1) {
      return null;
    }
    const [removed] = this.linksStore.splice(index, 1);
    return removed;
  }

  aggregateIncomingMap(nodeId: string): JsonValue {
    const incoming = this.linksStore.filter(
      (link) => link.relation === 'io' && link.dst.nodeId === nodeId && link.dst.kind === 'in',
    );

    let accumulator: JsonValue = {};
    for (const link of incoming) {
      accumulator = this.mergeJson(accumulator, link.map ?? {});
    }
    return accumulator;
  }

  private aggregatedChildrenMapForGroup(groupId: string): JsonValue {
    let accumulator: JsonValue = {};
    const entryLinks = this.linksStore.filter(
      (link) =>
        link.relation === 'entry-exit' &&
        link.src.nodeId === groupId &&
        link.src.kind === 'entry' &&
        link.dst.kind === 'exit',
    );

    for (const link of entryLinks) {
      const childId = link.dst.nodeId;
      const childMap = this.effectiveOutputMap(childId, 0);
      accumulator = this.mergeJson(accumulator, childMap);
    }

    return accumulator;
  }

  private nodeOutputOwnMap(nodeId: string, outIdx: number): JsonValue {
    const node = this.nodesStore.find((candidate) => candidate.id === nodeId);
    return this.cloneValue(node?.outputs?.[outIdx]?.map ?? {});
  }

  effectiveOutputMap(nodeId: string, outIdx: number): JsonValue {
    const node = this.nodesStore.find((candidate) => candidate.id === nodeId);
    if (!node) {
      return {};
    }

    if (node.type === 'agent-group') {
      const incoming = this.aggregateIncomingMap(nodeId);
      const children = this.aggregatedChildrenMapForGroup(nodeId);
      return this.mergeJson(incoming, children);
    }

    const incoming = this.aggregateIncomingMap(nodeId);
    const own = this.nodeOutputOwnMap(nodeId, outIdx);
    return this.mergeJson(incoming, own);
  }

  recomputeDownstreamFrom(nodeId: string): void {
    const queue: string[] = [nodeId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      const outgoing = this.linksStore.filter(
        (link) => link.relation === 'io' && link.src.nodeId === current && link.src.kind === 'out',
      );

      for (const link of outgoing) {
        link.map = this.effectiveOutputMap(link.src.nodeId, link.src.portIndex);
        const destinationId = link.dst.nodeId;
        if (!visited.has(destinationId)) {
          visited.add(destinationId);
          queue.push(destinationId);
        }
      }
    }
  }

  removeGroupEntry(groupId: string, index: number): void {
    const group = this.nodesStore.find((candidate) => candidate.id === groupId);
    if (!group?.entries) {
      return;
    }

    this.linksStore = this.linksStore.filter(
      (link) =>
        !(
          link.relation === 'entry-exit' &&
          link.src.nodeId === groupId &&
          link.src.kind === 'entry' &&
          link.src.portIndex === index
        ),
    );

    for (const link of this.linksStore) {
      if (
        link.relation === 'entry-exit' &&
        link.src.nodeId === groupId &&
        link.src.kind === 'entry' &&
        link.src.portIndex > index
      ) {
        link.src.portIndex -= 1;
      }
    }

    group.entries.splice(index, 1);
  }

  usesPortKind(nodeId: string, kind: PortKind): boolean {
    return this.linksStore.some(
      (link) =>
        (link.src.nodeId === nodeId && link.src.kind === kind) ||
        (link.dst.nodeId === nodeId && link.dst.kind === kind),
    );
  }

  cloneValue<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }

  createNode(type: GFlowNode['type'], x: number, y: number): GFlowNode {
    const node = NodeFactory.createNode(type, x, y);
    this.addNode(node);
    return node;
  }

  private mergeJson(a: JsonValue, b: JsonValue): JsonValue {
    if (this.isPlainObject(a) && this.isPlainObject(b)) {
      const result: Record<string, JsonValue> = { ...(a as Record<string, JsonValue>) };
      for (const key of Object.keys(b)) {
        result[key] = key in result
          ? this.mergeJson(result[key], (b as Record<string, JsonValue>)[key])
          : this.cloneValue((b as Record<string, JsonValue>)[key]);
      }
      return result;
    }

    return this.cloneValue(b);
  }

  private isPlainObject(value: unknown): value is Record<string, JsonValue> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
