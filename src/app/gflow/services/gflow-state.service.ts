import { Injectable } from '@angular/core';
import { NodeFactory } from '../core/node.factory';
import { GFlowLink, GFlowNode, GFlowPort, JsonValue, NodeType, PortRef } from '../core/gflow.types';

@Injectable()
export class GflowStateService {
  nodes: GFlowNode[] = [];
  links: GFlowLink[] = [];

  private nextLinkId = 1;

  addNode(type: NodeType, x: number, y: number): GFlowNode {
    const node = NodeFactory.createNode(type, x, y);
    if (!node.id) {
      node.id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }

    this.nodes.push(node);
    return node;
  }

  hasStart(): boolean {
    return this.nodes.some((node) => node.type === 'start');
  }

  findNode(nodeId: string): GFlowNode | undefined {
    return this.nodes.find((node) => node.id === nodeId);
  }

  deleteNode(nodeId: string) {
    this.links = this.links.filter((link) => link.src.nodeId !== nodeId && link.dst.nodeId !== nodeId);
    this.nodes = this.nodes.filter((node) => node.id !== nodeId);
  }

  nodeName(nodeId: string): string {
    return this.findNode(nodeId)?.name || nodeId;
  }

  parentAgentGroupsOf(childId: string): string[] {
    const ids = new Set<string>();
    this.links.forEach((link) => {
      if (link.relation === 'entry-exit' && link.dst.nodeId === childId && link.dst.kind === 'exit') {
        ids.add(link.src.nodeId);
      }
    });
    return Array.from(ids);
  }

  inputLinks(nodeId: string, portIndex: number): GFlowLink[] {
    return this.links.filter(
      (link) =>
        link.relation === 'io' &&
        link.dst.nodeId === nodeId &&
        link.dst.kind === 'in' &&
        link.dst.portIndex === portIndex,
    );
  }

  outputLinks(nodeId: string, portIndex: number): GFlowLink[] {
    return this.links.filter(
      (link) =>
        link.relation === 'io' &&
        link.src.nodeId === nodeId &&
        link.src.kind === 'out' &&
        link.src.portIndex === portIndex,
    );
  }

  createLinkBetween(a: PortRef, b: PortRef): GFlowLink | null {
    const outcome = this.resolveLinkEndpoints(a, b);
    if (!outcome) {
      return null;
    }

    const { src, dst, relation } = outcome;

    if (relation === 'entry-exit' && (this.isPortBusy(src) || this.isPortBusy(dst))) {
      return null;
    }

    if (src.nodeId === dst.nodeId && src.portIndex === dst.portIndex && src.kind === dst.kind) {
      return null;
    }

    const map = relation === 'io' && src.kind === 'out' ? this.effectiveOutputMap(src.nodeId, src.portIndex) : {};
    const link: GFlowLink = {
      id: String(this.nextLinkId++),
      src,
      dst,
      relation,
      map,
    };

    this.links = [...this.links, link];

    if (relation === 'entry-exit') {
      this.recomputeDownstreamFrom(src.nodeId);
    } else if (relation === 'io') {
      this.recomputeDownstreamFrom(src.nodeId);
    }

    return link;
  }

  removeLink(linkId: string): GFlowLink | null {
    const link = this.links.find((item) => item.id === linkId) ?? null;
    if (!link) {
      return null;
    }

    this.links = this.links.filter((item) => item.id !== linkId);

    if (link.relation === 'io') {
      this.recomputeDownstreamFrom(link.dst.nodeId);
    }

    if (link.relation === 'entry-exit') {
      const groupId = link.src.kind === 'entry' ? link.src.nodeId : link.dst.nodeId;
      if (groupId) {
        this.recomputeDownstreamFrom(groupId);
      }
    }

    return link;
  }

  splitLink(link: GFlowLink): GFlowNode | null {
    if (!link.mid || link.relation !== 'io') {
      return null;
    }

    const x0 = this.snap(link.mid.x - this.defaultNodeSize / 2);
    const y0 = this.snap(link.mid.y - this.defaultNodeSize / 2);
    const newNode = this.addNode('agent', x0, y0);

    this.links = this.links.filter((item) => item.id !== link.id);

    this.links = [
      ...this.links,
      {
        id: String(this.nextLinkId++),
        src: { ...link.src },
        dst: { nodeId: newNode.id, portIndex: 0, kind: 'in' },
        relation: 'io',
        map: this.cloneJson(link.map ?? {}),
      },
      {
        id: String(this.nextLinkId++),
        src: { nodeId: newNode.id, portIndex: 0, kind: 'out' },
        dst: { ...link.dst },
        relation: 'io',
        map: this.effectiveOutputMap(newNode.id, 0),
      },
    ];

    this.recomputeDownstreamFrom(newNode.id);
    return newNode;
  }

  removeGroupEntry(group: GFlowNode, index: number) {
    this.links = this.links.filter(
      (link) =>
        !(
          link.relation === 'entry-exit' &&
          link.src.nodeId === group.id &&
          link.src.kind === 'entry' &&
          link.src.portIndex === index
        ),
    );

    this.links.forEach((link) => {
      if (
        link.relation === 'entry-exit' &&
        link.src.nodeId === group.id &&
        link.src.kind === 'entry' &&
        link.src.portIndex > index
      ) {
        link.src = { ...link.src, portIndex: link.src.portIndex - 1 };
      }
    });

    group.entries?.splice(index, 1);
    this.recomputeDownstreamFrom(group.id);
  }

