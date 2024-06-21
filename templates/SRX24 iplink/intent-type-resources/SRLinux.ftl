<#setting number_format="computer">
{
  "[${site.ne\-name}] INTERFACE ${site.port\-id}": {
    "config": {
      "target": "srl_nokia-interfaces:/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {              
            "srl_nokia-interfaces:interface": {
                "name": "${site.port\-id}",
                "admin-state": "${global.adminState}",
<#if global.description??>
                "description": "{{ intent_type }}: ${global.description}",
</#if>
                "mtu": 9000,
                "subinterface": [{
                    "index": 1,
                    "admin-state": "enable",
                    "ipv4": {
                        "admin-state": "enable",
                        "address": [{
                            "ip-prefix": "${site.addr}/31"
                        }]
                    }
                }]
            }    
      },
      "ignoreChildren": []
    },
    "health": {
      "srl_nokia-interfaces:/interface=${site.port\-id?url('ISO-8859-1')}": {
            "oper-state": "up"
      }
    },
    "indicators": {
      "srl_nokia-interfaces:/interface=${site.port\-id?url('ISO-8859-1')}": {
        "speed": {
          "path": "$.ethernet.port-speed"
        },
        "utilization": {
          "path": "$.traffic-rate.out-bps"
        },
        "state": {
          "path": "$.oper-state"
        }            
      }
    }
  },
    
  "[${site.ne\-name}] LLDP INTERFACE ${site.port\-id}": {
    "config": {
      "target": "srl_nokia-system:/system/srl_nokia-lldp:lldp/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "srl_nokia-system:interface": {
                "name": "${site.port\-id}",                  
                "admin-state": "enable"
            }
      },
      "ignoreChildren": []
    },
    "health": {
      "srl_nokia-system:/system/srl_nokia-lldp:lldp/interface=${site.port\-id?url('ISO-8859-1')}": {
            "neighbor/nodename": {
              "path": "$.srl_nokia-lldp:neighbor[*].system-name",
              "equals": "${site.peer.ne\-name}"
            },
            "neighbor/port-id": {
              "path": "$.srl_nokia-lldp:neighbor[*].port-id",
              "equals": "${site.peer.port\-id}"
            }              
      }
    }      
  },
    
  "[${site.ne\-name}] IP INTERFACE BINDING ${site.port\-id}.1": {
    "config": {
      "target": "srl_nokia-network-instance:/network-instance=default/interface=${site.port\-id?url('ISO-8859-1')}.1",
      "operation": "replace",
      "value": {
            "srl_nokia-network-instance:interface":
                {
                    "name": "${site.port\-id}.1"          
                }
      },
      "ignoreChildren": []
    },
    "health": {
      "srl_nokia-interfaces:/interface=${site.port\-id?url('ISO-8859-1')}/subinterface=1": {
            "subinterface/oper-state": {
              "path": "oper-state",
              "equals": "up"
            }
      },
      "srl_nokia-network-instance:/network-instance=default/interface=${site.port\-id?url('ISO-8859-1')}.1": {
            "binding/oper-state": {
              "path": "oper-state",
              "equals": "up"
            }
      }
    }
  },
    
  "[${site.ne\-name}] ISIS INTERFACE ${site.port\-id}.1": {
    "config": {
      "target": "srl_nokia-network-instance:/network-instance=default/protocols/srl_nokia-isis:isis/instance=0/interface=${site.port\-id?url('ISO-8859-1')}.1",
      "operation": "replace",
      "value": {
            "interface":
                {
                    "interface-name": "${site.port\-id}.1",
                    "circuit-type": "point-to-point",
<#-- ISSUE: SRL MDC adaptor namespace misalignment -->
<#if mode = 'audit'>
                    "srl_nokia-isis:ipv4-unicast": {
<#else>
                    "ipv4-unicast": {
</#if>

                      "admin-state": "enable"
                    }
                }
      },
      "ignoreChildren": []
    },
    "health": {}
  }
}
