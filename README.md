# Task Manager

[![hexlet-check](https://github.com/luisfelipemontoya/task-manager/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/luisfelipemontoya/task-manager/actions)

A web application for creating, organizing, and tracking tasks. Assign statuses, assignees, and labels, then filter tasks by these criteria or by the current user as their creator.

Built as a learning project for the [Códica Fullstack JavaScript program](https://app.codica.la/programs/fullstack-javascript), using the [fastify-nodejs-application](https://github.com/hexlet-boilerplates/fastify-nodejs-application) boilerplate.

## Demo

[Open the live application](https://fullstack-javascript-project-141-093s.onrender.com)

The application interface is currently in Spanish.

## Features

- User registration, sign-in, and sign-out.
- Create, view, update, and delete users, statuses, labels, and tasks.
- Assign a status, an optional assignee, and multiple labels to each task.
- Filter tasks by status, assignee, label, or the current user as creator.
- Restrict task deletion to the task creator.
- Delete tasks and their label associations in a transaction while preserving labels.
- Prevent deletion of users, statuses, or labels that are linked to tasks.
- Report unexpected errors to Bugsink through the Sentry SDK while keeping validation errors in forms.

## Tech stack

- JavaScript ES modules and Node.js.
- Fastify and Pug for the server and views.
- Objection.js and Knex for models, database queries, and migrations.
- SQLite for development and tests; PostgreSQL for production.
- Bootstrap and Webpack for frontend assets.
- Passport and secure sessions for authentication.
- dotenv for configuration and i18next for translations.
- Jest for tests, Biome for linting, and Oxfmt for formatting.
- GitHub Actions for automated checks and Render for deployment.

## Installation

Requirements: Git, Node.js 22.x, and npm. The commands below target Linux or WSL.

```bash
git clone https://github.com/luisfelipemontoya/task-manager.git
cd task-manager
npm ci
cp .env.example .env
```

Configure the following environment variables in `.env`:

| Variable | Purpose |
|---|---|
| `SESSION_KEY` | Session secret. Replace the example value with your own. |
| `SENTRY_DSN` | Bugsink project DSN. Leave empty to disable local error monitoring. |
| `NODE_ENV` | Environment: `development`, `test`, or `production`. Defaults to `development`. |
| `DATABASE_URL` | PostgreSQL connection URL, required in production. |

Generate a session secret:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Copy the result into `.env`. This file is excluded from version control. Configure production secrets through Render's environment variables.

## Running locally

Build frontend assets and start the server:

```bash
npm run build
npm start
```

Open [http://localhost:3000](http://localhost:3000). The start command applies pending database migrations automatically. Development data is stored in `database.sqlite`.

Register an account and sign in. Create statuses and labels, then add tasks and choose their assignees. Combine filters on the task list, or select **Solo mis tareas** to show tasks you created.

To rebuild frontend assets as you work, run this in a separate terminal:

```bash
npx webpack --watch
```

## Checks

Run tests with the test database configuration:

```bash
NODE_ENV=test npm test
```

Check code and formatting:

```bash
npm run lint
```

Apply automatic lint and formatting fixes:

```bash
npm run lint:fix
```

Check the production asset build:

```bash
npm run build
```

## Deployment and monitoring

The application is deployed on Render with PostgreSQL. Production requires `NODE_ENV=production`, `DATABASE_URL`, and `SESSION_KEY`. Set `SENTRY_DSN` to enable error reporting to Bugsink.

The `instrument.js` file initializes the Sentry SDK before the server loads. Monitoring is enabled when a DSN is configured and the environment is not `test`.

## Automated project checks

The `.github/workflows/hexlet-check.yml` workflow runs Hexlet project checks through GitHub Actions. The badge at the top of this README links to workflow results.

This project was completed and approved as part of the Códica program. Keep the supplied workflow intact if continuing to use the academic checks.

## Acknowledgments

[Códica](https://app.codica.la/) provides programming education through guided practice, mentor feedback, and real projects. This application was developed as part of that learning process.
