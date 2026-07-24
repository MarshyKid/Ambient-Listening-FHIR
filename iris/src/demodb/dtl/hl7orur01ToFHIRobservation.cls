Class demodb.dtl.hl7orur01ToFHIRobservation Extends Ens.DataTransformDTL [ DependsOn = (EnsLib.HL7.Message, HS.FHIR.DTL.vR4.Model.Resource.Observation) ]
{

Parameter GENERATEEMPTYSEGMENTS = 0;

Parameter IGNOREMISSINGSOURCE = 1;

Parameter REPORTERRORS = 0;

Parameter TREATEMPTYREPEATINGFIELDASNULL = 0;

XData DTL [ XMLNamespace = "http://www.intersystems.com/dtl" ]
{
<transform sourceClass='EnsLib.HL7.Message' targetClass='HS.FHIR.DTL.vR4.Model.Resource.Observation' sourceDocType='2.3:ORU_R01' create='new' language='objectscript' >
<if condition='source.{PIDgrpgrp(1).ORCgrp(1).OBR:ResultStatus}="F"' >
<true>
<assign value='"final"' property='target.status' action='set' />
</true>
<false>
<assign value='"registered"' property='target.status' action='set' />
</false>
</if>
<if condition='source.{PIDgrpgrp(1).ORCgrp(1).OBR:FillerOrderNumber.entityidentifier}&apos;=""' >
<annotation>for identifying lab or vital result</annotation>
<true>
<assign value='"LocalSystemNumber"' property='target.identifier.(1).system' action='set' />
<assign value='source.{PIDgrpgrp(1).ORCgrp(1).OBR:FillerOrderNumber.entityidentifier}' property='target.id' action='set' />
<assign value='source.{PIDgrpgrp(1).ORCgrp(1).OBR:FillerOrderNumber}' property='context.obsid' action='set' disabled='1' />
<assign value='source.{PIDgrpgrp(1).ORCgrp(1).OBR:FillerOrderNumber.entityidentifier}' property='target.identifier.(1).value' action='set' />
</true>
</if>
<assign value='source.{PIDgrpgrp(1).ORCgrp(1).OBR:FillerOrderNumber.namespaceID}' property='categorycode' action='set' />
<if condition='categorycode="RAD"' >
<true>
<assign value='"http://hl7.org"' property='target.category.(1).coding.(1).system' action='set' />
<assign value='"imaging"' property='target.category.(1).coding.(1).code' action='set' />
<assign value='"Imaging"' property='target.category.(1).coding.(1).display' action='set' />
</true>
</if>
<assign value='"localsystem"' property='target.code.coding.(1).system' action='set' />
<assign value='source.{PIDgrpgrp(1).ORCgrp(1).OBR:UniversalServiceIdentifier.identifier}' property='target.code.coding.(1).code' action='set' />
<assign value='source.{PIDgrpgrp(1).ORCgrp(1).OBR:UniversalServiceIdentifier.text}' property='target.code.coding.(1).display' action='set' />
<assign value='source.{PIDgrpgrp(1).PIDgrp.PID:PatientIDExternalID.ID}' property='target.subject.reference' action='set' />
<assign value='source.{PIDgrpgrp(1).PIDgrp.PID:PatientName}' property='target.subject.display' action='set' />
<assign value='source.{PIDgrpgrp(1).PIDgrp.PV1grp.PV1:PreadmitNumber.ID}' property='target.encounter.reference' action='set' />
<assign value='source.{PIDgrpgrp(1).ORCgrp(1).OBR:PlacerOrderNumber(1).entityidentifier}' property='target.basedOn.(1).reference' action='set' />
<assign value='source.{PIDgrpgrp(1).ORCgrp(1).OBR:ObservationDateTime.timeofanevent}' property='edt' action='set' />
<assign value='$E(edt,1,4)_"-"_$E(edt,5,6)_"-"_$E(edt,7,8)_"T"_$E(edt,9,10)_":"_$E(edt,11,12)_":"_$E(edt,13,14)_"Z"' property='target.effectiveDateTime' action='set' />
<foreach property='source.{PIDgrpgrp(1).ORCgrp(1).OBXgrp()}' key='k1' >
<assign value='target.valueString_";"_source.{PIDgrpgrp(1).ORCgrp(1).OBXgrp(k1).OBX}' property='target.valueString' action='set' />
</foreach>
</transform>
}

}
