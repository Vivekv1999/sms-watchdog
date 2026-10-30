export interface ParsedSms {
  otp: string;
  service: string;
  isOtp: boolean;
  cleanBody: string;
}

export function parseSmsDetails(sender: string = '', body: string = ''): ParsedSms {
  const combined = `${sender} ${body}`.toLowerCase();

  // 1. Service Detection
  let service = 'OTHER';
  if (combined.includes('flpkrt') || combined.includes('flipkart')) {
    service = 'FLIPKART';
  } else if (combined.includes('amazon') || combined.includes('amzin')) {
    service = 'AMAZON';
  } else if (combined.includes('meesho')) {
    service = 'MEESHO';
  } else if (combined.includes('myntra')) {
    service = 'MYNTRA';
  } else if (combined.includes('shopify')) {
    service = 'SHOPIFY';
  } else if (combined.includes('sbi') || combined.includes('state bank')) {
    service = 'SBI BANK';
  } else if (combined.includes('hdfc')) {
    service = 'HDFC BANK';
  } else if (combined.includes('icici')) {
    service = 'ICICI BANK';
  } else if (combined.includes('axis')) {
    service = 'AXIS BANK';
  } else if (combined.includes('paytm')) {
    service = 'PAYTM';
  } else if (combined.includes('razorpay')) {
    service = 'RAZORPAY';
  } else if (combined.includes('zomato')) {
    service = 'ZOMATO';
  } else if (combined.includes('swiggy')) {
    service = 'SWIGGY';
  }

  // 2. High-Accuracy Contextual OTP Regex
  let otp = '';
  const contextPatterns = [
    // "OTP is 123456" or "OTP: 123456" or "code is 1234"
    /(?:otp|code|verification|passcode|secret|pin|login)\s*(?:is|:|#|-)?\s*([0-9]{4,8})\b/i,
    // "123456 is your Flipkart OTP" or "492812 is your code"
    /\b([0-9]{4,8})\s+(?:is\s+your|is\s+the|is\s+an)\s+(?:otp|code|verification|secret)/i,
    // "use code 123456"
    /(?:use|enter)\s+(?:code|otp|pin)\s+([0-9]{4,8})\b/i,
  ];

  for (const regex of contextPatterns) {
    const match = body.match(regex);
    if (match && match[1]) {
      otp = match[1];
      break;
    }
  }

  // Fallback: If not found by context, but word "otp" or "code" appears, find any 4-8 digit number
  if (!otp && (combined.includes('otp') || combined.includes('code') || combined.includes('verification'))) {
    const genericDigits = body.match(/\b([0-9]{4,8})\b/);
    if (genericDigits && genericDigits[1]) {
      otp = genericDigits[1];
    }
  }

  return {
    otp,
    service,
    isOtp: Boolean(otp),
    cleanBody: body.trim(),
  };
}
