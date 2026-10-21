# BranchedMenu Course Browser

This teacher-only module provides the BranchedMenu used as a scope selector for the original G6 knowledge graph. It does not replace the graph canvas or redesign the graph engine.

The menu selects:

- all course PDFs;
- one real PDF's chapters and knowledge points;
- one chapter inside that PDF.

The existing `KnowledgeGraphView`, graph query, node/edge styling, camera focus, orbit, free view, fullscreen and analytics remain the main graph experience. PDF preview is not mounted in the graph workspace.

## Third-party source

- Component: React Bits `BranchedMenu` TS + CSS registry
- Registry: `https://reactbits.dev/r/BranchedMenu-TS-CSS.json`
- Repository: `https://github.com/DavidHDev/react-bits`
- License: MIT + Commons Clause License Condition v1.0
- Copyright: 2026 David Haz
- Retrieved registry SHA256 values:
  - `BranchedMenu.tsx`: `5af7aa51894c582d73e399d9597eb05bb4b0e23e0e7500f6c7df5afd9e863702`
  - `BranchedMenu.css`: `9f483b0c5395623b8d7faf47978d34bf826b8cf1caf8ba4406d42a53ae8e6f83`
- Hugeicons packages:
  - `@hugeicons/react@1.1.10` (MIT)
  - `@hugeicons/core-free-icons@4.3.5` (MIT)

The official branch geometry, fold/reach/marker transitions and reduced-motion behavior are preserved. The local adaptation adds controlled stable-ID state, separate resource selection and collapse controls, empty groups, long-label handling, keyboard focus styles, resize-safe marker placement and a slim low-contrast scope scrollbar. Resource sections start collapsed, and the surrounding graph-scope panel animates between its collapsed and expanded layouts without remounting the graph.

The full React Bits license notice is stored in `THIRD_PARTY_NOTICES.md`.
