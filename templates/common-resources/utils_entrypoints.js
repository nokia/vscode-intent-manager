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

fwkUtils = load({script: resourceProvider.getResource('utils.js'), name: 'fwkUtils'});
utils = new fwkUtils();

var RuntimeException = Java.type('java.lang.RuntimeException');

/**
  * Validation of intent config/target that is automatically called for intent 
  * edit operations. This function is doing enhanced validation, in addition to
  * checks against the intent model (YANG).
  * If the intent config is identified invalid, the C/U/D operation will fail.
  * Execution happens before synchronize() to ensure intent is valid.
  *
  * @param {} input input provided by intent-engine
  **/

function validate(input) {
  var startTS = Date.now();

  var target     = input.getTarget();
  var config     = JSON.parse(input.getJsonIntentConfiguration())[0][intentContainer];
  
  logger.info(intentTypeName+":validate(" + target + ")");
  
  var contextualErrorJsonObj = {};
  getSites(target, config).forEach(function(site) {
    var neInfo = mds.getAllInfoFromDevices(site['ne-id']);
    
    if (neInfo === null || neInfo.size() === 0) {
      contextualErrorJsonObj["NODE "+site['ne-id']] = "Node not found";
    } else {
      var neFamilyTypeRelease = neInfo.get(0).getFamilyTypeRelease();
      if (neFamilyTypeRelease === null) {
        contextualErrorJsonObj["NODE "+site['ne-id']] = "Family/Type/Release unkown";
      } else {
        var neType = neFamilyTypeRelease.split(':')[0];
        var neVersion = neFamilyTypeRelease.split(':')[1];
        try {
          var templateName = getTemplateName(site['ne-id'], neType);
          var siteTemplate = resourceProvider.getResource(templateName);
        } catch (e) {
          contextualErrorJsonObj["NODE "+site['ne-id']] = "Device type unsupported! Template '"+templateName+"' not found!";
        }
      }
    }
  })

  var duration = Date.now()-startTS;
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
  var startTS = Date.now();

  var target     = input.getTarget();
  var config     = JSON.parse(input.getJsonIntentConfiguration())[0][intentContainer];
  var state      = input.getNetworkState().name();
  var topology   = input.getCurrentTopology();
  var syncResult = synchronizeResultFactory.createSynchronizeResult();
  
  logger.info(intentTypeName+":synchronize(" + target + ") in state " + state);
    
  var sites = [];
  var sitesConfigs = {};
  var sitesCleanups = {};
  var deploymentErrors = [];
  var yangPatchTemplate = resourceProvider.getResource("patch.ftl");

  // Recall nodal configuration elements from previous synchronize (for cleanup/housekeeping)
  if (topology && topology.getXtraInfo()!==null && !topology.getXtraInfo().isEmpty()) {
    topology.getXtraInfo().forEach(function(item) {
      if (item.getKey() === 'sitesCleanups') {
        sitesCleanups = JSON.parse(item.getValue());
        sitesConfigs  = JSON.parse(item.getValue()); // deep-clone of sitesCleanups
        logger.info("sitesCleanups restored: "+item.getValue());
      }
    })
  }
    
  if (state == "active")
    sites = getSites(target, config)

  // Iterate sites to populate siteConfigs per target device 
  sites.forEach(function(site) {
    var neId = site['ne-id'];
    var neInfo = mds.getAllInfoFromDevices(neId);
    var neFamilyTypeRelease = neInfo.get(0).getFamilyTypeRelease();
    var neType = neFamilyTypeRelease.split(':')[0];
    var neVersion = neFamilyTypeRelease.split(':')[1];
    
    var global = getGlobal(target, config)
    var siteTemplate = resourceProvider.getResource(getTemplateName(neId, neType));
    var objects = JSON.parse(utilityService.processTemplate(siteTemplate, {'target': target, 'site': site, 'global': global, 'neVersion': neVersion, 'mode': 'sync'}));

    if (!(neId in sitesConfigs))
      sitesConfigs[neId] = {};
    
    for (var objectName in objects) {
      if ("config" in objects[objectName]) {
        sitesConfigs[neId][objectName] = objects[objectName]['config'];
            
        // Convert 'value' object to JSON string as required as input for PATCH.ftl
        if (objects[objectName]['config']['value']) {
          let value = _resolveSynchronize(target, neId, '/'+objects[objectName]['config']['target'], objects[objectName]['config']['value']);
          sitesConfigs[neId][objectName]['value'] = JSON.stringify(value);
        }
      }
    }
  })
  
  // Deploy changes to target devices and update topology objects and xtra-data
  if ((state == "active") || (state == 'delete')) {
    var topologyObjects = [];
    for (neId in sitesConfigs) {
      var body = utilityService.processTemplate(yangPatchTemplate, {'patchId': target, 'patchItems': sitesConfigs[neId]});
      
      result = utils.restconfPatchDevice(neId, body);
      
      if (result.success) {
        // RESTCONF YANG PATCH was successful
        //  - objects that have been added/updated are added to the new topology
        //  - objects that have been added/updated are added to siteCleanups (extraData) to enable housekeeping
        
        sitesCleanups[neId] = {};
        for (objectName in sitesConfigs[neId]) {
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
          for (objectName in sitesCleanups[neId]) {
            topologyObjects.push(topologyFactory.createTopologyObjectFrom(objectName, sitesCleanups[neId][objectName]['target'], "INFRASTRUCTURE", neId));
          }
        }
      }
      
      if (topology === null)
        topology = topologyFactory.createServiceTopology();

      var xtrainfo = topologyFactory.createTopologyXtraInfoFrom("sitesCleanups", JSON.stringify(sitesCleanups));

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
  
  var duration = Date.now()-startTS;
  logger.info(intentTypeName+":synchronize(" + target + ") finished within "+duration+" ms");

  return syncResult;      
}

/**
  * Internal wrapper for mediator operation /resolve-synchronize for nsp23.11
  * implementation of approved misalignments.
  *
  * @param {string} target     Intent target
  * @param {string} neId       Device identifier
  * @param {string} rootXPath  Root XPATH of configuration
  * @param {Object} config     Desired configuration
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
  
    if (resolveResponse.success) {
        logger.info("resolved config report: " + JSON.stringify(resolveResponse.response));
        return resolveResponse.response;
    } else {
      throw new RuntimeException("Resolve Synchronize failed with "+resolveResponse.errmsg);      
    }
}

/**
  * Internal helper for nsp23.11 implementation of approved misalignments
  * Removes approved attributes/objects from audit-report.
  *
  * @param {auditFactor.AuditReport} unresolvedAuditReport Audit report before applying approvals
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
};

/**
  * Function to audit intents. Renders the desired configuration (same
  * as synchronize) and retrieves the actual configuration from MDC.
  * Compares actual against desired configuration to produce the AuditReport.
  * 
  * @param {} input input provided by intent-engine
  **/

function audit(input) {  
  var startTS = Date.now();
  
  var target     = input.getTarget();
  var config     = JSON.parse(input.getJsonIntentConfiguration())[0][intentContainer];
  var state      = input.getNetworkState().name();
  var topology   = input.getCurrentTopology();
  var auditReport = auditFactory.createAuditReport(intentTypeName, target);

  logger.info(intentTypeName+":audit(" + target + ") in state " + state);
  
  if (state=='active') {
    var sites = getSites(target, config);
      
    // iterate sites to populate config
    sites.forEach(function(site) {
      var neId = site['ne-id'];
      var neInfo = mds.getAllInfoFromDevices(neId);
      var neFamilyTypeRelease = neInfo.get(0).getFamilyTypeRelease();
      var neType = neFamilyTypeRelease.split(':')[0];
      var neVersion = neFamilyTypeRelease.split(':')[1];

      var global = getGlobal(target, config)
      var siteTemplate = resourceProvider.getResource(getTemplateName(neId, neType));
      var objects = JSON.parse(utilityService.processTemplate(siteTemplate, {'target': target, 'site': site, 'global': global, 'neVersion': neVersion, 'mode': 'audit'}));

      for (var objectName in objects) {
        if ("config" in objects[objectName]) {
          result = utils.restconfGetDevice(neId, objects[objectName]['config']['target']+"?content=config");
          if (result.success) {
            var aCfg = result.response;
            var iCfg = objects[objectName]['config']['value'];
            for (key in iCfg) {
              iCfg = iCfg[key];
              break;
            }
            
            for (key in aCfg) {
              aCfg = aCfg[key];
              if (Array.isArray(aCfg) && (aCfg.length > 0))
                aCfg = aCfg[0];
              break;
            }
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
              rcError = result.response['ietf-restconf:errors']['error'][0];
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
          for (var path in objects[objectName]['health']) {
            iState = objects[objectName]['health'][path];
            result = utils.restconfGetDevice(neId, path);
            if (result.success) {
              aState = result.response;
              for (key in aState) {
                aState = aState[key];
                if (Array.isArray(aState))
                  aState = aState[0]
                break;
              }
              utils.audit_state(neId, aState, iState, auditReport, '/'+path);
              // utils.audit_state(neId, aState, iState, auditReport, objectName);
            } else {
              if ('errmsg' in result) {
                logger.error("RESTCONF GET failed with error:\n" + result.errmsg);
                throw new RuntimeException("RESTCONF GET failed with " + result.errmsg);
              } else {
                rcError = result.response['ietf-restconf:errors']['error'][0];
                
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
    })
  }

  var duration = Date.now()-startTS;
  logger.info(intentTypeName+":audit(" + target + ") finished within "+duration+" ms");
    
  return _resolveAudit(auditReport);
};

/**
  * Function to compute/retrieve read-only state-attributes.
  * 
  * @param {} input input provided by intent-engine
  **/

function getStateAttributes(input) {
  /**
    * Entrypoint to update state attributes
    *
    **/    
  var startTS = Date.now();

  var target     = input.getTarget();
  var config     = JSON.parse(input.getJsonIntentConfiguration())[0][intentContainer];
  var state      = input.getNetworkState().name();
  var topology   = input.getCurrentTopology();

  logger.info(intentTypeName+":getStateAttributes(" + target + ") in state " + state);
  
  if (state == "active")
    sites = getSites(target, config)  

  // Iterate sites to get indiciators
  var indicators = {};  
  sites.forEach(function(site) {
    var neId = site['ne-id'];
    var neInfo = mds.getAllInfoFromDevices(neId);
    var neFamilyTypeRelease = neInfo.get(0).getFamilyTypeRelease();
    var neType = neFamilyTypeRelease.split(':')[0];
    var neVersion = neFamilyTypeRelease.split(':')[1];
  
    var global = getGlobal(target, config)
    var siteTemplate = resourceProvider.getResource(getTemplateName(neId, neType));
    var objects = JSON.parse(utilityService.processTemplate(siteTemplate, {'target': target, 'site': site, 'global': global, 'neVersion': neVersion, 'mode': 'state'}));
    
    for (var objectName in objects) {
      if ("indicators" in objects[objectName]) {
        for (var uri in objects[objectName]['indicators']) {
          iState = objects[objectName]['indicators'][uri];
          result = utils.restconfGetDevice(neId, uri);
          
          if (result.success) {
            var response = result.response;
            for (key in response) {
              response = response[key];
              if (Array.isArray(response))
                response = response[0]
              break;
            }
            
            for (var indicator in objects[objectName]['indicators'][uri]) {
              var value = utils.jsonPath(response, objects[objectName]['indicators'][uri][indicator]['path']);
              if (value && (value.length > 0)) {
                if (!(indicator in indicators))
                  indicators[indicator] = {}
                indicators[indicator][neId] = value[0];
              }
            }
          }
        }
      }
    }
  })
  
  if (indicators)
    logger.info('collected indicators: '+JSON.stringify(indicators));
    
  var state = getState(target, config, topology);
  var template = resourceProvider.getResource("state.ftl");
  var rvalue = utilityService.processTemplate(template, {'state': state, 'indicators': indicators});
  
  var duration = Date.now()-startTS;
  logger.info(intentTypeName+":getStateAttributes(" + target + ") finished within "+duration+" ms\n"+rvalue);

  return rvalue;
};