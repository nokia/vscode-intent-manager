/********************************************************************************
 * 
 * SCRIPT TO IMPLEMENT COMMON UTILITIES/HELPERS
 * (c) 2024 by Nokia
 *
 * THIS INTENT-TYPE IS FOR RESEARCH/STUDY ONLY!
 * WARNING!!! DON'T MODIFY!!!
 * 
 * Check README.MD for details!
 * 
 ********************************************************************************/

/* global mds, restClient, logger, auditFactory */
/* global RuntimeException */
/* eslint no-undef: "error" */

(function fwkUtils()
{
  /**
    * Executes NSP RESTCONF action
    * 
    * @param {} resource model-path string of the parent resource to execute the action
    * @param {} input dictionary of input variables (action specific)
    * @returns success {boolean} and errmsg {string}
    * 
    **/

  this.restconfNspAction = function(resource, input) {
    const startTS = Date.now();
    logger.info("restconfNspAction("+resource+")");

    const baseURL = "https://restconf-gateway/restconf/data/";
    const body = JSON.stringify({"input": input});

    let result = {};
    const managerInfo = mds.getManagerByName('NSP');
    if (managerInfo.getConnectivityState().toString() === 'CONNECTED') {
      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol());
      restClient.post(baseURL+resource, "application/json", body, "application/json", function(exception, httpStatus, response) {
        if (exception)
          result = { success: false, errmsg: "Couldn't connect to NSP mediator. Exception "+exception+" occured." };
        else if (httpStatus == 200 || httpStatus == 201)
          result = { success: true, response: JSON.parse(response) };
        else
          result = { success: false, errmsg: response };
      });
    } else
      result = { success: false, errmsg: "NSP mediator is disconnected." };
    
    const duration = Date.now()-startTS;
    logger.info("restconfNspAction() finished within "+duration+ "ms");

    return result;
  };

  /**
    * Executes framework action, implemented by the mediator
    * 
    * @param {} action mediator framework action to be called
    * @param {} input dictionary of input variables (action specific)
    * @returns success {boolean} and errmsg {string}
    * 
    **/
  
  this.fwkAction = function(action, input)
  {
    const startTS = Date.now();
    logger.info("fwkAction("+action+")");
    
    let result = {};
    const managerInfo = mds.getManagerByName('NSP');
    if (managerInfo.getConnectivityState().toString() === 'CONNECTED') {
      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol());
      restClient.post(action, "application/json", JSON.stringify(input), "application/json", function(exception, httpStatus, response) {
        if (exception)
          result = { success: false, errmsg: "Couldn't connect to NSP mediator. Exception "+exception+" occured." };
        else if (httpStatus == 200 || httpStatus == 201)
          result = { success: true, response: JSON.parse(response) };
        else
          result = { success: false, errmsg: response };
      });
    } else
      result = { success: false, errmsg: "NSP mediator is disconnected." };

    const duration = Date.now()-startTS;
    logger.info("fwkAction() finished within "+duration+ "ms");

    return result;
  };
  
  /**
    * Executes NSP RESTCONF RPC
    * 
    * @param {} operation RPC operation to be executed
    * @param {} input dictionary of input variables (RPC specific)
    * @returns success {boolean} and errmsg {string}
    * 
    **/  

  this.restconfNspRpc = function(operation, input)
  {
    const startTS = Date.now();
    logger.info("restconfNspRpc("+operation+")");

    const baseURL = "https://restconf-gateway/restconf/operations/";
    const body = JSON.stringify({"input": input});

    let result = {};
    const managerInfo = mds.getManagerByName('NSP');
    if (managerInfo.getConnectivityState().toString() === 'CONNECTED') {
      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol());
      restClient.post(baseURL+operation, "application/json", body, "application/json", function(exception, httpStatus, response) {
        if (exception)
          result = { success: false, errmsg: "Couldn't connect to NSP mediator. Exception "+exception+" occured." };
        else if (httpStatus == 200 || httpStatus == 201)
          result = { success: true, response: JSON.parse(response) };
        else
          result = { success: false, errmsg: response };
      });
    } else
      result = { success: false, errmsg: "NSP mediator is disconnected." };

    const duration = Date.now()-startTS;
    logger.info("restconfNspRpc() finished within "+duration+ "ms");

    return result;
  };
  
  /**
    * Executes NSP RESTCONF GET against MDC-managed nodes
    * 
    * @param {} neId target device
    * @param {} path requested subtree/attribute
    * @returns success {boolean} and errmsg {string}
    * 
    **/
  
  this.restconfGetDevice = function(neId, path) {
    const startTS = Date.now();
    logger.info("restconfGetDevice(\"" + neId + "\", \"" + path + "\")");

    const baseURL = "/restconf/data/network-device-mgr:network-devices/network-device="+neId+"/root/";

    let result = {};
    const managerInfo = mds.getAllManagersWithDevice(neId).get(0);
    if (managerInfo.getConnectivityState().toString() === 'CONNECTED') {
      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol());
      restClient.get(baseURL+path, "application/json", function(exception, httpStatus, response) {
        if (exception)
          result = { success: false, errmsg: "Couldn't connect to mediator. Exception "+exception+" occured." };
        else if (httpStatus == 200 || httpStatus == 201)
          result = { success: true, response: JSON.parse(response) };
        else
          result = { success: false, response: JSON.parse(response) };
      });
    } else
      result = { success: false, errmsg: "Mediator for "+neId+" is disconnected." };

    const duration = Date.now()-startTS;
    logger.info("restconfGetDevice() finished within "+duration+ "ms");

    return result;
  };

  /**
    * Executes NSP RESTCONF PATCH against MDC-managed nodes
    * 
    * @param {} neId target device
    * @param {} body SON string (rfc8072 YANG PATCH compliant)
    * @returns success {boolean} and errmsg {string}
    * 
    **/

  this.restconfPatchDevice = function(neId, body) {
    const startTS = Date.now();
    logger.info("restconfPatchDevice(\"" + neId + "\", \"" + body + "\")");

    const baseURL = "/restconf/data/network-device-mgr:network-devices/network-device="+neId+"/root/";
    
    let result = {};
    const managerInfo = mds.getAllManagersWithDevice(neId).get(0);
    if (managerInfo.getConnectivityState().toString() === 'CONNECTED') {
      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol());
      restClient.patch(baseURL, "application/yang-patch+json", body, "application/json", function(exception, httpStatus, response) {
        if (exception)
          result = { success: false, errmsg: "Couldn't connect to mediator. Exception "+exception+" occured." };
        else if (httpStatus == 200 || httpStatus == 201)
          result = { success: true };
        else {
          logger.error("RESTCONF PATCH failed with httpStatus(" + httpStatus + ") and respone:\n" + response);
          
          let errmsg = "";
          const patchStatus = JSON.parse(response)['ietf-yang-patch:yang-patch-status'];
          
          if ('edit-status' in patchStatus) {
            const rcError = patchStatus['edit-status']['edit'];
          
            rcError.forEach( function(rcEditError) {
              errmsg += "\n"+rcEditError['edit-id']+":\n";
              rcEditError['ietf-restconf:errors']['error'].forEach( function(errorDetails) {
                errmsg += "\t" + errorDetails['error-tag'] + " path(" + errorDetails['error-path'] + ") details(" + errorDetails['error-message'] + ")\n";
              });    
            });
          } else {
            errmsg += "\n[site:"+neId+"] rfc8072 global-errors occurred:\n";
            patchStatus['ietf-restconf:errors']['error'].forEach( function(errorDetails) {
                errmsg += "\t" + errorDetails['error-message'] + "\n";
            });
          }
                          
          result = { success: false, response: response, errmsg: errmsg };
        }
      });
    } else
    result = { success: false, errmsg: "Mediator for "+neId+" is disconnected." };

    const duration = Date.now()-startTS;
    logger.info("restconfPatchDevice() finished within "+duration+ "ms");

    return result;
  };

  /**
   * Retrieve device details from NSP model
   *
   * @param {} neId device
   * 
   **/
  
  this.getDeviceDetails = function(neId) {
    const input = {"depth": 3, "xpath-filter": "/nsp-equipment:network/network-element[ne-id='"+neId+"']", 'include-meta': false};
    const result = this.restconfNspRpc("nsp-inventory:find", input);
    
    if (!result.success)
      return {};

    if (result.response["nsp-inventory:output"]["data"].length === 0)
      return {};
        
    return this.serialize(result.response["nsp-inventory:output"]["data"][0]);
  };

  /**
    * Get list-keys from YANG model for MDC-managed nodes
    *
    * @param {} neId device
    * @param {} listPath  path of list to get the keys
    * @returns listKeys[]
    *
    **/
  
  this.restconfGetListKeys = function(neId, listPath) {
    const startTS = Date.now();
    logger.info("restconfGetListKeys(\"" + neId + "\", \"" + listPath + "\")");

    const baseURL = "https://restconf-gateway/restconf/meta/api/v1/model/schema/"+neId+"/";
    const url = baseURL + listPath.replace(/=[^=/]+\//g, "/");
  
    let result = {};
    const managerInfo = mds.getManagerByName('NSP');
    if (managerInfo.getConnectivityState().toString() === 'CONNECTED') {
      restClient.setIp(managerInfo.getIp());
      restClient.setPort(managerInfo.getPort());
      restClient.setProtocol(managerInfo.getProtocol());
      restClient.get(url, "application/json", function(exception, httpStatus, response) {
        if (exception)
          result = { success: false, errmsg: "Couldn't connect to mediator. Exception "+exception+" occured." };
        else if (httpStatus == 200)
          result = { success: true, response: JSON.parse(response) };
        else if (httpStatus == 201)
          result = { success: false, errmsg: "Returned httpStatus(201): No response" };
        else
          result = { success: false, errmsg: response };
      });
    } else
      result = { success: false, errmsg: "NSP mediator is disconnected." };
    
    let listKeys = [];
    if (result["success"]) {
      const attr = result["response"]["attributes"];
      for(let i = 0; i < attr.length; i++) {
        if(attr[i]["isKey"] !== undefined) {
          listKeys.push(attr[i]["name"]);
        }
      }
    } else
      logger.error("restconfGetListKeys() failed with error:\n" + result["errmsg"]);
    
    const duration = Date.now()-startTS;
    logger.info("restconfGetListKeys() finished within "+duration+ "ms");

    return listKeys;
  };

  /**
    * Flattens an inventory response and removes @ annotations
    *
    * @param {} obj object to be converted
    * @returns flattened object
    *
    **/
  
  this.serialize = function(obj) {    
    let result = {};

    function flatten(obj) {
      for (const key in obj) {
        if (key !== '@') {
          if (typeof obj[key]==='object')
            flatten(obj[key]);
          else
            result[key] = obj[key];
        }
      }
    }

    flatten(obj, "");
    return result;
  };
  
  /**
    * JSONPath 0.8.4 - XPath for JSON
    * available from https://code.google.com/archive/p/jsonpath/
    *
    * Copyright (c) 2007 Stefan Goessner (goessner.net)
    * Licensed under the MIT (MIT-LICENSE.txt) licence.
    * 
    * @throws SyntaxError
    *
    **/

  this.jsonPath = function(obj, expr, arg) {
    var P = {
      resultType: arg && arg.resultType || "VALUE",
      result: [],
      normalize: function(expr) {
         var subx = [];
         return expr.replace(/[['](\??\(.*?\))[\]']|\['(.*?)'\]/g, function($0,$1,$2){return "[#"+(subx.push($1||$2)-1)+"]";})  /* http://code.google.com/p/jsonpath/issues/detail?id=4 */
                    .replace(/'?\.'?|\['?/g, ";")
                    .replace(/;;;|;;/g, ";..;")
                    .replace(/;$|'?\]|'$/g, "")
                    .replace(/#([0-9]+)/g, function($0,$1){return subx[$1];});
      },
      asPath: function(path) {
         var x = path.split(";"), p = "$";
         for (var i=1,n=x.length; i<n; i++)
            p += /^[0-9*]+$/.test(x[i]) ? ("["+x[i]+"]") : ("['"+x[i]+"']");
         return p;
      },
      store: function(p, v) {
         if (p) P.result[P.result.length] = P.resultType == "PATH" ? P.asPath(p) : v;
         return !!p;
      },
      trace: function(expr, val, path) {
         if (expr !== "") {
            var x = expr.split(";"), loc = x.shift();
            x = x.join(";");
            if (val && Object.prototype.hasOwnProperty.call(val, loc))
               P.trace(x, val[loc], path + ";" + loc);
            else if (loc === "*")
               P.walk(loc, x, val, path, function(m,l,x,v,p) { P.trace(m+";"+x,v,p); });
            else if (loc === "..") {
               P.trace(x, val, path);
               P.walk(loc, x, val, path, function(m,l,x,v,p) { typeof v[m] === "object" && P.trace("..;"+x,v[m],p+";"+m); });
            }
            else if (/^\(.*?\)$/.test(loc)) // [(expr)]
               P.trace(P.eval(loc, val, path.substr(path.lastIndexOf(";")+1))+";"+x, val, path);
            else if (/^\?\(.*?\)$/.test(loc)) // [?(expr)]
               P.walk(loc, x, val, path, function(m,l,x,v,p) { if (P.eval(l.replace(/^\?\((.*?)\)$/,"$1"), v instanceof Array ? v[m] : v, m)) P.trace(m+";"+x,v,p); }); // issue 5 resolved
            else if (/^(-?[0-9]*):(-?[0-9]*):?([0-9]*)$/.test(loc)) // [start:end:step]  phyton slice syntax
               P.slice(loc, x, val, path);
            else if (/,/.test(loc)) { // [name1,name2,...]
               for (var s=loc.split(/'?,'?/),i=0,n=s.length; i<n; i++)
                  P.trace(s[i]+";"+x, val, path);
            }
         }
         else
            P.store(path, val);
      },
      walk: function(loc, expr, val, path, f) {
         if (val instanceof Array) {
            for (var i=0,n=val.length; i<n; i++)
               if (i in val)
                  f(i,loc,expr,val,path);
         }
         else if (typeof val === "object") {
            for (var m in val)
              if (Object.prototype.hasOwnProperty.call(val, m))
                  f(m,loc,expr,val,path);
         }
      },
      slice: function(loc, expr, val, path) {
         if (val instanceof Array) {
            var len=val.length, start=0, end=len, step=1;
            loc.replace(/^(-?[0-9]*):(-?[0-9]*):?(-?[0-9]*)$/g, function($0,$1,$2,$3){start=parseInt($1||start);end=parseInt($2||end);step=parseInt($3||step);});
            start = (start < 0) ? Math.max(0,start+len) : Math.min(len,start);
            end   = (end < 0)   ? Math.max(0,end+len)   : Math.min(len,end);
            for (var i=start; i<end; i+=step)
               P.trace(i+";"+expr, val, path);
         }
      },
      eval: function(x, _v, _vname) {
         try { return $ && _v && eval(x.replace(/@/g, "_v")); }
         catch(e) { throw new SyntaxError("jsonPath: " + e.message + ": " + x.replace(/@/g, "_v").replace(/\^/g, "_a")); }
      }
    };

    var $ = obj;
    if (expr && obj && (P.resultType == "VALUE" || P.resultType == "PATH")) {
       P.trace(P.normalize(expr).replace(/^\$;?/,""), obj, "$");  // issue 6 resolved
       return P.result.length ? P.result : false;
    }
  };
  
  /**
    * Helper to convert list of dict to dict
    * Note: Needed for key-aware array compare
    *
    * @param {} list array of dicts
    * @param {} keys keys for the underlying YANG list
    *
    **/

  this.groupBy = function(list, keys) {
    return list.reduce(
      function(rdict, entry) {
        let value = keys.map(function(key) {return encodeURIComponent(entry[key]);}).join(",");
        rdict[value] = entry;
        return rdict; 
      }, {}
    );
  };

  /**
    * Helper to run audits to compare intented vs actual config
    *
    * @param {} list ne-id, required for fetching model info
    * @param {} basePath target root path of the object under audit
    * @param {} aCfg actual config (object)
    * @param {} iCfg intended config (object)
    * @param {} mode operation: create, replace, merge, delete
    * @param {} ignore list of children subtree to ignore
    * @param {} auditReport used to report differences
    * @param {} obj object reference used for report
    * @param {} path used to build up relative path (recursive)
    *
    **/
  
  this.audit = function(neId, basePath, aCfg, iCfg, mode, ignore, auditReport, obj, path) {
    logger.debug("iCfg: "+JSON.stringify(iCfg));
    logger.debug("aCfg: "+JSON.stringify(aCfg));

    
    for (const key in iCfg) {
      if (key in aCfg) {
        if (typeof iCfg[key] !== typeof aCfg[key]) {
          // mismatch: type is different
          auditReport.addMisAlignedAttribute(auditFactory.createMisAlignedAttribute('/'+basePath+'/'+path+key, 'type '+typeof iCfg[key], 'type '+typeof aCfg[key], obj));
        } else if (!(iCfg[key] instanceof Object)) {
          if (iCfg[key] !== aCfg[key]) {
            // mismatch: value is different
            auditReport.addMisAlignedAttribute(auditFactory.createMisAlignedAttribute('/'+basePath+'/'+path+key, iCfg[key], aCfg[key], obj));
          } else {
            // aligned: type/value are same
          }
        } else if (Array.isArray(iCfg[key])) {
          if ((iCfg[key].length > 0) && (iCfg[key][0] instanceof Object) || (aCfg[key].length > 0) && (aCfg[key][0] instanceof Object)) {
            const keys = this.restconfGetListKeys(neId, basePath+'/'+path+key);
            const iCfgConverted = this.groupBy(iCfg[key], keys);
            const aCfgConverted = this.groupBy(aCfg[key], keys);
            this.audit(neId, basePath, aCfgConverted, iCfgConverted, mode, ignore, auditReport, obj, path+key+'=');
          } else {
            const iVal = JSON.stringify(iCfg[key]);
            const aVal = JSON.stringify(aCfg[key]);
            if (iVal !== aVal) {
              auditReport.addMisAlignedAttribute(auditFactory.createMisAlignedAttribute('/'+basePath+'/'+path+key, iVal, aVal, obj));
            }
          }
        } else {
          // look one level deper
          this.audit(neId, basePath, aCfg[key], iCfg[key], mode, ignore, auditReport, obj, path+key+'/');
        }        
      } else {
        if (iCfg[key] instanceof Object) {
          // mismatch: list/container is unconfigured
              
          const iVal = JSON.stringify(iCfg[key]);
          if ((iVal === '{}') || (iVal === '[]') || (iVal === '[null]')) 
            auditReport.addMisAlignedAttribute(auditFactory.createMisAlignedAttribute('/'+basePath+'/'+path+key, 'SET', 'UNSET', obj));
          else
            auditReport.addMisAlignedObject(auditFactory.createMisAlignedObject('/'+basePath+'/'+path+key, true, neId));

          // Alternative option: Report as misaligned attribute (JSON string)
          // auditReport.addMisAlignedAttribute(auditFactory.createMisAlignedAttribute(path+key, JSON.stringify(iCfg[key]), null, obj));
        } else {
          // mismatch: leaf is unconfigured
          auditReport.addMisAlignedAttribute(auditFactory.createMisAlignedAttribute('/'+basePath+'/'+path+key, iCfg[key], null, obj));
        }
      }
    }

    // undesired nodal attributes (only in mode create/replace)
    if (mode != 'merge') {
      for (const key in aCfg) {
        if (!(key in iCfg)) {
          // Possibility to ignore undesired children that match the list provided. Restrictions:
          //  (1) Can only ignore what is not part of the object created
          //  (2) Object created must contain the parent of the ignored
          //  (3) The ignore option is currently supported for audit only (not for deployment)
          
          let found = "";
          const aKey = path+key;
          for (const idx in ignore) {
            if (aKey.startsWith(ignore[idx])) {
              found = ignore[idx];
              break;
            }
          }
          
          if (!found) {
            if (aCfg[key] instanceof Object) {
              // mismatch: undesired list/container
              
              const aVal = JSON.stringify(aCfg[key]);
              if ((aVal === '{}') || (aVal === '[]') || (aVal === '[null]')) 
                auditReport.addMisAlignedAttribute(auditFactory.createMisAlignedAttribute(aKey, 'UNSET', 'SET', obj));
              else
                auditReport.addMisAlignedObject( auditFactory.createMisAlignedObject('/'+basePath+'/'+aKey, true, neId, true) );
              
              // Alternative option: Report as misaligned attribute (JSON string)
              // auditReport.addMisAlignedAttribute(auditFactory.createMisAlignedAttribute(aKey, null, JSON.stringify(aCfg[key]), obj));            
            } else {
              // mismatch: additional leaf
              auditReport.addMisAlignedAttribute(auditFactory.createMisAlignedAttribute('/'+basePath+'/'+aKey, null, aCfg[key], obj));
            }
          }          
        }
      }
    }
  };
  
  /**
    * Helper to run audits to compare intented vs actual state
    *
    * @param {} neId ne-id, required for fetching model info
    * @param {} aState actual state (object)
    * @param {} iState intended state (object)
    * @param {} auditReport used to report differences
    * @param {} obj object reference used for report
    * 
    * @throws RuntimeException
    * 
    **/
    
  this.audit_state = function(neId, aState, iState, auditReport, qPath) {
    logger.debug("iState: "+JSON.stringify(iState));
    logger.debug("aState: "+JSON.stringify(iState));

    const siteName = neId;    
    for (const key in iState) {
      if (iState[key] instanceof Object) {
        const path = iState[key]['path'];
        const aValue = this.jsonPath(aState, path);
        
        for (const check in iState[key]) {
          if (check !== 'path') {
            const iValue = iState[key][check];
            if (aValue && aValue.length > 0) {
              let match = true;
              switch (check) {
                case 'equals':
                case 'matches':
                  match = (aValue[0] === iValue);
                  break;
                case 'contains':
                case 'includes':
                  match = (aValue[0].indexOf(iValue) != -1);
                  break;
                case 'startsWith':
                  match = (aValue[0].startsWith(iValue));
                  break;
                case 'endsWith':
                  match = (aValue[0].endsWith(iValue));
                  break;
                case 'regex':
                  match = RegExp(iValue).test(aValue[0]);
                  break;
                default:
                  throw new RuntimeException("Unsupported check '"+check+"' for object("+path+"), jsonpath("+path+"), expected value("+iValue+")");
              }    
              if (!match)
                auditReport.addMisAlignedAttribute(auditFactory.createMisAlignedAttribute(qPath+'/'+key, iValue, aValue[0], siteName));
            } else {
              auditReport.addMisAlignedAttribute(auditFactory.createMisAlignedAttribute(qPath+'/'+key, iValue, null, siteName));
            }
          }
        }
      } else if (key in aState) {
        if (iState[key] !== aState[key])
          auditReport.addMisAlignedAttribute(auditFactory.createMisAlignedAttribute(key, iState[key], aState[key], siteName));
      } else {
        auditReport.addMisAlignedAttribute(auditFactory.createMisAlignedAttribute(key, iState[key], null, siteName));
      }
    }
  };
});