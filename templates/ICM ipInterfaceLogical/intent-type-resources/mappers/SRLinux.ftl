<#setting number_format="computer">
{
  "INTERFACE ${site.port\-id}": {
    "config": {
      "target": "srl_nokia-interfaces:/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {              
            "srl_nokia-interfaces:interface": {
                "name": "${site.port\-id}",
                "admin-state": "${site.admin-state}",
<#if site.description??>                  
                "description": "${site.description}",
</#if>
<#if site.ip\-address??>
                "subinterface": [{
                    "index": 1,
                    "admin-state": "${site.admin-state}",
                    "ipv4": {
                        "address": [{
                            "ip-prefix": "${site.ip\-address}/31"
                        }]
                    }
                }],
</#if>
                "mtu": 9000
            }
      }
    }
  }<#if site.ip\-address??>,
    
  "LLDP INTERFACE ${site.port\-id}": {
    "config": {
      "target": "srl_nokia-system:/system/srl_nokia-lldp:lldp/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "srl_nokia-system:interface": {
                "name": "${site.port\-id}",                  
                "admin-state": "${site.admin-state}"
            }
      }
    }
  },
    
  "IP INTERFACE BINDING ${site.port\-id}.1": {
    "config": {
      "target": "srl_nokia-network-instance:/network-instance=default/interface=${site.port\-id?url('ISO-8859-1')}.1",
      "operation": "replace",
      "value": {
            "srl_nokia-network-instance:interface":
                {
                    "name": "${site.port\-id}.1"
                }
      }
    }
  },
    
  "ISIS INTERFACE ${site.port\-id}.1": {
    "config": {
      "target": "srl_nokia-network-instance:/network-instance=default/protocols/srl_nokia-isis:isis/instance=0/interface=${site.port\-id?url('ISO-8859-1')}.1",
      "operation": "replace",
      "value": {
            "srl_nokia-isis:interface":
                {
                    "interface-name": "${site.port\-id}.1",
                    "admin-state": "enable",
                    "hello-padding": "disable",
                    "circuit-type": "point-to-point",
<#-- ISSUE: SRL MDC adaptor namespace misalignment -->
<#if mode = 'audit'>
                    "srl_nokia-isis:ipv4-unicast": {
<#else>
                    "ipv4-unicast": {
</#if>
                    "admin-state": "${site.admin-state}"
                    },
                    "level": [
                      {
                        "level-number": 2
                      }
                    ]
                }
      }
    }
  }
</#if>
}