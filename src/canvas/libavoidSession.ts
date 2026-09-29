import type { Avoid } from 'libavoid-js';
import type { Point, Rect } from './canvasGeometry';

/** Clearance kept from cards a route isn't attached to. */
const SHAPE_BUFFER_DISTANCE = 10;
// The crossing penalty is left at libavoid's default of 0: routes may cross,
// and turning it on made routing dozens of times slower.

const COORDINATE_DECIMALS = 100;

export interface RoutableCard extends Rect {
  id: string;
}

/** An arrow to route: which cards it joins, and the two points (inside those
 *  cards) the route runs between. */
export interface RoutableArrow {
  id: string;
  from: RoutableCard;
  to: RoutableCard;
  start: Point;
  end: Point;
}

type Router = InstanceType<Avoid['Router']>;
type ShapeRef = InstanceType<Avoid['ShapeRef']>;
type ConnRef = InstanceType<Avoid['ConnRef']>;

interface ShapeEntry {
  ref: ShapeRef;
  /** Position and size as last given to libavoid, to spot what moved. */
  key: string;
}

interface ConnectorEntry {
  ref: ConnRef;
  fromCardId: string;
  toCardId: string;
  /** Endpoints as last given to libavoid. */
  key: string;
}

/** Frees a temporary WebAssembly object. The bindings' typings leave `delete`
 *  off these classes, but every embind object has it. */
function free(object: object): void {
  (object as { delete?: () => void }).delete?.();
}

function boxKey(card: Rect): string {
  return `${card.x},${card.y},${card.w},${card.h}`;
}

function endpointsKey(arrow: RoutableArrow): string {
  return `${arrow.start.x},${arrow.start.y},${arrow.end.x},${arrow.end.y}`;
}

/** Snaps to two decimals so the route's coordinates are tidy. */
function snap(value: number): number {
  return Math.round(value * COORDINATE_DECIMALS) / COORDINATE_DECIMALS;
}

/**
 * One libavoid router (Adaptagrams' object-avoiding connector router, in
 * polyline mode — free-angle lines around the cards) kept alive for a board.
 * Cards and arrows are synced to it incrementally on every `route` call — only
 * what was added, moved or removed is touched, and libavoid re-routes just the
 * connectors that affects — which keeps dragging a card cheap. Wraps stateful
 * WebAssembly objects, so it's deliberately a class rather than a pure function.
 */
export class LibavoidSession {
  private readonly router: Router;
  private readonly shapes = new Map<string, ShapeEntry>();
  private readonly connectors = new Map<string, ConnectorEntry>();

  constructor(private readonly avoid: Avoid) {
    this.router = new avoid.Router(avoid.RouterFlag.PolyLineRouting.value);
    this.router.setRoutingParameter(avoid.RoutingParameter.shapeBufferDistance, SHAPE_BUFFER_DISTANCE);
  }

  /** Brings libavoid in line with the given cards and arrows and returns each
   *  arrow's route, from its `start` to its `end` around the other cards. */
  route(cards: readonly RoutableCard[], arrows: readonly RoutableArrow[]): Map<string, Point[]> {
    const cardIds = new Set(cards.map((card) => card.id));
    const wanted = new Map(arrows.map((arrow) => [arrow.id, arrow]));

    // Connectors go first: a connector is tied to its cards' shapes.
    for (const [id, entry] of this.connectors) {
      const arrow = wanted.get(id);
      if (arrow && arrow.from.id === entry.fromCardId && arrow.to.id === entry.toCardId) continue;
      this.router.deleteConnector(entry.ref);
      this.connectors.delete(id);
    }
    for (const [id, entry] of this.shapes) {
      if (cardIds.has(id)) continue;
      this.router.deleteShape(entry.ref);
      this.shapes.delete(id);
    }
    for (const card of cards) this.syncShape(card);
    for (const arrow of arrows) this.syncConnector(arrow);

    this.router.processTransaction();
    return new Map([...this.connectors].map(([id, entry]) => [id, this.readRoute(entry.ref)]));
  }

  /** Frees the WebAssembly router and everything it owns. */
  dispose(): void {
    this.router.delete();
    this.shapes.clear();
    this.connectors.clear();
  }

  private point(at: Point) {
    return new this.avoid.Point(at.x, at.y);
  }

  private rectangleFor(card: Rect) {
    const topLeft = this.point(card);
    const bottomRight = this.point({ x: card.x + card.w, y: card.y + card.h });
    const rectangle = new this.avoid.Rectangle(topLeft, bottomRight);
    free(topLeft);
    free(bottomRight);
    return rectangle;
  }

  private endFor(at: Point) {
    const point = this.point(at);
    const end = new this.avoid.ConnEnd(point);
    free(point);
    return end;
  }

  private syncShape(card: RoutableCard): void {
    const key = boxKey(card);
    const existing = this.shapes.get(card.id);
    if (existing?.key === key) return;

    const rectangle = this.rectangleFor(card);
    if (existing) {
      // The third argument is libavoid's `first_move` flag, missing from the typings.
      (this.router as unknown as { moveShape_poly(s: ShapeRef, p: unknown, firstMove: boolean): void }).moveShape_poly(
        existing.ref,
        rectangle,
        false,
      );
      existing.key = key;
    } else {
      this.shapes.set(card.id, { ref: new this.avoid.ShapeRef(this.router, rectangle), key });
    }
    free(rectangle);
  }

  private syncConnector(arrow: RoutableArrow): void {
    const key = endpointsKey(arrow);
    const existing = this.connectors.get(arrow.id);
    if (existing?.key === key) return;

    const source = this.endFor(arrow.start);
    const target = this.endFor(arrow.end);
    if (existing) {
      existing.ref.setSourceEndpoint(source);
      existing.ref.setDestEndpoint(target);
      existing.key = key;
    } else {
      const ref = new this.avoid.ConnRef(this.router, source, target);
      ref.setRoutingType(this.avoid.ConnType.ConnType_PolyLine.value);
      this.connectors.set(arrow.id, { ref, fromCardId: arrow.from.id, toCardId: arrow.to.id, key });
    }
    free(source);
    free(target);
  }

  private readRoute(connector: ConnRef): Point[] {
    const line = connector.displayRoute();
    return Array.from({ length: line.size() }, (_, i) => {
      const point = line.at(i);
      return { x: snap(point.x), y: snap(point.y) };
    });
  }
}
