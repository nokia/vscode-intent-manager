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
    "ETHCFM LEVEL 7": {
        "config": {
            "target": "srl_nokia-oam:/oam/srl_nokia-ethcfm:ethcfm/domain=level7",
            "operation": "replace",
            "value": {
                "srl_nokia-oam:domain": {
                    "domain-id": "level7",
                    "domain-format": "none",
                    "level": 7
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