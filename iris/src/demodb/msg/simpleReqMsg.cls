Class demodb.msg.simpleReqMsg Extends Ens.Request
{

Property tablename As %String;

Property rowid As %String;

Storage Default
{
<Data name="simpleReqMsgDefaultData">
<Subscript>"simpleReqMsg"</Subscript>
<Value name="1">
<Value>tablename</Value>
</Value>
<Value name="2">
<Value>rowid</Value>
</Value>
</Data>
<DefaultData>simpleReqMsgDefaultData</DefaultData>
<Type>%Storage.Persistent</Type>
}

}
