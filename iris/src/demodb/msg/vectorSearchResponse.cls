Class demodb.msg.VectorSearchResponse Extends Ens.Response
{

Property PatientReference As %String;

Property Query As %String(MAXLEN = 320000);

Property Results As list Of demodb.msg.VectorSearchResult;

Property ResultCount As %Integer;

Storage Default
{
<Data name="VectorSearchResponseDefaultData">
<Subscript>"VectorSearchResponse"</Subscript>
<Value name="1">
<Value>PatientReference</Value>
</Value>
<Value name="2">
<Value>Query</Value>
</Value>
<Value name="3">
<Value>Results</Value>
</Value>
<Value name="4">
<Value>ResultCount</Value>
</Value>
</Data>
<DefaultData>VectorSearchResponseDefaultData</DefaultData>
<Type>%Storage.Persistent</Type>
}

}
