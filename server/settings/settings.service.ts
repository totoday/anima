import type { SidebarOrder } from '../../shared/server-settings.js';
import {
  serverConfigStore,
  type ServerConfig,
  type ServerConfigStore,
} from '../storage/schema/server.store.js';

export interface DashboardSettings {
  host: string;
  port: number;
}

export class ServerSettingsService {
  constructor(private readonly store: ServerConfigStore = serverConfigStore) {}

  readConfig(): Promise<ServerConfig> {
    return this.store.read();
  }

  async getDashboardSettings(input: {
    defaultHost: string;
    defaultPort: number;
  }): Promise<DashboardSettings> {
    const config = await this.store.read();
    return {
      host: config.dashboardHost ?? input.defaultHost,
      port: config.dashboardPort ?? input.defaultPort,
    };
  }

  async getSidebarOrder(): Promise<SidebarOrder> {
    const config = await this.store.read();
    return config.sidebarOrder ?? {};
  }

  async setSidebarOrder(sidebarOrder: SidebarOrder): Promise<SidebarOrder> {
    const config = await this.store.read();
    await this.store.write({ ...config, sidebarOrder });
    return sidebarOrder;
  }
}

export const defaultServerSettingsService = new ServerSettingsService();
