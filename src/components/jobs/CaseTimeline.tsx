import type { CaseStepRecord, JobDefinition } from '@/core/jobs';

const ACTOR_LABEL: Record<CaseStepRecord['actor_kind'], string> = {
  user: 'Person',
  rule: 'Rule',
  employee: 'AI employee',
};

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
  }).format(new Date(value));
}

// Every step, in order, with who did it. The same timeline will show AI
// employee steps later, with the same record shape.
export default function CaseTimeline({ steps, def }: { steps: CaseStepRecord[]; def: JobDefinition }) {
  return (
    <ol className="job-timeline" aria-label="Case timeline">
      {steps.map((step) => (
        <li key={step.id} className="job-timeline-item">
          <div className="job-timeline-head">
            <span className="job-actor" data-kind={step.actor_kind}>{ACTOR_LABEL[step.actor_kind]}</span>
            <span className="job-timeline-who">{step.actor_name}</span>
            <time dateTime={step.created_at}>{formatWhen(step.created_at)}</time>
          </div>
          <p className="job-timeline-summary">{step.summary}</p>
          <p className="job-timeline-state">
            {step.from_state ? `${def.states[step.from_state]?.label ?? step.from_state} → ` : ''}
            {def.states[step.to_state]?.label ?? step.to_state}
          </p>
        </li>
      ))}
    </ol>
  );
}
