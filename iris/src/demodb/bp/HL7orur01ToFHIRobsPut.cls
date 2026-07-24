/// 
Class demodb.bp.HL7orur01ToFHIRobsPut Extends Ens.BusinessProcessBPL
{

Storage Default
{
<Type>%Storage.Persistent</Type>
}

/// BPL Definition
XData BPL [ XMLNamespace = "http://www.intersystems.com/bpl" ]
{
<process language='objectscript' request='EnsLib.HL7.Message' response='HS.FHIRServer.Interop.Response' height='2000' width='2000' >
<context>
<property name='dynamicBundle' type='%Library.DynamicObject' instantiate='0' deletewithcontext='0' />
<property name='StreamId' type='%String' instantiate='0' deletewithcontext='0' >
<parameters>
<parameter name='MAXLEN'  value='50' />
</parameters>
</property>
<property name='srpath' type='%String' instantiate='0' deletewithcontext='0' >
<parameters>
<parameter name='MAXLEN'  value='100' />
</parameters>
</property>
<property name='obsid' type='%String' instantiate='0' deletewithcontext='0' >
<parameters>
<parameter name='MAXLEN'  value='50' />
</parameters>
</property>
<property name='fhirobs' type='HS.FHIR.DTL.vR4.Model.Resource.Observation' instantiate='0' deletewithcontext='0' />
</context>
<sequence xend='200' yend='850' >
<empty name='some ref info' xpos='200' ypos='250' disabled="true">
<annotation><![CDATA[https://docs.intersystems.com/irisforhealthlatest/csp/docbook/DocBook.UI.Page.cls?KEY=HXFHIR_client#HXFHIR_client_interactions_call]]></annotation>
</empty>
<assign name="srpath assign" property="context.srpath" value="request.{PIDgrpgrp(1).ORCgrp(1).OBR:PlacerOrderNumber(1).entityidentifier}" action="set" xpos='200' ypos='350' />
<assign name="obsid assign" property="context.obsid" value="request.{PIDgrpgrp(1).ORCgrp(1).OBR:FillerOrderNumber.entityidentifier}" action="set" xpos='200' ypos='450' />
<transform name='transform' class='demodb.dtl.hl7orur01ToFHIRobservation' source='request' target='context.fhirobs' xpos='200' ypos='550' />
<code name='Save JSON to Stream' xpos='200' ypos='650' >
<annotation><![CDATA[prepare the patch content]]></annotation>
<![CDATA[   set outp = context.fhirobs.ToJSON()
  
  set tQuickStream = ##class(HS.SDA3.QuickStream).%New()
  
  set tSC=tQuickStream.Write(outp.Read()) 
  do tQuickStream.Flush()
  
  set context.StreamId = tQuickStream.%Id()
]]>
</code>
<call name='Call ToFHIRDemo' target='ToFHIRDemo' async='0' xpos='200' ypos='750' >
<request type='HS.FHIRServer.Interop.Request' >
<assign property="callrequest.QuickStreamId" value="context.StreamId" action="set" />
<assign property="callrequest.Request.RequestMethod" value="&quot;PUT&quot;" action="set" />
<assign property="callrequest.Request.RequestPath" value="&quot;Observation/&quot;_context.obsid" action="set" />
<assign property="callrequest.Request.RequestFormatCode" value="&quot;JSON&quot;" action="set" />
<assign property="callrequest.Request.ResponseFormatCode" value="&quot;JSON&quot;" action="set" />
</request>
<response type='HS.FHIRServer.Interop.Response' >
<assign property="response" value="callresponse" action="set" />
</response>
</call>
</sequence>
</process>
}

}
