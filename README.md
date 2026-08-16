# Wordshire

Wordshire is a Vite + React vocabulary game with switchable English and Japanese adventures, 2,000 questions per language, 999 deterministic levels, a building economy, and a paper-trading market.

## Development

```bash
npm install
npm run dev
npm run lint
npm run build
```

## Vocabulary generation

```bash
npm run generate:vocabulary
npm run generate:japanese
```

Generated vocabulary lives in `src/data/`; quality reports are written to `reports/`. See `THIRD_PARTY_NOTICES.md` for source attribution and data licenses.

<!--

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
-->
