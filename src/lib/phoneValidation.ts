// Normalization + validation for international phone numbers, tuned for Brazil (BR).
// Returns structured result so UI can show precise guidance.

export interface PhoneValidationResult {
  ok: boolean;
  e164?: string;          // digits only, no "+", e.g. "5527997784501"
  formatted?: string;     // pretty display, e.g. "+55 27 99778-4501"
  countryCode?: string;   // e.g. "55"
  areaCode?: string;      // e.g. "27"
  local?: string;         // remainder after DDI+DDD
  isMobile?: boolean;
  errorCode?:
    | 'empty'
    | 'too_short'
    | 'too_long'
    | 'missing_ddi'
    | 'invalid_ddd'
    | 'invalid_br_mobile'
    | 'invalid_chars'
    | 'unsupported_country';
  errorMessage?: string;
  hint?: string;
}

// Valid Brazilian DDDs (area codes)
const VALID_BR_DDDS = new Set([
  '11','12','13','14','15','16','17','18','19',
  '21','22','24','27','28',
  '31','32','33','34','35','37','38',
  '41','42','43','44','45','46','47','48','49',
  '51','53','54','55',
  '61','62','63','64','65','66','67','68','69',
  '71','73','74','75','77','79',
  '81','82','83','84','85','86','87','88','89',
  '91','92','93','94','95','96','97','98','99',
]);

// A conservative allowlist of common country codes we recognize for display
// (we still accept others via generic E.164 rules).
const KNOWN_COUNTRY_CODES = new Set([
  '1','7','20','27','30','31','32','33','34','36','39','40','41','43','44','45','46','47','48','49',
  '51','52','53','54','55','56','57','58','60','61','62','63','64','65','66','81','82','84','86','90',
  '91','92','93','94','95','98','212','213','216','218','220','221','222','223','224','225','226','227','228','229','230','231','233','234','235','236','237','238','239','240','241','242','243','244','245','248','249','250','251','252','253','254','255','256','257','258','260','261','262','263','264','265','266','267','268','269','290','291','297','298','299','350','351','352','353','354','355','356','357','358','359','370','371','372','373','374','375','376','377','378','380','381','382','383','385','386','387','389','420','421','423','500','501','502','503','504','505','506','507','508','509','590','591','592','593','594','595','596','597','598','599','670','672','673','674','675','676','677','678','679','680','681','682','683','685','686','687','688','689','690','691','692','850','852','853','855','856','870','880','886','960','961','962','963','964','965','966','967','968','970','971','972','973','974','975','976','977','992','993','994','995','996','998',
]);

function stripChars(raw: string): string {
  return String(raw || '').replace(/[^\d+]/g, '');
}

/**
 * Normalize + validate an international phone number.
 * - Removes any non-digit chars (keeps leading + for detection).
 * - Assumes Brazil (55) when no DDI is present AND digits look like BR (10-11).
 * - Enforces BR mobile rules (DDD válido, 9 no início do celular).
 * - Rejects impossible lengths (< 8 or > 15 digits).
 */
export function validatePhone(raw: string): PhoneValidationResult {
  const cleaned = stripChars(raw);
  if (!cleaned) {
    return { ok: false, errorCode: 'empty', errorMessage: 'Informe um número.', hint: 'Ex: (27) 99778-4501 ou 5527997784501.' };
  }

  // Reject anything with unexpected characters left over
  if (/[^\d+]/.test(cleaned)) {
    return { ok: false, errorCode: 'invalid_chars', errorMessage: 'O número contém caracteres inválidos.', hint: 'Use apenas dígitos, espaços, hífens ou parênteses.' };
  }

  const hasPlus = cleaned.startsWith('+');
  let digits = cleaned.replace(/\D/g, '').replace(/^0+/, '');

  if (!digits) {
    return { ok: false, errorCode: 'empty', errorMessage: 'Informe um número.', hint: 'Ex: (27) 99778-4501.' };
  }

  // BR shortcut: 10 or 11 digits without DDI → prepend 55
  if (!hasPlus && (digits.length === 10 || digits.length === 11)) {
    digits = '55' + digits;
  }

  if (digits.length < 8) {
    return { ok: false, errorCode: 'too_short', errorMessage: 'Número muito curto.', hint: 'Inclua DDI (ex: 55) + DDD (ex: 27) + número.' };
  }
  if (digits.length > 15) {
    return { ok: false, errorCode: 'too_long', errorMessage: 'Número muito longo.', hint: 'E.164 aceita no máximo 15 dígitos.' };
  }

  // Detect country code (1-3 digits). Prefer longest known match.
  let cc = '';
  for (const len of [3, 2, 1]) {
    const candidate = digits.slice(0, len);
    if (KNOWN_COUNTRY_CODES.has(candidate)) { cc = candidate; break; }
  }
  if (!cc) {
    return { ok: false, errorCode: 'missing_ddi', errorMessage: 'DDI não reconhecido.', hint: 'Inicie com o código do país. Ex: 55 (Brasil), 1 (EUA), 351 (Portugal).' };
  }

  const rest = digits.slice(cc.length);

  // Brazil-specific rules
  if (cc === '55') {
    if (rest.length < 10 || rest.length > 11) {
      return {
        ok: false,
        errorCode: 'invalid_br_mobile',
        errorMessage: 'Número brasileiro deve ter DDD + 8 ou 9 dígitos.',
        hint: 'Formato: 55 + DDD (2 dígitos) + número. Ex: 5527997784501.',
      };
    }
    const ddd = rest.slice(0, 2);
    if (!VALID_BR_DDDS.has(ddd)) {
      return { ok: false, errorCode: 'invalid_ddd', errorMessage: `DDD "${ddd}" não é válido no Brasil.`, hint: 'Confira o DDD da cidade/estado.' };
    }
    const local = rest.slice(2);
    const isMobile = local.length === 9;
    if (isMobile && !local.startsWith('9')) {
      return { ok: false, errorCode: 'invalid_br_mobile', errorMessage: 'Celular brasileiro deve começar com 9.', hint: `Ex: 55 ${ddd} 9XXXX-XXXX.` };
    }
    const formatted = isMobile
      ? `+55 ${ddd} ${local.slice(0, 5)}-${local.slice(5)}`
      : `+55 ${ddd} ${local.slice(0, 4)}-${local.slice(4)}`;
    return {
      ok: true,
      e164: digits,
      formatted,
      countryCode: '55',
      areaCode: ddd,
      local,
      isMobile,
    };
  }

  // Generic international
  if (rest.length < 6) {
    return { ok: false, errorCode: 'too_short', errorMessage: 'Número local muito curto para este DDI.', hint: 'Verifique se incluiu o DDD/área.' };
  }

  return {
    ok: true,
    e164: digits,
    formatted: `+${cc} ${rest}`,
    countryCode: cc,
    local: rest,
  };
}

export function normalizePhone(raw: string): string | null {
  const r = validatePhone(raw);
  return r.ok ? r.e164! : null;
}
