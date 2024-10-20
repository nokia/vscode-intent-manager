/********************************************************************************
 *
 * SCRIPT TO IMPLEMENT IBN ENTRYPOINTS (VALIDATE, AUDIT, SYNC)
 * (c) 2024 by Nokia
 *
 * THIS INTENT-TYPE IS FOR RESEARCH/STUDY ONLY!
 * WARNING!!! DON'T MODIFY!!!
 * 
 * Check README.MD for details!
 *
 ********************************************************************************/

/* global load, resourceProvider, Java, logger, mds, utilityService  */
/* global synchronizeResultFactory, topologyFactory, auditFactory */
/* global intentTypeName, intentContainer */
/* global getSites, getGlobal, freeResources, getState, getTemplateName */
/* eslint no-undef: "error" */

const fwkUtils = load({script: resourceProvider.getResource('utils.js'),  name: 'fwkUtils'});
const utils = new fwkUtils();

const fwkResources = load({script: resourceProvider.getResource('utils_resources.js'),  name: 'fwkResources'});
const resourceAdmin = new fwkResources();

const StringUtils = Java.type('org.apache.commons.lang3.StringUtils');

const RuntimeException = Java.type('java.lang.RuntimeException');

/**
  * Validation of intent config/target that is automatically called for intent 
  * edit operations. This function is doing enhanced validation, in addition to
  * checks against the intent model (YANG).
  * If the intent config is identified invalid, the C/U/D operation will fail.
  * Execution happens before synchronize() to ensure intent is valid.
  *
  * @param {} input input provided by intent-engine
  * 
  * @throws {throwContextErrorException} Validation failed
  * 
  **/

function validate(input) {  
  const startTS = Date.now();

  const target  = input.getTarget();
  const config  = JSON.parse(input.getJsonIntentConfiguration())[0][intentContainer];
  
  logger.info(intentTypeName+":validate(" + target + ")");
  
  let contextualErrorJsonObj = {};
  getSites(target, config).forEach(function(site) {
    const neInfo = mds.getAllInfoFromDevices(site['ne-id']);
    
    if (neInfo === null || neInfo.size() === 0) {
      contextualErrorJsonObj["NODE "+site['ne-id']] = "Node not found";
    } else {
      const neFamilyTypeRelease = neInfo.get(0).getFamilyTypeRelease();
      if (neFamilyTypeRelease === null) {
        contextualErrorJsonObj["NODE "+site['ne-id']] = "Family/Type/Release unkown";
      } else {
        const neType = neFamilyTypeRelease.split(':')[0];
        const neVersion = neFamilyTypeRelease.split(':')[1];
        const templateName = getTemplateName(site['ne-id'], neType);
        try {
          resourceProvider.getResource(templateName);
        } catch (e) {
          contextualErrorJsonObj["NODE "+site['ne-id']] = "Device type unsupported! Template '"+templateName+"' not found!";
        }
      }
    }
  });

  const duration = Date.now()-startTS;
  logger.info(intentTypeName+":validate(" + target + ") finished within "+duration+" ms");

  if (Object.keys(contextualErrorJsonObj).length !== 0) {
    utilityService.throwContextErrorException(contextualErrorJsonObj);
  }
}

/**
  * Deployment of intents to the network, called for synchronize operations.
  * Used to apply create, update, delete and reconcile to managed devices.
  *
  * All objects created are remembered/restored as part of topology/extra-data
  * to enable update and delete operations removing network objects that are
  * no longer required (house-keeping).
  * 
  * In the deployment template (ftl) it's recommended to use operations "replace",
  * "merge", or "remove". The usage of "create" must be avoided, because it fails
  * if the network object already exists (use "replace" instead). The usage of
  * "delete" must be avoided, because it fails if the network object does not
  * exists (use "remove" instead).
  *
  * @param {} input input provided by intent-engine
  **/

