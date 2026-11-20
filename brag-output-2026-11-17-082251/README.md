# KronOS motion film

25-second 1920x1080, 30fps kinetic product film. Music and interaction SFX; no narration.

- `brag.mp4`: final export, with canvas poster baked into the first frame.
- `brag.jpg`: standalone poster.
- `composition/index.html`: editable, deterministic Hyperframes composition.
- `brag-plan.md`: storyboard and source references.
- `composition-brief.md`: creative brief.
- `share-copy.txt`: suggested caption.
- `check.json`: automated visual validation.

The UI is a stylized recreation of the inspected KronOS composer and source-grounded tools. Task content is fictional. Only KronOS appears as product branding.

To re-render, run from `composition/`:

```sh
npx hyperframes render --quality delivery --output ../brag.mp4
```

Music: Happy Beats / Business Moves vol. 12 by ende.app, from the brag skill's bundled assets. SFX: Kenney, from the same bundle.
