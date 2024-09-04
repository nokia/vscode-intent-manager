/********************************************************************************
 * INTENT-TYPE BLUEPRINT
 *   use-case: base device configuration (day1)
 * 
 * (c) 2024 by Nokia
 ********************************************************************************/

/* global classResolver, logger, resourceProvider */
/* eslint no-undef: "error" */

import { IntentLogic }   from 'common/IntentLogic.mjs';
import { IntentHandler } from 'common/IntentHandler.mjs';

let HashMap = classResolver.resolveClass('java.util.HashMap');

const iso2_to_idd = {
  'AF': 93, 'AL': 355, 'DZ': 213, 'AS': 1, 'AD': 376, 'AO': 244, 'AI': 1,
  'AG': 1, 'AR': 54, 'AM': 374, 'AW': 297, 'AU': 61, 'AT': 43, 'AZ': 994,
  'BS': 1, 'BH': 973, 'BD': 880, 'BB': 1, 'BY': 375, 'BE': 32, 'BZ': 501,
  'BJ': 229, 'BM': 1, 'BT': 975, 'BO': 591, 'BA': 387, 'BW': 267, 'BR': 55,
  'IO': 246, 'VG': 1, 'BN': 673, 'BG': 359, 'BF': 226, 'BI': 257, 'KH': 855,
  'CM': 237, 'CA': 1, 'CV': 238, 'KY': 1, 'CF': 236, 'TD': 235, 'CL': 56,
  'CN': 86, 'CO': 57, 'KM': 269, 'CK': 682, 'CR': 506, 'HR': 385, 'CU': 53,
  'CW': 599, 'CY': 357, 'CZ': 420, 'CD': 243, 'DK': 45, 'DJ': 253, 'DM': 1,
  'DO': 1, 'TL': 670, 'EC': 593, 'EG': 20, 'SV': 503, 'GQ': 240, 'ER': 291,
  'EE': 372, 'ET': 251, 'FK': 500, 'FO': 298, 'FJ': 679, 'FI': 358, 'FR': 33,
  'PF': 689, 'GA': 241, 'GM': 220, 'GE': 995, 'DE': 49, 'GH': 233, 'GI': 350,
  'GR': 30, 'GL': 299, 'GD': 1, 'GU': 1, 'GT': 502, 'GN': 224, 'GW': 245,
  'GY': 592, 'HT': 509, 'HN': 504, 'HK': 852, 'HU': 36, 'IS': 354, 'IN': 91,
  'ID': 62, 'IR': 98, 'IQ': 964, 'IE': 353, 'IL': 972, 'IT': 39, 'JM': 1,
  'JP': 81, 'JO': 962, 'KZ': 7, 'KE': 254, 'KI': 686, 'KP': 850, 'KR': 82,
  'KW': 965, 'KG': 996, 'LA': 856, 'LV': 371, 'LB': 961, 'LS': 266, 'LR': 231,
  'LY': 218, 'LI': 423, 'LT': 370, 'LU': 352, 'MO': 853, 'MK': 389, 'MG': 261,
  'MW': 265, 'MY': 60, 'MV': 960, 'ML': 223, 'MT': 356, 'MH': 692, 'MR': 222,
  'MU': 230, 'YT': 262, 'MX': 52, 'FM': 691, 'MD': 373, 'MC': 377, 'MN': 976,
  'ME': 382, 'MS': 1, 'MA': 212, 'MZ': 258, 'MM': 95, 'NA': 264, 'NR': 674,
  'NP': 977, 'NL': 31, 'NC': 687, 'NZ': 64, 'NI': 505, 'NE': 227, 'NG': 234,
  'NU': 683, 'NF': 672, 'MP': 1, 'NO': 47, 'OM': 968, 'PK': 92, 'PW': 680,
  'PA': 507, 'PG': 675, 'PY': 595, 'PE': 51, 'PH': 63, 'PL': 48, 'PT': 351,
  'PR': 1, 'QA': 974, 'CG': 242, 'RO': 40, 'RU': 7, 'RW': 250, 'SH': 290,
  'KN': 1, 'LC': 1, 'PM': 508, 'VC': 1, 'WS': 685, 'SM': 378, 'ST': 239,
  'SA': 966, 'SN': 221, 'RS': 381, 'SC': 248, 'SL': 232, 'SG': 65, 'SX': 1,
  'SK': 421, 'SI': 386, 'SB': 677, 'SO': 252, 'ZA': 27, 'SS': 211, 'ES': 34,
  'LK': 94, 'SD': 249, 'SR': 597, 'SZ': 268, 'SE': 46, 'CH': 41, 'SY': 963,
  'TW': 886, 'TJ': 992, 'TZ': 255, 'TH': 66, 'TG': 228, 'TK': 690, 'TO': 676,
  'TT': 1, 'TN': 216, 'TR': 90, 'TM': 993, 'TC': 1, 'TV': 688, 'UG': 256,
  'UA': 380, 'AE': 971, 'GB': 44, 'US': 1, 'UY': 598, 'UZ': 998, 'VU': 678,
  'VA': 39, 'VE': 58, 'VN': 84, 'WF': 681, 'EH': 212, 'YE': 967, 'ZM': 260,
  'ZW': 263
};

