# fit-every-feed

One image in, every ad size out.

https://uselesssoso.github.io/fit-every-feed-site/

You give it one image. It gives you the ad sizes you picked, cropped on the subject. Stills only, for now. The video path is in the repo and turned off.

The sizes come from the platforms’ own docs, checked 2026-10-04. Treat the X rows as unverified until someone checks them again.

Nothing is uploaded. The file never leaves the browser.

Sample photograph by Alina Matveycheva, [Unsplash License](https://unsplash.com/license). Details in [CREDITS.md](CREDITS.md).

[MIT](LICENSE) © 2026 uselesssoso.

## On your machine

```bash
npm install
npm run dev
```

The dev server is at `/fit-every-feed-site/`. `npm test` runs the checks. `npm run build` writes `dist`.

The live site is the built files in the public repo `uselesssoso/fit-every-feed-site`. This source repo stays private.
