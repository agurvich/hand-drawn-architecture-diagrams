# Authoring a diagram for this tool

This document is written to be handed to an AI — pasted into a prompt, a tool call or a system
message — that needs to **generate** a diagram for this app without reading its source. It covers the
schema, the rules that are enforced, and the advice that makes a diagram good in *this* tool rather
than merely valid.

Paste the result into the app's **JSON** panel and press Import.

## The one idea worth understanding first

A diagram is **one graph with stable positions**, and the thing that makes it useful is **nesting plus
collapse**. Any node can contain others. Collapse a container and it stands in for everything inside
it: connections that crossed its boundary are re-drawn against the container, several that become the
same relationship merge into one line with a count, and connections that were internal to it
disappear.

So your job is not to design one picture. It is to build a graph honest enough that it reads well
both expanded and collapsed. A diagram with no containers throws away the only thing this tool does
that a whiteboard does not.

## The document

```ts
interface DiagramDocument {
  version: 1
  nodes?: DocumentNode[] // defaults to []
  connections?: DocumentConnection[] // defaults to []
}
```

That is the entire document. There is no view state, no layout object, and no other top-level key —
**an unknown key is an error**, not something ignored.

### Nodes

```ts
interface DocumentNode {
  id: string // unique; see Ids below
  label: string // shown on the node
  x: number // relative to parentId when set, absolute otherwise
  y: number
  w: number // width in canvas units; must be greater than zero
  h: number // height; must be greater than zero
  rotation?: number // radians; omit for upright, which is almost always right
  color?: string // hex or a CSS colour keyword; see Colour
  collapsed?: boolean // true = folded up on load
  parentId?: string // another node's id; omit for top-level
}
```

### Connections

```ts
interface DocumentConnection {
  id: string // unique, in the SAME namespace as node ids
  sourceId: string // a node id
  targetId: string // a node id
}
```

A connection is a directed line. It has no label, no style and no waypoints — those do not exist in
this tool yet, and adding the fields would not make them appear.

## What is enforced

**Everything below is checked, and a document that breaks any of it is rejected with the path that
is wrong** (for example `nodes[2].parentId: no node with id "cache"`). Nothing fails silently, and
nothing is half-imported: the document is accepted whole or not at all.

- Every `parentId`, `sourceId` and `targetId` must name a node **in this document**.
- Ids are **one namespace**: a connection may not reuse a node's id, or another connection's.
- Ids must match `^[A-Za-z0-9_.-]{1,128}$` — letters, digits, underscore, dot, hyphen. No spaces.
- `parentId` may not form a cycle, including a node parented to itself.
- Unknown keys are rejected at every level.
- `color` must be `#hex` or a lowercase CSS keyword.
- Every required field must be present and the right type. `x` and `y` are any finite numbers,
  negatives included. **`w` and `h` must be greater than zero** — a zero or negative size is
  rejected here rather than being allowed through to break the canvas.

## Ids

Use readable, stable ids — `web-server`, `orders.api`, `vpc_prod`. They survive a round trip exactly,
so a document you write by hand keeps the names you chose when it is exported again. Prefer ids that
describe the thing rather than its position, so a rename of the label does not strand them.

**A diagram drawn by hand in the app exports with generated ids** like `LX_eNNYs4V_-x7Ipz-Ko8`, since
that is genuinely what those shapes are called. Renaming them in the JSON is fine and encouraged —
just rename every reference too, and the validator will tell you precisely which one you missed.
Export also sorts by id, so a hand-drawn diagram comes back in an order that looks arbitrary.

## Positioning

There is no auto-layout. `x`/`y`/`w`/`h` are what renders.

- `x`/`y` are the node's **top-left corner**, not its centre.
- A **top-level** node's position is absolute canvas coordinates.
- A **child's** position is relative to its parent's box, measured from that box's top-left.

**Importing does not move the camera.** If you place a diagram far from the origin, the canvas may
look empty after import until the reader scrolls or zooms to fit. Keep a diagram near `0,0` unless
you have a reason not to.

Practical guidance: a leaf node reads well at about `200×120`. Give siblings at least 60 units of gap
so a connection between them has room. A container needs to be big enough to hold its children's
boxes plus their offsets — nothing clips or reflows for you, so a child at `y: 300` inside a
container of `h: 200` will simply hang out of it. Top-level containers want generous separation,
250–400 units.

## Colour

`color` is per node and does **not** inherit — an earlier version of this tool cascaded colour down
to descendants and this one does not, so tint each node you want tinted.

Two things worth knowing:

- A **misspelled keyword passes validation and then renders black** — indistinguishable from a node
  with no colour at all. `rebeccapurple` works; `rebecapurple` is accepted by the check and comes out
  looking uncoloured. Prefer hex if you are unsure. Keywords must be lowercase: `RED` is rejected.
- Reuse the same value across nodes in the same conceptual category. That repetition is what makes
  colour read as a category rather than as noise.

