<state-report xmlns="http://www.nokia.com/management-solutions/ibn">
  <evpn-eline-state xmlns="http://www.nokia.com/management-solutions/evpn-eline">
    <evi>${state.evi?c}</evi>
    <oper-state>${indicators.state?values[0]}</oper-state>
    <transport>${indicators.transport?values[0]}</transport>                  
    <performance>
<#if indicators.latency??>
      <round-trip-delay>${indicators.latency?values[0]?c}</round-trip-delay>
      <round-trip-jitter>${indicators.jitter?values[0]?c}</round-trip-jitter>
      <frame-loss-ratio>${indicators.loss?values[0]?c}</frame-loss-ratio>
</#if>
    </performance>
   </evpn-eline-state>
</state-report>
