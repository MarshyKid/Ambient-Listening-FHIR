Include Ensemble

Class demodb.bo.VectorSearchOperation Extends Ens.BusinessOperation
{

Parameter INVOCATION = "Queue";

XData MessageMap
{
<MapItems>
    <MapItem MessageType="demodb.msg.VectorSearchRequest">
        <Method>Search</Method>
    </MapItem>
</MapItems>
}

Method Search(pRequest As demodb.msg.VectorSearchRequest, Output pResponse As demodb.msg.VectorSearchResponse) As %Status
{
    Set tSC = $$$OK
    Set tCount = 0
    Set pResponse = ##class(demodb.msg.VectorSearchResponse).%New()

    Try {
        Set pResponse.PatientReference = pRequest.PatientReference
        Set pResponse.Query = pRequest.Query
        Set pResponse.ResultCount = 0

        Set tPatient = pRequest.PatientReference
        Set tQuery = pRequest.Query
        Set tTopK = +pRequest.TopK

        If tPatient = "" {
            Set tSC = $$$ERROR($$$GeneralError, "PatientReference is required")
            $$$ThrowOnError(tSC)
        }

        If tPatient '[ "Patient/" {
            Set tSC = $$$ERROR($$$GeneralError, "PatientReference must use Patient/{id}")
            $$$ThrowOnError(tSC)
        }

        If tQuery = "" {
            Set tSC = $$$ERROR($$$GeneralError, "Query is required")
            $$$ThrowOnError(tSC)
        }

        // Restrict the result count to a safe range.
        If tTopK < 1 Set tTopK = 5
        If tTopK > 20 Set tTopK = 20

        /*
         * tTopK has been converted to and bounded as an integer,
         * so it is safe to place in the TOP clause.
         */
        Set tSQL =
            "SELECT TOP "_tTopK_" "
            _"ResourceType, ResourceId, VersionId, SearchText, "
            _"VECTOR_COSINE("
            _"SearchEmbedding, "
            _"EMBEDDING(?, 'ambient-fhir-openai')"
            _") AS Similarity "
            _"FROM AmbientFHIR.VectorStore "
            _"WHERE PatientId = ? "
            _"ORDER BY Similarity DESC"

        Set tStatement = ##class(%SQL.Statement).%New()

        Set tSC = tStatement.%Prepare(tSQL)
        $$$ThrowOnError(tSC)

        Set tResult = tStatement.%Execute(
            tQuery,
            tPatient
        )

        If tResult.%SQLCODE < 0 {
            Set tSC = $$$ERROR($$$GeneralError, "Vector search failed: "_tResult.%Message)
            $$$ThrowOnError(tSC)
        }

        While tResult.%Next() {
            Set tHit =
                ##class(demodb.msg.VectorSearchResult).%New()

            Set tHit.ResourceType =
                tResult.%Get("ResourceType")

            Set tHit.ResourceId =
                tResult.%Get("ResourceId")

            Set tHit.VersionId =
                tResult.%Get("VersionId")

            Set tHit.SearchText =
                tResult.%Get("SearchText")

            Set tHit.Similarity =
                tResult.%Get("Similarity")

            Do pResponse.Results.Insert(tHit)
            Set tCount = tCount + 1
        }

        Set pResponse.ResultCount = tCount

        Set tHit = ##class(demodb.msg.VectorSearchResult).%New()
        Set tHit.ResourceType = "Test"
        Set tHit.ResourceId = "TestId"
        set tHit.VersionId = "TestVId"
        Do pResponse.Results.Insert(tHit)

    } Catch tException {
        Set tSC = tException.AsStatus()

        $$$LOGERROR("Vector retrieval failed: "_$SYSTEM.Status.GetErrorText(tSC))
    }

    Quit tSC
}

}
