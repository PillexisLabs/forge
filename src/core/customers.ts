// Customer details that jobs share with the CRM. A job says which customer
// a case belongs to (JobDefinition.customerOf); the job engine emits
// `customer.updated` when those details change, and the CRM keeps the
// customer record. The CRM can also register a directory, so a new
// enquiry from a known buyer starts with the details already on file.
// Modules never import each other: this file is the contract.

export type CustomerFacts = {
  name: string;
  company: string | null;
  /** Digits with country code, e.g. 919845012345. */
  phone: string | null;
  email: string | null;
  gstin: string | null;
  pincode: string | null;
};

export type CustomerRecord = CustomerFacts & { contactId: number };

export type CustomerDirectory = {
  find(by: { phone?: string | null; email?: string | null }): Promise<CustomerRecord | null>;
};

let directory: CustomerDirectory | null = null;

export function registerCustomerDirectory(next: CustomerDirectory) {
  directory = next;
}

/** The customer on file for this phone or email, or null (also when no CRM is installed). */
export async function findCustomer(by: { phone?: string | null; email?: string | null }): Promise<CustomerRecord | null> {
  if (!directory || (!by.phone && !by.email)) return null;
  return directory.find(by).catch((error) => {
    console.error('customers: lookup failed', error);
    return null;
  });
}

export function sameFacts(a: CustomerFacts | null, b: CustomerFacts | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
