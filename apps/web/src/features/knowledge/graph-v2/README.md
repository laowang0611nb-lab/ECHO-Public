# Knowledge Graph V2

This module renders the teacher knowledge graph as a focus-rooted knowledge network.

## Architecture

- `graph-adapter.ts` turns the API graph into a knowledge-point-only source model and a deterministic display tree.
- `graph-layout.ts` computes a stable radial/organic layout from real container dimensions. It does not run force simulation and does not use random numbers.
- `graph-controller.ts` owns the single G6 instance, focus transitions, camera, free view, orbit, hover states, semantic-edge reveal, and label LOD.
- `knowledge-graph-view.tsx` owns route state, course switching, filters, fullscreen, loading/empty/error states, and the analytics card.
- `analytics-card.tsx` renders only fields returned by the real `KnowledgePointAnalytics` API.

## Data Graph And Display Tree

The backend graph can contain many-to-many semantic relations. The display tree is layout-only:

- every visible node has at most one `displayParentId`;
- the focus node is the root;
- traversal is breadth-first and deterministic;
- prerequisite relations are preferred when a parent must be selected;
- remaining ties use chapter order, point order, label, and ID;
- raw semantic edges remain in `GraphSourceModel.semanticEdges` and are revealed only for the active node.

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
- Zoom is clamped to 10%-200%.
- Orbit pauses during focus transitions, drag, zoom, hover, hidden pages, and `prefers-reduced-motion`.

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

- Clicking a different node rebuilds the display tree while every node glides from its previous layout position to the new slot, with the camera animating at the same time.
- While the sidebar collapses or expands, canvas rendering pauses and the graph is briefly blurred, then redraws once at the new size.
- Clicking the focused node opens the existing `buildPointHref` detail route.
- Dragging or zooming enters free view and stops automatic orbit.
- Clicking a node in free view returns to focused mode.
- Reset returns to the current focus.
- Fit view calculates a bounded zoom from the real layout bounds and recenters the focus.
- Fit view pauses orbit only while fitting and resumes it after the idle delay.
- Fullscreen changes only the graph panel.

## Extension Points

The analytics card consumes the existing knowledge-point analytics query. Future business fields can be added to the card without changing the graph adapter or controller. Additional semantic relation types should first be added to the shared contract, then mapped in `graph-adapter.ts`; the layout tree remains separate from semantic reveal.
