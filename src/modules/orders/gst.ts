// GST place of supply. The seller's state comes from the first two digits of
// its GSTIN. The buyer's state comes from the buyer's GSTIN when known, else
// it is estimated from the delivery pincode, and the invoice says so.

export const STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya',
  '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh',
  '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu', '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa',
  '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};

// First two (or three) pincode digits to a GST state code. Approximate at
// some borders; a buyer GSTIN always wins.
const PIN3: Record<string, string> = { '160': '04', '403': '30', '605': '34', '244': '05', '246': '05', '247': '05', '248': '05', '249': '05', '262': '05', '263': '05', '737': '11', '744': '35', '682': '32', '194': '38' };
const PIN2: Record<string, string> = {
  '11': '07', '12': '06', '13': '06', '14': '03', '15': '03', '16': '03', '17': '02', '18': '01', '19': '01',
  '20': '09', '21': '09', '22': '09', '23': '09', '24': '09', '25': '09', '26': '09', '27': '09', '28': '09',
  '30': '08', '31': '08', '32': '08', '33': '08', '34': '08', '36': '24', '37': '24', '38': '24', '39': '24',
  '40': '27', '41': '27', '42': '27', '43': '27', '44': '27', '45': '23', '46': '23', '47': '23', '48': '23', '49': '22',
  '50': '36', '51': '37', '52': '37', '53': '37', '56': '29', '57': '29', '58': '29', '59': '29',
  '60': '33', '61': '33', '62': '33', '63': '33', '64': '33', '67': '32', '68': '32', '69': '32',
  '70': '19', '71': '19', '72': '19', '73': '19', '74': '19', '75': '21', '76': '21', '77': '21', '78': '18',
  '80': '10', '81': '20', '82': '20', '83': '20', '84': '10', '85': '10',
};

export function stateFromGstin(gstin: string | null | undefined): string | null {
  const code = (gstin ?? '').trim().slice(0, 2);
  return STATES[code] ? code : null;
}

export function stateFromPincode(pincode: string | null | undefined): string | null {
  const pin = (pincode ?? '').trim();
  return PIN3[pin.slice(0, 3)] ?? PIN2[pin.slice(0, 2)] ?? null;
}

/** CGST + SGST inside the seller's state, IGST across states. Pure, for tests. */
export function splitGst(gstPaise: number, sellerState: string | null, buyerState: string | null): { cgst: number; sgst: number; igst: number } {
  if (sellerState && buyerState && sellerState === buyerState) {
    const cgst = Math.floor(gstPaise / 2);
    return { cgst, sgst: gstPaise - cgst, igst: 0 };
  }
  return { cgst: 0, sgst: 0, igst: gstPaise };
}
