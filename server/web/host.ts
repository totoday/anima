import { resolveAnimaHome } from '../anima-home.js';
import { errorMessage } from '../ids.js';
import { defaultServerSettingsService } from '../settings/settings.service.js';
import { createWebServer } from './app.js';

export interface WebHostOptions {
  host?: string;
  port?: number;
}

export async function startWebHost(opts: WebHostOptions = {}): Promise<void> {
  const animaHome = resolveAnimaHome();
  const host = opts.host ?? '127.0.0.1';
  const { port: configuredPort } = await defaultServerSettingsService.getDashboardSettings({
    defaultHost: host,
    defaultPort: 4174,
  });
  const port = opts.port ?? configuredPort;
  const server = await createWebServer();
  await new Promise<void>((resolveServer) => {
    server.listen(port, host, resolveServer);
  });
  console.log(`Anima web listening on http://${host}:${port}`);
  console.log(`Anima home: ${animaHome}`);
  await awaitShutdown(
    () =>
      new Promise<void>((resolveClose) => {
        server.close(() => resolveClose());
      }),
  );
}

async function awaitShutdown(stop: () => Promise<void>): Promise<void> {
  await new Promise<void>((resolveShutdown) => {
    let stopping = false;
    const handle = (signal: NodeJS.Signals) => {
      if (stopping) return;
      stopping = true;
      console.log(`Received ${signal}, shutting down...`);
      stop()
        .catch((error) => {
          console.error(`Shutdown error: ${errorMessage(error)}`);
        })
        .finally(() => resolveShutdown());
    };
    process.once('SIGINT', handle);
    process.once('SIGTERM', handle);
  });
}
