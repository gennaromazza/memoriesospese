# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

- Image Vision è l'area video dedicata agli sposi: mostra i film di matrimonio e porta alla raccolta video completa.

## User preferences

- Nella homepage pubblica, alternare fondi pieni della palette October Mist tra le sezioni ed evitare i gradienti.
- Image Vision deve avere una tipografia molto leggibile e d'impatto, con un tono da piattaforma streaming senza imitare il marchio Netflix.

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details

## Flusso Git

- GitHub `main` è l'unica linea di verità. Replit e il computer di Gennaro devono avere sempre lo stesso commit di `main`.
- Prima di lavorare: eseguire `git fetch origin`; se `origin/main` è avanti, eseguire `git merge --ff-only origin/main`.
- Dopo aver lavorato: creare un commit con messaggio chiaro; poi Gennaro spinge con `git push origin HEAD:main`, solo se è un avanzamento semplice.
- Mai force push, mai `reset --hard`, mai rebase, mai modificare commit già pubblicati, mai usare "Sync Changes" alla cieca.
- Se il push è rifiutato o `origin/main` ha commit nuovi che non sono tuoi: fermarsi e avvisare Gennaro, senza risolvere da soli.
- I file non tracciati in `attached_assets/Pasted-*`, creati da Replit per i messaggi incollati, non contano come modifiche e non vanno committati.
- Non cancellare rami o file di backup (`backup/*`, `restore/*`, `codex/*`, `snyk-*`).
- Mai committare chiavi o credenziali.
- Claude Code lavora su rami `claude/*`; quando Gennaro lo chiede, portarli in `main` con un'unione normale.
