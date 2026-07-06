<state-report xmlns="http://www.nokia.com/management-solutions/ibn">
  <{{ intent_type }}-state xmlns="urn:nokia.com:nsp:yang:im:{{ intent_type }}">
    <subnet>${state.subnet}</subnet>
<#if indicators.state??>
    <oper-state>${indicators.state?values[0]}</oper-state>
</#if>
<#if indicators.speed??>
    <speed>${indicators.speed?values[0]}</speed>
</#if>
    <performance>
<#if indicators.latency??>
      <round-trip-delay>${indicators.latency?values[0]?c}</round-trip-delay>
      <round-trip-jitter>${indicators.jitter?values[0]?c}</round-trip-jitter>
      <frame-loss-ratio>${indicators.loss?values[0]?c}</frame-loss-ratio>
</#if>
<#if indicators.utilization??>
      <utilization>${indicators.utilization?values[0]?c}</utilization>
</#if>
    </performance>
   </{{ intent_type }}-state>
</state-report>