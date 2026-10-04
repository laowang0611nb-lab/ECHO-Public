# Knowledge Graph V2

This module renders the teacher knowledge graph as a focus-centered knowledge network with a stable layout root.

The graph keeps a stable spatial layout while focus changes. In focused mode, navigation is a local A/B position swap plus style handoff; the camera and all unrelated nodes stay fixed. Free-view navigation is the only path allowed to move the camera.

## Architecture

- `graph-adapter.ts` turns the API graph into a knowledge-point-only source model and a deterministic display tree.
- `graph-layout.ts` computes a stable radial/organic layout from real container dimensions. It does not run force simulation and does not use random numbers.
- `graph-controller.ts` owns the single G6 instance, focus transitions, camera, free view, orbit, hover states, semantic-edge reveal, and label LOD.
- The first G6 render is deferred one frame, and `destroy()` waits for an in-flight render, so mount/unmount cycles (React StrictMode, fast route changes) never trip G6's destroyed-instance guard.
- `knowledge-graph-view.tsx` owns route state, course switching, filters, fullscreen, loading/empty/error states, and the analytics card.
- `analytics-card.tsx` renders only fields returned by the real `KnowledgePointAnalytics` API.

## Data Graph And Display Tree

The backend graph can contain many-to-many semantic relations. The display tree is layout-only:

- every visible node has at most one `displayParentId`;
- the initial layout root is the tree root, independent from the current visual focus;
- traversal is breadth-first and deterministic;
- prerequisite relations are preferred when a parent must be selected;
- remaining ties use chapter order, point order, label, and ID;
- raw semantic edges remain in `GraphSourceModel.semanticEdges` and are revealed only for the active node.
- focus styling is driven by runtime `focusId` and G6 states; the layout root, edge set, and radial ordering are not rebuilt by a normal focus click.

Display-tree edges are layout-only and do not carry source/target direction. Only semantic reveal edges are directional, so a prerequisite arrow always preserves the API's original direction.

This prevents the default canvas from becoming edge soup while preserving the real data graph.

## LOD And Motion

Labels are rendered by G6 in the graph layer. There is no per-frame DOM label overlay.

- The focus and hovered node always show a label.
- High-risk points remain visible.
- Far zoom shows focus, hovered, high-risk, and important first-hop nodes.
- Near zoom shows more depth and degree.
- Text stays horizontal and is compensated to keep a stable screen size.
- Orbit has one rAF owner and completes one cycle in about 160 seconds.
- Orbit rotates live rendered positions around the current focus node's live position; the focus node stays fixed as the pivot.
- Orbit snapshots the current rendered positions when it starts or resumes, then rotates that fixed snapshot by the accumulated phase; cumulative phase is never applied to already-rotated live coordinates, so angular speed stays constant.
- Zoom is clamped to 10%-200%.
- Orbit pauses during focus transitions, drag, zoom, hover, hidden pages, and `prefers-reduced-motion`.
- Orbit only runs while the pointer is outside the graph panel; entering the panel stops it and leaving resumes it immediately.
- A focused-mode handoff runs for about 0.72s (0.18s under `prefers-reduced-motion`): A and B swap live positions along shallow opposite arcs while size, halo, and label emphasis interpolate on one timeline.
- The camera and all nodes except A/B remain unchanged during a focused-mode handoff; orbit rebases after the swap and resumes only after the post-transition cooldown.

## Risk Presentation

Global high-risk status comes from the real course dashboard's `high_risk_knowledge_points`. The selected point's card uses the real `KnowledgePointAnalytics` response. If the API does not provide an explicit risk level, the card derives a view-only level:
Until the dashboard request succeeds, non-selected points stay `unknown` rather than being presented as normal. Once the dashboard is available, points outside its high-risk list use `normal`.

- `high`: average mastery below 55 or at least 8 affected students;
- `medium`: average mastery below 65 or at least 5 affected students;
- `elevated`: average mastery below 75 or at least 3 affected students;
- `normal`: no threshold is met;
- `unknown`: no mastery records exist.

The derived value is never written back to the database and is not presented as a scientific risk model.

## Interaction

- Clicking a different node in focused mode swaps only A and B: the clicked node takes A's exact live slot, A moves to B's old live slot, and the camera does not move.
- While the sidebar collapses or expands, canvas rendering pauses and the graph is briefly blurred, then redraws once at the new size.
- Clicking the focused node opens the existing `buildPointHref` detail route.
- Dragging or zooming enters free view and stops automatic orbit.
- Zoom is bound to Shift + wheel; a plain wheel leaves the viewport untouched.
- Clicking a node in free view returns to focused mode.
- Reset returns to the current focus.
- Fit view calculates a bounded zoom from the current live bounds and recenters the focus without rebuilding the layout.
- Ring radii use a fixed band table: the first ring sits 35% closer to the focus, outer rings keep a slightly wider stride.
- The analytics card collapses to a single 38px row via the chevron next to the risk badge, matching the toolbar height.
- Fit view pauses orbit only while fitting and resumes it after the idle delay.
- Fullscreen changes only the graph panel.
- Fullscreen resizes both canvas axes: the graph renders into a full-bleed inner wrapper so the G6 container cannot collapse to the canvas height.
- Free-view navigation may restore the camera to the clicked node; future focused-mode clicks return to the local A/B swap once free view settles.
- The local handoff owns positions, focus size, halo, and label emphasis on one timeline; neighbor dimming and semantic emphasis commit at handoff completion.

## Extension Points

The analytics card consumes the existing knowledge-point analytics query. Future business fields can be added to the card without changing the graph adapter or controller. Additional semantic relation types should first be added to the shared contract, then mapped in `graph-adapter.ts`; the layout tree remains separate from semantic reveal.