function synchronize(input) {  
  const startTS = Date.now();
  const target  = input.getTarget();
  const config  = JSON.parse(input.getJsonIntentConfiguration())[0][intentContainer];
  const state   = input.getNetworkState().name();
 
  logger.info(intentTypeName+":synchronize(" + target + ") in state " + state);
 
  let topology   = input.getCurrentTopology();
  let syncResult = synchronizeResultFactory.createSynchronizeResult();
  
  let sitesConfigs = {};
  let sitesCleanups = {};
  let deploymentErrors = [];

  const yangPatchTemplate = resourceProvider.getResource("patch.ftl");

  // Recall nodal configuration elements from previous synchronize (for cleanup/housekeeping)
  if (topology && topology.getXtraInfo()!==null && !topology.getXtraInfo().isEmpty()) {
    topology.getXtraInfo().forEach(function(item) {
      if (item.getKey() === 'sitesCleanups') {
        sitesCleanups = JSON.parse(item.getValue());
        sitesConfigs  = JSON.parse(item.getValue()); // deep-clone of sitesCleanups
        logger.info("sitesCleanups restored: "+item.getValue());
      }
    });
  }

  // Iterate sites to populate/update sitesConfigs per target device
  if (state == "active")
    getSites(target, config).forEach(function(site) {
      const neId = site['ne-id'];
      const neInfo = mds.getAllInfoFromDevices(neId);
      const neFamilyTypeRelease = neInfo.get(0).getFamilyTypeRelease();
      const neType = neFamilyTypeRelease.split(':')[0];
      const neVersion = neFamilyTypeRelease.split(':')[1];

      if (!(neId in sitesConfigs))
        sitesConfigs[neId] = {};
      
      const global = getGlobal(target, config);
      const siteTemplate = resourceProvider.getResource(getTemplateName(neId, neType));
      const objects = JSON.parse(utilityService.processTemplate(siteTemplate, {'target': target, 'site': site, 'global': global, 'neVersion': neVersion, 'mode': 'sync'}));
        
      for (const objectName in objects) {
        if ("config" in objects[objectName]) {
          sitesConfigs[neId][objectName] = objects[objectName]['config'];
              
          // Convert 'value' object to JSON string as required as input for PATCH.ftl
          if (objects[objectName]['config']['value']) {
            let value = _resolveSynchronize(target, neId, '/'+objects[objectName]['config']['target'], objects[objectName]['config']['value']);
            sitesConfigs[neId][objectName]['value'] = JSON.stringify(value);
          }
        }
      }
    });
  
  // Deploy changes to target devices and update topology objects and xtra-data
  if ((state === "active") || (state === 'delete')) {
    let topologyObjects = [];
    for (const neId in sitesConfigs) {
      const body = utilityService.processTemplate(yangPatchTemplate, {'patchId': target, 'patchItems': sitesConfigs[neId]});
      
      let result = utils.restconfPatchDevice(neId, body);
      
      if (result.success) {
        // RESTCONF YANG PATCH was successful
        //  - objects that have been added/updated are added to the new topology
        //  - objects that have been added/updated are added to siteCleanups (extraData) to enable housekeeping
        
        sitesCleanups[neId] = {};
        for (const objectName in sitesConfigs[neId]) {
          if (sitesConfigs[neId][objectName]["operation"]==="replace") {
            // For operation "replace" remember how to clean-up the object created (house-keeping).
            // For cleanup we are using operation "remove", to avoid the operation from failing,
            // if the corresponding device configuration was deleted from the network already.
            
            sitesCleanups[neId][objectName] = {'target': sitesConfigs[neId][objectName]['target'], 'operation': 'remove'};
            topologyObjects.push(topologyFactory.createTopologyObjectFrom(objectName, sitesConfigs[neId][objectName]['target'], "INFRASTRUCTURE", neId));
          }

          // NOTE:
          //   Operations "merge", and "remove" will not be reverted back!
          //   Operations "create", and "delete" should not be used (not reverted back either)!
        }
        
        if (Object.keys(sitesCleanups[neId]).length === 0)
          delete sitesCleanups[neId];
        
      } else {
        logger.error("Deployment on "+neId+" failed with error:\n"+result.errmsg);
        deploymentErrors.push(result.errmsg);
        
        // RESTCONF YANG PATCH failed
        //  - Keep siteCleanups (extraData) for this site to enable housekeeping
        //  - Generate topology from siteCleanup (same content as it was before)
        
        if (neId in sitesCleanups) {
          for (const objectName in sitesCleanups[neId]) {
            topologyObjects.push(topologyFactory.createTopologyObjectFrom(objectName, sitesCleanups[neId][objectName]['target'], "INFRASTRUCTURE", neId));
          }
        }
      }
      
      if (topology === null)
        topology = topologyFactory.createServiceTopology();

      let xtrainfo = topologyFactory.createTopologyXtraInfoFrom("sitesCleanups", JSON.stringify(sitesCleanups));

      topology.setXtraInfo([xtrainfo]);
      topology.setTopologyObjects(topologyObjects);
    }
  }

  syncResult.setTopology(topology);
  
  if (deploymentErrors.length > 0) {
    syncResult.setSuccess(false);
    syncResult.setErrorCode("500");
    syncResult.setErrorDetail(deploymentErrors.toString());    
  } else {
    syncResult.setSuccess(true);
    if (state == 'delete')
      freeResources(target, config);
  }
  
  const duration = Date.now()-startTS;
  logger.info(intentTypeName+":synchronize(" + target + ") finished within "+duration+" ms");

  return syncResult;      
}

