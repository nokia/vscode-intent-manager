<#setting number_format="computer">
{  
  "[${site.ne\-name}] INTERFACE ${site.port\-id}": {
    "config": {
      "target": "openconfig-interfaces:/interfaces/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "openconfig-interfaces:interface": {
                "name": "${site.port\-id}",
                "config": {
                    "name": "${site.port\-id}",
<#if global.description??>
                    "description": "[{{ intent_type }}:${target}] ${global.description}",
</#if>
                    "type": "ethernetCsmacd"
                },
                "subinterfaces": {
                    "subinterface": [
                        {
                            "index": 0,
                            "config": {
                                "index": 0,
<#if global.description??>                              
                                "description": "[{{ intent_type }}:${target}] ${global.description}",
</#if>                              
                                "enabled": true
                            },
<#-- MDC BUG | The ipv4 container uses a different namespace prefix
                            "openconfig-if-ip:ipv4": {
-->
                            "ipv4": {
                                "addresses": {
                                    "address": [
                                        {
                                            "ip": "${site.addr}",
                                            "config": {
                                                "ip": "${site.addr}",
                                                "prefix-length": 31
                                            }
                                        }
                                    ]
                                },
                                "config": {
<#-- MDC BUG | Adding the primary address causes a failure
                                    "primary-address": "${site.addr}",
-->
                                    "mtu": 8986
                                }
                            }
                        }
                    ]
                }
            }
      }
    },
    "health": {
      "openconfig-interfaces:/interfaces/interface=${site.port\-id?url('ISO-8859-1')}/state": {
        "oper-status": "UP"
      },
      "openconfig-lldp:lldp/interfaces/interface=${site.port\-id?url('ISO-8859-1')}/neighbors": {
        "neighbor/state/system-name": {
          "path": "$.neighbor[*].state.system-name",
          "equals": "${site.peer.ne\-name}"
        },
        "neighbor/state/port-description": {
          "path": "$.neighbor[*].state.port-description",
          "contains": "${site.peer.port\-id}"
        }
      },
      "openconfig-interfaces:/interfaces/interface=${site.port\-id?url('ISO-8859-1')}/subinterfaces/subinterface=0/state": {
        "oper-status": "UP"
      },
      "openconfig-interfaces:/interfaces/interface=${site.port\-id?url('ISO-8859-1')}/subinterfaces/subinterface=0/state": {
        "oper-status": "UP"
      }
    }
  },
  "[${site.ne\-name}] LLDP INTERFACE ${site.port\-id}": {
    "config": {
      "target": "openconfig-lldp:/lldp/interfaces/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "openconfig-lldp:interface": {
                "name": "${site.port\-id}",
                "config": {
                    "name": "${site.port\-id}",
                    "enabled": true
                }
            }
      }
    }
  },
  "[${site.ne\-name}] NETWORK INTERFACE ${site.port\-id}": {
    "config": {
      "target": "openconfig-network-instance:/network-instances/network-instance=Base/interfaces/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "openconfig-network-instance:interface": {
                "id": "${site.port\-id}",
                "config": {
                    "id": "${site.port\-id}",
                    "interface": "${site.port\-id}",
                    "associated-address-families": ["IPV4"],
                    "subinterface": 0
                }
            }        
      }
    }
  },
  "[${site.ne\-name}] ISIS INTERFACE ${site.port\-id}": {
    "config": {
      "target": "openconfig-network-instance:/network-instances/network-instance=Base/protocols/protocol=ISIS,0/isis/interfaces/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "openconfig-network-instance:interface": {
                "interface-id": "${site.port\-id}",
                "config": {
                    "enabled": true,
                    "interface-id": "${site.port\-id}",
                    "passive": false,
                    "hello-padding": "DISABLE",
                    "circuit-type": "POINT_TO_POINT"
                },
                "afi-safi": {
                    "af": [
                        {
                            "afi-name": "IPV4",
                            "safi-name": "UNICAST",
                            "config": {
                                "afi-name": "IPV4",
                                "safi-name": "UNICAST"
                            }
                        }
                    ]
                },
                "levels": {
                    "level": [
                        {
                            "level-number": 1,
                            "config": {
                                "level-number": 1,
                                "enabled": true
                            }
                        }
                    ]
                },
                "interface-ref": {
                    "config": {
                        "interface": "${site.port\-id}",
                        "subinterface": 0
                    }
                }
            }        
      }
    },
    "health": {
<#-- SR OS MDC OpenConfig adaptor does not cover levels/level/adjacencies      
      "openconfig-network-instance:/network-instances/network-instance=Base/protocols/protocol=ISIS,0/isis/interfaces/interface=${site.port\-id?url('ISO-8859-1')}/levels/level=1/adjacencies": {
        "isis/adjacency/state": {
          "path": "$.adjacency[*].adjacency-state",
          "equals": "UP"
        },
        "isis/adjacency/neighbor": {
          "path": "$.adjacency[*].neighbor-ipv4-address",
          "equals": "${site.peer.addr}"
        }
      }
-->        
    }      
  },
  "[${site.ne\-name}] MPLS INTERFACE ${site.port\-id}": {
    "config": {
      "target": "openconfig-network-instance:/network-instances/network-instance=Base/mpls/global/interface-attributes/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "openconfig-network-instance:interface": {
                "interface-id": "${site.port\-id}",
                "config": {
                    "interface-id": "${site.port\-id}"
                },
                "interface-ref": {
                    "config": {
                        "interface": "${site.port\-id}",
                        "subinterface": 0
                    }
                }
            }        
      }
    }
  },
  "[${site.ne\-name}] TE INTERFACE ${site.port\-id}": {
    "config": {
      "target": "openconfig-network-instance:/network-instances/network-instance=Base/mpls/te-interface-attributes/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "openconfig-network-instance:interface": {
                "interface-id": "${site.port\-id}",
                "config": {
                    "interface-id": "${site.port\-id}"
                },
                "interface-ref": {
                    "config": {
                        "interface": "${site.port\-id}",
                        "subinterface": 0
                    }
                }
            }        
      }
    }
  },
  "[${site.ne\-name}] LDP INTERFACE ${site.port\-id}": {
    "config": {
      "target": "openconfig-network-instance:/network-instances/network-instance=Base/mpls/signaling-protocols/ldp/interface-attributes/interfaces/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "openconfig-network-instance:interface": {
                "interface-id": "${site.port\-id}",
                "config": {
                    "interface-id": "${site.port\-id}"
                },
                "interface-ref": {
                    "config": {
                        "interface": "${site.port\-id}",
                        "subinterface": 0
                    }
                },
                "address-families": {
                    "address-family": [
                        {
                            "afi-name": "IPV4",
                            "config": {
                                "afi-name": "IPV4",
                                "enabled": true
                            }
                        }
                    ]
                }
            }        
      }
    }
  }    
}