A serviceable palette: `#4f8ff7` blue, `#f7924f` orange, `#38b06a` green, `#c05fd6` purple,
`#e0475a` red, `#2fb6c4` teal, `#f7b500` yellow, `#98a2b3` grey.

## Nesting and collapse — the part that matters

Any node other nodes point at via `parentId` is a container. There is no separate flag.

- Nest when the children are genuinely a subsystem a reader would want to treat as one unit
  sometimes and in detail other times: a service and its internals, an account and what is in it, a
  request path and its steps.
- **Do not nest for the sake of it.** A container with one child is indirection. A container that
  never usefully collapses is a rectangle.
- Two or three levels is usually as deep as stays legible.
- A connection can point at a **container itself** rather than one of its children. That is the right
  way to model a genuinely container-level relationship, and it resolves correctly at every collapse
  state.
- Set `collapsed: true` on containers whose internals are not the point of the diagram you are
  handing over. The reader can open them.
- **A collapsed container keeps the `w`/`h` you gave it** — it does not shrink to fit its label. A
  container sized to hold three children ships as a large mostly-empty box with a "3 hidden" badge.
  If a container spends most of its life collapsed, size it for how it should look collapsed and let
  its children overflow when it is open, or accept the empty space.

What collapse does, precisely: an endpoint inside a collapsed container resolves to the outermost
collapsed container holding it. Connections that then have the same source and target merge into one
line labelled with how many it stands for. Connections whose two ends resolve to the *same* container
disappear, because they are internal to a closed box.

## A worked example

Three services in a platform, talking to a database and to an outside client. The platform ships
collapsed, so the diagram opens as "client → platform → database" and expands into the detail.

```json
{
  "version": 1,
  "nodes": [
    { "id": "client", "label": "Mobile client", "x": 80, "y": 260, "w": 200, "h": 120 },
    {
      "id": "platform",
      "label": "Order platform",
      "x": 420,
      "y": 80,
      "w": 360,
      "h": 480,
      "color": "#4f8ff7",
      "collapsed": true
    },
    { "id": "gateway", "label": "API gateway", "x": 40, "y": 60, "w": 280, "h": 110, "parentId": "platform" },
    { "id": "orders", "label": "Orders service", "x": 40, "y": 210, "w": 280, "h": 110, "parentId": "platform" },
    { "id": "billing", "label": "Billing service", "x": 40, "y": 360, "w": 280, "h": 110, "parentId": "platform" },
    { "id": "db", "label": "Postgres", "x": 920, "y": 260, "w": 200, "h": 120, "color": "#38b06a" }
  ],
  "connections": [
    { "id": "client-gateway", "sourceId": "client", "targetId": "gateway" },
    { "id": "gateway-orders", "sourceId": "gateway", "targetId": "orders" },
    { "id": "orders-billing", "sourceId": "orders", "targetId": "billing" },
    { "id": "orders-db", "sourceId": "orders", "targetId": "db" },
    { "id": "billing-db", "sourceId": "billing", "targetId": "db" }
  ]
}
```

Collapsed, that draws **two** lines: client → platform, and a single **×2** line platform → database
standing for the two services that talk to it. Both `gateway → orders` and `orders → billing` vanish,
being internal to the closed box. Expand the platform and all five lines return, each against its own
service. Nothing about the document changed — collapse is a way of looking, not an edit.

A minimal document, for reference:

```json
{
  "version": 1,
  "nodes": [
    { "id": "a", "label": "Service A", "x": 100, "y": 100, "w": 200, "h": 120 },
    { "id": "b", "label": "Service B", "x": 500, "y": 100, "w": 200, "h": 120 }
  ],
  "connections": [{ "id": "a-b", "sourceId": "a", "targetId": "b" }]
}
```

## What a round trip does not carry

Export is faithful except in two ways, both deliberate:

- **Z-order.** Nodes that overlap may come back in a different stacking order. Avoid relying on
  overlap to mean anything.
- **Array order.** Export sorts `nodes` and `connections` by id, so a document you wrote in a
  meaningful order comes back alphabetised. It is the same diagram; do not read the order as
  intent.

Anything you drew by hand in the app — pencil strokes, text, notes, tldraw's own shapes — is **not**
part of the document and is not exported. Importing replaces the whole page, so the app warns you and
asks before discarding that work.

## What this tool does not have

Do not write these; they are rejected as unknown keys, and inventing them will get your document
refused rather than partially applied:

`scenes`, `edgeSets`, `metadata`, `icon`, `isActor`, `actorId`, `sourceHandle`, `targetHandle`,
`autoLayout`, `colorPalette`, `stickyNotes`.

Narrated scenes, edge sets, actor/action attribution and icons are all things this tool may grow
later. Today it has nodes, nesting, collapse and connections — which is enough to say most of what an
architecture diagram needs to say.
