# veo

Cloudflare Worker project for `veo`.

This repository preserves the runtime behavior of the source Worker `drveo`:
every request returns a plain-text `Hello World!` response.

## Development

```sh
npm install
npm test
npm run check
npm run dev
```

## Deployment

```sh
npm run deploy
```

The project intentionally has no Cloudflare resource bindings or secrets.