/**
  * Wrapper for /resolve-synchronize implemented in mediator (nsp23.11/nsp24.4)
  * Merging sync payload with device config to keep approved misalignments untouched
  *
  * @param {string} target     Intent target
  * @param {string} neId       Device identifier
  * @param {string} rootXPath  Root XPATH of configuration
  * @param {Object} config     Desired configuration
  * 
  * @throws {RuntimeException} /resolve-synchronize failed
  * 
  **/

function _resolveSynchronize(target, neId, rootXPath, config) {
    logger.info("resolving config for intent-type: {}, target: {}, device-name: {}, root-xpath: {}, config: {}",
    intentTypeName, target, neId, rootXPath, JSON.stringify(config));
    const unresolvedConfig = {
        "intent-type": intentTypeName,
        "target": target,
        "device-name": neId,
        "root-xpath": rootXPath,
        "intent-configuration": config
    };

    // Call the mediator to resolve config
    const resolveResponse = utils.fwkAction("/resolve-synchronize", unresolvedConfig);
  
    if (!resolveResponse.success)
      throw new RuntimeException("Resolve Synchronize failed with "+resolveResponse.errmsg);      

    logger.info("resolved config report: " + JSON.stringify(resolveResponse.response));
    return resolveResponse.response;
}

/**
  * Wrapper for /resolve-audit implemented in mediator (nsp23.11/nsp24.4)
  * Removes approved attributes/objects from audit-report
  *
  * @param {auditFactor.AuditReport} unresolvedAuditReport Audit report before applying approvals
  * 
  * @throws {RuntimeException} /resolve-audit failed
  * 
  **/

function _resolveAudit(unresolvedAuditReport) {
    // Convert audit report from java to JSON
    const unresolvedAuditReportJson = {
        "target": unresolvedAuditReport.getTarget(),
        "intent-type": unresolvedAuditReport.getIntentType()
    };

    // Handle misaligned attributes if any
    if (unresolvedAuditReport.getMisAlignedAttributes()) {
        unresolvedAuditReportJson["misaligned-attribute"] = [];
        // For each misAlignedAttribute convert to json
        unresolvedAuditReport.getMisAlignedAttributes().forEach(function (misAlignedAttribute) {
            const misAlignedAttributeJson = {
                "name": misAlignedAttribute.getName(),
                "device-name": misAlignedAttribute.getDeviceName(),
                "expected-value": misAlignedAttribute.getExpectedValue(),
                "actual-value": misAlignedAttribute.getActualValue(),
            };
            unresolvedAuditReportJson["misaligned-attribute"].push(misAlignedAttributeJson);
        });
    }

    // Handle misaligned objects if any
    if (unresolvedAuditReport.getMisAlignedObjects()) {
        unresolvedAuditReportJson["misaligned-object"] = [];
        // For each misaligned object convert to json
        unresolvedAuditReport.getMisAlignedObjects().forEach(function (misAlignedObject) {
            const misAlignedObjectJson = {
                "object-id": misAlignedObject.getObjectId(),
                "device-name": misAlignedObject.getDeviceName(),
                "is-configured": misAlignedObject.isConfigured(),
                "is-undesired": misAlignedObject.isUndesired()
            };
            unresolvedAuditReportJson["misaligned-object"].push(misAlignedObjectJson);
        });
    }

    logger.info("unresolved audit report: {}", JSON.stringify(unresolvedAuditReportJson));

    // Create a new audit report to send back
    const resolvedAuditReport = auditFactory.createAuditReport(unresolvedAuditReport.getIntentType(), unresolvedAuditReport.getTarget());

    // Call the mediator to resolve audit report
    let resolveResponse = utils.fwkAction("/resolve-audit", unresolvedAuditReportJson);

    if (resolveResponse.success) {
        logger.info("resolved audit report: " + JSON.stringify(resolveResponse.response));
        const resolvedAuditReportJson = resolveResponse.response;
        for (let i = 0; i < resolvedAuditReportJson["misaligned-attribute"].length; i++) {
            const attributeData = resolvedAuditReportJson["misaligned-attribute"][i];
            const misalignedAttribute = auditFactory.createMisAlignedAttribute(
                attributeData.name, attributeData["expected-value"], attributeData["actual-value"], attributeData["device-name"]);
            resolvedAuditReport.addMisAlignedAttribute(misalignedAttribute);
        }

        for (let i = 0; i < resolvedAuditReportJson["misaligned-object"].length; i++) {
            let misalignedObjectAttribute = resolvedAuditReportJson["misaligned-object"][i];
            let misalignedObject = auditFactory.createMisAlignedObject(
                misalignedObjectAttribute["object-id"], misalignedObjectAttribute["is-configured"], misalignedObjectAttribute["device-name"], misalignedObjectAttribute["is-undesired"]);
            resolvedAuditReport.addMisAlignedObject(misalignedObject);
        }
    } else {
      throw new RuntimeException("Resolve Audit failed with "+resolveResponse.errmsg);
    }

    return resolvedAuditReport;
}

