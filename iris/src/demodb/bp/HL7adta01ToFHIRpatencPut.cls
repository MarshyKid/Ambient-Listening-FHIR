/// 
Class demodb.bp.HL7adta01ToFHIRpatencPut Extends Ens.BusinessProcessBPL
{

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
<property name='patid' type='%String' instantiate='0' deletewithcontext='0' >
<parameters>
<parameter name='MAXLEN'  value='50' />
</parameters>
</property>
<property name='fhirpat' type='HS.FHIR.DTL.vR4.Model.Resource.Patient' instantiate='0' deletewithcontext='0' />
<property name='encid' type='%String' instantiate='0' deletewithcontext='0' >
<parameters>
<parameter name='MAXLEN'  value='50' />
</parameters>
</property>
<property name='fhirenc' type='HS.FHIR.DTL.vR4.Model.Resource.Encounter' instantiate='0' deletewithcontext='0' />
</context>
<sequence xend='200' yend='1450' >
<empty name='some ref info' xpos='200' ypos='250' disabled="true">
<annotation><![CDATA[https://docs.intersystems.com/irisforhealthlatest/csp/docbook/DocBook.UI.Page.cls?KEY=HXFHIR_client#HXFHIR_client_interactions_call]]></annotation>
</empty>
<assign name="srpath assign" property="context.srpath" value="request.{PIDgrpgrp(1).ORCgrp(1).OBR:PlacerOrderNumber(1).entityidentifier}" action="set" xpos='200' ypos='350' disabled="true"/>
<assign name="patid assign" property="context.patid" value="request.{PID:PatientIDInternalID(1).ID}" action="set" xpos='200' ypos='450' />
<transform name='transform patient' class='demodb.dtl.hl7adta01ToFHIRpatient' source='request' target='context.fhirpat' xpos='200' ypos='550' />
<code name='prepare patient payload' xpos='200' ypos='650' >
<![CDATA[   set outp = context.fhirpat.ToJSON()
  
  set tQuickStream = ##class(HS.SDA3.QuickStream).%New()
  
  set tSC=tQuickStream.Write(outp.Read()) 
  do tQuickStream.Flush()
  
  set context.StreamId = tQuickStream.%Id()]]>
</code>
<call name='Call ToFHIRDemo pat' target='ToFHIRDemo' async='0' xpos='200' ypos='750' >
<request type='HS.FHIRServer.Interop.Request' >
<assign property="callrequest.QuickStreamId" value="context.StreamId" action="set" />
<assign property="callrequest.Request.RequestMethod" value="&quot;PUT&quot;" action="set" />
<assign property="callrequest.Request.RequestPath" value="&quot;Patient/&quot;_context.patid" action="set" />
<assign property="callrequest.Request.RequestFormatCode" value="&quot;JSON&quot;" action="set" />
<assign property="callrequest.Request.ResponseFormatCode" value="&quot;JSON&quot;" action="set" />
</request>
<response type='HS.FHIRServer.Interop.Response' >
<assign property="response" value="callresponse" action="set" />
</response>
</call>
<assign name="encid assign" property="context.encid" value="request.{PV1:VisitNumber.ID}" action="set" xpos='200' ypos='850' />
<transform name='transform encounter' class='demodb.dtl.hl7adta01ToFHIRencounter' source='request' target='context.fhirenc' xpos='200' ypos='950' />
<code name='prepare enc payload' xpos='200' ypos='1050' >
<![CDATA[   set outp = context.fhirenc.ToJSON()
  
  set tQuickStream = ##class(HS.SDA3.QuickStream).%New()
  
  set tSC=tQuickStream.Write(outp.Read()) 
  do tQuickStream.Flush()
  
  set context.StreamId = tQuickStream.%Id()]]>
</code>
<call name='Call ToFHIRDemo enc' target='ToFHIRDemo' async='0' xpos='200' ypos='1150' >
<request type='HS.FHIRServer.Interop.Request' >
<assign property="callrequest.QuickStreamId" value="context.StreamId" action="set" />
<assign property="callrequest.Request.RequestMethod" value="&quot;PUT&quot;" action="set" />
<assign property="callrequest.Request.RequestPath" value="&quot;Encounter/&quot;_context.encid" action="set" />
<assign property="callrequest.Request.RequestFormatCode" value="&quot;JSON&quot;" action="set" />
<assign property="callrequest.Request.ResponseFormatCode" value="&quot;JSON&quot;" action="set" />
</request>
<response type='HS.FHIRServer.Interop.Response' >
<assign property="response" value="callresponse" action="set" />
</response>
</call>
<code name='Save JSON to Stream' xpos='200' ypos='1250' disabled="true">
<annotation><![CDATA[prepare the bundle content]]></annotation>
<![CDATA[   
   
   set entry=[]
   // 0. update the request
   set reqpat={}
   set reqpat."method"="PUT"
   set reqpat."url" ="Patient/"_context.patid
   set context.fhirpat.request=reqpat
   
   set reqenc={}
   set reqenc."method"="PUT"
   set reqenc."url" ="Encounter/"_context.encid
   set context.fhirenc.request=reqenc
   
   
   // 1. Insert the object into the entry Array
   do entry.%Push(context.fhirpat)
   do entry.%Push(context.fhirenc)
   
   // 2. create the bundle
   set bundle={}
   set bundle.resourceType="Bundle"
   set bundle.type="transaction"
   set bundle.entry=entry
   
   // 3. prepare the json
   set outp = bundle.ToJSON()
  
  set tQuickStream = ##class(HS.SDA3.QuickStream).%New()
  
  set tSC=tQuickStream.Write(outp.Read()) 
  do tQuickStream.Flush()
  
  set context.StreamId = tQuickStream.%Id()
]]>
</code>
<call name='Call ToFHIRDemo' target='ToFHIRDemo' async='0' xpos='200' ypos='1350' disabled="true">
<request type='HS.FHIRServer.Interop.Request' >
<assign property="callrequest.QuickStreamId" value="context.StreamId" action="set" />
<assign property="callrequest.Request.RequestMethod" value="&quot;POST&quot;" action="set" />
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

Storage Default
{
<Type>%Storage.Persistent</Type>
}

}
