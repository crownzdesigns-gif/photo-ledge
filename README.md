# Photo Ledge

An interactive photo wall. Drag photos around, rearrange them and add your own.

**Live:** https://hang-favorite-pics.vercel.app

## Built with

Claude Code · Vercel

React 19 · TypeScript · Vite

## Features

- **Drag and throw.** Pick up a polaroid and let go: it slides with momentum, wobbles, then swings to rest like it's hanging from a pin.
- **Rotate.** Use the rotate handle on a photo to tilt it to any angle.
- **Add your own.** Double-tap a photo to swap in a picture from your device and rename the caption. The card flips over to show the change.
- **Reset.** Double-tap the board and every photo springs back to its starting place in a cascade.
- **Works on phones.** Narrow screens get a portrait layout, and you can pinch to resize the board.
- **Keyboard friendly.** Tab to a photo, nudge it with the arrow keys, rotate with `,` and `.`, and press Enter to edit.
- **Small touches.** Photos shift with a subtle parallax as the cursor moves, a soft spotlight follows the pointer, and the board gently "breathes" when left alone.
- **Respects reduced motion.** The ambient effects switch off when your system asks for less motion.

Photos you add stay in your browser for the current visit only. Nothing is uploaded, and refreshing the page brings back the original set.

## Run it locally

You need [Node.js](https://nodejs.org) 20.19+ or 22.12+.

```bash
git clone https://github.com/crownzdesigns-gif/photo-ledge.git
cd photo-ledge
npm install
npm run dev
```

Then open the address Vite prints, usually http://localhost:5173.

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Type-checks and builds the site into `dist/` |
| `npm run preview` | Serves the built site locally |
| `npm run lint` | Runs ESLint |

### Environment variables

None are needed. The app runs entirely in the browser with no backend or API keys. [.env.example](.env.example) is included as a placeholder in case that changes.

## Use your own photos

Put your images in `public/photos/` and update the list in [src/photos.ts](src/photos.ts), which sets each photo's file, caption, position and tilt.
