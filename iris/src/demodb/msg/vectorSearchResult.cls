Class demodb.msg.VectorSearchResult Extends %SerialObject
{

Property ResourceType As %String;

Property ResourceId As %String;

Property VersionId As %String;

Property SearchText As %String(MAXLEN = 320000);

Property Similarity As %Double;

Storage Default
{
<Data name="VectorSearchResultState">
<Value name="1">
<Value>ResourceType</Value>
</Value>
<Value name="2">
<Value>ResourceId</Value>
</Value>
<Value name="3">
<Value>VersionId</Value>
</Value>
<Value name="4">
<Value>SearchText</Value>
</Value>
<Value name="5">
<Value>Similarity</Value>
</Value>
</Data>
<State>VectorSearchResultState</State>
<StreamLocation>^demodb.msg.VectorSearchResultS</StreamLocation>
<Type>%Storage.Serial</Type>
}

}
