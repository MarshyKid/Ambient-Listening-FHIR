/// 
Class demodb.route.hl7route Extends Ens.Rule.Definition
{

Parameter RuleAssistClass = "EnsLib.HL7.MsgRouter.RuleAssist";

XData RuleDefinition [ XMLNamespace = "http://www.intersystems.com/rule" ]
{
<ruleDefinition alias="" context="EnsLib.HL7.MsgRouter.RoutingEngine" production="DEMOPKG.FoundationProduction">
<ruleSet name="" effectiveBegin="" effectiveEnd="">
<rule name="orur01">
<constraint name="source" value="hl7httpin"></constraint>
<constraint name="docCategory" value="2.3"></constraint>
<constraint name="docName" value="ORU_R01"></constraint>
<when condition="1" comment="">
<send transform="" target="HL7orur01ToFHIRsrPatch"></send>
</when>
</rule>
<rule name="adta01" disabled="false">
<constraint name="docCategory" value="2.3"></constraint>
<constraint name="docName" value="ADT_A01"></constraint>
<constraint name="source" value="hl7httpin"></constraint>
<when condition="1" comment="">
<send transform="" target="HL7adta01ToFHIRpatencPut"></send>
</when>
</rule>
<send transform="" target=""></send>
</ruleSet>
</ruleDefinition>
}

}
