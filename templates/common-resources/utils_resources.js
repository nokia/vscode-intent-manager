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

fwkUtils = load({script: resourceProvider.getResource('utils.js'), name: 'fwkUtils'});
utils = new fwkUtils();

(function fwkResources() {
  this.getSubnet = function(pool, scope, target) {
    /**
      * Get reserved subnet from Resource Admin
      *
      * input:
      *   pool   - IP pool to be used
      *   scope  - IP pool to be used
      *   target - reference for reservation
      *
      * return(success)
      *   subnet as string, for example 10.0.0.0/31
      *
      * return(error)
      *   empty string ""
      *
      **/
    
    var input = {
      "xpath-filter":
        "/nsp-resource-pool:resource-pools/ip-resource-pools[name='"+pool+"' and scope='"+scope+"']/consumed-resources[reference='"+target+"']"
    };
    result = utils.restconfNspRpc("nsp-inventory:find", input);
    
    if (!result.success)
      throw new RuntimeException("Find subnet failed with "+result.errmsg);

    if (result.response["nsp-inventory:output"]["total-count"]>0)      
      return result.response["nsp-inventory:output"]["data"][0]["value"];
    
    return "";
  }
  
  this.obtainSubnet = function(pool, scope, purpose, pfxlen, intentTypeName, target) {
    /**
      * Obtain subnet from Resource Admin
      *
      * input:
      *   pool           - IP pool to be used
      *   scope          - IP pool to be used
      *   purpose        - Purpose tag, for example 'network-link'
      *   pfxlen         - Prefix-length for subnet
      *   intentTypeName - reference for reservation 
      *   target         - reference for reservation
      *
      * return(success)
      *   subnet as string, for example 10.0.0.0/31
      *
      * throws exception on error
      *
      **/
    
    var input = {
      "xpath-filter":
        "/nsp-resource-pool:resource-pools/ip-resource-pools[name='"+pool+"' and scope='"+scope+"']/consumed-resources[reference='"+target+"']"
    };
    result = utils.restconfNspRpc("nsp-inventory:find", input);
    
    if (!result.success)
      throw new RuntimeException("Find subnet failed with "+result.errmsg);

    if (result.response["nsp-inventory:output"]["total-count"]>0)      
      return result.response["nsp-inventory:output"]["data"][0]["value"];
    
    var resource = "nsp-resource-pool:resource-pools/ip-resource-pools="+pool+","+scope+"/obtain-value-from-pool";
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
  }
  
  this.releaseSubnet = function(pool, scope, target) {
    /**
      * Release subnet from Resource Admin
      *
      * input:
      *   pool   - IP pool to be used
      *   scope  - IP pool to be used
      *   target - reference for reservation
      *
      **/
    
    var resource = "nsp-resource-pool:resource-pools/ip-resource-pools="+pool+","+scope+"/release-by-ref";
    var input = {"reference": target};
    
    var result = utils.restconfNspAction(resource, input);
    
    if (!result.success)
      logger.error("releaseSubnet(" + target + ") failed with error:\n" + result.errmsg);
  }

  
  
  this.getId = function(pool, scope, target) {
    /**
      * Get reserved number from Resource Admin
      *
      * input:
      *   pool   - numeric pool to be used
      *   scope  - numeric pool to be used
      *   target - reference for reservation
      *
      * return(success)
      *   number as string
      *
      * return(error)
      *   empty string ""
      *
      **/
    
    var input = {
      "xpath-filter":
        "/nsp-resource-pool:resource-pools/numeric-resource-pools[name='"+pool+"' and scope='"+scope+"']/num-consumed-resources[reference='"+target+"']"
    };
    result = utils.restconfNspRpc("nsp-inventory:find", input);
    
    if (!result.success)
      throw new RuntimeException("Find id failed with "+result.errmsg);

    if (result.response["nsp-inventory:output"]["total-count"]>0)      
      return result.response["nsp-inventory:output"]["data"][0]["value"];
    
    return "";
  }
  
  this.obtainId = function(pool, scope, intentTypeName, target) {
    /**
      * Obtain number from Resource Admin
      *
      * input:
      *   pool           - numeric pool to be used
      *   scope          - numeric pool to be used
      *   pfxlen         - Prefix-length for subnet
      *   intentTypeName - reference for reservation 
      *   target         - reference for reservation
      *
      * return(success)
      *   number as string
      *
      * throws exception on error
      *
      **/
    
    var input = {
      "xpath-filter":
        "/nsp-resource-pool:resource-pools/numeric-resource-pools[name='"+pool+"' and scope='"+scope+"']/num-consumed-resources[reference='"+target+"']"
    };
    result = utils.restconfNspRpc("nsp-inventory:find", input);
    
    if (!result.success)
      throw new RuntimeException("Find id failed with "+result.errmsg);

    if (result.response["nsp-inventory:output"]["total-count"]>0)      
      return result.response["nsp-inventory:output"]["data"][0]["value"];
    
    var resource = "nsp-resource-pool:resource-pools/numeric-resource-pools="+pool+","+scope+"/obtain-value-from-pool";
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
  }
  
  this.releaseId = function(pool, scope, target) {
    /**
      * Release number from Resource Admin
      *
      * input:
      *   pool   - numeric pool to be used
      *   scope  - numeric pool to be used
      *   target - reference for reservation
      *
      **/
    
    var resource = "nsp-resource-pool:resource-pools/numeric-resource-pools="+pool+","+scope+"/release-by-ref";
    var input = {"reference": target};
    
    var result = utils.restconfNspAction(resource, input);
    
    if (!result.success)
      logger.error("releaseSubnet(" + target + ") failed with error:\n" + result.errmsg);
  }
})
