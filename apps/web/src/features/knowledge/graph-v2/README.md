# Knowledge Graph V2

This module renders the teacher knowledge graph as a focus-centered knowledge network with a stable layout root.

Focus navigation is implemented as an anchored camera-and-layout transition. When a user clicks a node, that node's current world position becomes the anchor of the next rooted layout. The camera travels to that anchor while the existing graph continuously morphs into the new layout. The clicked node does not teleport to the previous focus position; the viewport travels to the concept.

## Architecture

- `graph-adapter.ts` turns the API graph into a knowledge-point-only source model and re-roots the existing deterministic display tree without changing its undirected edge set.
- `graph-layout.ts` computes a stable radial/organic layout from real container dimensions and translates a rooted layout so its root remains anchored at the clicked node's live world position. It does not run force simulation and does not use random numbers.
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
- focus navigation re-roots display metadata (`depth`, `displayParentId`, `branchId`, angles) and computes a new rooted radial layout while preserving the existing undirected display-edge identities.

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
- Orbit continues while the pointer is inside the graph panel. It runs at normal speed unless the pointer is hovering the current focus node, where it eases down to 1/4 speed instead of switching abruptly.
- A focused-mode navigation runs for about 0.90s (0.18s under `prefers-reduced-motion`) with one master progress value: camera travel, layout morph, focus emphasis, and semantic emphasis are staged from that value.
- The clicked node stays fixed in world space while the camera travels to it; all nodes morph from their live positions to the translated B-rooted target layout. Orbit rebases after the complete layout commit and resumes only after the cooldown.

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

- Clicking a different node in focused mode anchors the clicked node's current world position, re-roots the display tree around it, and morphs the graph toward the translated rooted layout while the camera travels to that node. A moves to its natural position in the new layout rather than swapping into B's old slot.
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
- Free-view navigation uses the same anchored camera-and-layout navigation when a node is clicked, then returns to focused mode after the transition settles.
- The navigation timeline owns positions, camera travel, focus size, halo, label emphasis, and semantic edge staging; analytics commits only after the visual navigation settles.

## Extension Points

The analytics card consumes the existing knowledge-point analytics query. Future business fields can be added to the card without changing the graph adapter or controller. Additional semantic relation types should first be added to the shared contract, then mapped in `graph-adapter.ts`; the layout tree remains separate from semantic reveal.
