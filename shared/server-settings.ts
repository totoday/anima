import { z } from 'zod';

export const SidebarOrder = z.object({
  agents: z.array(z.string()).optional(),
  kbs: z.array(z.string()).optional(),
});
export type SidebarOrder = z.infer<typeof SidebarOrder>;

export const ReleaseTrack = z.enum(['stable', 'canary']);
export type ReleaseTrack = z.infer<typeof ReleaseTrack>;
