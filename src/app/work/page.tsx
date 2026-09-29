import AccessNotice from '@/components/AccessNotice';
import ForgeShell from '@/components/ForgeShell';
import CaseList from '@/components/jobs/CaseList';
import SetupNotice from '@/components/SetupNotice';
import { ASSIGNEE_LABELS, assigneeRolesFor, listCases, type AssigneeRole, type CaseRecord } from '@/core/jobs';
import { getSessionUserFromCookies } from '@/core/session';
import { casePath, enabledJobs } from '@/modules/jobs';

export const dynamic = 'force-dynamic';

// My work: every open case that waits for one of the user's roles, across
// all jobs. An AI employee later gets the same inbox for its own roles.
export default async function WorkPage() {
  const user = await getSessionUserFromCookies();
  if (!user) return <AccessNotice area="Work" />;

  const roles = assigneeRolesFor(user);
  const jobs = enabledJobs();
  const defs = Object.fromEntries(jobs.map((job) => [job.job, job]));

  let rows: CaseRecord[];
  try {
    rows = roles.length
      ? (await listCases({ openOnly: true, assigneeRoles: roles })).filter((row) => defs[row.job])
      : [];
  } catch (error) {
    return <SetupNotice message={error instanceof Error ? error.message : String(error)} />;
  }

  const groups = roles
    .map((role) => ({ role, rows: rows.filter((row) => row.assignee_role === role) }))
    .filter((group) => group.rows.length > 0);

  return (
    <ForgeShell
      activeArea="work"
      title="My work"
      description={roles.length
        ? `Cases that wait for you as ${roles.map((role: AssigneeRole) => ASSIGNEE_LABELS[role].toLowerCase()).join(', ')}.`
        : 'Your role does not act on cases. You can still open any case from its list.'}
    >
      <div className="job-stack">
        {groups.length === 0 && <p className="job-empty">Nothing waits for you now.</p>}
        {groups.map((group) => (
          <section key={group.role} className="job-panel">
            <header className="job-panel-head">
              <h2>{ASSIGNEE_LABELS[group.role]}</h2>
              <span className="job-count">{group.rows.length}</span>
            </header>
            <CaseList
              rows={group.rows}
              defs={defs}
              hrefFor={(row) => casePath(row.job, row.ref)}
              columns={[{ label: 'Job', render: (row) => defs[row.job].label }]}
              empty="Nothing here."
            />
          </section>
        ))}
      </div>
    </ForgeShell>
  );
}
