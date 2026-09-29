import AccessNotice from '@/components/AccessNotice';
import ForgeShell from '@/components/ForgeShell';
import NewEnquiryForm from '@/components/sales/NewEnquiryForm';
import { guardModulePage } from '@/core/page-guard';

export const dynamic = 'force-dynamic';

export default async function NewEnquiryPage() {
  const user = await guardModulePage('sales', 'sales:write');
  if (!user) return <AccessNotice area="Sales" />;
  return (
    <ForgeShell
      activeArea="sales"
      title="New enquiry"
      description="Record what the buyer asked for, in their words. You build the quote on the next screen."
    >
      <NewEnquiryForm />
    </ForgeShell>
  );
}
