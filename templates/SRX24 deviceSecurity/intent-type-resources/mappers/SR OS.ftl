<#setting number_format="computer">
{
    "disable insecure protocols (ftp, telnet) under system security": {
        "config": {
            "target": "nokia-conf:/configure/system/security",
            "operation": "merge",
            "value": {
                "nokia-conf:security": {
                    "telnet-server": false,
                    "telnet6-server": false,
                    "ftp-server": false
                }
            }
        }
    },
    "management-access-filter": {
        "config": {
            "target": "nokia-conf:/configure/system/security/management-access-filter",
            "operation": "replace",
            "value": {
                "nokia-conf:management-access-filter": {
                    "ip-filter": {
                        "admin-state": "enable",
                        "default-action": "accept",
                        "entry": [
                            {
                                "entry-id": 10,
                                "description": "Allow CLI\/SFTP over SSH",
                                "action": "accept",
                                "match": {
                                    "mgmt-port": {
                                        "cpm": [null]
                                    },
                                    "dst-port": {
                                        "port": 22
                                    }
                                }
                            },
                            {
                                "entry-id": 20,
                                "description": "Allow NETCONF",
                                "action": "accept",
                                "match": {
                                    "mgmt-port": {
                                        "cpm": [null]
                                    },
                                    "dst-port": {
                                        "port": 830
                                    }
                                }
                            },
                            {
                                "entry-id": 30,
                                "description": "Allow gRPC",
                                "action": "accept",
                                "match": {
                                    "mgmt-port": {
                                        "cpm": [null]
                                    },
                                    "dst-port": {
                                        "port": 57400
                                    }
                                }
                            },
                            {
                                "entry-id": 40,
                                "description": "Allow ICMP",
                                "action": "accept",
                                "match": {
                                    "protocol": "icmp",
                                    "mgmt-port": {
                                        "cpm": [null]
                                    }
                                }
                            },
                            {
                                "entry-id": 100,
                                "description": "log all other protocols",
                                "action": "accept",
                                "log-events": true,
                                "match": {
                                    "mgmt-port": {
                                        "cpm": [null]
                                    }
                                }
                            }
                        ]
                    },
                    "ipv6-filter": {
                        "default-action": "accept"
                    },
                    "mac-filter": {
                        "default-action": "accept"
                    }
                }
            }
        }
    },
    "security logs using log-id 90": {
        "config": {
            "target": "nokia-conf:/configure/log/log-id=90",
            "operation": "replace",
            "value": {
                "nokia-conf:log": {
                    "name": "90",
                    "source": {
                        "security": true
                    },
                    "destination": {
                        "memory": {
                            "max-entries": 1000
                        }
                    }
                }
            }
        }
    }
}
