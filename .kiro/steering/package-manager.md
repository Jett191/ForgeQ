# Package Manager

This project uses **pnpm** as its package manager.

## Rules

- Use `pnpm` for all install / run / exec commands. Do not use `npm` or `yarn`.
- Lockfile of record is `pnpm-lock.yaml`. Do not commit `package-lock.json` or `yarn.lock`.
- When generating documentation, specs, tasks, scripts, or CI snippets, write commands in pnpm form.

## Command Mapping

| Intent                  | Command                  |
|-------------------------|--------------------------|
| Install all deps        | `pnpm install`           |
| Add a dependency        | `pnpm add <pkg>`         |
| Add a dev dependency    | `pnpm add -D <pkg>`      |
| Remove a dependency     | `pnpm remove <pkg>`      |
| Run a package script    | `pnpm <script>` (e.g. `pnpm build`, `pnpm test:unit`) |
| Run an arbitrary binary | `pnpm exec <bin>` or `pnpm dlx <pkg>` |
| Update deps             | `pnpm update`            |

Note: `pnpm <script>` works directly without the `run` keyword (e.g. `pnpm build` instead of `pnpm run build`).
