/********************************************************************************
 * 
 * WRAPPER TO SIMPLIFY USAGE OF RESOURCE ADMINISTRATOR
 * (c) 2024 by Nokia
 *
 ********************************************************************************/

/* global classResolver, Java */
/* global mds, logger, restClient, resourceProvider, utilityService */
/* eslint no-undef: "error" */

let RuntimeException = classResolver.resolveClass("java.lang.RuntimeException");

export class ResourceAdmin {
  /**
    * Executes nsp-inventory:find operation
    * 
    * @param {string} xpath Search criteria (object selector)
    * @returns success {boolean}, errmsg {string}, response {object}
    *
    **/

  static #nspFindEntry(xpath) {
    const startTS = Date.now();
    logger.debug("ResourceAdmin::#nspFindEntry({})", xpath);
    
    var result = {};
    var managerInfo = mds.getManagerByName('NSP');
    if (managerInfo.getConnectivityState().toString() === 'CONNECTED') {
      var url = "https://restconf-gateway/restconf/operations/nsp-inventory:find";
      var body = JSON.stringify({"input": {"xpath-filter": xpath}});

      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol().toString());

      restClient.post(url, "application/json", body, "application/json", (exception, httpStatus, response) => {
        const duration = Date.now()-startTS;
        logger.debug("POST {} {} finished within {} ms", url, body, duration|0);

        if (exception) {
          logger.error("Exception {} occured.", exception);
          result = { success: false, response: {}, errmsg: "Exception "+exception+" occured."};
        }
        else if (httpStatus >= 400) {
          // Either client error (4xx) or server error (5xx)
          logger.warn("NSP response: {} {}", httpStatus, response);
          result = { success: false, response: {}, errmsg: response};
        }
        else {
          logger.debug("NSP response: {} {}", httpStatus, response);
          const output = JSON.parse(response)["nsp-inventory:output"];
          const total = output["total-count"];

          if (total === 0) {
            logger.debug("Resource not found");
            result = { success: true, response: {} };
          }
          else if (total > 1) {
            logger.warn("Query xpath={} returned multiple resources! Only returning first entry found!", xpath);
            result = { success: true, response: output.data[0] };
          } else {
            result = { success: true, response: output.data[0] };
          }
        }          
      });
    } else
      result = { success: false, response: {}, errmsg: "NSP mediator is disconnected." };

    const duration = Date.now()-startTS;
    logger.debug("ResourceAdmin::#nspFindEntry({}) finished within {} ms", xpath, duration|0);
  
    return result;
  }

  /**
    * Executes NSP RESTCONF action
    * 
    * @param {} resource model-path string of the parent resource to execute the action
    * @param {} input dictionary of input variables (action specific)
    * @returns success {boolean} and errmsg {string}
    * 
    **/

  static #restconfNspAction(resource, input) {
    const startTS = Date.now();
    logger.debug("ResourceAdmin::#restconfNspAction({})", resource);

    let result = {};
    const managerInfo = mds.getManagerByName('NSP');
    if (managerInfo.getConnectivityState().toString() === 'CONNECTED') {
      const url = "https://restconf-gateway/restconf/data/"+resource;
      const body = JSON.stringify({"input": input});
  
      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol().toString());

      restClient.post(url, "application/json", body, "application/json", (exception, httpStatus, response) => {
        const duration = Date.now()-startTS;
        logger.debug("POST {} {} finished within {} ms", url, body, duration|0);
        
        if (exception) {
          logger.error("Exception {} occured.", exception);
          result = { success: false, response: {}, errmsg: "Exception "+exception+" occured."};
        }
        else if (httpStatus >= 400) {
          // Either client error (4xx) or server error (5xx)
          logger.warn("NSP response: {} {}", httpStatus, response);
          result = { success: false, response: {}, errmsg: response};
        }
        else {
          logger.debug("NSP response: {} {}", httpStatus, response);
          result = { success: true, response: JSON.parse(response) };
        }
      });
    } else
      result = { success: false, errmsg: "NSP mediator is disconnected." };
    
    const duration = Date.now()-startTS;
    logger.debug("ResourceAdmin::#restconfNspAction() finished within {} ms", duration|0);

    return result;
  }

  /**
    * Get reserved subnet from Resource Admin
    * 
    * @param {} pool IP pool to be used
    * @param {} scope IP pool to be used
    * @param {} target reference for reservation
    * @returns subnet as string, for example 10.0.0.0/31 (or empty string in error cases)
    * 
    **/

  static getSubnet(pool, scope, target) {
    const startTS = Date.now();
    logger.info("ResourceAdmin::getSubnet(pool={}, scope={}, target={})", pool, scope, target);

    const result = this.#nspFindEntry("/nsp-resource-pool:resource-pools/ip-resource-pools[name='"+pool+"' and scope='"+scope+"']/consumed-resources[reference='"+target+"']");
    
    if (!result.success)
      throw new RuntimeException("Find subnet failed with "+result.errmsg);

    let subnet = "";
    if ('value' in result.response) {
      subnet = result.response.value;
      logger.info("subnet: {}", subnet );
    } else {
      logger.info("subnet: to be reserved/obtained");
    }

    const duration = Date.now()-startTS;
    logger.info("ResourceAdmin::getSubnet(pool={}, scope={}, target={}) finished within {} ms", pool, scope, target, duration|0);

    return subnet;
  }
  
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

  static obtainSubnet(pool, scope, purpose, pfxlen, intentTypeName, target) {
    const startTS = Date.now();
    logger.info("ResourceAdmin::obtainSubnet(pool={}, scope={}, target={})", pool, scope, target);

    const result = this.#nspFindEntry("/nsp-resource-pool:resource-pools/ip-resource-pools[name='"+pool+"' and scope='"+scope+"']/consumed-resources[reference='"+target+"']");
    
    if (!result.success)
      throw new RuntimeException("Find subnet failed with "+result.errmsg);

    let subnet = "";
    if ('value' in result.response) {
      subnet = result.response.value;
      logger.info("subnet: {} (existing entry)", subnet );
    } else {
      const resource = "nsp-resource-pool:resource-pools/ip-resource-pools="+pool+","+scope+"/obtain-value-from-pool";
      const input = {
        "owner": "restconf/data/ibn:ibn/intent=" + target + "," + intentTypeName,
        "confirmed": true,
        "all-or-nothing": true,
        "reference": target,
        "total-number-of-resources": 1,
        "allocation-mask": pfxlen,
        "purpose": purpose
      };
      const result = this.#restconfNspAction(resource, input);
      
      if (!result.success)
        throw new RuntimeException("Obtain subnet failed with "+result.errmsg);

      subnet = result.response["nsp-resource-pool:output"]["consumed-resources"][0][0].value;
      logger.info("subnet: {} (new entry)", subnet );
    }

    const duration = Date.now()-startTS;
    logger.info("ResourceAdmin::obtainSubnet(pool={}, scope={}, target={}) finished within {} ms", pool, scope, target, duration|0);

    return subnet;
  }

  /**
    * Release subnet from Resource Admin
    *
    * @param {} pool IP pool to be used
    * @param {} scope IP pool to be used
    * @param {} target reference for reservation 
    * 
    **/
  
  static releaseSubnet(pool, scope, target) {
    const startTS = Date.now();
    logger.info("ResourceAdmin::releaseSubnet(pool={}, scope={}, target={})", pool, scope, target);

    const resource = "nsp-resource-pool:resource-pools/ip-resource-pools="+pool+","+scope+"/release-by-ref";
    const input = {"reference": target};
    
    const result = this.#restconfNspAction(resource, input);
    
    if (!result.success)
      logger.error("releaseSubnet(" + target + ") failed with error:\n" + result.errmsg);

    const duration = Date.now()-startTS;
    logger.info("ResourceAdmin::releaseSubnet(pool={}, scope={}, target={}) finished within {} ms", pool, scope, target, duration|0);
  }

  /**
    * Get reserved number from Resource Admin
    * 
    * @param {} pool numeric pool to be used
    * @param {} scope numeric pool to be used
    * @param {} target reference for reservation
    * @returns number as string
    * 
    **/
    
  static getId(pool, scope, target) {
    const startTS = Date.now();
    logger.info("ResourceAdmin::getId(pool={}, scope={}, target={})", pool, scope, target);

    const result = this.#nspFindEntry( "/nsp-resource-pool:resource-pools/numeric-resource-pools[name='"+pool+"' and scope='"+scope+"']/num-consumed-resources[reference='"+target+"']");
    
    if (!result.success)
      throw new RuntimeException("Find id failed with "+result.errmsg);

    let id = "";
    if ('value' in result.response) {
      id = result.response.value;
      logger.info("id: {}", id );
    } else {
      logger.info("id: to be reserved/obtained");
    }    

    const duration = Date.now()-startTS;
    logger.info("ResourceAdmin::getId(pool={}, scope={}, target={}) finished within {} ms", pool, scope, target, duration|0);

    return id;
  }

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
  
  static obtainId(pool, scope, intentTypeName, target) {
    const startTS = Date.now();
    logger.info("ResourceAdmin::obtainId(pool={}, scope={}, target={})", pool, scope, target);

    const result = this.#nspFindEntry("/nsp-resource-pool:resource-pools/numeric-resource-pools[name='"+pool+"' and scope='"+scope+"']/num-consumed-resources[reference='"+target+"']");
    
    if (!result.success)
      throw new RuntimeException("Find id failed with "+result.errmsg);

    let id = "";
    if ('value' in result.response) {
      id = result.response.value;
      logger.info("id: {} (existing entry)", id);
    } else {
      const resource = "nsp-resource-pool:resource-pools/numeric-resource-pools="+pool+","+scope+"/obtain-value-from-pool";
      const input = {
        "owner": "restconf/data/ibn:ibn/intent=" + target + "," + intentTypeName,
        "confirmed": true,
        "all-or-nothing": true,
        "reference": target,
        "total-number-of-resources": 1
      };
      const result = this.#restconfNspAction(resource, input);
      
      if (!result.success)
        throw new RuntimeException("Obtain id failed with "+result.errmsg);

      id = result.response["nsp-resource-pool:output"]["num-consumed-resources"][0].value;
      logger.info("id: {} (new entry)", id );
    }

    const duration = Date.now()-startTS;
    logger.info("ResourceAdmin::obtainId(pool={}, scope={}, target={}) finished within {} ms", pool, scope, target, duration|0);

    return id;    
  }

  /**
    * Release number from Resource Admin
    *
    * @param {} pool numeric pool to be used
    * @param {} scope numeric pool to be used
    * @param {} target reference for reservation 
    * 
    **/
  
  static releaseId(pool, scope, target) {    
    const startTS = Date.now();
    logger.info("ResourceAdmin::releaseId(pool={}, scope={}, target={})", pool, scope, target);

    const resource = "nsp-resource-pool:resource-pools/numeric-resource-pools="+pool+","+scope+"/release-by-ref";
    const input = {"reference": target};
    
    const result = this.#restconfNspAction(resource, input);
    
    if (!result.success)
      logger.error("releaseId(" + target + ") failed with error:\n" + result.errmsg);

    const duration = Date.now()-startTS;
    logger.info("ResourceAdmin::releaseId(pool={}, scope={}, target={}) finished within {} ms", pool, scope, target, duration|0);
  }
}