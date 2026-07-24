Class DEMOPKG.FoundationProduction Extends Ens.Production [ Not ProcedureBlock ]
{

XData ProductionDefinition
{
<Production Name="DEMOPKG.FoundationProduction" TestingEnabled="true" LogGeneralTraceEvents="false">
  <Description></Description>
  <ActorPoolSize>1</ActorPoolSize>
  <Item Name="HS.Util.Trace.Operations" Category="" ClassName="HS.Util.Trace.Operations" PoolSize="1" Enabled="true" Foreground="false" Comment="" LogTraceEvents="false" Schedule="">
  </Item>
  <Item Name="ToFHIRDemo" Category="" ClassName="HS.FHIRServer.Interop.HTTPOperation" PoolSize="1" Enabled="true" Foreground="false" Comment="" LogTraceEvents="false" Schedule="">
    <Setting Target="Host" Name="ServiceName">irisfhir</Setting>
    <Setting Target="Host" Name="TraceOperations">*FULL*</Setting>
  </Item>
  <Item Name="hl7httpin" Category="" ClassName="EnsLib.HL7.Service.HTTPService" PoolSize="1" Enabled="true" Foreground="false" Comment="" LogTraceEvents="false" Schedule="">
    <Setting Target="Adapter" Name="Port">7038</Setting>
    <Setting Target="Host" Name="MessageSchemaCategory">2.3</Setting>
    <Setting Target="Host" Name="TargetConfigNames">hl7route</Setting>
  </Item>
  <Item Name="HL7orur01ToFHIRsrPatch" Category="" ClassName="demodb.bp.HL7orur01ToFHIRsrPatch" PoolSize="1" Enabled="true" Foreground="false" Comment="" LogTraceEvents="false" Schedule="">
  </Item>
  <Item Name="hl7route" Category="" ClassName="EnsLib.HL7.MsgRouter.RoutingEngine" PoolSize="1" Enabled="true" Foreground="false" Comment="" LogTraceEvents="false" Schedule="">
    <Setting Target="Host" Name="BusinessRuleName">demodb.route.hl7route</Setting>
  </Item>
  <Item Name="HL7orur01ToFHIRobsPut" Category="" ClassName="demodb.bp.HL7orur01ToFHIRobsPut" PoolSize="1" Enabled="true" Foreground="false" Comment="" LogTraceEvents="false" Schedule="">
  </Item>
  <Item Name="HL7adta01ToFHIRpatencPut" Category="" ClassName="demodb.bp.HL7adta01ToFHIRpatencPut" PoolSize="1" Enabled="true" Foreground="false" Comment="" LogTraceEvents="false" Schedule="">
  </Item>
</Production>
}

}
