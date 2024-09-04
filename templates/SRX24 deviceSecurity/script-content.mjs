/********************************************************************************
 * INTENT-TYPE BLUEPRINT
 *   use-case: baseline security (device-level: 7x50)
 * 
 * (c) 2024 by Nokia
 ********************************************************************************/

import { IntentLogic }   from 'common/IntentLogic.mjs';
import { IntentHandler } from 'common/IntentHandler.mjs';

class CustomLogic extends (IntentLogic) {
  static INTENT_TYPE = '{{ intent_type }}';
  static INTENT_ROOT = '{{ intent_type }}:{{ intent_type }}';  
}

new IntentHandler(CustomLogic);