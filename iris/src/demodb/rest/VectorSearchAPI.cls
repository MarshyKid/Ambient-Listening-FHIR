Include Ensemble

Class demodb.rest.VectorSearchAPI Extends %CSP.REST
{

Parameter UseSession = 0;

Parameter HandleCorsRequest = 1;

/*
 * Ensure Write commands become part of the HTTP response.
 */
Parameter IgnoreWrites = 0;

Parameter CONTENTTYPE = "application/json";

Parameter CHARSET = "utf-8";

Parameter CONVERTINPUTSTREAM = 1;

XData UrlMap [ XMLNamespace = "http://www.intersystems.com/urlmap" ]
{
<Routes>
    <Route Url="/ping" Method="GET" Call="Ping"/>
    <Route Url="/search" Method="POST" Call="Search"/>
    <Route Url="/search/" Method="POST" Call="Search"/>
</Routes>
}

/*
 * Use this to confirm that the web application is connected
 * to this exact dispatch class.
 */
ClassMethod Ping() As %Status
{
    Set %response.Status = "200 OK"
    Set %response.ContentType = "application/json"
    Set %response.CharSet = "utf-8"

    Write {
        "status": "ok",
        "dispatchClass": "demodb.rest.VectorSearchAPI"
    }.%ToJSON()

    Quit $$$OK
}

ClassMethod Search() As %Status
{
    Set tSC = $$$OK

    Set %response.ContentType = "application/json"
    Set %response.CharSet = "utf-8"

    Try {
        /*
         * Confirms in the Event Log that this route was entered.
         */
        $$$LOGINFO("Entered POST /search REST handler")

        If '$IsObject(%request.Content) {
            Set tSC = $$$ERROR($$$GeneralError, "HTTP request did not contain a body")
            $$$ThrowOnError(tSC)
        }

        Set tJSON = {}.%FromJSON(%request.Content)

        Set tRequest =
            ##class(demodb.msg.VectorSearchRequest).%New()

        Set tRequest.PatientReference =
            tJSON.%Get("patientReference", "")

        Set tRequest.Query =
            tJSON.%Get("query", "")

        Set tRequest.TopK =
            tJSON.%Get("topK", 5)

        $$$LOGINFO("Creating Vector Search API Service for patient "_tRequest.PatientReference)

        /*
         * This must match the production configuration item name,
         * not merely the class name.
         */
        Set tSC =
            ##class(Ens.Director).CreateBusinessService(
                "Vector Search API Service",
                .tService
            )

        $$$ThrowOnError(tSC)

        If '$IsObject(tService) {
            Set tSC = $$$ERROR($$$GeneralError, "CreateBusinessService returned no service object")
            $$$ThrowOnError(tSC)
        }

        Set tSC =
            tService.ProcessInput(
                tRequest,
                .tResponse
            )

        $$$ThrowOnError(tSC)

        If '$IsObject(tResponse) {
            Set tSC = $$$ERROR($$$GeneralError, "Production returned no VectorSearchResponse")
            $$$ThrowOnError(tSC)
        }

        Set tResults = []

        For tIndex = 1:1:tResponse.Results.Count() {
            Set tHit = tResponse.Results.GetAt(tIndex)

            Do tResults.%Push({
                "resourceType": (tHit.ResourceType),
                "resourceId": (tHit.ResourceId),
                "versionId": (tHit.VersionId),
                "searchText": (tHit.SearchText),
                "similarity": (tHit.Similarity)
            })
        }

        Set tOutput = {
            "patientReference": (tResponse.PatientReference),
            "query": (tResponse.Query),
            "resultCount": (tResponse.ResultCount),
            "results": (tResults)
        }

        Set %response.Status = "200 OK"

        /*
         * Simpler and easier to debug than OutputToDevice().
         */
        Write tOutput.%ToJSON()

    } Catch tException {
        Set tSC = tException.AsStatus()

        $$$LOGERROR("Vector-search REST request failed: "_$SYSTEM.Status.GetErrorText(tSC)_" | "_tException.DisplayString())

        Set %response.Status = "500 Internal Server Error"

        Write {
            "error": "Vector search request failed",
            "details": ($SYSTEM.Status.GetErrorText(tSC))
        }.%ToJSON()
    }

    /*
     * HTTP status and body carry the client response.
     */
    Quit $$$OK
}

}
