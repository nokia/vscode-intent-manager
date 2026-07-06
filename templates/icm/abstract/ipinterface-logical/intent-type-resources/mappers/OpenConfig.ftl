<#setting number_format="computer">
{              
  "INTERFACE ${site.port\-id}": {
    "config": {
      "target": "openconfig-interfaces:/interfaces/interface=${site.port\-id?url('ISO-8859-1')}",
      "operation": "replace",
      "value": {
            "openconfig-interfaces:interface": {
                "name": "${site.port\-id}",
                "config": {
                    "name": "${site.port\-id}",
                    "type": "ethernetCsmacd"
                },
                "subinterfaces": {
<#if site.ip\-address??>
                    "subinterface": [
                        {
                            "index": 1,
                            "config": {
<#if site.description??>
                                "description": "${site.description}",
</#if>
<#if site.admin\-state == "enable">
                                "enabled": true,
</#else>                                
                                "enabled": false,
</#if>
                                "index": 1
                            },
<#-- MDC BUG | The ipv4 container uses a different namespace prefix
                            "openconfig-if-ip:ipv4": {
-->
                            "ipv4": {
                                "addresses": {
                                    "address": [
                                        {
                                            "ip": "${site.ip\-address}",
                                            "config": {
                                                "ip": "${site.ip\-address}",
                                                "prefix-length": 31
                                            }
                                        }
                                    ]
                                },
                                "config": {
<#-- MDC BUG | Adding the primary address causes a failure
                                    "primary-address": "${site.ip\-address}",
-->
                                    "mtu": 8986
                                }
                            }
                        }
                    ]
</#if>                    
                }
            }
        }
    }
  },

  "LLDP INTERFACE ${site.port\-id}": {
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
  }<#if site.ip\-address??>,

  "NETWORK INTERFACE ${site.port\-id}": {
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
                    "subinterface": 1
                }
            }        
      }
    }
  },

  "ISIS INTERFACE ${site.port\-id}": {
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
                            "level-number": 2,
                            "config": {
                                "level-number": 2,
                                "enabled": true
                            }
                        }
                    ]
                },
                "interface-ref": {
                    "config": {
                        "interface": "${site.port\-id}",
                        "subinterface": 1
                    }
                }
            }        
      }
    }
  },

  "MPLS INTERFACE ${site.port\-id}": {
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
                        "subinterface": 1
                    }
                }
            }        
      }
    }
  },

  "TE INTERFACE ${site.port\-id}": {
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
                        "subinterface": 1
                    }
                }
            }        
      }
    }
  },
    
  "LDP INTERFACE ${site.port\-id}": {
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
                        "subinterface": 1
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
</#if>                    
}