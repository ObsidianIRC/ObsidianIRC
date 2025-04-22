# Contributing

## Clone and setup the repository
```sh
git clone https://github.com/ObsidianIRC/ObsidianIRC
cd ObsidianIRC
npm install
npm run dev  # Start the development server
```

Alternatively to run the full ObsidianIRC stack:
```sh
docker compose up
```

## Coding Style
We use [biome](https://biomejs.dev/guides/editors/first-party-extensions/) for linting and formatting.
You can run the following command to check if your code is formatted correctly:
```sh
npm run lint
npm run format
```

## Git Hooks
We use [lefthook](https://github.com/evilmartians/lefthook) for managing git hooks.
We have commit hooks to enforce coding style. You can install the hoooks with:
```sh
npm run commit-hook-install
```

Now every time you commit the lint and format commands will run automatically.