  aggregatedInputMap(nodeId: string): JsonValue {
    return this.aggregateIncomingMap(nodeId);
  }

  recomputeDownstreamFrom(nodeId: string) {
    const queue = [nodeId];
    const visited = new Set<string>();

    while (queue.length) {
      const id = queue.shift()!;
      const outgoing = this.links.filter(
        (link) => link.relation === 'io' && link.src.nodeId === id && link.src.kind === 'out',
      );

      for (const link of outgoing) {
        link.map = this.effectiveOutputMap(link.src.nodeId, link.src.portIndex);
        const dstId = link.dst.nodeId;
        if (!visited.has(dstId)) {
          visited.add(dstId);
          queue.push(dstId);
        }
      }
    }
  }

  updateNodeOutputs(nodeId: string, outputs: GFlowPort[], remap?: Map<number, number>) {
    const node = this.findNode(nodeId);
    if (!node) {
      return;
    }

    node.outputs = outputs.map((port) => ({ ...port }));

    if (remap && remap.size) {
      this.links.forEach((link) => {
        if (link.src.nodeId === nodeId && link.src.kind === 'out') {
          const nextIndex = remap.get(link.src.portIndex);
          if (nextIndex !== undefined) {
            link.src = { ...link.src, portIndex: nextIndex };
          }
        }
      });
    }

    this.links = this.links.filter((link) => {
      if (link.src.nodeId !== nodeId || link.src.kind !== 'out') {
        return true;
      }

      return link.src.portIndex < node.outputs.length;
    });

    this.recomputeDownstreamFrom(nodeId);
  }

  private resolveLinkEndpoints(
    a: PortRef,
    b: PortRef,
  ): { src: PortRef; dst: PortRef; relation: 'io' | 'entry-exit' } | null {
    if (a.kind === 'out' && b.kind === 'in') {
      return { src: a, dst: b, relation: 'io' };
    }
    if (a.kind === 'in' && b.kind === 'out') {
      return { src: b, dst: a, relation: 'io' };
    }
    if (a.kind === 'entry' && b.kind === 'exit') {
      return { src: a, dst: b, relation: 'entry-exit' };
    }
    if (a.kind === 'exit' && b.kind === 'entry') {
      return { src: b, dst: a, relation: 'entry-exit' };
    }
    return null;
  }

  private isPortBusy(ref: PortRef): boolean {
    return this.links.some(
      (link) =>
        link.relation === 'entry-exit' &&
        ((link.src.nodeId === ref.nodeId && link.src.kind === ref.kind && link.src.portIndex === ref.portIndex) ||
          (link.dst.nodeId === ref.nodeId && link.dst.kind === ref.kind && link.dst.portIndex === ref.portIndex)),
    );
  }

  private aggregateIncomingMap(nodeId: string): JsonValue {
    const incoming = this.links.filter(
      (link) => link.relation === 'io' && link.dst.nodeId === nodeId && link.dst.kind === 'in',
    );

    let acc: JsonValue = {};
    for (const link of incoming) {
      acc = this.mergeJson(acc, link.map ?? {});
    }

    return acc;
  }

  private aggregatedChildrenMapForGroup(groupId: string): JsonValue {
    let acc: JsonValue = {};

    const entryLinks = this.links.filter(
      (link) =>
        link.relation === 'entry-exit' &&
        link.src.nodeId === groupId &&
        link.src.kind === 'entry' &&
        link.dst.kind === 'exit',
    );

    for (const link of entryLinks) {
      const childMap = this.effectiveOutputMap(link.dst.nodeId, 0);
      acc = this.mergeJson(acc, childMap);
    }

    return acc;
  }

  private nodeOutputOwnMap(nodeId: string, outIdx: number): JsonValue {
    const node = this.findNode(nodeId);
    if (!node) {
      return {};
    }

    return this.cloneJson(node.outputs?.[outIdx]?.map ?? {});
  }

  private effectiveOutputMap(nodeId: string, outIdx: number): JsonValue {
    const node = this.findNode(nodeId);
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

  private mergeJson(a: JsonValue, b: JsonValue): JsonValue {
    if (this.isPlainObject(a) && this.isPlainObject(b)) {
      const result: Record<string, JsonValue> = { ...a } as Record<string, JsonValue>;
      for (const key of Object.keys(b)) {
        result[key] = key in result
          ? this.mergeJson((a as Record<string, JsonValue>)[key], (b as Record<string, JsonValue>)[key])
          : this.cloneJson((b as Record<string, JsonValue>)[key]);
      }
      return result;
    }

    return this.cloneJson(b);
  }

  private isPlainObject(value: unknown): value is Record<string, JsonValue> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private cloneJson<T extends JsonValue>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }

  private snap(value: number): number {
    const g = this.defaultNodeSize / 4;
    return Math.round(value / g) * g;
  }

  private get defaultNodeSize(): number {
    return 96;
  }
}
