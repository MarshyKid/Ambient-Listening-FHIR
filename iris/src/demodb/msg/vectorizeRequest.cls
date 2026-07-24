Class demodb.msg.vectorizeRequest Extends Ens.Request
{

/// QuickStream containing the original FHIR request body.
Property QuickStreamId As %String;

/// ID assigned or confirmed by the FHIR repository.
Property ResourceId As %String(MAXLEN = 256);

/// Version assigned by the FHIR repository.
Property VersionId As %String(MAXLEN = 128);

/// Original FHIR method, normally POST or PUT.
Property RequestMethod As %String(MAXLEN = 16);

/// Original request path.
Property RequestPath As %String(MAXLEN = 2048);

Storage Default
{
<Data name="vectorizeRequestDefaultData">
<Subscript>"vectorizeRequest"</Subscript>
<Value name="1">
<Value>QuickStreamId</Value>
</Value>
<Value name="2">
<Value>ResourceId</Value>
</Value>
<Value name="3">
<Value>VersionId</Value>
</Value>
<Value name="4">
<Value>RequestMethod</Value>
</Value>
<Value name="5">
<Value>RequestPath</Value>
</Value>
</Data>
<DefaultData>vectorizeRequestDefaultData</DefaultData>
<Type>%Storage.Persistent</Type>
}

}
