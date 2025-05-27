<#setting number_format="computer">
{
    "SYSTEM": {
        "config": {
            "target": "srl_nokia-system:/system",
            "operation": "merge",
            "value": {
                "srl_nokia-system:system": {
                    "srl_nokia-lldp:lldp": {
                        "admin-state": "enable"
                    },
                    "srl_nokia-system-info:information": {
                        "contact": "${site.contact}",
                        "location": "${site.location.gps\-position} (${site.location.name}, ${site.location.country})"
                    }
                }
            }
        }
    },
    "DEFAULT NETWORK INSTANCE": {
        "config": {
            "target": "srl_nokia-network-instance:/network-instance=default",
            "operation": "merge",
            "value": {
                "srl_nokia-network-instance:network-instance": {
                    "name": "default",
                    "type": "srl_nokia-network-instance:default",
                    "admin-state": "enable",
                    "description": "global routing instance",
                    "interface": [
                        {
                            "name": "system0.0"
                        }
                    ],
                    "protocols": {
                        "srl_nokia-isis:isis": {
                            "instance": [
                                {
                                    "name": "0",
                                    "admin-state": "enable",
                                    "level-capability": "L2",
                                    "net": [
                                        "${site.countryCode?string}.cafe.cafe.cafe.0000.${site.countryCode?string('0000')}.${site.nodeId?string('0000')}.00"
                                    ],
                                    "timers": {
                                        "lsp-lifetime": 65535
                                    },
                                    "ipv4-unicast": {
                                        "admin-state": "enable"
                                    },
                                    "interface": [
                                        {
                                            "interface-name": "system0.0",
                                            "passive": true,
                                            "ipv4-unicast": {
                                                "admin-state": "enable"
                                            }
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                }
            }
        }
    }
}