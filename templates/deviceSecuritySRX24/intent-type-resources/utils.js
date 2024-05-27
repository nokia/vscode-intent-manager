/********************************************************************************
 * 
 * COMMON UTILITIES FOR NSP RESTCONF, MDC, RESOURCE-ADMIN, ...
 * (c) 2024 by Nokia
 *
 * WARNING!!!
 * THIS INTENT-TYPE IS FOR RESEARCH/STUDY ONLY!
 *
 * DON'T MODIFY!!!
 * Changes restricted to: target, models, main-script, viewConfig and templates
 *
 * Restrictions:
 *   - Scalability/Performance
 *   - Limited error-handling (FTL, ...)
 *   - Implementation is not thread-safe (parallel sync/audits)
 *   - Requires MDC mediation (devices with NETCONF or gRPC support)
 * 
 * Experimental features:
 *   - operation merge and delete
 *   - ignore-children
 *   - intend-based assurance
 * 
 * Under investigation:
 *   - View-Config evolution (avoid custom callbacks)
 *   - Deployment/audits using CLI and NFMP mediation
 *   - Intent dependencies, shared objects and undesired objects
 *   - IBSF / ICM compliancy
 *   - Event-driven audits (no-code)
 *   - Pre-approved misalignments (low-code)
 *   - Intent-based assurance ph2 (auto-trigger, separation, ...)
*
 ********************************************************************************/

