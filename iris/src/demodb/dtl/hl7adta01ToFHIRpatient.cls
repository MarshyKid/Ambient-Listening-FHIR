Class demodb.dtl.hl7adta01ToFHIRpatient Extends Ens.DataTransformDTL [ DependsOn = (EnsLib.HL7.Message, HS.FHIR.DTL.vR4.Model.Resource.Patient) ]
{

Parameter GENERATEEMPTYSEGMENTS = 0;

Parameter IGNOREMISSINGSOURCE = 1;

Parameter REPORTERRORS = 1;

Parameter TREATEMPTYREPEATINGFIELDASNULL = 0;

XData DTL [ XMLNamespace = "http://www.intersystems.com/dtl" ]
{
<transform sourceClass='EnsLib.HL7.Message' targetClass='HS.FHIR.DTL.vR4.Model.Resource.Patient' sourceDocType='2.3:ADT_A01' create='new' language='objectscript' >
<assign value='source.{PID:PatientIDInternalID(1).assigningauthority.universalID}' property='target.identifier.(1).system' action='set' />
<assign value='source.{PID:PatientIDInternalID(1).ID}' property='target.identifier.(1).value' action='set' />
<assign value='source.{PID:PatientIDInternalID(1).ID}' property='target.id' action='set' />
<assign value='"official"' property='target.identifier.(1).use' action='set' />
<assign value='"official"' property='target.name.(1).use' action='set' />
<assign value='source.{PID:PatientName.familyname}' property='target.name.(1).family' action='set' />
<assign value='source.{PID:PatientName.givenname}' property='target.name.(1).given.(1)' action='set' />
<assign value='source.{PID:PatientName.prefix}' property='target.name.(1).prefix.(1)' action='set' />
<if condition='source.{PID:PhoneNumberHome(1)}&apos;=""' >
<true>
<assign value='source.{PID:PhoneNumberHome()}' property='target.telecom.(1).value' action='set' />
<assign value='"phone"' property='target.telecom.(1).system' action='set' />
<assign value='"home"' property='target.telecom.(1).use' action='set' />
<if condition='source.{PID:Sex}="F"'  expanded='false' >
<true>
<assign value='"female"' property='target.gender' action='set' />
</true>
<false>
<if condition='source.{PID:Sex}="M"' >
<true>
<assign value='"male"' property='target.gender' action='set' />
</true>
</if>
</false>
</if>
</true>
</if>
<assign value='source.{PID:DateofBirth}' property='target.birthDate' action='set' />
<if condition='source.{PID:MaritalStatus(1)}="M"' >
<true>
<assign value='"http://hl7.org"' property='target.maritalStatus.coding.(1).system' action='set' />
<assign value='source.{PID:MaritalStatus(1)}' property='target.maritalStatus.coding.(1).code' action='set' />
<assign value='"Married"' property='target.maritalStatus.coding.(1).display' action='set' />
</true>
</if>
<if condition='source.{PID:PrimaryLanguage.identifier}&apos;=""' >
<true>
<assign value='source.{PID:PrimaryLanguage.identifier}' property='target.communication.(1).language.text' action='set' />
</true>
</if>
</transform>
}

}
