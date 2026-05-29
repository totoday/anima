import { Bot, Globe } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { fetchAgentSkills } from '@/api/agents';
import { queryKeys } from '@/lib/query-keys';
import type { SkillSummary } from '@shared/skills';

// ---------------------------------------------------------------------------
// Single skill row
// ---------------------------------------------------------------------------

function SkillRow({ skill }: { skill: SkillSummary }) {
  return (
    <div className="py-2.5">
      <div className="font-serif text-[14px] leading-snug text-text">{skill.name}</div>
      {skill.description && (
        <div className="mt-0.5 line-clamp-2 font-sans text-[12px] leading-relaxed text-text-muted">
          {skill.description}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skill group (global / local)
// ---------------------------------------------------------------------------

function SkillGroup({
  label,
  icon: Icon,
  path,
  skills,
}: {
  label: string;
  icon: LucideIcon;
  path: string;
  skills: SkillSummary[];
}) {
  return (
    <div>
      {/* Label row */}
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="h-3 w-3 shrink-0 text-text-subtle" />
        <span className="caps text-text-subtle">{label}</span>
      </div>
      {/* Path subtitle */}
      <div className="mb-2 font-mono text-[11px] text-text-subtle/60 leading-snug truncate" title={path}>
        {path}
      </div>
      {/* Skill list or empty state */}
      {skills.length === 0 ? (
        <p className="font-serif italic text-[13px] text-text-subtle">None</p>
      ) : (
        <div className="divide-y divide-border-soft/60">
          {skills.map((skill) => (
            <SkillRow key={skill.dirName} skill={skill} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export function SkillsSection({ agentId }: { agentId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.agentSkills(agentId),
    queryFn: () => fetchAgentSkills(agentId),
    enabled: !!agentId,
    // Skills change infrequently — no live refetch needed.
    staleTime: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-1">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-4 w-32 animate-pulse rounded bg-surface-elevated" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SkillGroup
        label="Global skills"
        icon={Globe}
        path={data.globalPath}
        skills={data.global}
      />
      <SkillGroup
        label="This agent's skills"
        icon={Bot}
        path={data.localPath}
        skills={data.local}
      />
    </div>
  );
}
