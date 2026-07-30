import { getSql } from '../src/lib/db';
import { env } from '../src/lib/env';

type Transcript = {
  id: string;
  title: string;
  date: number;
  duration: number | null;
  organizer_email: string | null;
  participants: string[];
  transcript_url: string | null;
  meeting_attendees: { displayName: string | null; email: string | null; name: string | null }[];
  meeting_info: { summary_status: string | null } | null;
  summary: {
    short_summary: string | null;
    overview: string | null;
    action_items: string | null;
  } | null;
};

const QUERY = `
  query CrmTranscripts($fromDate: DateTime, $limit: Int, $skip: Int) {
    transcripts(fromDate: $fromDate, limit: $limit, skip: $skip, mine: true) {
      id title date duration organizer_email participants transcript_url
      meeting_attendees { displayName email name }
      meeting_info { summary_status }
      summary { short_summary overview action_items }
    }
  }
`;

async function fetchTranscripts(fromDate: string) {
  const output: Transcript[] = [];
  for (let skip = 0; ; skip += 50) {
    const response = await fetch('https://api.fireflies.ai/graphql', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.firefliesApiKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: QUERY, variables: { fromDate, limit: 50, skip } }),
    });
    if (!response.ok) throw new Error(`Fireflies request failed with ${response.status}`);
    const payload = await response.json() as {
      data?: { transcripts?: Transcript[] };
      errors?: { message: string }[];
    };
    if (payload.errors?.length) throw new Error(payload.errors.map((item) => item.message).join('; '));
    const page = payload.data?.transcripts ?? [];
    output.push(...page);
    if (page.length < 50) return output;
  }
}

function externalAttendee(transcript: Transcript) {
  const internal = new Set(
    (process.env.FIREFLIES_INTERNAL_EMAILS ?? 'contact@pillexislabs.com')
      .split(',')
      .map((value) => value.trim().toLowerCase()),
  );
  const attendee = transcript.meeting_attendees.find((item) => {
    const email = item.email?.toLowerCase();
    return email && email !== transcript.organizer_email?.toLowerCase() && !internal.has(email) && !email.endsWith('@pillexislabs.com');
  });
  const email = attendee?.email?.toLowerCase()
    ?? transcript.participants.find((value) => {
      const emailValue = value.toLowerCase();
      return emailValue !== transcript.organizer_email?.toLowerCase() && !internal.has(emailValue) && !emailValue.endsWith('@pillexislabs.com');
    })?.toLowerCase();
  if (!email) return null;
  return {
    email,
    name: attendee?.displayName || attendee?.name || email.split('@')[0],
    domain: email.split('@')[1],
  };
}

async function main() {
  const days = Number(process.argv[2] ?? 90);
  const fromDate = new Date(Date.now() - days * 86_400_000).toISOString();
  const transcripts = await fetchTranscripts(fromDate);
  const sql = getSql();
  let matched = 0;

  try {
    for (const transcript of transcripts) {
      const person = externalAttendee(transcript);
      if (!person) continue;
      await sql.begin(async (tx) => {
        const companies = await tx<{ id: number }[]>`
          insert into crm_companies (display_name, domain)
          values (${person.domain.split('.')[0]}, ${person.domain})
          on conflict (lower(domain)) where domain is not null and domain <> ''
          do update set updated_at = now()
          returning id
        `;
        const companyId = companies[0].id;
        const contacts = await tx<{ id: number }[]>`
          insert into crm_contacts (company_id, name, primary_email)
          values (${companyId}, ${person.name}, ${person.email})
          on conflict (lower(primary_email)) where primary_email is not null and primary_email <> ''
          do update set name = excluded.name, company_id = excluded.company_id, updated_at = now()
          returning id
        `;
        const contactId = contacts[0].id;
        const existing = await tx<{ id: number }[]>`
          select id from crm_deals where contact_id = ${contactId} order by created_at asc limit 1
        `;
        const dealId = existing[0]?.id ?? (await tx<{ id: number }[]>`
          insert into crm_deals (
            contact_id, company_id, title, problem_statement, lead_source, stage, last_interaction_at
          )
          values (
            ${contactId}, ${companyId}, ${`${person.name} opportunity`},
            ${transcript.summary?.short_summary ?? null}, 'fireflies', 'qualified',
            ${new Date(transcript.date).toISOString()}
          )
          returning id
        `)[0].id;

        await tx`
          update crm_deals set
            problem_statement = coalesce(${transcript.summary?.short_summary ?? null}, problem_statement),
            last_interaction_at = greatest(
              coalesce(last_interaction_at, '-infinity'::timestamptz),
              ${new Date(transcript.date).toISOString()}
            ),
            updated_at = now()
          where id = ${dealId}
        `;
        await tx`
          insert into crm_meetings (
            deal_id, fireflies_transcript_id, title, meeting_at, duration_minutes,
            transcript_url, summary_status, short_summary, overview, action_items
          )
          values (
            ${dealId}, ${transcript.id}, ${transcript.title}, ${new Date(transcript.date).toISOString()},
            ${transcript.duration}, ${transcript.transcript_url},
            ${transcript.summary ? 'available' : 'unavailable'}, ${transcript.summary?.short_summary ?? null},
            ${transcript.summary?.overview ?? null}, ${transcript.summary?.action_items ?? null}
          )
          on conflict (fireflies_transcript_id) do update set
            deal_id = excluded.deal_id, title = excluded.title, meeting_at = excluded.meeting_at,
            duration_minutes = excluded.duration_minutes, transcript_url = excluded.transcript_url,
            summary_status = excluded.summary_status, short_summary = excluded.short_summary,
            overview = excluded.overview, action_items = excluded.action_items, synced_at = now()
        `;
        await tx`
          insert into crm_activities (
            deal_id, contact_id, actor, type, occurred_at, subject, body, source, source_id
          )
          values (
            ${dealId}, ${contactId}, 'Fireflies', 'meeting', ${new Date(transcript.date).toISOString()},
            ${transcript.title}, ${transcript.summary?.short_summary ?? null}, 'fireflies', ${transcript.id}
          )
          on conflict (source, source_id) where source_id is not null and source_id <> ''
          do update set subject = excluded.subject, body = excluded.body, occurred_at = excluded.occurred_at
        `;
      });
      matched += 1;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
  console.log(`Synced ${matched} client meetings from Fireflies API.`);
}

main().catch((error) => {
  console.error('Fireflies CRM sync failed:', error);
  process.exit(1);
});
