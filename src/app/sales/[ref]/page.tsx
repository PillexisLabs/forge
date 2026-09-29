import { redirect } from 'next/navigation';

// Quotes open as a sheet over the list. Old links to /sales/<ref> land there.
export default function QuoteRedirect({ params }: { params: { ref: string } }) {
  redirect(`/sales?open=${encodeURIComponent(params.ref)}`);
}
