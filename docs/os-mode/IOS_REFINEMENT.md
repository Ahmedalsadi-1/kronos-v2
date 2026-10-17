# iOS design refinement

KronTerm translates Apple's interaction and hierarchy guidance into its React/Electron components. Its desktop window controls, live sessions, and workspace model remain native to KronTerm.

| Section | Primary guidance | Implementation |
| --- | --- | --- |
| Shell and navigation | [Adopting Liquid Glass](https://developer.apple.com/documentation/technologyoverviews/adopting-liquid-glass), [Toolbars](https://developer.apple.com/design/human-interface-guidelines/toolbars) | Related controls share rounded groups; independent actions remain separated; overflow preserves available actions. |
| Control Center | [Materials](https://developer.apple.com/design/human-interface-guidelines/materials), [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons) | Regular glass material, grouped permission rows, pill controls, readable headers, and familiar switch proportions. |
| Open windows and quick links | [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars), [App icons](https://developer.apple.com/design/human-interface-guidelines/app-icons) | Clear selected rows, larger rounded icon tiles, consistent list spacing, and labeled shortcuts. |
| Chat and composer | [Typography](https://developer.apple.com/design/human-interface-guidelines/typography), [Layout](https://developer.apple.com/design/human-interface-guidelines/layout) | System type hierarchy, readable opaque messages, adaptive input layout, and concentric rounded control shapes. |
| Selectors and command menus | [Menus](https://developer.apple.com/design/human-interface-guidelines/menus), [Materials](https://developer.apple.com/design/human-interface-guidelines/materials) | Logical groups, separators, roomy rows, neutral regular glass, capsule selectors, and larger search field. |
| Accessibility | [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility) | Light/dark colors, visible focus, larger coarse-pointer targets, reduced motion, opaque reduced-transparency fallback, and forced-color support. |

Glass belongs to controls and navigation. Conversation messages, file contents, browser pages, and terminal output keep opaque content surfaces. Desktop controls retain desktop density; touch/coarse-pointer targets expand where appropriate.
