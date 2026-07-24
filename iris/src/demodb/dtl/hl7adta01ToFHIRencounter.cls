Class demodb.dtl.hl7adta01ToFHIRencounter Extends Ens.DataTransformDTL [ DependsOn = (EnsLib.HL7.Message, HS.FHIR.DTL.vR4.Model.Resource.Encounter) ]
{

Parameter GENERATEEMPTYSEGMENTS = 0;

Parameter IGNOREMISSINGSOURCE = 1;

Parameter REPORTERRORS = 1;

Parameter TREATEMPTYREPEATINGFIELDASNULL = 0;

XData DTL [ XMLNamespace = "http://www.intersystems.com/dtl" ]
{
<transform sourceClass='EnsLib.HL7.Message' targetClass='HS.FHIR.DTL.vR4.Model.Resource.Encounter' sourceDocType='2.3:ADT_A01' create='new' language='objectscript' >
<assign value='source.{PV1:VisitNumber.ID}' property='target.id' action='set' />
<assign value='source.{PV1:VisitNumber.assigningauthority.universalID}' property='target.identifier.(1).system' action='set' />
<assign value='source.{PV1:VisitNumber.ID}' property='target.identifier.(1).value' action='set' />
<if condition='source.{EVN:EventTypeCode}="A01"' >
<true>
<assign value='"in-progress"' property='target.status' action='set' />
</true>
<false>
<assign value='"in-progress"' property='target.status' action='set' />
</false>
</if>
<if condition='source.{PV1:PatientClass}="I"' >
<true>
<assign value='"http://hl7.org"' property='target.class.system' action='set' />
<assign value='"IMP"' property='target.class.code' action='set' />
<assign value='"inpatient encounter"' property='target.class.display' action='set' />
</true>
<false>
<assign value='"http://hl7.org"' property='target.class.system' action='set' />
<assign value='"AMB"' property='target.class.code' action='set' />
<assign value='"ambulatory"' property='target.class.display' action='set' />
</false>
</if>
<assign value='"Patient/"_source.{PID:PatientIDInternalID(1).ID}' property='target.subject.reference' action='set' />
<assign value='"http://hl7.org"' property='target.participant.(1).type.(1).coding.(1).system' action='set' />
<assign value='"ATND"' property='target.participant.(1).type.(1).coding.(1).code' action='set' />
<assign value='"attender"' property='target.participant.(1).type.(1).coding.(1).display' action='set' />
<assign value='source.{PV1:AttendingDoctor}' property='target.participant.(1).individual.display' action='set' />
<assign value='source.{PV1:AdmitDateTime.timeofanevent}' property='target.period.start' action='set' />
</transform>
}

}