/**
  * Function to audit intents. Renders the desired configuration (same
  * as synchronize) and retrieves the actual configuration from MDC.
  * Compares actual against desired configuration to produce the AuditReport.
  * 
  * @param {} input input provided by intent-engine
  * 
  * @throws {RuntimeException} config/state retrieval failed
  * 
  **/

function audit(input) {  
  const startTS = Date.now();
  
  const target    = input.getTarget();
  const config    = JSON.parse(input.getJsonIntentConfiguration())[0][intentContainer];
  const state     = input.getNetworkState().name();
  let auditReport = auditFactory.createAuditReport(intentTypeName, target);

  logger.info(intentTypeName+":audit(" + target + ") in state " + state);
  
  if (state=='active') {
    // iterate sites to populate config:
    getSites(target, config).forEach(function(site) {
      const neId = site['ne-id'];
      const neInfo = mds.getAllInfoFromDevices(neId);
      const neFamilyTypeRelease = neInfo.get(0).getFamilyTypeRelease();
      const neType = neFamilyTypeRelease.split(':')[0];
      const neVersion = neFamilyTypeRelease.split(':')[1];

      const global = getGlobal(target, config);
      const siteTemplate = resourceProvider.getResource(getTemplateName(neId, neType));
      const objects = JSON.parse(utilityService.processTemplate(siteTemplate, {'target': target, 'site': site, 'global': global, 'neVersion': neVersion, 'mode': 'audit'}));

      for (const objectName in objects) {
        if ("config" in objects[objectName]) {
          const result = utils.restconfGetDevice(neId, objects[objectName]['config']['target']+"?content=config");
          if (result.success) {
            let iCfg = objects[objectName]['config']['value'];
            for (const key in iCfg) {
              iCfg = iCfg[key];
              break;
            }
            
            let aCfg = result.response;
            for (const key in aCfg) {
              aCfg = aCfg[key];
              break;
            }

            if (Array.isArray(aCfg) && (aCfg.length > 0))
              aCfg = aCfg[0];

            if (Array.isArray(aCfg))
              auditReport.addMisAlignedObject(auditFactory.createMisAlignedObject(objects[objectName]['config']['target'], false, neId));              
            else
              utils.audit(neId, objects[objectName]['config']['target'], aCfg, iCfg, objects[objectName]['config']['operation'], objects[objectName]['config']['ignoreChildren'], auditReport, neId, '');
              // utils.audit(neId, objects[objectName]['config']['target'], aCfg, iCfg, objects[objectName]['config']['operation'], objects[objectName]['config']['ignoreChildren'], auditReport, objectName, '');
              
          } else {
            if ('errmsg' in result) {
              logger.error("RESTCONF GET failed with error:\n" + result.errmsg);
              throw new RuntimeException("RESTCONF GET failed with " + result.errmsg);
            } else {
              const rcError = result.response['ietf-restconf:errors']['error'][0];
              if (rcError['error-tag'] === "invalid-value") {
                // get failed, because path is not configured
                auditReport.addMisAlignedObject(auditFactory.createMisAlignedObject(objects[objectName]['config']['target'], false, neId));          
              } else {
                throw new RuntimeException("RESTCONF GET failed with " + rcError['error-message']);
              }
            }
          }
        }
        
        if ("health" in objects[objectName]) {
          for (const path in objects[objectName]['health']) {
            const iState = objects[objectName]['health'][path];
            const result = utils.restconfGetDevice(neId, path);
            if (result.success) {
              let aState = result.response;
              for (const key in aState) {
                aState = aState[key];
                break;
              }
              if (Array.isArray(aState))
                aState = aState[0];

              utils.audit_state(neId, aState, iState, auditReport, '/'+path);
              // utils.audit_state(neId, aState, iState, auditReport, objectName);
            } else {
              if ('errmsg' in result) {
                logger.error("RESTCONF GET failed with error:\n" + result.errmsg);
                throw new RuntimeException("RESTCONF GET failed with " + result.errmsg);
              } else {
                const rcError = result.response['ietf-restconf:errors']['error'][0];
                
                if (rcError['error-tag'] === "invalid-value") {
                  // get failed, because path is not available
                  //auditReport.addMisAlignedObject(auditFactory.createMisAlignedObject(path, false, neId));
                  utils.audit_state(neId, {}, iState, auditReport, '/'+path);
                  // utils.audit_state(neId, {}, iState, auditReport, objectName);

                } else {
                  throw new RuntimeException("RESTCONF GET failed with " + rcError['error-message']);
                }
              }
            }
          }
        }
      }
    });
  }

  const resolvedAuditReport =  _resolveAudit(auditReport);

  const duration = Date.now()-startTS;
  logger.info(intentTypeName+":audit(" + target + ") finished within "+duration+" ms");
    
  return resolvedAuditReport;
}