(function fwkUtils() {
  this.restconfNspAction = function(resource, input)
  {
    /**
      * Executes NSP RESTCONF action
      *
      * input:
      *   resource - model-path string of the parent resource to execute the action
      *   input    - dictionary of input variables (action specific)
      *
      * return values if successful:
      *   success(true)
      *   response  - dictionary of output variables (action specific)
      *
      * return values if failed:
      *   success(false)
      *   errmsg    - string containing error details
      *
      **/
    
    var t1 = Date.now();
    logger.info("restconfNspAction("+resource+")");
    
    var result = {};
    var managerInfo = mds.getManagerByName('NSP');
    if (managerInfo.getConnectivityState().toString() === 'CONNECTED') {
      var baseURL = "https://restconf-gateway/restconf/data/";
      var body = JSON.stringify({"input": input});      
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
    
    logger.info("restconfNspAction() finished within "+(Date.now()-t1)+"ms");
    return result;
  }
  
  
  
  this.fwkAction = function(action, input)
  {
    
    var t1 = Date.now();
    logger.info("fwkAction("+action+")");
    
    var result = {};
    var managerInfo = mds.getManagerByName('NSP');
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
    
    logger.info("fwkAction() finished within "+(Date.now()-t1)+"ms");
    return result;
  }  
  
  
  
  this.restconfNspRpc = function(operation, input)
  {
    /**
      * Executes NSP RESTCONF RPC
      *
      * input:
      *   operation - RPC action to be executed
      *   input     - dictionary of input variables (action specific)
      *
      * return values if successful:
      *   success(true)
      *   response   - dictionary of output variables (action specific)
      *
      * return values if failed:
      *   success(false)
      *   errmsg     - string containing error details
      *
      **/
    
    var t1 = Date.now();
    logger.info("restconfNspRpc("+operation+")");
    
    var result = {};
    var managerInfo = mds.getManagerByName('NSP');
    if (managerInfo.getConnectivityState().toString() === 'CONNECTED') {
      var baseURL = "https://restconf-gateway/restconf/operations/";
      var body = JSON.stringify({"input": input});
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
    
    logger.info("restconfNspRpc() finished within "+(Date.now()-t1)+"ms");
    return result;
  }
  
  
  
  this.restconfGetDevice = function(neId, path) {
    /**
      * Executes NSP RESTCONF GET against MDC-managed nodes
      *
      * input:
      *   neId - targetted device
      *   path - requested subtree/attribute
      *
      * return values if successful:
      *   success(true)
      *   response - get response
      *
      * return values if failed:
      *   success(false)
      *   errmsg   - string containing error details
      *
      **/
    
    var t1 = Date.now();
    logger.info("restconfGetDevice(\"" + neId + "\", \"" + path + "\")");
    
    var result = {};
    var baseURL = "/restconf/data/network-device-mgr:network-devices/network-device="+neId+"/root/";
    
    var managerInfo = mds.getAllManagersWithDevice(neId).get(0);
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
    
    logger.info("restconfGetDevice() finished within "+(Date.now()-t1)+"ms");
    return result;
  }
  
  
  
  this.restconfPatchDevice = function(neId, body) {
    /**
      * Executes NSP RESTCONF PATCH against MDC-managed nodes
      *
      * input:
      *   neId - targetted device
      *   body - JSON string (rfc8072 YANG PATCH compliant)
      *
      * return values if successful:
      *   success(true)
      *   response - not used
      *
      * return values if failed:
      *   success(false)
      *   errmsg   - string containing error details
      *
      **/
    
    var t1 = Date.now();
    logger.info("restconfPatchDevice(\"" + neId + "\", \"" + body + "\")");
    
    var result = {};
    var baseURL = "/restconf/data/network-device-mgr:network-devices/network-device="+neId+"/root/";
    
    var managerInfo = mds.getAllManagersWithDevice(neId).get(0);
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
        
        var errmsg = "";
        var patchStatus = JSON.parse(response)['ietf-yang-patch:yang-patch-status'];
        
        if ('edit-status' in patchStatus) {
          var rcError = patchStatus['edit-status']['edit'];
        
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
    
    logger.info("restconfPatchDevice() finished within "+(Date.now()-t1)+"ms");
    return result;
  }

  
  
  this.getDeviceDetails = function(neId) {
    /**
     * Retrieve device details from NSP model
     *
     **/  

    var input = {"depth": 3, "xpath-filter": "/nsp-equipment:network/network-element[ne-id='"+neId+"']"};
    var result = this.restconfNspRpc("nsp-inventory:find", input);
    
    if (!result.success)
      return {}

    if (result.response["nsp-inventory:output"]["data"].length === 0)
      return {}
        
    return this.serialize(result.response["nsp-inventory:output"]["data"][0]);
  };

  
  
  this.restconfGetListKeys = function(neId, listPath) {
    /**
      * Get list-keys from YANG model for MDC-managed nodes
      *
      * input:
      *   neId     - targetted device
      *   listPath - path of list to get the keys
      *
      * returns:
      *   listKeys[]
      *
      **/
    
    var t1 = Date.now();
    logger.info("restconfGetListKeys(\"" + neId + "\", \"" + listPath + "\")");
    
    var result = {};
    var managerInfo = mds.getManagerByName('NSP');
    if (managerInfo.getConnectivityState().toString() === 'CONNECTED') {
      var baseURL = "https://restconf-gateway/restconf/meta/api/v1/model/schema/"+neId+"/"
      var url = baseURL + listPath.replace(/=[^=\/]+\//g, "/");

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
      })
    } else {
      result = { success: false, errmsg: "NSP mediator is disconnected." };
    }
    
    var listKeys = [];
    if (result["success"]) {
      attr = result["response"]["attributes"];
      for(var i = 0; i < attr.length; i++) {
        if(attr[i]["isKey"] !== undefined) {
          listKeys.push(attr[i]["name"]);
        }
      }
    } else {
      logger.error("restconfGetListKeys() failed with error:\n" + result["errmsg"]);
    }
    
    logger.info("restconfGetListKeys() finished within "+(Date.now()-t1)+"ms");
    return listKeys;
  }

  
  
  this.serialize = function(obj) {
    /**
      * Flattens an inventory response and removes @ annotations
      *
      * input:
      *   obj   - object to be converted
      *
      * returns flattened object
      *
      **/
    
    var result = {};
    function flatten(obj) {
      for (key in obj) {
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
  }
  
  
  
  this.jsonPath = function(obj, expr, arg) {
    /**
      * JSONPath 0.8.4 - XPath for JSON
      * available from https://code.google.com/archive/p/jsonpath/
      *
      * Copyright (c) 2007 Stefan Goessner (goessner.net)
      * Licensed under the MIT (MIT-LICENSE.txt) licence.
      *
      **/
  
    var P = {
      resultType: arg && arg.resultType || "VALUE",
      result: [],
      normalize: function(expr) {
         var subx = [];
         return expr.replace(/[\['](\??\(.*?\))[\]']|\['(.*?)'\]/g, function($0,$1,$2){return "[#"+(subx.push($1||$2)-1)+"]";})  /* http://code.google.com/p/jsonpath/issues/detail?id=4 */
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
            if (val && val.hasOwnProperty(loc))
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
               if (val.hasOwnProperty(m))
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
  } 
  
  
  
  this.groupBy = function(list, keys) {
    /**
      * Helper to convert list of dict to dict
      * Note: Needed for key-aware array compare
      *
      * input:
      *   list - array of dicts
      *   keys - keys for the underlying YANG list
      *
      **/
    
    return list.reduce(
      function(rdict, entry) {
        var value = keys.map(function(key) {return encodeURIComponent(entry[key])}).join(",");
        rdict[value] = entry;
        return rdict; 
      }, {}
    );
  }
  
  
  
  this.audit = function(neId, basePath, aCfg, iCfg, mode, ignore, auditReport, obj, path) {
    /**
      * Helper to run audits to compare intented vs actual config
      *
      * input:
      *   neId        - ne-id, required for fetching model info
      *   basePath    - target root path of the object under audit
      *   aCfg        - actual config (object)
      *   iCfg        - intended config (object)
      *   mode        - operation: create, replace, merge, delete
      *   ignore      - list of children subtree to ignore
      *   auditReport - used to report differences
      *   obj         - object reference used for report
      *   path        - used to build up relative path (recursive)
      *
      **/
    
    for (var key in iCfg) {
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
            keys = this.restconfGetListKeys(neId, basePath+'/'+path+key);

            var iCfgConverted = this.groupBy(iCfg[key], keys);
            var aCfgConverted = this.groupBy(aCfg[key], keys);
            this.audit(neId, basePath, aCfgConverted, iCfgConverted, mode, ignore, auditReport, obj, path+key+'=');
          } else {
            iVal = JSON.stringify(iCfg[key]);
            aVal = JSON.stringify(aCfg[key]);
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
              
          iVal = JSON.stringify(iCfg[key]);
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
      for (key in aCfg) {
        if (!(key in iCfg)) {
          // Possibility to ignore undesired children that match the list provided. Restrictions:
          //  (1) Can only ignore what is not part of the object created
          //  (2) Object created must contain the parent of the ignored
          //  (3) The ignore option is currently supported for audit only (not for deployment)
          
          var found = "";
          var aKey = path+key;
          for (idx in ignore) {
            if (aKey.startsWith(ignore[idx])) {
              found = ignore[idx];
              break;
            }
          }
          
          if (!found) {
            if (aCfg[key] instanceof Object) {
              // mismatch: undesired list/container
              
              aVal = JSON.stringify(aCfg[key]);
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
  }
  
  
  
  this.audit_state = function(neId, aState, iState, auditReport, qPath) {
    /**
      * Helper to run audits to compare intented vs actual state
      *
      * input:
      *   neId        - ne-id, required for fetching model info
      *   aState      - actual state (object)
      *   iState      - intended state (object)
      *   auditReport - used to report differences
      *   obj         - object reference used for report
      *
      **/
    
    var siteName = neId;
    
    for (var key in iState) {
      if (iState[key] instanceof Object) {
        var path = iState[key]['path'];
        var aValue = this.jsonPath(aState, path);
        
        for (var check in iState[key]) {
          if (check !== 'path') {
            var iValue = iState[key][check];
            if (aValue && aValue.length > 0) {
              var match = true;
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
  }
})
