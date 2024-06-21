/********************************************************************************
 * 
 * SCRIPT TO SIMPLIFY USAGE OF RESOURCE ADMIN
 * (c) 2024 by Nokia
 *
 * THIS INTENT-TYPE IS FOR RESEARCH/STUDY ONLY!
 * WARNING!!! DON'T MODIFY!!!
 * 
 * Check README.MD for details!
 * 
 ********************************************************************************/

/* global RuntimeException, utils, logger  */
/* eslint no-undef: "error" */

(function fwkResources() {
  /**
    * Get reserved subnet from Resource Admin
    * 
    * @param {} pool IP pool to be used
    * @param {} scope IP pool to be used
    * @param {} target reference for reservation
    * @returns subnet as string, for example 10.0.0.0/31 (or empty string in error cases)
    * 
    **/

  this.getSubnet = function(pool, scope, target) {    
    const input = {
      "xpath-filter":
        "/nsp-resource-pool:resource-pools/ip-resource-pools[name='"+pool+"' and scope='"+scope+"']/consumed-resources[reference='"+target+"']"
    };
    const result = utils.restconfNspRpc("nsp-inventory:find", input);
    
    if (!result.success)
      throw new RuntimeException("Find subnet failed with "+result.errmsg);

    if (result.response["nsp-inventory:output"]["total-count"]>0)      
      return result.response["nsp-inventory:output"]["data"][0]["value"];
    
    return "";
  };
  
  /**
    * Obtain subnet from Resource Admin
    *
    * @param {} pool IP pool to be used
    * @param {} scope IP pool to be used
    * @param {} purpose Purpose tag, for example 'network-link'
    * @param {} pfxlen Prefix-length for subnet
    * @param {} intentTypeName reference for reservation 
    * @param {} target reference for reservation 
    * @returns subnet as string, for example 10.0.0.0/31 (or empty string in error cases)
    * 
    * @throws {RuntimeException} obtain subnet failed
    * 
    **/

  this.obtainSubnet = function(pool, scope, purpose, pfxlen, intentTypeName, target) {    
    let input = {
      "xpath-filter":
        "/nsp-resource-pool:resource-pools/ip-resource-pools[name='"+pool+"' and scope='"+scope+"']/consumed-resources[reference='"+target+"']"
    };
    let result = utils.restconfNspRpc("nsp-inventory:find", input);
    
    if (!result.success)
      throw new RuntimeException("Find subnet failed with "+result.errmsg);

    if (result.response["nsp-inventory:output"]["total-count"]>0)      
      return result.response["nsp-inventory:output"]["data"][0]["value"];
    
    const resource = "nsp-resource-pool:resource-pools/ip-resource-pools="+pool+","+scope+"/obtain-value-from-pool";
    input = {
      "owner": "restconf/data/ibn:ibn/intent=" + target + "," + intentTypeName,
      "confirmed": true,
      "all-or-nothing": true,
      "reference": target,
      "total-number-of-resources": 1,
      "allocation-mask": pfxlen,
      "purpose": purpose
    };
    result = utils.restconfNspAction(resource, input);
    
    if (!result.success)
      throw new RuntimeException("Obtain subnet failed with "+result.errmsg);
    
    return result['response']["nsp-resource-pool:output"]["consumed-resources"][0][0]["value"];
  };

  /**
    * Release subnet from Resource Admin
    *
    * @param {} pool IP pool to be used
    * @param {} scope IP pool to be used
    * @param {} target reference for reservation 
    * 
    **/
  
  this.releaseSubnet = function(pool, scope, target) {
    const resource = "nsp-resource-pool:resource-pools/ip-resource-pools="+pool+","+scope+"/release-by-ref";
    const input = {"reference": target};
    
    const result = utils.restconfNspAction(resource, input);
    
    if (!result.success)
      logger.error("releaseSubnet(" + target + ") failed with error:\n" + result.errmsg);
  };

  /**
    * Get reserved number from Resource Admin
    * 
    * @param {} pool numeric pool to be used
    * @param {} scope numeric pool to be used
    * @param {} target reference for reservation
    * @returns number as string
    * 
    **/
    
  this.getId = function(pool, scope, target) {  
    const input = {
      "xpath-filter":
        "/nsp-resource-pool:resource-pools/numeric-resource-pools[name='"+pool+"' and scope='"+scope+"']/num-consumed-resources[reference='"+target+"']"
    };
    const result = utils.restconfNspRpc("nsp-inventory:find", input);
    
    if (!result.success)
      throw new RuntimeException("Find id failed with "+result.errmsg);

    if (result.response["nsp-inventory:output"]["total-count"]>0)      
      return result.response["nsp-inventory:output"]["data"][0]["value"];
    
    return "";
  };

  /**
    * Obtain a number from Resource Admin
    *
    * @param {} pool numeric pool to be used
    * @param {} scope numeric pool to be used
    * @param {} intentTypeName reference for reservation 
    * @param {} target reference for reservation 
    * @returns number as string
    * 
    * @throws {RuntimeException} obtain number failed
    * 
    **/
  
  this.obtainId = function(pool, scope, intentTypeName, target) {
    let input = {
      "xpath-filter":
        "/nsp-resource-pool:resource-pools/numeric-resource-pools[name='"+pool+"' and scope='"+scope+"']/num-consumed-resources[reference='"+target+"']"
    };
    let result = utils.restconfNspRpc("nsp-inventory:find", input);
    
    if (!result.success)
      throw new RuntimeException("Find id failed with "+result.errmsg);

    if (result.response["nsp-inventory:output"]["total-count"]>0)      
      return result.response["nsp-inventory:output"]["data"][0]["value"];
    
    const resource = "nsp-resource-pool:resource-pools/numeric-resource-pools="+pool+","+scope+"/obtain-value-from-pool";
    input = {
        "owner": "restconf/data/ibn:ibn/intent=" + target + "," + intentTypeName,
        "confirmed": true,
        "all-or-nothing": true,
        "reference": target,
        "total-number-of-resources": 1
    };
    result = utils.restconfNspAction(resource, input);
    
    if (!result.success)
      throw new RuntimeException("Obtain subnet failed with "+result.errmsg);
    
    return result['response']["nsp-resource-pool:output"]["num-consumed-resources"][0]["value"];
  };

  /**
    * Release number from Resource Admin
    *
    * @param {} pool numeric pool to be used
    * @param {} scope numeric pool to be used
    * @param {} target reference for reservation 
    * 
    **/
  
  this.releaseId = function(pool, scope, target) {    
    const resource = "nsp-resource-pool:resource-pools/numeric-resource-pools="+pool+","+scope+"/release-by-ref";
    const input = {"reference": target};
    
    const result = utils.restconfNspAction(resource, input);
    
    if (!result.success)
      logger.error("releaseSubnet(" + target + ") failed with error:\n" + result.errmsg);
  };
});