import { z } from 'zod';

export const SidebarOrder = z.object({
  agents: z.array(z.string()).optional(),
  kbs: z.array(z.string()).optional(),
});
export type SidebarOrder = z.infer<typeof SidebarOrder>;