/**
  * Function to compute/retrieve read-only state-attributes.
  * 
  * @param {} input input provided by intent-engine
  **/

function getStateAttributes(input) {
  const startTS = Date.now();

  const target   = input.getTarget();
  const config   = JSON.parse(input.getJsonIntentConfiguration())[0][intentContainer];
  const state    = input.getNetworkState().name();
  let topology   = input.getCurrentTopology();
  let rvalue     = "";

  logger.info(intentTypeName+":getStateAttributes(" + target + ") in state " + state);
  
  if (state == "active") {
    let indicators = {};

    // Iterate sites to get indiciators
    getSites(target, config).forEach(function(site) {
      const neId = site['ne-id'];
      const neInfo = mds.getAllInfoFromDevices(neId);
      const neFamilyTypeRelease = neInfo.get(0).getFamilyTypeRelease();
      const neType = neFamilyTypeRelease.split(':')[0];
      const neVersion = neFamilyTypeRelease.split(':')[1];
    
      const global = getGlobal(target, config);
      const siteTemplate = resourceProvider.getResource(getTemplateName(neId, neType));
      const objects = JSON.parse(utilityService.processTemplate(siteTemplate, {'target': target, 'site': site, 'global': global, 'neVersion': neVersion, 'mode': 'state'}));
      
      for (const objectName in objects) {
        if ("indicators" in objects[objectName]) {
          for (const uri in objects[objectName]['indicators']) {
            const result = utils.restconfGetDevice(neId, uri);
            
            if (result.success) {
              let response = result.response;
              for (const key in response) {
                response = response[key];
                break;
              }
              if (Array.isArray(response))
                response = response[0];

              for (const indicator in objects[objectName]['indicators'][uri]) {
                const value = utils.jsonPath(response, objects[objectName]['indicators'][uri][indicator]['path']);
                if (value && (value.length > 0)) {
                  if (!(indicator in indicators))
                    indicators[indicator] = {};
                  indicators[indicator][neId] = value[0];
                }
              }
            }
          }
        }
      }
    });

    if (indicators)
      logger.info('collected indicators: '+JSON.stringify(indicators));
    
    const state = getState(target, config, topology);
    const template = resourceProvider.getResource("state.ftl");
    rvalue = utilityService.processTemplate(template, {'state': state, 'indicators': indicators});
  }
  
  const duration = Date.now()-startTS;
  logger.info(intentTypeName+":getStateAttributes(" + target + ") finished within "+duration+" ms\n"+rvalue);

  return rvalue;
}