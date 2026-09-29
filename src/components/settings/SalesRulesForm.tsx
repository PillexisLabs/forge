'use client';

import { useState } from 'react';
import { useAction } from '@/components/lf/useAction';
import type { SalesRules } from '@/modules/sales/sales-settings';
import { Affix, Card, digits, Row, SaveBar, Segmented, Switch } from './kit';

type Form = {
  approvalMode: 'above' | 'always';
  approvalLimitRupees: string;
  autoDraft: boolean;
  autoSend: boolean;
  freightLocalRupees: string;
  freightOutstationRupees: string;
  localPinPrefixes: string;
  quoteValidDays: string;
  businessName: string;
  businessAddress: string;
  businessGstin: string;
};

function toForm(r: SalesRules): Form {
  return {
    approvalMode: r.approvalMode, approvalLimitRupees: String(r.approvalLimitRupees), autoDraft: r.autoDraft, autoSend: r.autoSend,
    freightLocalRupees: String(r.freightLocalRupees), freightOutstationRupees: String(r.freightOutstationRupees),
    localPinPrefixes: r.localPinPrefixes.join(', '), quoteValidDays: String(r.quoteValidDays),
    businessName: r.businessName, businessAddress: r.businessAddress, businessGstin: r.businessGstin,
  };
}

export default function SalesRulesForm({ rules }: { rules: SalesRules }) {
  const [base, setBase] = useState(() => toForm(rules));
  const [f, setF] = useState(base);
  const [saved, setSaved] = useState(false);
  const { post, busy, error } = useAction();
  const set = (patch: Partial<Form>) => { setF({ ...f, ...patch }); setSaved(false); };
  const dirty = JSON.stringify(f) !== JSON.stringify(base);

  return (
    <div className="st-stack">
      <Card title="Approval" description="Who must approve a quote before Forge sends it. A person always checks drafts that Forge prepares.">
        <Row label="Approval needed for">
          <Segmented label="Approval needed for" value={f.approvalMode} onChange={(v) => set({ approvalMode: v })} options={[{ id: 'above', label: 'Above a limit' }, { id: 'always', label: 'Every quote' }]} />
        </Row>
        <Row label="Approval limit" description="Total with GST and freight. Quotes above it go to an admin." htmlFor="sr-limit" disabled={f.approvalMode === 'always'}>
          <Affix before="₹"><input id="sr-limit" inputMode="numeric" value={f.approvalLimitRupees} disabled={f.approvalMode === 'always'} onChange={(e) => set({ approvalLimitRupees: digits(e.target.value) })} /></Affix>
        </Row>
      </Card>

      <Card title="Automation" description="What Forge does without a click.">
        <Row label="Draft quotes from messages" description="Forge matches the items and quantities to your catalogue, or asks the buyer for what is missing.">
          <Switch id="sr-draft" label="Draft quotes from messages" checked={f.autoDraft} onChange={(v) => set({ autoDraft: v })} />
        </Row>
        <Row label="Send approved quotes" description="Forge sends the quote and its PDF on WhatsApp or email when the buyer can receive it.">
          <Switch id="sr-send" label="Send approved quotes" checked={f.autoSend} onChange={(v) => set({ autoSend: v })} />
        </Row>
      </Card>

      <Card title="Freight and validity" description="Freight is added by pincode. Quotes carry their validity date.">
        <Row label="Local freight" htmlFor="sr-local"><Affix before="₹"><input id="sr-local" inputMode="numeric" value={f.freightLocalRupees} onChange={(e) => set({ freightLocalRupees: digits(e.target.value) })} /></Affix></Row>
        <Row label="Outstation freight" htmlFor="sr-out"><Affix before="₹"><input id="sr-out" inputMode="numeric" value={f.freightOutstationRupees} onChange={(e) => set({ freightOutstationRupees: digits(e.target.value) })} /></Affix></Row>
        <Row label="Local pincodes start with" description="Separate with commas. For example 56, 57 for Karnataka." htmlFor="sr-pins"><input id="sr-pins" className="st-text" value={f.localPinPrefixes} onChange={(e) => set({ localPinPrefixes: e.target.value })} /></Row>
        <Row label="Quote validity" htmlFor="sr-valid"><Affix after="days"><input id="sr-valid" inputMode="numeric" value={f.quoteValidDays} onChange={(e) => set({ quoteValidDays: digits(e.target.value) })} /></Affix></Row>
      </Card>

      <Card title="Business details" description="Printed on every quote, order confirmation and invoice.">
        <Row label="Business name" htmlFor="sr-name"><input id="sr-name" className="st-text" value={f.businessName} onChange={(e) => set({ businessName: e.target.value })} /></Row>
        <Row label="Address" htmlFor="sr-address"><input id="sr-address" className="st-text" value={f.businessAddress} onChange={(e) => set({ businessAddress: e.target.value })} /></Row>
        <Row label="GSTIN" description="Needed for GST tax invoices." htmlFor="sr-gstin"><input id="sr-gstin" className="st-text" value={f.businessGstin} maxLength={15} onChange={(e) => set({ businessGstin: e.target.value.toUpperCase() })} /></Row>
      </Card>

      <SaveBar
        dirty={dirty} busy={busy === 'save'} error={error} saved={saved}
        onDiscard={() => setF(base)}
        onSave={async () => {
          const ok = await post('save', '/api/settings/sales-rules', { ...f });
          if (ok) { setBase(f); setSaved(true); }
        }}
      />
    </div>
  );
}
