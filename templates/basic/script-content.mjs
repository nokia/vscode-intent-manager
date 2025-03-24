/****************************************************************************
 * BASIC INTENT-TYPE
 * 
 * (c) 2025 by Nokia
 ****************************************************************************/

let ValidateResult = Java.type("com.nokia.fnms.controller.ibn.intenttype.spi.ValidateResult");
let SynchronizeResult = Java.type("com.nokia.fnms.controller.ibn.intenttype.spi.SynchronizeResult");
let AuditReport = Java.type("com.nokia.fnms.controller.ibn.intenttype.spi.AuditReport");
let MisAlignedObject = Java.type("com.nokia.fnms.controller.ibn.intenttype.spi.MisAlignedObject");
let MisAlignedAttribute = Java.type("com.nokia.fnms.controller.ibn.intenttype.spi.MisAlignedAttribute");

export class IntentHandler {
  /**
    * Method to deploy the intent to the network. It contains the backend code for the
    * synchronize operation used to create, update, delete and reconcile operations.
    * 
    * For house-keeping it is recommended to remember created objects
    * as part of topology/extra-data. This is to enable update and delete
    * operations to remove network objects that are no longer required.
    * 
    * @param {SynchronizeInput} input Used to access information about the intent to be synchronized
    * @returns {SynchronizeResult} provide information about the execution/success back to the engine
    **/

  async synchronize(input) {
    const state = input.getNetworkState().name();
    const target = input.getTarget();
    const startTS = Date.now();
    logger.debug(`IntentHandler::synchronize(${target}) in state ${state}`);

    const config = JSON.parse(input.getJsonIntentConfiguration())[0];
    logger.info("intent-cfg: " + JSON.stringify(config, null, "  "));

    const result = new SynchronizeResult();
    result.setSuccess(true);

    const duration = Date.now()-startTS;
    logger.debug("IntentHandler::synchronize() finished within {} ms", duration|0);
    
    return result;
  }

  /**
    * Execute intent audits by comparing desired vs actual configuration (and state).
    * 
    * @param {AuditInput} input used to access information about the intent to be audited
    * @returns {AuditReport} audit-report object containing the misaligned attributed and objects 
    **/

  async onAudit(input) {
    const state = input.getNetworkState().name();
    const target = input.getTarget();
    const startTS = Date.now();
    const intentType = input.getIntentType();
    const intentTypeVersion = input.getIntentTypeVersion();
    logger.debug(`IntentHandler::onAudit(${target}) in state ${state}`);

    // creating new AuditReport()
    const report = new AuditReport();
    report.setIntentType(intentType);
    report.setTarget(target);

    // misaligned attribute
    report.addMisAlignedAttribute(new MisAlignedAttribute("namespace:root/cfg/misaligned-attribute", "expected", "actual", target));

    // missing attribute
    report.addMisAlignedAttribute(new MisAlignedAttribute("namespace:root/cfg/missing-attribute", "expected", undefined, target));

    // undesired attribute
    report.addMisAlignedAttribute(new MisAlignedAttribute("namespace:root/cfg/undesired-attribute", undefined, "actual", target));

    // misaligned objects (is-configured=false, is-undesired=false)
    report.addMisAlignedObject(new MisAlignedObject("namespace:root/cfg/entry=missing1", false, target));

    // misaligned objects (is-configured=true,  is-undesired=false)
    report.addMisAlignedObject(new MisAlignedObject("namespace:root/cfg/entry=missing2", true, target));

    // misaligned objects (is-configured=false, is-undesired=true)
    report.addMisAlignedObject(new MisAlignedObject("namespace:root/cfg/entry=undesired1", false, target, true));

    // misaligned objects (is-configured=true, is-undesired=true)
    report.addMisAlignedObject(new MisAlignedObject("namespace:root/cfg/entry=undesired2", true, target, true));

    const duration = Date.now()-startTS;
    logger.debug("IntentHandler::onAudit() finished within {} ms", duration|0);

    return report;
  }

  /**
    * Validation of intent config/target that is automatically called for intent 
    * create/edit and state-change operations. This method may do enhanced
    * validation, in addition to checks against the intent model (YANG), that is
    * automatically executed by the intent engine.
    * 
    * If the intent config is identified invalid, the create/edit operation will
    * fail. Execution happens before synchronize() to ensure intent is valid.
    * 
    * @param {} input input provided by intent-engine
    * @returns {ValidateResult} *
    **/

  validate(input) {
    const state = input.getNetworkState().name();
    const target = input.getTarget();
    const startTS = Date.now();
    logger.debug(`IntentHandler::validate(${target}) in state ${state}`);
    
    const contextualErrorJsonObj = {};
    if (target === "error") {
      logger.error("Bad target!");
      contextualErrorJsonObj["BAD TARGET"] = "value error was provided";
    }

    if (target === "warning")
      logger.warn("Suspicious target!");

    const duration = Date.now()-startTS;
    logger.debug("IntentHandler::validate() finished within {} ms", duration|0);
   
    if (Object.keys(contextualErrorJsonObj).length !== 0)
      utilityService.throwContextErrorException(contextualErrorJsonObj);

    const validateResult = new ValidateResult();
    return validateResult;
  }
}

new IntentHandler();