class DeviceConfig extends (IntentLogic) {
  static INTENT_TYPE = '{{ intent_type }}';
  static INTENT_ROOT = '{{ intent_type }}:{{ intent_type }}';
  
  static validate(target, config, contextualErrorJsonObj) {
    const countryCodeFromISO2 = iso2_to_idd[config.location.ccode].toString();

    if (target.indexOf(':') >= 0) {
      if (/^10\d\d::cafe:\d+$/.test(target)) {
        const countryCodeFromNEID = target.split(':')[0].substring(2);
        if (countryCodeFromISO2 !== countryCodeFromNEID)
          contextualErrorJsonObj['country code mismatch'] = 'system IPv6 address must follow the pattern 10{country-code}::cafe:{node-id}';
      } else contextualErrorJsonObj['bad ne-id'] = 'system IPv6 address must follow the pattern 10{country-code}::cafe:{node-id}';
    } else {
      if (/^10\.\d+\.0\.\d+$/.test(target)) {
        const countryCodeFromNEID = target.split('.')[1];
        if (countryCodeFromISO2 !== countryCodeFromNEID)
          contextualErrorJsonObj['country code mismatch'] = 'system IPv4 address must follow the pattern 10.{country-code}.0.{node-id}';
      } else contextualErrorJsonObj['bad ne-id'] = 'system IPv4 address must follow the pattern 10.{country-code}.0.{node-id}';
    }
  }

  static getSiteParameters(target, config, siteNames) {
    let sites = [config];
  
    sites[0]['ne-id'] = target;
    sites[0]['ne-name'] = siteNames[target];
    sites[0]['countryCode'] = iso2_to_idd[config.location.ccode];

    if (target.indexOf(':') > 0)
      sites[0]['nodeId'] = parseInt(target.split(':')[3]); // extract nodeId from IPv6 address '10{country-code}::cafe:{node-id}'
    else
      sites[0]['nodeId'] = parseInt(target.split('.')[3]); // extract nodeId from IPv4 address '10.{country-code}.0.{node-id}'
  
    logger.info('site information: '+JSON.stringify(sites[0], null, '  '));    
    return sites;
  }
}

/**
 * Customize IntentHandler by adding getCities()
 * callout for viewConfig to pick city from list.
 * Avoids to enter geo-coordinates and country
 */

class CustomIntentHandler extends (IntentHandler) {
  constructor(intentLogic) {
    super(intentLogic);
  }

  getCities(context) {
    const data = JSON.parse(resourceProvider.getResource('cities.json'));

    const cities = new HashMap();
    data.forEach(city => cities.put(city, city));

    return cities;
  }
}

new CustomIntentHandler(DeviceConfig);