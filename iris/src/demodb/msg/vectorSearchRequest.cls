Class demodb.msg.VectorSearchRequest Extends Ens.Request
{

Property PatientReference As %String(MAXLEN = 256);

Property Query As %String(MAXLEN = 320000);

Property TopK As %Integer [ InitialExpression = 5 ];

/// Optional comma-separated allow-list for the demo.
Property ResourceTypes As %String(MAXLEN = 1000);

Storage Default
{
<Data name="VectorSearchRequestDefaultData">
<Subscript>"VectorSearchRequest"</Subscript>
<Value name="1">
<Value>PatientReference</Value>
</Value>
<Value name="2">
<Value>Query</Value>
</Value>
<Value name="3">
<Value>TopK</Value>
</Value>
<Value name="4">
<Value>ResourceTypes</Value>
</Value>
</Data>
<DefaultData>VectorSearchRequestDefaultData</DefaultData>
<Type>%Storage.Persistent</Type>
}

}
