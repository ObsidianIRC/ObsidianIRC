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

## Local Development & Testing

### Development Setup

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/ObsidianIRC/ObsidianIRC
   cd ObsidianIRC
   npm install
   ```

2. **Start development server:**
   ```bash
   npm run dev
   ```

### Testing Environment

For testing features locally, we provide a complete IRC testing stack with Docker Compose:

#### Start Testing Stack (IRC Server + 3 Bots)
```bash
# in one terminal
npm run dev
# in another terminal
docker-compose --profile testing up -d
```

Now you can connect to `ws://localhost:8097` with any nickname and check the `#test` channel.
