# Railway deployment

The supported production shape is one Railway service built from the repository
root. The same Node process serves the compiled React app, `/health`, and Socket.IO.
Rooms and reconnect sessions exist only in that process's memory.

## Deploy from GitHub

1. Push the repository, including `railway.toml`, to GitHub.
2. In Railway, choose **New Project**, select **Deploy from GitHub repo**, and select
   the repository. Keep the service root directory at the repository root.
3. Open the service's **Variables** and add `NODE_ENV=production`. If Railway already
   started the first deployment, deploy the resulting staged change or redeploy after
   adding the variable.
4. Keep exactly one replica. In **Settings > Scale**, the total replica count across
   the configured regions must be one.
5. After the deployment is healthy, open **Settings > Networking** and choose
   **Generate Domain**. Open the generated HTTPS URL.

Railway builds new commits pushed to the service's connected branch. Build and deploy
logs are available on each deployment; inspect both when a deployment fails.

## Checked-in configuration

Railway reads the root `railway.toml` for each deployment:

```toml
[build]
builder = "RAILPACK"
buildCommand = "pnpm build"

[deploy]
startCommand = "pnpm start"
healthcheckPath = "/health"
healthcheckTimeout = 100
restartPolicyType = "ON_FAILURE"
restartPolicyMaxRetries = 10
```

Railpack detects Node from the root `package.json` (`>=22.13 <25`) and pnpm from
`packageManager` (`pnpm@10.34.5`). It uses Corepack for that pnpm version and installs
the workspace from `pnpm-lock.yaml` before running the configured build. Railpack's Node
install keeps development dependencies available to the build even though its build
environment uses `NODE_ENV=production`. No custom install or dependency-pruning override
is needed; if one is added, verify that the server's workspace dependencies remain in
the deploy image.

`pnpm build` compiles all four workspace projects, including `apps/web/dist`.
`pnpm start` starts only `@grandstand/server`; in production that server finds and serves
the web bundle. Railway injects `PORT` automatically, and the server binds it on
`0.0.0.0`. Do not create a `PORT` variable unless diagnosing a nonstandard deployment.

## Variables and origins

For the single-service deployment, the only required user variable is:

```text
NODE_ENV=production
```

The browser defaults to its own origin, so do not set `VITE_SOCKET_URL` for this layout.
Same-origin HTTP and Socket.IO requests are accepted without `CORS_ORIGINS`.

`CORS_ORIGINS` is optional. Use it only to permit additional browser origins, as a
comma-separated list of exact origins without paths, for example:

```text
CORS_ORIGINS=https://preview.example.com,https://game.example.com
```

If the web app and server are deliberately deployed to different origins, set
`VITE_SOCKET_URL` to the server's public origin **before building the web app**, and add
the web app's exact origin to the server's `CORS_ORIGINS`. `VITE_SOCKET_URL` is a Vite
build-time value, not a runtime server setting. A split deployment also needs separate
static hosting and is outside the one-service Railway path documented here.

## Verify the deployment

Replace the example host with the generated Railway domain:

```powershell
$BaseUrl = "https://your-service.up.railway.app"
Invoke-RestMethod "$BaseUrl/health"
(Invoke-WebRequest "$BaseUrl/").StatusCode
(Invoke-WebRequest "$BaseUrl/room/verification").StatusCode
```

The health response must be `{"ok":true}`. Both browser routes should return the SPA
with status 200. Then open the generated domain in two browser/device sessions:

1. Create a room and choose **Invite players**.
2. Scan the QR code with the second device, or copy/share its link.
3. Confirm that the invite opens the same public domain with `?room=ROOMCODE`, then join
   and play an action from each session.

The QR code contains the current page's public origin plus the room query parameter. Do
not generate or share it from `localhost` when inviting another device.

## Persistence and scaling limits

Rooms, games, tokens, and reconnect state are in memory. A restart, redeploy, crash, or
replacement of the running container loses every active room; clients must create a new
room. The restart policy can restart a failed process, but it cannot restore room state.

Run one service, one replica, and one server process. There is no shared room store,
sticky-session guarantee, or Socket.IO cluster adapter. Multiple replicas or processes
can route members of one room to different memory stores and cause missing rooms,
failed reconnects, or divergent state. Railway's default is one replica, but verify the
service scale setting has not been changed.

## Troubleshooting

- **Build cannot find `pnpm`, TypeScript, or Vite:** confirm the root directory contains
  `package.json`, `pnpm-lock.yaml`, and `pnpm-workspace.yaml`; confirm the deployment
  uses the checked-in `railway.toml`; remove custom install/pruning overrides.
- **Start says production web assets were not found:** inspect the build log for a
  successful `pnpm build` and `apps/web/dist`; do not point the service root at
  `apps/server`.
- **Health check fails or the service is unreachable:** inspect deploy logs for the
  listening message or a startup exception. Leave `PORT` to Railway and keep the server
  bound to `0.0.0.0`. `/health` must return HTTP 200 within the configured 100 seconds.
- **Generated domain shows 404 while `/health` works:** set `NODE_ENV=production` and
  redeploy so the server registers static and SPA routes.
- **Socket.IO connects locally but not in production:** for the single-service layout,
  remove `VITE_SOCKET_URL` and use the generated HTTPS origin. For a split layout, check
  the build-time server URL and exact `CORS_ORIGINS` entry.
- **An origin receives HTTP 403:** same-origin requests should work. For an additional
  frontend, add only its exact scheme and host to `CORS_ORIGINS`, then redeploy.
- **Players see missing rooms after a deploy or restart:** this is expected for the
  in-memory v1 service; create and share a new room.
- **Intermittent missing rooms or reconnect failures:** verify the service has one total
  replica and that no custom start command launches multiple Node processes.
