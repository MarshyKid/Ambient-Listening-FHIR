/// 
Class demodb.bp.HL7orur01ToFHIRsrPatch Extends Ens.BusinessProcessBPL
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
<property name='fpath' type='%String' instantiate='0' deletewithcontext='0' >
<parameters>
<parameter name='MAXLEN'  value='100' />
</parameters>
</property>
</context>
<sequence xend='200' yend='750' >
<empty name='some ref info' xpos='200' ypos='250' disabled="true">
<annotation><![CDATA[https://docs.intersystems.com/irisforhealthlatest/csp/docbook/DocBook.UI.Page.cls?KEY=HXFHIR_client#HXFHIR_client_interactions_call]]></annotation>
</empty>
<assign name="fpath assign" property="context.fpath" value="request.{PIDgrpgrp(1).ORCgrp(1).OBR:PlacerOrderNumber(1).entityidentifier}" action="set" xpos='200' ypos='350' />
<code name='Save JSON to Stream' xpos='200' ypos='450' >
<annotation><![CDATA[prepare the patch content]]></annotation>
<![CDATA[  // 1. Initialize the root variable as a JSON Array
  set darray = ##class(%DynamicArray).%New()
  
  // 2. set the patch content
  set context.dynamicBundle.op="replace"
  set context.dynamicBundle.path="/status"
  set context.dynamicBundle.value="completed"
  
  // 3. Insert the operation object into the root Array
  do darray.%Push(context.dynamicBundle)
  
  set tQuickStream = ##class(HS.SDA3.QuickStream).%New()
  
  // FIXED: Use Write() instead of CopyFrom() because %ToJSON() returns a plain string string
  //do tQuickStream.Write(context.dynamicBundle.%ToJSON())
  do tQuickStream.Write(darray.%ToJSON())
  do tQuickStream.Flush()
  
  set context.StreamId = tQuickStream.%Id()
]]>
</code>
<call name='Call ToFHIRDemo' target='ToFHIRDemo' async='0' xpos='200' ypos='550' >
<request type='HS.FHIRServer.Interop.Request' >
<assign property="callrequest.QuickStreamId" value="context.StreamId" action="set" />
<assign property="callrequest.Request.RequestMethod" value="&quot;PATCH&quot;" action="set" />
<assign property="callrequest.Request.RequestPath" value="context.fpath" action="set" />
<assign property="callrequest.Request.RequestFormatCode" value="&quot;JPatch&quot;" action="set" />
<assign property="callrequest.Request.ResponseFormatCode" value="&quot;JSON&quot;" action="set" />
</request>
<response type='HS.FHIRServer.Interop.Response' >
<assign property="response" value="callresponse" action="set" />
</response>
</call>
<call name='update observation' target='HL7orur01ToFHIRobsPut' async='1' xpos='200' ypos='650' >
<annotation><![CDATA[optional]]></annotation>
<request type='EnsLib.HL7.Message' >
<assign property="callrequest" value="request" action="set" />
</request>
<response type='Ens.Response' />
</call>
</sequence>
</process>
}

}
