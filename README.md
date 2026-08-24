# veo

Cloudflare Worker project for `veo`.

This Worker serves the LIFF entry page for `2010657278-VqB7uA2y` and initializes
the LINE Front-end Framework with the public configuration in `wrangler.jsonc`.

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

The project intentionally has no storage bindings or secrets. `LIFF_ID` and
`LIFF_URL` are public, non-secret configuration values.
