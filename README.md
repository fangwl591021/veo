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

The project intentionally has no storage bindings or secrets. The explicitly
supplied `LIFF_ID` and `LIFF_URL` remain available as public, non-secret vars in
`wrangler.jsonc`. The source application has no LIFF integration point, so these
vars do not change the cloned Worker behavior.
