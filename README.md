# X402 Solana Demo

A monorepo project demonstrating web and server integration with TypeScript.

## Project Structure

This is a pnpm workspace monorepo containing two main packages:

- **web**: React application with Vite and TypeScript
- **server**: Koa.js server application with TypeScript

## Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0

## Installation

```bash
# Install dependencies for all packages
pnpm install
```

## Development

```bash
# Start both web and server in development mode
pnpm dev

# Start only the web application
pnpm --filter web dev

# Start only the server
pnpm --filter server dev
```

## Build

```bash
# Build all packages
pnpm build

# Build specific package
pnpm --filter web build
pnpm --filter server build
```

## Available Scripts

- `pnpm dev` - Start development servers for all packages
- `pnpm build` - Build all packages
- `pnpm clean` - Clean build artifacts
- `pnpm lint` - Run linting
- `pnpm type-check` - Run TypeScript type checking

## Web Application

The web application is built with:
- React 18
- Vite
- TypeScript
- Modern CSS

Access the web app at: http://localhost:3000

## Server Application

The server application is built with:
- Koa.js
- TypeScript
- CORS support
- Body parsing
- Request logging

API endpoints:
- Health check: http://localhost:3001/health
- Hello API: http://localhost:3001/api/hello
- Data API: http://localhost:3001/api/data (POST)

## Technologies Used

- **Frontend**: React, Vite, TypeScript
- **Backend**: Koa.js, TypeScript
- **Package Manager**: pnpm
- **Build Tool**: Vite (web), tsc (server)
- **Code Quality**: ESLint, Prettier, TypeScript

## License

MIT