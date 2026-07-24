Include Ensemble

Class demodb.bs.VectorSearchService Extends Ens.BusinessService
{

Property TargetConfigName As Ens.DataType.ConfigName [ InitialExpression = "demodb.bp.VectorSearchOperation" ];

Parameter SETTINGS = "TargetConfigName";

Method OnProcessInput(pInput As demodb.msg.VectorSearchRequest, Output pOutput As demodb.msg.VectorSearchResponse) As %Status
{
    Quit ..SendRequestSync(
        ..TargetConfigName,
        pInput,
        .pOutput
    )
}

}
