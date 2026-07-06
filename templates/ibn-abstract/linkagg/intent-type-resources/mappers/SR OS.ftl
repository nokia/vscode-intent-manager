<#setting number_format="computer">
{
<#list site.ports as port>
    "PORT ${port}": {
        "config": {
            "target": "nokia-conf:/configure/port=${port?url('ISO-8859-1')}",
            "operation": "replace",
            "value": {
                "nokia-conf:port": {
                    "port-id": "${port}",
<#if global.description??>
                    "description": "${global.description}",
</#if>
                    "ethernet": {
                        "mode": "network",
                        "encap-type": "dot1q",
                        "mtu": 2000
                    }
                }
            }
        }
    },
</#list>    
    "LAG INSTANCE ${global.lagId}": {
        "config": {
            "target": "nokia-conf:/configure/lag=${global.lagId?url('ISO-8859-1')}",
            "operation": "replace",
            "value": {
                "nokia-conf:lag": {
                    "lag-name": "${global.lagId}",
                    "admin-state": "enable",
<#if global.description??>
                    "description": "${global.description}",
</#if>
                    "encap-type": "dot1q",
                    "mode": "network",
                    "port": [
<#list site.ports as port>
                        {
                            "port-id": "${port}"
                        }<#sep>,</#sep>
</#list>
                    ]
                }
            }
        }
    }
}