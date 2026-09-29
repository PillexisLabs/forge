import { consumeEvents } from '@/core/events';
import { createCase, ruleActor } from '@/core/jobs';
import { orderJob } from './order-job';

const ORDER_RULE = ruleActor('orders.from-accepted-quote', 'Order rule');

// quote.accepted → a confirmed order. The event id is the idempotency key,
// so a replayed event returns the existing order instead of a second one.
export async function consumeQuoteAccepted(): Promise<number> {
  return consumeEvents('orders.quote-accepted', ['quote.accepted'], async (event) => {
    const quoteCaseId = Number(event.payload.quote_case_id);
    await createCase(orderJob, 'createFromQuote', event.payload, ORDER_RULE, {
      parentCaseId: Number.isInteger(quoteCaseId) ? quoteCaseId : undefined,
      sourceEventId: Number(event.id),
    });
  });
}
