<#setting number_format="computer">
{
    "PORT ${site.port\-id}": {
        "config": {
            "target": "nokia-conf:/configure/port=${site.port\-id?url('ISO-8859-1')}",
            "operation": "replace",
            "value": {
                "nokia-conf:port": {
                    "port-id": "${site.port\-id}",
                    "admin-state": "${site.admin\-state}",
<#if site.description??>
                    "description": "${site.description}",
</#if>
                    "ethernet": {
                        "mode": "network",
                        "encap-type": "null",
                        "mtu": 9000,
                        "down-when-looped": {
                            "admin-state": "enable"
                        },
                        "lldp": {
                            "dest-mac": [
                                {
                                    "mac-type": "nearest-bridge",
                                    "notification": false,
                                    "receive": true,
                                    "transmit": true,
                                    "port-id-subtype": "tx-if-name",
                                    "tx-tlvs": {
                                        "port-desc": true,                                      
                                        "sys-name": true
                                    },
                                    "tx-mgmt-address": [
                                        {
                                            "mgmt-address-system-type": "system",
                                            "admin-state": "enable"
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                }
            }
        }
    }<#if site.if\-name??>,
    "IP INTERFACE ${site.if\-name}": {
        "config": {
            "target": "nokia-conf:/configure/router=Base/interface=${site.if\-name?url('ISO-8859-1')}",
            "operation": "replace",
            "value": {
                "nokia-conf:interface": 
                {
                    "interface-name": "${site.if\-name}",
                    "port": "${site.port\-id}",
                    "ipv4": {
                      "primary": {
<#if site.ip\-address??>
                        "address": "${site.ip\-address}",
                        "prefix-length": 31
</#if>
                      }
                    },
                    "admin-state": "${site.admin\-state}"
                }
            }
        }
    },

    "ISIS INTERFACE ${site.if\-name}": {
        "config": {
            "target": "nokia-conf:/configure/router=Base/isis=0/interface=${site.if\-name?url('ISO-8859-1')}",
            "operation": "replace",
            "value": {
                "nokia-conf:interface": {
                    "interface-name": "${site.if\-name}",
                    "interface-type": "point-to-point",
                    "hello-padding": "none",
                    "level-capability": "2",
                    "admin-state": "${site.admin\-state}"
                }                
            }
        }
    },

    "LDP INTERFACE ${site.if\-name}": {
        "config": {
            "target": "nokia-conf:/configure/router=Base/ldp/interface-parameters/interface=${site.if\-name?url('ISO-8859-1')}",
            "operation": "replace",
            "value": {
                "nokia-conf:interface": {
                    "ip-int-name": "${site.if\-name}",
                    "ipv4": {
                        "admin-state": "${site.admin\-state}"
                    }
                }    
            }
        }
    }
</#if>    
}